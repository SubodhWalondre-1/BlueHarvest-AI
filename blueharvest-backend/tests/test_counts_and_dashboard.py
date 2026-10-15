from io import BytesIO
from PIL import Image


def _token(client, username, password):
    response = client.post("/api/auth/login", json={"username": username, "password": password})
    return response.json()["access_token"]


def test_count_session_persistence_and_analytics(client, registered):
    token = registered["token"]
    headers = {"Authorization": f"Bearer {token}"}
    created = client.post("/api/count-sessions", headers=headers, json={
        "count": 1250, "source": "Uploaded", "container": "Tray", "pond_location": "Pond One",
        "processing_time_ms": None, "confidence": None,
    })
    assert created.status_code == 201, created.text
    session = created.json()["session"]
    assert session["count"] == 1250
    assert session["confidence"] is None

    saved = client.patch(f"/api/count-sessions/{session['session_id']}/save", headers=headers, json={"is_saved": True})
    assert saved.status_code == 200
    history = client.get("/api/count-sessions", headers=headers)
    assert history.status_code == 200
    assert history.json()["items"][0]["count"] == 1250

    summary = client.get("/api/dashboard/summary?range=all_time", headers=headers)
    assert summary.status_code == 200
    assert summary.json()["total_fish"] == 1250
    assert summary.json()["sessions"] == 1

    for r in ["today", "this_week", "this_month", "7_days"]:
        res = client.get(f"/api/dashboard/summary?range={r}", headers=headers)
        assert res.status_code == 200
        assert res.json()["total_fish"] == 1250

    deleted = client.delete(f"/api/count-sessions/{session['session_id']}", headers=headers)
    assert deleted.status_code == 204
    after = client.get("/api/dashboard/summary?range=all_time", headers=headers)
    assert after.json()["total_fish"] == 0


def test_image_processing_does_not_fake_a_count(client, registered):
    headers = {"Authorization": f"Bearer {registered['token']}"}
    image_bytes = BytesIO()
    Image.new("RGB", (8, 8), "white").save(image_bytes, format="PNG")
    image_bytes.seek(0)
    response = client.post("/api/image-processing", headers=headers, files={"image": ("sample.png", image_bytes, "image/png")})
    assert response.status_code == 503
    assert response.json()["detail"]["code"] == "model_not_configured"


def test_preprocess_validates_file_without_claiming_quality_score(client, registered):
    headers = {"Authorization": f"Bearer {registered['token']}"}
    image_bytes = BytesIO()
    Image.new("RGB", (8, 8), "white").save(image_bytes, format="PNG")
    image_bytes.seek(0)
    response = client.post("/api/preprocess-image", headers=headers, files={"file": ("sample.png", image_bytes, "image/png")})
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "validated"
    assert body["quality_assessment"]["status"] == "not_evaluated"


def test_clients_cannot_submit_demo_counts(client, registered, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "demo_mode_enabled", True)
    headers = {"Authorization": f"Bearer {registered['token']}"}
    response = client.post("/api/count-sessions", headers=headers, json={
        "count": 999999, "is_demo": True, "method": "DEMO DATA — SAMPLE ONLY"
    })
    assert response.status_code == 403
    assert response.json()["detail"]["code"] == "demo_fixture_read_only"


def test_count_session_is_not_visible_to_another_user(client, registered):
    owner_headers = {"Authorization": f"Bearer {registered['token']}"}
    created = client.post("/api/count-sessions", headers=owner_headers, json={"count": 42})
    assert created.status_code == 201, created.text
    session_id = created.json()["session"]["session_id"]

    signup = client.post("/api/auth/signup", json={
        "full_name": "Different Operator", "username": "operator_other",
        "email": "other@example.com", "pond_location": "Other Pond",
        "password": "SafeOtherPass!123",
    })
    assert signup.status_code == 201, signup.text
    other_headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    response = client.get(f"/api/count-sessions/{session_id}", headers=other_headers)
    assert response.status_code == 404
    deletion = client.delete(f"/api/count-sessions/{session_id}", headers=other_headers)
    assert deletion.status_code == 404

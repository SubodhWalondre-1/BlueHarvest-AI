from io import BytesIO
from PIL import Image
import pytest
from sqlalchemy import select

from app.api.routes import image_processing
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.models import CountSession, UploadedImage
from app.services.counting_service import _extract_response


@pytest.fixture()
def infer(client, registered, monkeypatch):
    def run(payload=None, source="Uploaded", **extra):
        async def count(*_args):
            return _extract_response(payload if payload is not None else {"count": 1250})

        monkeypatch.setattr(image_processing, "count_fish_image", count)
        data = BytesIO()
        Image.new("RGB", (8, 8), "white").save(data, format="PNG")
        return client.post(
            "/api/image-processing", headers={"Authorization": f"Bearer {registered['token']}"},
            files={"image": ("sample.png", data.getvalue(), "image/png")}, data={"source": source, **extra},
        )

    return run


def headers(registered):
    return {"Authorization": f"Bearer {registered['token']}"}


def test_count_session_persistence_and_analytics(client, registered, infer):
    token = registered["token"]
    headers = {"Authorization": f"Bearer {token}"}
    result = infer()
    assert result.status_code == 200, result.text
    session_id = result.json()["session_id"]
    before = client.get("/api/dashboard/summary?range=all_time", headers=headers)
    assert before.json()["total_fish"] == before.json()["sessions"] == 0
    created = client.post("/api/count-sessions", headers=headers, json={"session_id": session_id})
    assert created.status_code == 200, created.text
    session = created.json()["session"]
    assert session["count"] == 1250
    assert session["confidence"] is None
    assert session["inference_verified"] is True
    assert session["pond"] == registered["user"]["pondLocation"]
    assert session["image"] == result.json()["image_url"]

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
    assert response.status_code == 422


def test_count_session_is_not_visible_to_another_user(client, registered, infer):
    owner_headers = {"Authorization": f"Bearer {registered['token']}"}
    created = infer({"count": 42})
    assert created.status_code == 200, created.text
    session_id = created.json()["session_id"]

    signup = client.post("/api/auth/signup", json={
        "full_name": "Different Operator", "username": "operator_other",
        "email": "other@example.com", "pond_location": "Other Pond",
        "password": "SafeOtherPass!123",
    })
    assert signup.status_code == 201, signup.text
    other_headers = {"Authorization": f"Bearer {signup.json()['access_token']}"}
    response = client.get(f"/api/count-sessions/{session_id}", headers=other_headers)
    assert response.status_code == 404
    saved = client.post("/api/count-sessions", headers=other_headers, json={"session_id": session_id})
    assert saved.status_code == 404
    patched = client.patch(f"/api/count-sessions/{session_id}/save", headers=other_headers, json={"is_saved": True})
    assert patched.status_code == 404
    assert client.get("/api/count-sessions", headers=other_headers).json()["items"] == []
    deletion = client.delete(f"/api/count-sessions/{session_id}", headers=other_headers)
    assert deletion.status_code == 404


def test_client_cannot_create_count_without_inference(client, registered):
    response = client.post("/api/count-sessions", headers=headers(registered), json={"count": 999999})
    assert response.status_code == 422
    assert client.get("/api/count-sessions?include_unverified=true", headers=headers(registered)).json()["items"] == []
    assert client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()["total_fish"] == 0


@pytest.mark.parametrize("field,value", [
    ("count", 999999), ("confidence", 1), ("image_path", "/api/uploads/forged.png"),
    ("image_url", "https://example.com/forged.png"), ("avg_length_mm", 999),
    ("density", "High"), ("processing_time_ms", 1), ("method", "Forged model"),
    ("status", "completed"), ("is_demo", True), ("inference_verified", True),
    ("user_id", "another-user"), ("pond_location", "Fake Pond"), ("source", "Camera"),
])
def test_save_rejects_metrics_even_with_valid_session_id(client, registered, infer, field, value):
    session_id = infer().json()["session_id"]
    post = client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id, field: value})
    patch = client.patch(f"/api/count-sessions/{session_id}/save", headers=headers(registered), json={"is_saved": True, field: value})
    assert post.status_code == patch.status_code == 422
    stored = client.get(f"/api/count-sessions/{session_id}", headers=headers(registered)).json()["session"]
    assert stored["count"] == 1250 and stored["is_saved"] is False


def test_inference_persists_model_values_and_owned_image_before_save(client, registered, infer):
    response = infer({"count": 27, "confidence": 0.93, "avg_length_mm": 4.5,
                      "processing_time_ms": 123, "density_label": "Medium", "method": "P2PNet"},
                     source="Camera", count="999999", confidence="1", image_url="forged", user_id="other")
    assert response.status_code == 200, response.text
    body = response.json()
    session_id = body["session_id"]
    body["final_count"] = 999999
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        stored = db.get(CountSession, session_id)
        image = db.get(UploadedImage, body["image_url"].rsplit("/", 1)[1])
        assert stored.count == 27 and stored.confidence == 0.93
        assert stored.avg_length_mm == 4.5 and stored.processing_time_ms == 123
        assert stored.density == "Medium" and stored.method == "P2PNet"
        assert stored.image_path == body["image_url"] and stored.user_id == image.user_id == registered["user"]["id"]
        assert stored.source == "Camera" and stored.inference_verified is True and stored.is_saved is False
    finally:
        provider.close()
    saved = client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id})
    assert saved.json()["session"]["count"] == 27
    assert saved.json()["session"]["confidence"] == "93.0%"
    assert saved.json()["session"]["image"] == body["image_url"]


def test_repeated_save_is_idempotent_and_delete_cannot_be_replayed(client, registered, infer):
    session_id = infer().json()["session_id"]
    for _ in range(3):
        response = client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id})
        assert response.status_code == 200 and response.json()["session"]["session_id"] == session_id
    assert len(client.get("/api/count-sessions", headers=headers(registered)).json()["items"]) == 1
    summary = client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()
    assert summary["sessions"] == 1 and summary["total_fish"] == 1250
    assert client.delete(f"/api/count-sessions/{session_id}", headers=headers(registered)).status_code == 204
    assert client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id}).status_code == 404


def test_zero_count_and_missing_optional_metrics_are_preserved(client, registered, infer):
    session_id = infer({"count": 0}).json()["session_id"]
    saved = client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id}).json()["session"]
    assert saved["count"] == 0 and saved["confidence"] is None and saved["avgLength"] is None
    assert saved["processing_time_ms"] is None
    summary = client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()
    assert summary["total_fish"] == 0 and summary["sessions"] == 1


def test_unsaved_results_stay_out_of_ledger_and_dashboard(client, registered, infer):
    first = infer().json()["session_id"]
    second = infer().json()["session_id"]
    assert first != second
    assert client.get("/api/count-sessions?include_unsaved=false", headers=headers(registered)).json()["items"] == []
    assert len(client.get("/api/count-sessions", headers=headers(registered)).json()["items"]) == 2
    assert client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()["total_fish"] == 0
    assert client.patch(f"/api/count-sessions/{first}/save", headers=headers(registered), json={"is_saved": True}).status_code == 200
    assert client.patch(f"/api/count-sessions/{first}/save", headers=headers(registered), json={"is_saved": False}).status_code == 200
    assert client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()["total_fish"] == 0


def test_unknown_or_missing_session_cannot_be_saved(client, registered):
    assert client.post("/api/count-sessions", headers=headers(registered), json={}).status_code == 422
    assert client.post("/api/count-sessions", headers=headers(registered), json={"session_id": "not-a-session"}).status_code == 422
    assert client.post("/api/count-sessions", headers=headers(registered), json={"session_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404


def test_save_requires_authentication(client, registered, infer):
    session_id = infer().json()["session_id"]
    assert client.post("/api/count-sessions", json={"session_id": session_id}).status_code == 401
    assert client.patch(f"/api/count-sessions/{session_id}/save", json={"is_saved": True}).status_code == 401


def test_failed_or_invalid_inference_creates_no_result(client, registered, infer):
    response = infer({"confidence": 0.99})
    assert response.status_code == 502
    assert not list(settings.uploads_path.iterdir())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        assert db.scalar(select(CountSession)) is None
        assert db.scalar(select(UploadedImage)) is None
    finally:
        provider.close()


def test_legacy_counts_are_preserved_but_excluded_and_cannot_be_promoted(client, registered, monkeypatch):
    from uuid import uuid4

    session_id = str(uuid4())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.add(CountSession(id=session_id, batch_code="BAT-LEGACY", user_id=registered["user"]["id"], count=999999, is_saved=True))
        db.commit()
    finally:
        provider.close()
    assert client.get("/api/count-sessions", headers=headers(registered)).json()["items"] == []
    legacy = client.get("/api/count-sessions?include_unverified=true", headers=headers(registered)).json()["items"]
    assert len(legacy) == 1 and legacy[0]["count"] == 999999
    assert legacy[0]["inference_verified"] is False and legacy[0]["status"] == "Unverified legacy record"
    assert client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id}).status_code == 409
    assert client.patch(f"/api/count-sessions/{session_id}/save", headers=headers(registered), json={"is_saved": True}).status_code == 409
    monkeypatch.setattr(settings, "demo_mode_enabled", True)
    for suffix in ["", "&include_demo=true"]:
        summary = client.get(f"/api/dashboard/summary?range=all_time{suffix}", headers=headers(registered)).json()
        assert summary["total_fish"] == 0 and summary["sessions"] == 0


def test_demo_fixtures_remain_explicitly_labelled_and_cannot_be_saved_as_ai(client, registered, monkeypatch):
    from uuid import uuid4

    monkeypatch.setattr(settings, "demo_mode_enabled", True)
    session_id = str(uuid4())
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        db.add(CountSession(id=session_id, batch_code="BAT-DEMO-TEST", user_id=registered["user"]["id"],
                            count=42, is_saved=True, is_demo=True))
        db.commit()
    finally:
        provider.close()
    assert client.get("/api/count-sessions", headers=headers(registered)).json()["items"] == []
    rows = client.get("/api/count-sessions?include_demo=true", headers=headers(registered)).json()["items"]
    assert len(rows) == 1 and rows[0]["status"] == "Demo sample" and rows[0]["is_demo"] is True
    assert client.get("/api/dashboard/summary?range=all_time", headers=headers(registered)).json()["total_fish"] == 0
    summary = client.get("/api/dashboard/summary?range=all_time&include_demo=true", headers=headers(registered)).json()
    assert summary["total_fish"] == 42 and summary["includes_demo_data"] is True
    assert client.post("/api/count-sessions", headers=headers(registered), json={"session_id": session_id}).status_code == 403
    assert client.patch(f"/api/count-sessions/{session_id}/save", headers=headers(registered), json={"is_saved": True}).status_code == 403


@pytest.mark.parametrize("value", [None, 1, "true"])
def test_save_state_requires_a_boolean(client, registered, infer, value):
    session_id = infer().json()["session_id"]
    assert client.patch(f"/api/count-sessions/{session_id}/save", headers=headers(registered), json={"is_saved": value}).status_code == 422


def test_invalid_source_does_not_start_inference(client, registered, infer):
    response = infer(source="Forged")
    assert response.status_code == 422
    assert not list(settings.uploads_path.iterdir())

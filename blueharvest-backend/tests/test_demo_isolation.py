from io import BytesIO
from PIL import Image
from app.api.routes import image_processing
from app.core.config import settings
from app.db.session import get_db
from app.main import app
from app.services.demo_service import DEMO_USER, seed_demo_data


def test_demo_logins_have_separate_workspaces_and_refresh_keeps_the_owner(client, monkeypatch):
    monkeypatch.setattr(settings, "demo_mode_enabled", True)
    provider = app.dependency_overrides[get_db]()
    try:
        seed_demo_data(next(provider))
    finally:
        provider.close()
    credentials = {key: DEMO_USER[key] for key in ("username", "password")}
    first = client.post("/api/auth/login", json=credentials).json()
    first_headers = {"Authorization": f"Bearer {first['access_token']}"}
    first_rows = client.get("/api/count-sessions?include_demo=true", headers=first_headers).json()["items"]
    second = client.post("/api/auth/login", json=credentials).json()
    assert first["user"]["id"] != second["user"]["id"]
    assert first["user"]["isDemo"] and second["user"]["isDemo"]
    second_headers = {"Authorization": f"Bearer {second['access_token']}"}
    second_rows = client.get("/api/count-sessions?include_demo=true", headers=second_headers).json()["items"]
    assert len(first_rows) == len(second_rows) == 4
    assert {row["session_id"] for row in first_rows}.isdisjoint({row["session_id"] for row in second_rows})
    target = first_rows[0]["session_id"]
    assert client.get(f"/api/count-sessions/{target}", headers=second_headers).status_code == 404
    assert client.delete(f"/api/count-sessions/{target}", headers=second_headers).status_code == 404
    refreshed = client.post("/api/auth/refresh", headers={"Origin": settings.allowed_origins[0], "X-CSRF-Protection": "1"})
    assert refreshed.status_code == 200 and refreshed.json()["user"]["id"] == second["user"]["id"]
    second_headers = {"Authorization": f"Bearer {refreshed.json()['access_token']}"}

    async def count(*_args):
        return {"final_fish_count": 17, "final_count": 17, "stats": {}}

    monkeypatch.setattr(image_processing, "count_fish_image", count)
    image = BytesIO()
    Image.new("RGB", (8, 8), "blue").save(image, format="PNG")
    uploaded = client.post("/api/image-processing", headers=first_headers,
        files={"image": ("fish.png", image.getvalue(), "image/png")})
    assert uploaded.status_code == 200, uploaded.text
    result = uploaded.json()
    assert client.get(result["image_url"], headers=first_headers).status_code == 200
    assert client.get(result["image_url"], headers=second_headers).status_code == 404
    assert client.post("/api/count-sessions", headers=first_headers, json={"session_id": result["session_id"]}).status_code == 200
    summary = client.get("/api/dashboard/summary?range=all_time", headers=first_headers).json()
    assert summary["total_fish"] == 17 and summary["sessions"] == 1
    assert client.get("/api/dashboard/summary?range=all_time", headers=second_headers).json()["total_fish"] == 0
    assert client.delete(f"/api/count-sessions/{result['session_id']}", headers=first_headers).status_code == 204
    assert client.get(result["image_url"], headers=first_headers).status_code == 404

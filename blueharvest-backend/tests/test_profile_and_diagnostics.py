def test_profile_and_settings_persist(client, registered):
    headers = {"Authorization": f"Bearer {registered['token']}"}
    profile = client.patch("/api/users/me", headers=headers, json={"pond_location": "New Pond"})
    assert profile.status_code == 200, profile.text
    assert profile.json()["user"]["pondLocation"] == "New Pond"

    settings = client.patch("/api/users/me/settings", headers=headers, json={"notifications_enabled": False, "language": "English", "theme": "Dark"})
    assert settings.status_code == 200
    assert settings.json()["settings"]["notificationsEnabled"] is False


def test_diagnostics_report_model_unavailable(client):
    response = client.get("/api/diagnostics")
    assert response.status_code == 200
    body = response.json()
    assert body["model"]["available"] is False
    assert body["image_processing"]["reason"] == "model_not_configured"

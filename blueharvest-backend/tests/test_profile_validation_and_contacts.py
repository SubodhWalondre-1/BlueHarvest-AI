from datetime import timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select
from app.core.config import settings
from app.core.security import hash_password
from app.core.time import utcnow_naive
from app.db.session import get_db
from app.main import app
from app.models import ContactChangeChallenge, User
from app.services import contact_change_service as contacts

PASSWORD = "SafeTestPass!123"


def headers(registered):
    return {"Authorization": f"Bearer {registered['token']}"}


def request_change(client, registered, channel="email", value="verified@example.com", password=PASSWORD):
    return client.post("/api/users/me/contact-change/request", headers=headers(registered),
                       json={"channel": channel, "value": value, "password": password})


def confirm(client, registered, challenge, password=PASSWORD, code=None):
    return client.post("/api/users/me/contact-change/confirm", headers=headers(registered), json={
        "challenge_id": challenge["challenge_id"], "code": code or challenge["development_code"], "password": password,
    })


def change_row(model, key, **changes):
    provider = app.dependency_overrides[get_db]()
    try:
        db = next(provider)
        row = db.get(model, key)
        for field, value in changes.items():
            setattr(row, field, value)
        db.commit()
    finally:
        provider.close()


@pytest.mark.parametrize("field", ["username", "display_role", "full_name", "email", "pond_location"])
@pytest.mark.parametrize("value", [None, "   "])
def test_required_profile_fields_reject_null_and_whitespace(client, registered, field, value):
    response = client.patch("/api/users/me", headers=headers(registered), json={field: value})
    assert response.status_code == 422
    assert client.get("/api/users/me", headers=headers(registered)).json()["user"] == registered["user"]


@pytest.mark.parametrize("field", ["username", "display_role", "full_name"])
def test_profile_length_is_checked_after_trimming(client, registered, field):
    assert client.patch("/api/users/me", headers=headers(registered), json={field: " A "}).status_code == 422
    response = client.patch("/api/users/me", headers=headers(registered), json={field: " " * 300 + "Operator" + " " * 300})
    assert response.status_code == 200, response.text
    user = response.json()["user"]
    assert user[{"username": "username", "display_role": "role", "full_name": "fullName"}[field]] == "Operator"


@pytest.mark.parametrize("field", ["full_name", "username", "pond_location"])
def test_signup_rejects_whitespace_before_persistence(client, field):
    payload = {"full_name": "New Operator", "username": "new_operator", "email": "new@example.com",
               "pond_location": "Pond One", "password": PASSWORD, field: "   "}
    assert client.post("/api/auth/signup", json=payload).status_code == 422


def test_omitted_fields_and_unchanged_normalized_contacts_remain_valid(client, registered):
    assert client.patch("/api/users/me", headers=headers(registered), json={}).status_code == 200
    result = client.patch("/api/users/me", headers=headers(registered), json={
        "email": " OPERATOR@EXAMPLE.COM ", "phone": "+91 98765 43210", "pond_location": " New Pond ",
    })
    assert result.status_code == 200 and result.json()["user"]["pondLocation"] == "New Pond"
    assert client.patch("/api/users/me", headers=headers(registered), json={"phone": 12345678}).status_code == 422


@pytest.mark.parametrize("field,value", [("email", "attacker@example.com"), ("phone", "+919999888877"), ("phone", None)])
def test_direct_contact_changes_are_blocked_without_partial_profile_writes(client, registered, field, value):
    result = client.patch("/api/users/me", headers=headers(registered), json={field: value, "full_name": "Changed Operator"})
    assert result.status_code == 409 and result.json()["detail"]["code"] == "contact_verification_required"
    assert client.get("/api/users/me", headers=headers(registered)).json()["user"] == registered["user"]


@pytest.mark.parametrize("channel,value,key", [("email", "verified@example.com", "emailVerified"), ("phone", "+919999888877", "phoneVerified")])
def test_contact_changes_require_password_and_destination_code(client, registered, channel, value, key):
    requested = request_change(client, registered, channel, value)
    assert requested.status_code == 200, requested.text
    challenge = requested.json()
    assert client.get("/api/users/me", headers=headers(registered)).json()["user"][channel] == registered["user"][channel]
    wrong_password = confirm(client, registered, challenge, password="WrongPassword")
    assert wrong_password.status_code == 403
    result = confirm(client, registered, challenge)
    assert result.status_code == 200, result.text
    assert result.json()["user"][channel] == value and result.json()["user"][key] is True
    assert confirm(client, registered, challenge).status_code == 400


def test_phone_removal_verifies_the_current_phone(client, registered):
    result = request_change(client, registered, "phone", None)
    assert result.status_code == 200, result.text
    provider = app.dependency_overrides[get_db]()
    try:
        row = next(provider).get(ContactChangeChallenge, result.json()["challenge_id"])
        assert row.destination == registered["user"]["phone"] and row.new_value is None
        assert row.code_hash != result.json()["development_code"]
    finally:
        provider.close()
    verified = confirm(client, registered, result.json())
    assert verified.status_code == 200 and verified.json()["user"]["phone"] is None
    assert verified.json()["user"]["phoneVerified"] is False


def test_wrong_password_cannot_request_code(client, registered):
    result = request_change(client, registered, password="WrongPassword")
    assert result.status_code == 403
    provider = app.dependency_overrides[get_db]()
    try:
        assert next(provider).scalar(select(ContactChangeChallenge)) is None
    finally:
        provider.close()


def test_bad_code_attempts_are_bounded_and_expired_codes_fail(client, registered):
    challenge = request_change(client, registered).json()
    wrong = "000000" if challenge["development_code"] != "000000" else "111111"
    for _ in range(settings.otp_max_attempts):
        assert confirm(client, registered, challenge, code=wrong).status_code == 400
    assert confirm(client, registered, challenge).status_code == 400
    second = request_change(client, registered, value="second@example.com").json()
    change_row(ContactChangeChallenge, second["challenge_id"], expires_at=utcnow_naive() - timedelta(seconds=1))
    assert confirm(client, registered, second).status_code == 400


def test_resend_invalidates_old_challenge_and_only_latest_can_apply(client, registered):
    first = request_change(client, registered).json()
    second = request_change(client, registered, value="second@example.com").json()
    assert confirm(client, registered, first).status_code == 400
    assert confirm(client, registered, second).json()["user"]["email"] == "second@example.com"


def test_challenge_is_bound_to_owner_and_target_cannot_be_overridden(client, registered):
    challenge = request_change(client, registered).json()
    other = client.post("/api/auth/signup", json={"full_name": "Other Operator", "username": "other_contact",
        "email": "other@example.com", "pond_location": "Other Pond", "password": PASSWORD}).json()
    result = confirm(client, {"token": other["access_token"]}, challenge)
    assert result.status_code == 400
    override = client.post("/api/users/me/contact-change/confirm", headers=headers(registered), json={
        "challenge_id": challenge["challenge_id"], "code": challenge["development_code"], "password": PASSWORD,
        "value": "forged@example.com",
    })
    assert override.status_code == 422
    assert confirm(client, registered, challenge).json()["user"]["email"] == "verified@example.com"


def test_password_change_invalidates_pending_contact_proof(client, registered):
    challenge = request_change(client, registered).json()
    change_row(User, registered["user"]["id"], password_hash=hash_password("UpdatedPassword!123"))
    assert confirm(client, registered, challenge, password="UpdatedPassword!123").status_code == 409


def test_contact_conflicts_are_rechecked_at_confirmation(client, registered):
    challenge = request_change(client, registered).json()
    signup = client.post("/api/auth/signup", json={"full_name": "Other Operator", "username": "conflict_contact",
        "email": "verified@example.com", "pond_location": "Other Pond", "password": PASSWORD})
    assert signup.status_code == 201
    assert confirm(client, registered, challenge).status_code == 409
    assert client.get("/api/users/me", headers=headers(registered)).json()["user"]["email"] == registered["user"]["email"]


@pytest.mark.parametrize("failure,status", [(contacts.DeliveryNotConfigured("Delivery unavailable"), 503), (RuntimeError("Provider failed"), 502)])
def test_production_delivery_failure_preserves_existing_pending_challenge(client, registered, monkeypatch, failure, status):
    first = request_change(client, registered).json()
    monkeypatch.setattr(settings, "app_env", "production")

    async def fail(*_args, **_kwargs):
        raise failure

    monkeypatch.setattr(contacts, "send_email_otp", fail)
    result = request_change(client, registered, value="second@example.com")
    assert result.status_code == status and "development_code" not in result.json()
    assert confirm(client, registered, first).status_code == 200


def test_production_never_exposes_code_and_uses_contact_message(client, registered, monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    sent = []

    async def deliver(destination, code, purpose):
        sent.append((destination, code, purpose))

    monkeypatch.setattr(contacts, "send_email_otp", deliver)
    response = request_change(client, registered)
    assert response.status_code == 200 and "development_code" not in response.json()
    assert sent[0][0] == "verified@example.com" and sent[0][2] == "contact verification"


def test_contact_requests_are_rate_limited(client, registered):
    for index in range(5):
        assert request_change(client, registered, value=f"verified{index}@example.com").status_code == 200
    result = request_change(client, registered, value="last@example.com")
    assert result.status_code == 429 and int(result.headers["Retry-After"]) > 0


def test_contact_endpoints_require_authentication_and_reauthentication_fields(client):
    assert client.post("/api/users/me/contact-change/request", json={"channel": "email", "value": "new@example.com", "password": PASSWORD}).status_code == 401
    assert client.post("/api/users/me/contact-change/confirm", json={"challenge_id": str(uuid4()), "code": "123456", "password": PASSWORD}).status_code == 401


def test_contact_change_invalidates_existing_password_recovery_proof(client, registered):
    destination = registered["user"]["email"]
    reset = client.post("/api/auth/password-reset/request", json={"destination": destination}).json()
    verified = client.post("/api/auth/password-reset/verify", json={"destination": destination, "code": reset["development_code"]}).json()
    challenge = request_change(client, registered, "phone", "+919999888877").json()
    assert confirm(client, registered, challenge).status_code == 200
    reused = client.post("/api/auth/password-reset/confirm", json={"destination": destination,
        "reset_token": verified["reset_token"], "new_password": "AttackerPassword!123"})
    assert reused.status_code == 400


def test_contact_request_commit_failure_preserves_old_challenge(client, registered, monkeypatch):
    from sqlalchemy.orm import Session

    first = request_change(client, registered).json()
    original = Session.commit

    def fail(db):
        if any(isinstance(row, ContactChangeChallenge) for row in db.new):
            db.flush()
            raise RuntimeError("Simulated contact commit failure")
        original(db)

    monkeypatch.setattr(Session, "commit", fail)
    with pytest.raises(RuntimeError, match="contact commit failure"):
        request_change(client, registered, value="second@example.com")
    assert confirm(client, registered, first).status_code == 200


def test_contact_confirmation_is_single_use_under_concurrency(tmp_path):
    from concurrent.futures import ThreadPoolExecutor
    from threading import Barrier
    from fastapi import HTTPException, Request
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.core.security import digest_token
    from app.db.base import Base
    from app.schemas.user import ContactChangeConfirm

    engine = create_engine(f"sqlite:///{(tmp_path / 'contact-concurrency.db').as_posix()}", connect_args={"check_same_thread": False, "timeout": 15})
    Base.metadata.create_all(engine)
    sessions = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    challenge_id = str(uuid4())
    with sessions() as db:
        user = User(id="contact-owner", username="contact_owner", full_name="Contact Owner", email="old@example.com", password_hash=hash_password(PASSWORD))
        db.add(user)
        db.commit()
        challenge = ContactChangeChallenge(id=challenge_id, user_id=user.id, channel="email", destination="new@example.com",
            new_value="new@example.com", previous_value=user.email, credential_hash=digest_token(user.password_hash),
            expires_at=utcnow_naive() + timedelta(minutes=10))
        challenge.code_hash = contacts._code_hash(challenge, "123456")
        db.add(challenge)
        db.commit()
    barrier = Barrier(2)

    def compete(_index):
        with sessions() as db:
            user = db.get(User, "contact-owner")
            barrier.wait(timeout=10)
            request = Request({"type": "http", "client": ("198.51.100.1", 1234), "headers": []})
            try:
                contacts.confirm_contact_change(db, request, user, ContactChangeConfirm(challenge_id=challenge_id, code="123456", password=PASSWORD))
                return 200
            except HTTPException as exc:
                return exc.status_code

    try:
        with ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(compete, range(2)))
        assert sorted(results) == [200, 400]
        with sessions() as db:
            assert db.get(User, "contact-owner").email == "new@example.com"
    finally:
        engine.dispose()

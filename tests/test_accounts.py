import pytest
from fastapi.testclient import TestClient

from app.auth.security import hash_password, verify_password
from app.db.database import engine
from app.db.models import Base
from app.main import app

VALID_PROFILE = {
    "gpa": 3.8,
    "grade_level": "high_school_senior",
    "intended_majors": ["engineering"],
    "demographic_tags": ["african_american"],
    "state": "CA",
    "citizenship": "us_citizen",
    "financial_need_level": "high",
    "activities": ["robotics club"],
}


@pytest.fixture(autouse=True)
def clean_database():
    """Start every test with empty account tables."""
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    yield


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def signup(client, email="student@example.com", password="password123"):
    return client.post("/auth/signup", json={"email": email, "password": password})


class TestPasswordHashing:
    def test_hash_is_not_plaintext_and_verifies(self):
        hashed = hash_password("password123")
        assert hashed != "password123"
        assert verify_password("password123", hashed)
        assert not verify_password("wrong-password", hashed)


class TestSignup:
    def test_signup_creates_account_and_session(self, client):
        response = signup(client)
        assert response.status_code == 201
        body = response.json()
        assert body["email"] == "student@example.com"
        assert "password" not in body
        assert "password_hash" not in body

        me = client.get("/auth/me")
        assert me.status_code == 200
        assert me.json()["email"] == "student@example.com"

    def test_signup_normalizes_email_case(self, client):
        assert signup(client, email="Mixed@Example.com").status_code == 201
        duplicate = signup(client, email="mixed@example.com")
        assert duplicate.status_code == 409

    def test_signup_duplicate_email_returns_409(self, client):
        assert signup(client).status_code == 201
        again = signup(client)
        assert again.status_code == 409
        assert "error" in again.json()["detail"]

    def test_signup_short_password_returns_422(self, client):
        response = signup(client, password="short")
        assert response.status_code == 422

    def test_signup_invalid_email_returns_422(self, client):
        response = signup(client, email="not-an-email")
        assert response.status_code == 422


class TestLogin:
    def test_login_success(self, client):
        signup(client)
        client.post("/auth/logout")
        response = client.post(
            "/auth/login",
            json={"email": "student@example.com", "password": "password123"},
        )
        assert response.status_code == 200
        assert client.get("/auth/me").status_code == 200

    def test_login_wrong_password_returns_401(self, client):
        signup(client)
        client.post("/auth/logout")
        response = client.post(
            "/auth/login",
            json={"email": "student@example.com", "password": "wrong-password"},
        )
        assert response.status_code == 401

    def test_login_unknown_email_returns_401(self, client):
        response = client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": "password123"},
        )
        assert response.status_code == 401


class TestSessionLifecycle:
    def test_me_without_session_returns_401(self, client):
        assert client.get("/auth/me").status_code == 401

    def test_logout_clears_session(self, client):
        signup(client)
        assert client.get("/auth/me").status_code == 200
        assert client.post("/auth/logout").status_code == 200
        assert client.get("/auth/me").status_code == 401


class TestAuthRequired:
    def test_account_endpoints_require_login(self, client):
        assert client.get("/account/profile").status_code == 401
        assert client.get("/account/saved").status_code == 401
        assert client.put("/account/profile", json=VALID_PROFILE).status_code == 401


class TestProfilePersistence:
    def test_profile_starts_empty_then_saves(self, client):
        signup(client)
        initial = client.get("/account/profile")
        assert initial.status_code == 200
        assert initial.json()["profile"] is None

        saved = client.put("/account/profile", json=VALID_PROFILE)
        assert saved.status_code == 200
        assert saved.json()["profile"]["gpa"] == 3.8

        fetched = client.get("/account/profile")
        assert fetched.json()["profile"]["intended_majors"] == ["engineering"]

    def test_profile_update_overwrites(self, client):
        signup(client)
        client.put("/account/profile", json=VALID_PROFILE)
        updated = {**VALID_PROFILE, "gpa": 3.2, "state": "TX"}
        client.put("/account/profile", json=updated)
        fetched = client.get("/account/profile").json()["profile"]
        assert fetched["gpa"] == 3.2
        assert fetched["state"] == "TX"

    def test_invalid_profile_returns_422(self, client):
        signup(client)
        bad = {**VALID_PROFILE, "gpa": 9.9}
        assert client.put("/account/profile", json=bad).status_code == 422


class TestSavedScholarships:
    def _first_id(self, client):
        return client.get("/scholarships").json()[0]["id"]

    def test_save_list_and_remove(self, client):
        signup(client)
        scholarship_id = self._first_id(client)

        saved = client.post(f"/account/saved/{scholarship_id}")
        assert saved.status_code == 201
        assert saved.json()["scholarship"]["id"] == scholarship_id

        listing = client.get("/account/saved")
        assert listing.status_code == 200
        items = listing.json()["saved"]
        assert len(items) == 1
        assert items[0]["scholarship_id"] == scholarship_id
        assert items[0]["scholarship"] is not None

        removed = client.delete(f"/account/saved/{scholarship_id}")
        assert removed.status_code == 200
        assert client.get("/account/saved").json()["saved"] == []

    def test_saving_same_scholarship_twice_is_idempotent(self, client):
        signup(client)
        scholarship_id = self._first_id(client)
        assert client.post(f"/account/saved/{scholarship_id}").status_code == 201
        assert client.post(f"/account/saved/{scholarship_id}").status_code == 201
        assert len(client.get("/account/saved").json()["saved"]) == 1

    def test_saving_unknown_scholarship_returns_404(self, client):
        signup(client)
        assert client.post("/account/saved/does-not-exist").status_code == 404

    def test_saved_lists_are_per_user(self, client):
        signup(client, email="a@example.com")
        scholarship_id = self._first_id(client)
        client.post(f"/account/saved/{scholarship_id}")
        client.post("/auth/logout")

        signup(client, email="b@example.com")
        assert client.get("/account/saved").json()["saved"] == []

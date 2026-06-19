import pytest
from fastapi.testclient import TestClient

from app.ics import build_calendar
from app.main import app
from app.models.scholarship import Eligibility, Scholarship


def _scholarship(id_: str, name: str, deadline: str, award=10000) -> Scholarship:
    return Scholarship(
        id=id_,
        name=name,
        sponsor="Test Foundation",
        award_amount=award,
        deadline=deadline,
        url="https://example.org/scholarship",
        eligibility=Eligibility(),
        description="A test scholarship.",
        verified=False,
    )


class TestBuildCalendar:
    def test_includes_only_parseable_deadlines(self):
        items = [
            _scholarship("a", "Alpha", "2026-09-30"),
            _scholarship("b", "Beta", "rolling"),
            _scholarship("c", "Gamma", "VERIFY"),
        ]
        ics = build_calendar(items)

        assert ics.startswith("BEGIN:VCALENDAR")
        assert "END:VCALENDAR" in ics
        assert ics.count("BEGIN:VEVENT") == 1
        assert "DTSTART;VALUE=DATE:20260930" in ics
        assert "DTEND;VALUE=DATE:20261001" in ics  # all-day, non-inclusive end
        assert "SUMMARY:Apply: Alpha" in ics

    def test_escapes_special_characters(self):
        ics = build_calendar([_scholarship("x", "Smith, Jones & Co.", "2026-05-01")])
        assert "Smith\\, Jones & Co." in ics

    def test_empty_list_is_valid_calendar(self):
        ics = build_calendar([])
        assert "BEGIN:VCALENDAR" in ics
        assert "END:VCALENDAR" in ics
        assert "BEGIN:VEVENT" not in ics

    def test_lines_use_crlf(self):
        ics = build_calendar([_scholarship("a", "Alpha", "2026-09-30")])
        assert "\r\n" in ics


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _signup(client, email="cal@example.com", password="password123"):
    return client.post("/auth/signup", json={"email": email, "password": password})


class TestCalendarEndpoint:
    def test_requires_login(self, client):
        assert client.get("/account/saved/calendar.ics").status_code == 401

    def test_returns_calendar_for_saved_user(self, client):
        _signup(client, email="cal-user@example.com")
        scholarship_id = client.get("/scholarships").json()[0]["id"]
        client.post(f"/account/saved/{scholarship_id}")

        response = client.get("/account/saved/calendar.ics")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/calendar")
        assert "attachment" in response.headers.get("content-disposition", "")
        assert "BEGIN:VCALENDAR" in response.text

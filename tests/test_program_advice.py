"""Tests for the /program-advice endpoint (LLM-backed summer-program guidance)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

VALID_STUDENT = {
    "gpa": 3.9,
    "grade_level": "high_school_junior",
    "intended_majors": ["engineering"],
    "demographic_tags": ["african_american"],
    "state": "CA",
    "citizenship": "us_citizen",
    "financial_need_level": "high",
    "activities": ["robotics club"],
}

FAKE_API_KEY = "sk-ant-test-key-not-real"
KNOWN_PROGRAM_ID = "mites-summer"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


class TestProgramAdviceValidation:
    def test_missing_program_id_returns_422(self, client):
        response = client.post("/program-advice", json={"student": VALID_STUDENT})
        assert response.status_code == 422

    def test_malformed_student_body_returns_422(self, client):
        response = client.post(
            "/program-advice",
            json={"student": {"gpa": "not-a-number"}, "program_id": KNOWN_PROGRAM_ID},
        )
        assert response.status_code == 422

    def test_unknown_program_id_returns_404(self, client):
        response = client.post(
            "/program-advice",
            json={"student": VALID_STUDENT, "program_id": "does-not-exist"},
        )
        assert response.status_code == 404
        assert "error" in response.json()["detail"]


class TestProgramAdviceErrors:
    def test_missing_api_key_returns_clean_error(self, client, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        response = client.post(
            "/program-advice",
            json={"student": VALID_STUDENT, "program_id": KNOWN_PROGRAM_ID},
        )

        assert response.status_code == 503
        assert "error" in response.json()["detail"]
        assert "sk-ant" not in response.text

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_api_failure_does_not_leak_key(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.side_effect = RuntimeError(
            f"Auth failed for {FAKE_API_KEY}"
        )

        response = client.post(
            "/program-advice",
            json={"student": VALID_STUDENT, "program_id": KNOWN_PROGRAM_ID},
        )

        assert response.status_code == 503
        assert FAKE_API_KEY not in response.text
        assert "Traceback" not in response.text


class TestProgramAdviceSuccess:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_success_returns_advice_json(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_block = MagicMock()
        mock_block.text = "1. How to stand out\nLean on your robotics club work."
        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create.return_value = mock_response

        response = client.post(
            "/program-advice",
            json={"student": VALID_STUDENT, "program_id": KNOWN_PROGRAM_ID},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["program_id"] == KNOWN_PROGRAM_ID
        assert "advice" in data
        assert "robotics" in data["advice"]
        # The program system prompt, not the scholarship one, should be in play.
        _, kwargs = mock_client.messages.create.call_args
        assert "summer program" in kwargs["system"].lower()
        assert FAKE_API_KEY not in response.text


class TestProgramAdviceOpenApi:
    def test_endpoint_listed_in_openapi(self, client):
        schema = client.get("/openapi.json").json()
        assert "/program-advice" in schema["paths"]
        assert "post" in schema["paths"]["/program-advice"]

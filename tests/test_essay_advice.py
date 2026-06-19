from anthropic import AuthenticationError
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models.student import StudentProfile

VALID_STUDENT = {
    "gpa": 3.8,
    "grade_level": "high_school_senior",
    "intended_majors": ["engineering"],
    "demographic_tags": ["african_american"],
    "state": "CA",
    "citizenship": "us_citizen",
    "financial_need_level": "high",
    "activities": ["robotics club"],
}

FAKE_API_KEY = "sk-ant-test-key-not-real"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


class TestEssayAdviceValidation:
    def test_missing_scholarship_id_returns_422(self, client):
        response = client.post("/essay-advice", json={"student": VALID_STUDENT})
        assert response.status_code == 422

    def test_malformed_student_body_returns_422(self, client):
        response = client.post(
            "/essay-advice",
            json={"student": {"gpa": "not-a-number"}, "scholarship_id": "coca-cola-scholars"},
        )
        assert response.status_code == 422

    def test_unknown_scholarship_id_returns_404(self, client):
        response = client.post(
            "/essay-advice",
            json={"student": VALID_STUDENT, "scholarship_id": "does-not-exist"},
        )
        assert response.status_code == 404
        assert "error" in response.json()["detail"]


class TestEssayAdviceErrors:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_api_failure_returns_clean_error_without_key(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.side_effect = RuntimeError(
            f"Auth failed for {FAKE_API_KEY}"
        )

        response = client.post(
            "/essay-advice",
            json={"student": VALID_STUDENT, "scholarship_id": "coca-cola-scholars"},
        )

        assert response.status_code == 503
        body = response.json()
        assert "error" in body["detail"]
        assert FAKE_API_KEY not in response.text
        assert "Traceback" not in response.text
        assert "RuntimeError" not in response.text

    def test_missing_api_key_returns_clean_error(self, client, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        response = client.post(
            "/essay-advice",
            json={"student": VALID_STUDENT, "scholarship_id": "coca-cola-scholars"},
        )

        assert response.status_code == 503
        assert "error" in response.json()["detail"]
        assert "sk-ant" not in response.text

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_authentication_error_returns_actionable_message(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        request = MagicMock()
        response = MagicMock()
        response.status_code = 401
        response.headers = {}
        response.request = request
        mock_client.messages.create.side_effect = AuthenticationError(
            "invalid x-api-key",
            response=response,
            body={"error": {"type": "authentication_error"}},
        )

        response = client.post(
            "/essay-advice",
            json={"student": VALID_STUDENT, "scholarship_id": "coca-cola-scholars"},
        )

        assert response.status_code == 503
        message = response.json()["detail"]["error"]
        assert "ANTHROPIC_API_KEY" in message
        assert FAKE_API_KEY not in response.text


class TestEssayAdviceSuccess:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_success_returns_advice_json(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_block = MagicMock()
        mock_block.text = "1. Essay angle suggestions\nUse your robotics club work."
        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create.return_value = mock_response

        response = client.post(
            "/essay-advice",
            json={"student": VALID_STUDENT, "scholarship_id": "coca-cola-scholars"},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["scholarship_id"] == "coca-cola-scholars"
        assert "advice" in data
        assert "robotics" in data["advice"]
        assert FAKE_API_KEY not in response.text


class TestEssayAdviceOpenApi:
    def test_endpoint_listed_in_openapi(self, client):
        schema = client.get("/openapi.json").json()
        assert "/essay-advice" in schema["paths"]
        assert "post" in schema["paths"]["/essay-advice"]


class TestEssayReviewValidation:
    def test_missing_draft_returns_422(self, client):
        response = client.post(
            "/essay-review",
            json={"student": VALID_STUDENT, "scholarship_id": "coca-cola-scholars"},
        )
        assert response.status_code == 422

    def test_empty_draft_returns_422(self, client):
        response = client.post(
            "/essay-review",
            json={
                "student": VALID_STUDENT,
                "scholarship_id": "coca-cola-scholars",
                "draft": "",
            },
        )
        assert response.status_code == 422

    def test_unknown_scholarship_id_returns_404(self, client):
        response = client.post(
            "/essay-review",
            json={
                "student": VALID_STUDENT,
                "scholarship_id": "does-not-exist",
                "draft": "My essay draft about robotics.",
            },
        )
        assert response.status_code == 404
        assert "error" in response.json()["detail"]


class TestEssayReviewErrors:
    def test_missing_api_key_returns_clean_error(self, client, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

        response = client.post(
            "/essay-review",
            json={
                "student": VALID_STUDENT,
                "scholarship_id": "coca-cola-scholars",
                "draft": "My essay draft about robotics club.",
            },
        )

        assert response.status_code == 503
        assert "error" in response.json()["detail"]
        assert "sk-ant" not in response.text


class TestEssayReviewSuccess:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.essay.advice.Anthropic")
    def test_success_returns_feedback_json(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_block = MagicMock()
        mock_block.text = "1. Strengths\nYour robotics example is concrete."
        mock_response = MagicMock()
        mock_response.content = [mock_block]
        mock_client.messages.create.return_value = mock_response

        response = client.post(
            "/essay-review",
            json={
                "student": VALID_STUDENT,
                "scholarship_id": "coca-cola-scholars",
                "draft": "My essay about my robotics club leadership.",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert data["scholarship_id"] == "coca-cola-scholars"
        assert "feedback" in data
        assert "robotics" in data["feedback"]
        assert FAKE_API_KEY not in response.text


class TestEssayReviewOpenApi:
    def test_endpoint_listed_in_openapi(self, client):
        schema = client.get("/openapi.json").json()
        assert "/essay-review" in schema["paths"]
        assert "post" in schema["paths"]["/essay-review"]

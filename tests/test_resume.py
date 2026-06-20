from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app

FAKE_API_KEY = "sk-ant-test-key-not-real"


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def _tool_response(payload: dict):
    """Build a mocked Anthropic response carrying a single tool_use block."""
    block = MagicMock()
    block.type = "tool_use"
    block.input = payload
    response = MagicMock()
    response.content = [block]
    return response


class TestResumeValidation:
    def test_blank_input_returns_400(self, client):
        response = client.post("/resume/extract", data={"text": "   "})
        assert response.status_code == 400
        assert "error" in response.json()["detail"]

    def test_missing_api_key_returns_clean_error(self, client, monkeypatch):
        monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
        response = client.post(
            "/resume/extract", data={"text": "Jane Doe, GPA 3.9, Engineering"}
        )
        assert response.status_code == 503
        assert "error" in response.json()["detail"]
        assert "sk-ant" not in response.text


class TestResumeSuccess:
    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.resume.extractor.Anthropic")
    def test_text_extraction_maps_to_profile(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.return_value = _tool_response(
            {
                "gpa": 3.9,
                "grade_level": "high_school_senior",
                "intended_majors": ["engineering", "not_a_real_field"],
                "demographic_tags": [],
                "state": "ca",
                "citizenship": "us_citizen",
                "financial_need_level": "high",
                "activities": ["Robotics Club captain", "Math tutor"],
                "target_schools": ["MIT"],
                "notes": "Confirm your citizenship.",
            }
        )

        response = client.post("/resume/extract", data={"text": "resume text here"})

        assert response.status_code == 200
        data = response.json()
        profile = data["profile"]
        assert profile["gpa"] == 3.9
        assert profile["grade_level"] == "high_school_senior"
        # Unknown field tag is filtered out, valid one kept.
        assert profile["intended_majors"] == ["engineering"]
        assert profile["state"] == "CA"  # normalized to uppercase
        assert profile["citizenship"] == "us_citizen"
        assert profile["activities"] == ["Robotics Club captain", "Math tutor"]
        assert data["notes"] == "Confirm your citizenship."
        assert FAKE_API_KEY not in response.text

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.resume.extractor.Anthropic")
    def test_invalid_values_are_dropped(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.return_value = _tool_response(
            {
                "gpa": 7.5,  # out of range
                "grade_level": "wizard",  # not in vocabulary
                "state": "ZZ",  # not a real state
                "demographic_tags": ["african_american", "martian"],
            }
        )

        response = client.post("/resume/extract", data={"text": "x"})

        assert response.status_code == 200
        profile = response.json()["profile"]
        assert profile["gpa"] is None
        assert profile["grade_level"] is None
        assert profile["state"] is None
        assert profile["demographic_tags"] == ["african_american"]

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.resume.extractor.Anthropic")
    def test_pdf_upload_sends_document_block(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.return_value = _tool_response(
            {"intended_majors": ["nursing"]}
        )

        response = client.post(
            "/resume/extract",
            files={"file": ("resume.pdf", b"%PDF-1.4 fake bytes", "application/pdf")},
        )

        assert response.status_code == 200
        assert response.json()["profile"]["intended_majors"] == ["nursing"]
        # The PDF must be forwarded to Claude as a document content block.
        _, kwargs = mock_client.messages.create.call_args
        content = kwargs["messages"][0]["content"]
        assert any(block.get("type") == "document" for block in content)


class TestResumeLimits:
    def test_oversize_file_is_rejected(self, client):
        big = b"x" * (5 * 1024 * 1024 + 4096)  # just over the 5 MB cap
        response = client.post(
            "/resume/extract", files={"file": ("big.txt", big, "text/plain")}
        )
        assert response.status_code == 413

    @patch.dict("os.environ", {"ANTHROPIC_API_KEY": FAKE_API_KEY})
    @patch("app.resume.extractor.Anthropic")
    def test_pasted_text_is_capped(self, mock_anthropic, client):
        mock_client = MagicMock()
        mock_anthropic.return_value = mock_client
        mock_client.messages.create.return_value = _tool_response({})

        response = client.post("/resume/extract", data={"text": "A" * 60000})

        assert response.status_code == 200
        _, kwargs = mock_client.messages.create.call_args
        content = kwargs["messages"][0]["content"]
        text_sent = " ".join(b.get("text", "") for b in content if b.get("type") == "text")
        # 60k chars of pasted input must be capped before reaching Claude.
        assert len(text_sent) < 55000


class TestResumeOpenApi:
    def test_endpoint_listed_in_openapi(self, client):
        schema = client.get("/openapi.json").json()
        assert "/resume/extract" in schema["paths"]
        assert "post" in schema["paths"]["/resume/extract"]

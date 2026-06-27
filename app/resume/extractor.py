"""Extract a structured student profile from a resume using Claude tool use.

The model is forced to call a single ``submit_profile`` tool whose JSON schema
constrains every controlled field to the app's canonical vocabulary. Whatever it
returns is then filtered again on the server, so an unexpected value can never
reach the form or the matcher.
"""

from __future__ import annotations

import base64
from typing import Any

from anthropic import Anthropic, NotFoundError

from app.llm import AIFeatureError, get_api_key, map_api_error
from app.models.resume import ResumeExtraction, ResumeExtractionResponse
from app.vocabulary import (
    CITIZENSHIP_VALUES,
    DEMOGRAPHIC_TAG_VALUES,
    FIELD_OF_STUDY_VALUES,
    FINANCIAL_NEED_LEVEL_VALUES,
    GRADE_LEVEL_INPUT_VALUES,
    GRADE_LEVEL_VALUES,
    STATE_CODE_VALUES,
)

EXTRACT_MODEL = "claude-sonnet-4-6"
EXTRACT_FALLBACK_MODELS = (
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
)
EXTRACT_MAX_TOKENS = 1024
MAX_LIST_ITEMS = 20

SYSTEM_PROMPT = """You extract a structured U.S. scholarship profile from a resume.
Use ONLY information present in the resume. Never guess or invent values.
Map free text to the allowed values provided by the tool; if nothing fits, omit the field.
Only set demographic_tags (race and ethnicity) if the resume states them explicitly. Do not infer race or ethnicity from names, schools, photos, or activities.
Only set citizenship if the resume states it explicitly.
Use the notes field to tell the student briefly what you could not determine and should be filled in by hand.
Call the submit_profile tool exactly once."""


def _profile_tool_schema() -> dict[str, Any]:
    return {
        "name": "submit_profile",
        "description": (
            "Record the structured student profile extracted from the resume. "
            "Omit any field you cannot determine from the resume; do not guess."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "gpa": {"type": "number", "description": "GPA on a 4.0 scale, if stated."},
                "grade_level": {"type": "string", "enum": sorted(GRADE_LEVEL_INPUT_VALUES)},
                "intended_majors": {
                    "type": "array",
                    "items": {"type": "string", "enum": sorted(FIELD_OF_STUDY_VALUES)},
                },
                "demographic_tags": {
                    "type": "array",
                    "items": {"type": "string", "enum": sorted(DEMOGRAPHIC_TAG_VALUES)},
                },
                "state": {
                    "type": "string",
                    "enum": sorted(STATE_CODE_VALUES),
                    "description": "Two-letter state code of residence, if determinable.",
                },
                "citizenship": {"type": "string", "enum": sorted(CITIZENSHIP_VALUES)},
                "financial_need_level": {
                    "type": "string",
                    "enum": sorted(FINANCIAL_NEED_LEVEL_VALUES),
                },
                "activities": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Extracurriculars, leadership, jobs, athletics as short phrases.",
                },
                "target_schools": {"type": "array", "items": {"type": "string"}},
                "notes": {
                    "type": "string",
                    "description": "What could not be determined and should be completed by the student.",
                },
            },
            "required": [],
        },
    }


def _build_content(resume_text: str | None, pdf_bytes: bytes | None) -> list[dict[str, Any]]:
    content: list[dict[str, Any]] = []
    if pdf_bytes:
        content.append(
            {
                "type": "document",
                "source": {
                    "type": "base64",
                    "media_type": "application/pdf",
                    "data": base64.standard_b64encode(pdf_bytes).decode("ascii"),
                },
            }
        )
    if resume_text:
        content.append({"type": "text", "text": f"Resume text:\n{resume_text}"})
    content.append(
        {"type": "text", "text": "Extract this student's profile by calling submit_profile."}
    )
    return content


def _call_model(client: Anthropic, content: list[dict[str, Any]], model: str) -> Any:
    return client.messages.create(
        model=model,
        max_tokens=EXTRACT_MAX_TOKENS,
        system=SYSTEM_PROMPT,
        tools=[_profile_tool_schema()],
        tool_choice={"type": "tool", "name": "submit_profile"},
        messages=[{"role": "user", "content": content}],
    )


def _first_tool_input(response: Any) -> dict[str, Any] | None:
    for block in response.content:
        if getattr(block, "type", None) == "tool_use":
            data = block.input
            return dict(data) if isinstance(data, dict) else None
    return None


def _as_list(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip() for item in value if str(item).strip()]


def _enum_value(value: Any, allowed: frozenset[str], *, upper: bool = False) -> str | None:
    if not isinstance(value, str):
        return None
    candidate = value.upper() if upper else value
    return candidate if candidate in allowed else None


def _coerce(data: dict[str, Any]) -> ResumeExtraction:
    """Keep only values that conform to the canonical vocabulary and GPA range."""
    try:
        gpa: float | None = float(data["gpa"])
    except (KeyError, TypeError, ValueError):
        gpa = None
    if gpa is not None and not 0.0 <= gpa <= 4.0:
        gpa = None

    return ResumeExtraction(
        gpa=gpa,
        grade_level=_enum_value(data.get("grade_level"), GRADE_LEVEL_VALUES),
        intended_majors=[
            m for m in _as_list(data.get("intended_majors")) if m in FIELD_OF_STUDY_VALUES
        ],
        demographic_tags=[
            d for d in _as_list(data.get("demographic_tags")) if d in DEMOGRAPHIC_TAG_VALUES
        ],
        state=_enum_value(data.get("state"), STATE_CODE_VALUES, upper=True),
        citizenship=_enum_value(data.get("citizenship"), CITIZENSHIP_VALUES),
        financial_need_level=_enum_value(
            data.get("financial_need_level"), FINANCIAL_NEED_LEVEL_VALUES
        ),
        activities=_as_list(data.get("activities"))[:MAX_LIST_ITEMS],
        target_schools=_as_list(data.get("target_schools"))[:MAX_LIST_ITEMS],
    )


def extract_profile_from_resume(
    *,
    resume_text: str | None = None,
    pdf_bytes: bytes | None = None,
    client: Anthropic | None = None,
) -> ResumeExtractionResponse:
    if not resume_text and not pdf_bytes:
        raise AIFeatureError("Provide a resume file or paste resume text.", status_code=400)

    api_key = get_api_key()
    if not api_key:
        raise AIFeatureError(
            "This feature is not available right now. The server needs an API key configured.",
            status_code=503,
        )

    anthropic_client = client or Anthropic(api_key=api_key)
    content = _build_content(resume_text, pdf_bytes)
    models_to_try = (EXTRACT_MODEL, *EXTRACT_FALLBACK_MODELS)

    response: Any | None = None
    last_error: Exception | None = None
    for model in models_to_try:
        try:
            response = _call_model(anthropic_client, content, model)
            break
        except NotFoundError as exc:
            last_error = exc
            continue
        except Exception as exc:
            raise map_api_error(exc) from None

    if response is None:
        raise map_api_error(last_error or Exception("No model available"))

    tool_input = _first_tool_input(response)
    if tool_input is None:
        raise AIFeatureError(
            "Could not read the resume. Try pasting the text instead.",
            status_code=502,
        )

    notes = tool_input.get("notes")
    return ResumeExtractionResponse(
        profile=_coerce(tool_input),
        notes=notes if isinstance(notes, str) and notes.strip() else None,
    )

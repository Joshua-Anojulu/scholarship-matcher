"""Server-side Anthropic integration for scholarship essay guidance."""

from __future__ import annotations

from typing import Any

from anthropic import Anthropic, NotFoundError

from app.llm import AIFeatureError as EssayAdviceError
from app.llm import get_api_key as _get_api_key
from app.llm import map_api_error as _map_api_error
from app.models.scholarship import Scholarship
from app.models.student import StudentProfile

ESSAY_MODEL = "claude-sonnet-4-6"
ESSAY_FALLBACK_MODELS = (
    "claude-sonnet-4-20250514",
    "claude-3-5-sonnet-20241022",
)
ESSAY_MAX_TOKENS = 1024
ESSAY_REVIEW_MAX_TOKENS = 1500


SYSTEM_PROMPT = """You are a practical scholarship essay coach for U.S. students.
You write concise, specific guidance tied to the student's real profile and one scholarship.
Be honest and direct. Do not flatter or pad.
Do NOT use em dashes anywhere in your output. Use commas, periods, or parentheses instead.
If the student provided very little information, say what additional detail would help rather than inventing facts about them."""


def _format_student_context(student: StudentProfile) -> str:
    activities = ", ".join(student.activities) if student.activities else "(none provided)"
    majors = ", ".join(student.intended_majors) if student.intended_majors else "(none provided)"
    demographics = (
        ", ".join(student.demographic_tags) if student.demographic_tags else "(none provided)"
    )
    schools = (
        ", ".join(student.target_schools)
        if student.target_schools
        else "(none provided)"
    )
    return f"""Student profile:
- GPA: {student.gpa}
- Grade level: {student.grade_level}
- Citizenship: {student.citizenship}
- State: {student.state}
- Financial need level: {student.financial_need_level}
- Intended fields of study: {majors}
- Demographic tags: {demographics}
- Activities: {activities}
- Target schools: {schools}"""


def _format_scholarship_context(scholarship: Scholarship) -> str:
    eligibility = scholarship.eligibility
    fields = (
        ", ".join(eligibility.fields_of_study)
        if eligibility.fields_of_study
        else "open to all fields"
    )
    demographics = (
        ", ".join(eligibility.demographics)
        if eligibility.demographics
        else "no specific demographic requirements"
    )
    return f"""Scholarship:
- Name: {scholarship.name}
- Sponsor: {scholarship.sponsor}
- Description: {scholarship.description}
- Fields of study: {fields}
- Demographics emphasized: {demographics}
- Essay required: {eligibility.essay_required}"""


def build_essay_prompt(student: StudentProfile, scholarship: Scholarship) -> str:
    return f"""{_format_student_context(student)}

{_format_scholarship_context(scholarship)}

Using ONLY the student's real inputs above, write tailored essay guidance with these sections:

1. Essay angle suggestions: Provide two or three specific angles that draw on the student's actual activities, fields of study, grade level, and demographic context. Reference their real inputs. Do not use hypotheticals like "if you volunteered" when they already listed activities.

2. What this sponsor likely values: A short note on what the sponsor appears to value based on its description and eligibility, and how this student can speak to that with their real background.

3. Common mistake to avoid: One mistake applicants often make for this type of scholarship essay.

Keep the total response concise and practical. Use plain section headings."""


def build_essay_review_prompt(
    student: StudentProfile, scholarship: Scholarship, draft: str
) -> str:
    return f"""{_format_student_context(student)}

{_format_scholarship_context(scholarship)}

The student has written a draft essay for this scholarship. Review it.

Draft essay:
\"\"\"
{draft}
\"\"\"

Give specific, constructive feedback in these sections:

1. Strengths: What works in this draft and should stay. Point to actual sentences or ideas the student wrote.

2. Specific improvements: The two or three highest-impact changes. Quote or paraphrase the part of the draft you mean, and say concretely what to do instead. Tie advice to the student's real profile and what this sponsor values.

3. Alignment with this scholarship: Whether the draft speaks to what this sponsor appears to value, and what to add or cut to align it better.

4. Mechanics and clarity: One or two notes on structure, wording, or flow.

Be honest and direct. Refer to what the student actually wrote, not hypotheticals. Do not rewrite the essay for them; guide them to revise it themselves."""


def _call_model(client: Anthropic, user_prompt: str, model: str, max_tokens: int) -> Any:
    return client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_prompt}],
    )


def _complete(
    user_prompt: str,
    *,
    client: Anthropic | None = None,
    max_tokens: int = ESSAY_MAX_TOKENS,
) -> str:
    """Run one Anthropic completion with model fallback and safe error mapping."""
    api_key = _get_api_key()
    if not api_key:
        raise EssayAdviceError(
            "This feature is not available right now. The server needs an API key configured.",
            status_code=503,
        )

    anthropic_client = client or Anthropic(api_key=api_key)
    models_to_try = (ESSAY_MODEL, *ESSAY_FALLBACK_MODELS)

    response: Any | None = None
    last_error: Exception | None = None
    for model in models_to_try:
        try:
            response = _call_model(anthropic_client, user_prompt, model, max_tokens)
            break
        except NotFoundError as exc:
            last_error = exc
            continue
        except Exception as exc:
            raise _map_api_error(exc) from None

    if response is None:
        raise _map_api_error(last_error or Exception("No model available"))

    text_blocks = [
        block.text
        for block in response.content
        if hasattr(block, "text") and block.text
    ]
    if not text_blocks:
        raise EssayAdviceError(
            "The response came back empty. Try again in a few minutes.",
            status_code=502,
        )

    return "\n".join(text_blocks).strip()


def generate_essay_advice(
    student: StudentProfile,
    scholarship: Scholarship,
    *,
    client: Anthropic | None = None,
) -> str:
    """Pre-writing guidance: essay angles tailored to the student and scholarship."""
    return _complete(build_essay_prompt(student, scholarship), client=client)


def generate_essay_review(
    student: StudentProfile,
    scholarship: Scholarship,
    draft: str,
    *,
    client: Anthropic | None = None,
) -> str:
    """Post-writing feedback on the student's actual draft for this scholarship."""
    return _complete(
        build_essay_review_prompt(student, scholarship, draft),
        client=client,
        max_tokens=ESSAY_REVIEW_MAX_TOKENS,
    )

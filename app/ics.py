"""Build an iCalendar (.ics) document for saved opportunity deadlines.

Hand-rolled per RFC 5545 so the export needs no extra dependency. Only entries
with a real ISO date are included; rolling and unverified deadlines are skipped.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.models.program import SummerProgram
from app.models.scholarship import Scholarship

_PRODID = "-//Scholarships4U//Opportunity Deadlines//EN"


def _parse_deadline(deadline: str) -> date | None:
    if not deadline or deadline == "rolling" or deadline.startswith("VERIFY"):
        return None
    try:
        return date.fromisoformat(deadline)
    except ValueError:
        return None


def _format_award(amount: float | str) -> str:
    if isinstance(amount, (int, float)):
        return f"${amount:,.0f}"
    return str(amount)


def _escape(text: str) -> str:
    """Escape the characters iCalendar treats as special in text values."""
    return (
        text.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def _event_lines(
    *,
    uid: str,
    name: str,
    deadline: str,
    description: str,
    stamp: str,
) -> list[str]:
    parsed_deadline = _parse_deadline(deadline)
    if parsed_deadline is None:
        return []
    start = parsed_deadline.strftime("%Y%m%d")
    # All-day VEVENTs use a non-inclusive DTEND on the following day.
    end = (parsed_deadline + timedelta(days=1)).strftime("%Y%m%d")
    return [
        "BEGIN:VEVENT",
        f"UID:{uid}@scholarships4u",
        f"DTSTAMP:{stamp}",
        f"DTSTART;VALUE=DATE:{start}",
        f"DTEND;VALUE=DATE:{end}",
        f"SUMMARY:{_escape('Apply: ' + name)}",
        f"DESCRIPTION:{_escape(description)}",
        "END:VEVENT",
    ]


def build_calendar(
    scholarships: list[Scholarship],
    programs: list[SummerProgram] | None = None,
) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{_PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Scholarships4U verified deadlines",
    ]
    for scholarship in scholarships:
        lines += _event_lines(
            uid=f"scholarship-{scholarship.id}",
            name=scholarship.name,
            deadline=scholarship.deadline,
            description=(
                f"Scholarship. Sponsor: {scholarship.sponsor}. "
                f"Award: {_format_award(scholarship.award_amount)}. "
                f"{scholarship.url}"
            ),
            stamp=stamp,
        )
    for program in programs or []:
        lines += _event_lines(
            uid=f"program-{program.id}",
            name=program.name,
            deadline=program.deadline,
            description=(
                f"Summer program. Host: {program.host}. "
                f"Cost: {program.cost}. Location: {program.location}. "
                f"{program.url}"
            ),
            stamp=stamp,
        )
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

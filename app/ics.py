"""Build an iCalendar (.ics) document for saved scholarship deadlines.

Hand-rolled per RFC 5545 so the export needs no extra dependency. Only entries
with a real ISO date are included; rolling and unverified deadlines are skipped.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.models.scholarship import Scholarship

_PRODID = "-//Scholarships4U//Deadlines//EN"


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


def build_calendar(scholarships: list[Scholarship]) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        f"PRODID:{_PRODID}",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "X-WR-CALNAME:Scholarship deadlines",
    ]
    for scholarship in scholarships:
        deadline = _parse_deadline(scholarship.deadline)
        if deadline is None:
            continue
        start = deadline.strftime("%Y%m%d")
        # All-day VEVENTs use a non-inclusive DTEND on the following day.
        end = (deadline + timedelta(days=1)).strftime("%Y%m%d")
        description = _escape(
            f"Sponsor: {scholarship.sponsor}. "
            f"Award: {_format_award(scholarship.award_amount)}. "
            f"{scholarship.url}"
        )
        lines += [
            "BEGIN:VEVENT",
            f"UID:{scholarship.id}@scholarships4u",
            f"DTSTAMP:{stamp}",
            f"DTSTART;VALUE=DATE:{start}",
            f"DTEND;VALUE=DATE:{end}",
            f"SUMMARY:{_escape('Apply: ' + scholarship.name)}",
            f"DESCRIPTION:{description}",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    return "\r\n".join(lines) + "\r\n"

"""Smoke-test the live Scholarships4U deployment."""

from __future__ import annotations

import json
import sys
import uuid

import httpx

BASE = "https://scholarship-matcher-fqr2.onrender.com"
TIMEOUT = 120.0


def main() -> int:
    failures: list[str] = []
    client = httpx.Client(base_url=BASE, timeout=TIMEOUT, follow_redirects=True)

    def check(name: str, ok: bool, detail: str = "") -> None:
        status = "PASS" if ok else "FAIL"
        print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
        if not ok:
            failures.append(name)

    # Health
    r = client.get("/health")
    check("GET /health", r.status_code == 200 and r.json().get("status") == "ok", r.text[:80])

    # Match
    profile = {
        "gpa": 3.8,
        "grade_level": "high_school_senior",
        "citizenship": "us_citizen",
        "state": "TX",
        "financial_need_level": "medium",
        "intended_majors": ["engineering"],
        "demographic_tags": [],
        "target_schools": [],
        "activities": ["robotics club"],
    }
    r = client.post("/match", json=profile)
    results = r.json() if r.status_code == 200 else []
    check(
        "POST /match",
        r.status_code == 200 and isinstance(results, list) and len(results) > 0,
        f"{len(results)} matches" if results else r.text[:120],
    )

    # Signup + session
    email = f"smoke-{uuid.uuid4().hex[:12]}@example.com"
    password = "SmokeTest123!"
    r = client.post("/auth/signup", json={"email": email, "password": password})
    check("POST /auth/signup", r.status_code == 201, r.text[:120])

    r = client.get("/auth/me")
    check("GET /auth/me", r.status_code == 200 and r.json().get("email") == email, r.text[:80])

    # Save profile
    r = client.put("/account/profile", json=profile)
    check("PUT /account/profile", r.status_code == 200, r.text[:80])

    r = client.get("/account/profile")
    body = r.json() if r.status_code == 200 else {}
    check(
        "GET /account/profile",
        r.status_code == 200 and body.get("profile", {}).get("gpa") == 3.8,
        r.text[:80],
    )

    # Bookmark first match
    scholarship_id = results[0]["scholarship_id"] if results else None
    if scholarship_id:
        r = client.post(f"/account/saved/{scholarship_id}")
        check("POST /account/saved/{id}", r.status_code == 201, r.text[:80])

        r = client.get("/account/saved")
        saved = r.json() if r.status_code == 200 else []
        check(
            "GET /account/saved",
            r.status_code == 200 and len(saved) >= 1,
            f"{len(saved)} saved",
        )

        r = client.get("/account/saved/calendar.ics")
        check(
            "GET /account/saved/calendar.ics",
            r.status_code == 200 and "BEGIN:VCALENDAR" in r.text,
            r.headers.get("content-type", "")[:40],
        )
    else:
        check("POST /account/saved/{id}", False, "no match to save")
        check("GET /account/saved", False, "skipped")
        check("GET /account/saved/calendar.ics", False, "skipped")

    # Password reset (expect 503 until Resend configured, or 200 if configured)
    r = client.post("/auth/password-reset/request", json={"email": email})
    if r.status_code == 503:
        check(
            "POST /auth/password-reset/request",
            True,
            "503 as expected — Resend not configured yet",
        )
    elif r.status_code == 200:
        check("POST /auth/password-reset/request", True, "200 — email flow enabled")
    else:
        check("POST /auth/password-reset/request", False, f"{r.status_code} {r.text[:120]}")

    # Cleanup: delete test account
    r = client.post("/auth/delete-account", json={"password": password})
    check("POST /auth/delete-account", r.status_code == 200, r.text[:80])

    print()
    if failures:
        print(f"Failed: {', '.join(failures)}")
        return 1
    print("All smoke tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

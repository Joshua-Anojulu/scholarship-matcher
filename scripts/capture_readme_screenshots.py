"""Capture README screenshots from a running Scholarships4U deployment.

Usage:
    pip install playwright
    playwright install chromium
    python scripts/capture_readme_screenshots.py

Optional:
    SCHOLARSHIPS4U_URL=https://your-host.onrender.com python scripts/capture_readme_screenshots.py
"""

from __future__ import annotations

import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.getenv(
    "SCHOLARSHIPS4U_URL", "https://scholarship-matcher-fqr2.onrender.com"
).rstrip("/")
OUT_DIR = Path(__file__).resolve().parent.parent / "docs" / "screenshots"


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(viewport={"width": 1280, "height": 900})
        page.add_init_script(
            'window.localStorage.setItem("site_consent_v1", "yes");'
        )
        page.goto(BASE_URL, wait_until="networkidle", timeout=120_000)

        page.locator(".hero").screenshot(path=OUT_DIR / "hero.png")

        page.locator("#gpa").fill("3.8")
        page.locator("#grade-level").select_option(label="High school senior")
        page.locator("#citizenship").select_option(label="US citizen")
        page.locator("#state").select_option(label="Texas")
        page.locator("#financial-need").select_option(label="Medium")
        page.locator('#fields-of-study input[value="engineering"]').check()
        page.locator("#submit-btn").click()

        page.locator("#results-section").wait_for(state="visible", timeout=60_000)
        page.locator("#results-section").screenshot(path=OUT_DIR / "match-results.png")

        page.locator(".match-card").first.screenshot(path=OUT_DIR / "match-card.png")
        browser.close()

    print(f"Saved screenshots to {OUT_DIR}")


if __name__ == "__main__":
    main()

import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, PlainTextResponse, Response
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.sessions import SessionMiddleware
from starlette.requests import Request as StarletteRequest

from app.api.account_routes import router as account_router
from app.api.auth_routes import router as auth_router
from app.data.loader import load_scholarships
from app.db.database import init_db
from app.essay.advice import (
    EssayAdviceError,
    generate_essay_advice,
    generate_essay_review,
)
from app.llm import AIFeatureError
from app.matching.matcher import match_scholarships
from app.models.essay import (
    EssayAdviceRequest,
    EssayAdviceResponse,
    EssayReviewRequest,
    EssayReviewResponse,
)
from app.models.match import MatchResult
from app.models.resume import ResumeExtractionResponse
from app.models.scholarship import Scholarship
from app.models.student import StudentProfile
from app.rate_limit import rate_limiter
from app.resume.extractor import extract_profile_from_resume
from app.vocabulary import VocabularyOption, get_vocabulary

# Cap upload size so a huge file cannot be read fully into memory or sent upstream.
MAX_RESUME_BYTES = 5 * 1024 * 1024
# Cap pasted/decoded resume text so an oversized paste cannot inflate token cost.
MAX_RESUME_TEXT = 50_000

# AI endpoints call a paid API, so they are rate limited per client IP.
_essay_limit = rate_limiter(15, 60, "essay")
_resume_limit = rate_limiter(10, 60, "resume")

load_dotenv()

STATIC_DIR = Path(__file__).parent / "static"

# A stable default keeps logins working across local restarts. In production the
# app refuses to boot with a guessable key (see _resolve_session_secret).
DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me"

_OG_IMAGE_PATH = "/static/og-image-dark.svg"
_SITEMAP_PATHS = ("/", "/privacy", "/terms")
_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy": (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    ),
}


def is_production_deploy() -> bool:
    """True when running on Render or against a Postgres DATABASE_URL."""
    return bool(os.getenv("RENDER")) or os.getenv("DATABASE_URL", "").startswith("postgres")


def _resolve_session_secret() -> str:
    secret = os.getenv("SESSION_SECRET", "").strip()
    # A Postgres database or Render's platform variable means this is a real
    # deployment, where signing session cookies with a guessable key would let
    # anyone forge a logged-in session.
    in_production = is_production_deploy()
    if not secret or secret == DEV_SESSION_SECRET:
        if in_production:
            raise RuntimeError(
                "SESSION_SECRET must be set to a strong, unique value in production. "
                "Set it in your host's environment variables and redeploy."
            )
        return DEV_SESSION_SECRET
    return secret


SESSION_SECRET = _resolve_session_secret()
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}
_DOCS_ENABLED = not is_production_deploy()


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        for header, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(header, value)
        return response


def _public_base_url(request: Request) -> str:
    env = os.getenv("PUBLIC_APP_URL", "").strip().rstrip("/")
    return env or str(request.base_url).rstrip("/")


def _absolute_og_image_urls(html: str, base_url: str) -> str:
    absolute = f"{base_url}{_OG_IMAGE_PATH}"
    return html.replace(f'content="{_OG_IMAGE_PATH}"', f'content="{absolute}"')


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.scholarships = load_scholarships()
    yield


app = FastAPI(
    title="Scholarships4U",
    description="Match students to scholarships with transparent, explainable scoring.",
    lifespan=lifespan,
    docs_url="/docs" if _DOCS_ENABLED else None,
    redoc_url="/redoc" if _DOCS_ENABLED else None,
    openapi_url="/openapi.json" if _DOCS_ENABLED else None,
)

app.add_middleware(SecurityHeadersMiddleware)

app.add_middleware(
    SessionMiddleware,
    secret_key=SESSION_SECRET,
    same_site="lax",
    https_only=SESSION_COOKIE_SECURE,
)

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1)(:\d+)?",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(account_router)


def _find_scholarship(scholarships: list[Scholarship], scholarship_id: str) -> Scholarship | None:
    for scholarship in scholarships:
        if scholarship.id == scholarship_id:
            return scholarship
    return None


@app.get("/")
def serve_index(request: Request) -> HTMLResponse:
    # Always revalidate the HTML so the ?v cache-busting on CSS/JS stays reliable;
    # a stale cached page would keep requesting old asset versions.
    html = (STATIC_DIR / "index.html").read_text(encoding="utf-8")
    html = _absolute_og_image_urls(html, _public_base_url(request))
    return HTMLResponse(html, headers={"Cache-Control": "no-cache"})


@app.get("/robots.txt", response_class=PlainTextResponse)
def robots_txt(request: Request) -> PlainTextResponse:
    base = _public_base_url(request)
    return PlainTextResponse(
        f"User-agent: *\nAllow: /\nDisallow: /docs\nDisallow: /redoc\nSitemap: {base}/sitemap.xml\n",
        media_type="text/plain",
    )


@app.get("/sitemap.xml", response_class=Response)
def sitemap_xml(request: Request) -> Response:
    base = _public_base_url(request)
    urls = "\n".join(
        f"  <url><loc>{base}{path if path != '/' else ''}/</loc></url>"
        if path == "/"
        else f"  <url><loc>{base}{path}</loc></url>"
        for path in _SITEMAP_PATHS
    )
    body = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"{urls}\n"
        "</urlset>\n"
    )
    return Response(content=body, media_type="application/xml")


@app.get("/privacy")
def serve_privacy() -> FileResponse:
    return FileResponse(STATIC_DIR / "privacy.html", headers={"Cache-Control": "no-cache"})


@app.get("/terms")
def serve_terms() -> FileResponse:
    return FileResponse(STATIC_DIR / "terms.html", headers={"Cache-Control": "no-cache"})


@app.get("/health")
def health() -> dict[str, str]:
    info = {"status": "ok"}
    commit = os.getenv("RENDER_GIT_COMMIT")
    if commit:
        # Render injects the deployed commit SHA; exposing it confirms which
        # build is live (handy for verifying a redeploy actually rolled out).
        info["commit"] = commit[:7]
    return info


@app.get("/vocabulary")
def vocabulary() -> dict[str, list[VocabularyOption]]:
    return get_vocabulary()


@app.get("/scholarships")
def get_scholarships(request: Request) -> list[Scholarship]:
    return request.app.state.scholarships


@app.post("/match")
def match_student(request: Request, student: StudentProfile) -> list[MatchResult]:
    scholarships: list[Scholarship] = request.app.state.scholarships
    return match_scholarships(student, scholarships)


@app.post(
    "/essay-advice",
    response_model=EssayAdviceResponse,
    dependencies=[Depends(_essay_limit)],
)
def essay_advice(request: Request, body: EssayAdviceRequest) -> EssayAdviceResponse:
    scholarships: list[Scholarship] = request.app.state.scholarships
    scholarship = _find_scholarship(scholarships, body.scholarship_id)
    if scholarship is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "That scholarship was not found in the current dataset."},
        )

    try:
        advice_text = generate_essay_advice(body.student, scholarship)
    except EssayAdviceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": exc.user_message},
        ) from None

    return EssayAdviceResponse(
        scholarship_id=scholarship.id,
        scholarship_name=scholarship.name,
        advice=advice_text,
    )


@app.post(
    "/essay-review",
    response_model=EssayReviewResponse,
    dependencies=[Depends(_essay_limit)],
)
def essay_review(request: Request, body: EssayReviewRequest) -> EssayReviewResponse:
    scholarships: list[Scholarship] = request.app.state.scholarships
    scholarship = _find_scholarship(scholarships, body.scholarship_id)
    if scholarship is None:
        raise HTTPException(
            status_code=404,
            detail={"error": "That scholarship was not found in the current dataset."},
        )

    try:
        feedback_text = generate_essay_review(body.student, scholarship, body.draft)
    except EssayAdviceError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": exc.user_message},
        ) from None

    return EssayReviewResponse(
        scholarship_id=scholarship.id,
        scholarship_name=scholarship.name,
        feedback=feedback_text,
    )


async def _read_upload_capped(upload: UploadFile, max_bytes: int) -> bytes | None:
    """Read an upload in chunks, returning None if it exceeds max_bytes.

    Reading in chunks (rather than upload.read() all at once) means a huge file
    is rejected after ~max_bytes instead of being loaded fully into memory.
    """
    chunks: list[bytes] = []
    total = 0
    while True:
        chunk = await upload.read(64 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > max_bytes:
            return None
        chunks.append(chunk)
    return b"".join(chunks)


@app.post(
    "/resume/extract",
    response_model=ResumeExtractionResponse,
    dependencies=[Depends(_resume_limit)],
)
async def resume_extract(
    file: UploadFile | None = File(default=None),
    text: str | None = Form(default=None),
) -> ResumeExtractionResponse:
    resume_text = (text or "").strip()[:MAX_RESUME_TEXT] or None
    pdf_bytes: bytes | None = None

    if file is not None:
        raw = await _read_upload_capped(file, MAX_RESUME_BYTES)
        if raw is None:
            raise HTTPException(
                status_code=413,
                detail={"error": "That file is too large. Use a resume under 5 MB."},
            )
        filename = (file.filename or "").lower()
        if file.content_type == "application/pdf" or filename.endswith(".pdf"):
            pdf_bytes = raw or None
        else:
            decoded = raw.decode("utf-8", errors="ignore").strip()
            resume_text = "\n".join(part for part in (resume_text, decoded) if part) or None

    if resume_text:
        resume_text = resume_text[:MAX_RESUME_TEXT]

    if pdf_bytes is None and not resume_text:
        raise HTTPException(
            status_code=400,
            detail={"error": "Upload a PDF or paste your resume text."},
        )

    try:
        return extract_profile_from_resume(resume_text=resume_text, pdf_bytes=pdf_bytes)
    except AIFeatureError as exc:
        raise HTTPException(
            status_code=exc.status_code,
            detail={"error": exc.user_message},
        ) from None


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


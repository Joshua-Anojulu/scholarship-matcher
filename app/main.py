import os
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

from app.api.account_routes import router as account_router
from app.api.auth_routes import router as auth_router
from app.data.loader import load_scholarships
from app.db.database import init_db
from app.essay.advice import EssayAdviceError, generate_essay_advice
from app.matching.matcher import match_scholarships
from app.models.essay import EssayAdviceRequest, EssayAdviceResponse
from app.models.match import MatchResult
from app.models.scholarship import Scholarship
from app.models.student import StudentProfile
from app.vocabulary import VocabularyOption, get_vocabulary

load_dotenv()

STATIC_DIR = Path(__file__).parent / "static"

# A stable default keeps logins working across local restarts. Production must
# override this with a real secret set in the host's environment variables.
DEV_SESSION_SECRET = "dev-only-insecure-session-secret-change-me"
SESSION_SECRET = os.getenv("SESSION_SECRET", DEV_SESSION_SECRET)
SESSION_COOKIE_SECURE = os.getenv("SESSION_COOKIE_SECURE", "").lower() in {"1", "true", "yes"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    app.state.scholarships = load_scholarships()
    yield


app = FastAPI(
    title="Scholarships4U",
    description="Match students to scholarships with transparent, explainable scoring.",
    lifespan=lifespan,
)

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
def serve_index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


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


@app.post("/essay-advice", response_model=EssayAdviceResponse)
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


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


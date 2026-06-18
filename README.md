# Scholarships4U

Scholarships4U is a personal portfolio project that helps U.S. students explore a small curated set of real national scholarships. Students submit a profile, receive ranked matches with transparent scoring, and can request essay guidance generated server-side by an LLM. An optional free account lets a student save their profile (it prefills on return) and bookmark scholarships.

## How it works

**Matching.** The app scores each scholarship with a transparent additive algorithm over field-of-study overlap and demographic tag overlap. GPA, grade level, state, citizenship, and passed deadlines act as hard filters only when the dataset holds a real value (not a `VERIFY` placeholder). Open-to-all scholarships receive a lower field score than specific field matches. Results are grouped into **Strong** and **Possible** tiers, with tie-breaking by confirmed upcoming deadlines and then scholarship name. Every match includes human-readable reasons and a numeric score breakdown.

**Essay advice.** When a student clicks **Get essay advice** on a result card, the backend sends the student's actual profile inputs and the scholarship description to the Anthropic API. The response suggests essay angles tied to the student's stated activities and background, notes what the sponsor likely values, and flags one common mistake. The API key never leaves the server.

**Accounts.** Accounts are optional. Without one, the app works exactly as before and keeps no data between visits. With an account (email and password), the student's profile is saved and prefilled on their next visit, and they can bookmark scholarships to a personal saved list. Passwords are stored as bcrypt hashes, never in plain text. The login is kept in a signed, httponly session cookie, so the session identifier is not readable by client JavaScript.

## Tech stack

- **Backend:** Python, FastAPI
- **Frontend:** Vanilla HTML, CSS, and JavaScript (served by FastAPI)
- **Scholarship data:** Pydantic models, local JSON file loaded at startup
- **Accounts and saved data:** SQLAlchemy ORM, SQLite locally and Postgres in production, bcrypt password hashing, signed session cookies
- **LLM:** Anthropic API (Claude Sonnet) for essay advice, server-side only

## Run locally

### 1. Create a virtual environment

```bash
python -m venv .venv
```

Windows:

```bash
.venv\Scripts\activate
```

macOS or Linux:

```bash
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

For development and tests:

```bash
pip install -r requirements-dev.txt
```

### 3. Set the API key

Copy the example env file and add your key:

```bash
copy .env.example .env
```

On macOS or Linux, use `cp .env.example .env`.

Edit `.env` and set:

```
ANTHROPIC_API_KEY=your_key_here
SESSION_SECRET=any_long_random_string
```

The real key belongs only in `.env`, which is gitignored. Do not put a real key in `.env.example`.

`ANTHROPIC_API_KEY` is required for essay advice. Each request incurs Anthropic API usage cost. `SESSION_SECRET` signs login session cookies; any long random string works locally.

`DATABASE_URL` is optional locally. When it is unset, the app creates a SQLite file (`scholarships4u.db`) in the project folder and uses it automatically, so accounts work with no extra setup.

### 4. Start the server

```bash
uvicorn app.main:app --reload
```

Open the app at [http://127.0.0.1:8000/](http://127.0.0.1:8000/).

API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

## Deploy (Render)

This repo includes a [`render.yaml`](render.yaml) for [Render](https://render.com/) free-tier services. It defines both the web service and a free Postgres database.

1. Push the repository to GitHub (without `.env`).
2. In Render, create a **Blueprint** from the repo. Render reads `render.yaml` and provisions:
   - A web service with build `pip install -r requirements.txt` and start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
   - A free Postgres database, wired to the web service as `DATABASE_URL`.
   - A generated `SESSION_SECRET`.
   - `SESSION_COOKIE_SECURE=true` so session cookies are sent only over HTTPS.
3. In the Render dashboard, set the one remaining secret under **Environment Variables**:
   - `ANTHROPIC_API_KEY` = your Anthropic API key

Do not commit the API key. Set it only in the host's environment variable UI. The app reads `DATABASE_URL` and switches from SQLite to Postgres automatically, so saved accounts persist across deploys.

The free Postgres plan and free web service are enough for a demo. On the free tier the database can expire after a period of inactivity, so treat saved data as non-critical.

### Railway (alternative)

1. Create a new project from the GitHub repo.
2. Set the start command:

```bash
uvicorn app.main:app --host 0.0.0.0 --port $PORT
```

3. Add a Postgres database to the project. Railway exposes its connection string as `DATABASE_URL`.
4. In the **Variables** tab, set `ANTHROPIC_API_KEY`, `SESSION_SECRET` (any long random string), and `SESSION_COOKIE_SECURE=true`.

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/` | Web app |
| `GET` | `/health` | Health check |
| `GET` | `/vocabulary` | Form option lists |
| `GET` | `/scholarships` | Full dataset |
| `POST` | `/match` | Rank scholarships for a profile |
| `POST` | `/essay-advice` | Generate essay guidance |
| `POST` | `/auth/signup` | Create an account and start a session |
| `POST` | `/auth/login` | Log in and start a session |
| `POST` | `/auth/logout` | End the session |
| `GET` | `/auth/me` | Current logged-in user |
| `GET` | `/account/profile` | Get the saved profile |
| `PUT` | `/account/profile` | Save or update the profile |
| `GET` | `/account/saved` | List saved scholarships |
| `POST` | `/account/saved/{id}` | Save a scholarship |
| `DELETE` | `/account/saved/{id}` | Remove a saved scholarship |

## Tests

```bash
pip install -r requirements-dev.txt
python -m pytest tests/ -v
```

Tests mock Anthropic calls. No paid API usage during the test run.

## Project structure

```
scholarship-matcher/
├── render.yaml
├── requirements.txt
├── requirements-dev.txt
├── .env.example
├── tests/
└── app/
    ├── main.py
    ├── vocabulary.py
    ├── api/          (auth and account routes)
    ├── auth/         (password hashing, session dependency)
    ├── db/           (SQLAlchemy engine and ORM models)
    ├── essay/
    ├── matching/
    ├── models/
    ├── static/
    └── data/
        └── scholarships.json
```

## Limitations

- The scholarship dataset is a **curated set** (117 real national programs), not a comprehensive directory.
- Some fields are marked `VERIFY` and must be confirmed on each sponsor's official page before you rely on them.
- Essay advice is generated guidance, not a guarantee of admission or funding.
- Accounts are intentionally basic (email and password). There is no email verification or password reset flow, so this is suited to a demo rather than production use.
- On the free Postgres tier, saved data should be treated as non-critical because the database can expire after inactivity.
- This is a **personal portfolio project**, not an official scholarship search or application service.

## Future work

- Resume parsing as a profile intake method
- Expand and fully verify the scholarship dataset
- School-specific scholarship matching
- Live data integration with sponsor feeds or APIs
- Account improvements: email verification, password reset, and schema migrations (for example Alembic)

---

*Scholarships4U is a personal project built for learning and demonstration.*

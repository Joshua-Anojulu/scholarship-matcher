"""Shared test setup.

Point the app at an isolated, temporary SQLite database before any app module
is imported, so tests never touch a real local or production database.
"""

import atexit
import os
import tempfile

_db_fd, _db_path = tempfile.mkstemp(suffix=".db")
os.close(_db_fd)

# SQLAlchemy SQLite URLs use forward slashes even on Windows.
os.environ["DATABASE_URL"] = "sqlite:///" + _db_path.replace("\\", "/")
os.environ.setdefault("SESSION_SECRET", "test-session-secret")


@atexit.register
def _cleanup_test_db() -> None:
    try:
        os.remove(_db_path)
    except OSError:
        pass

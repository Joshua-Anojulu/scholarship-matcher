"""Shared Anthropic helpers used by the essay and resume features.

Keeping the API-key lookup and error mapping in one place means the AI-backed
features map provider errors to the same safe, user-facing messages and never
leak the key or a raw traceback to the client.
"""

from __future__ import annotations

import os

from anthropic import (
    APIConnectionError,
    APITimeoutError,
    AuthenticationError,
    NotFoundError,
    PermissionDeniedError,
    RateLimitError,
)


class AIFeatureError(Exception):
    """Raised when an AI-backed feature fails; carries a safe user message."""

    def __init__(self, user_message: str, status_code: int = 503) -> None:
        self.user_message = user_message
        self.status_code = status_code
        super().__init__(user_message)


def get_api_key() -> str | None:
    raw = os.environ.get("ANTHROPIC_API_KEY")
    if not raw:
        return None
    cleaned = raw.strip().strip('"').strip("'")
    return cleaned or None


def map_api_error(exc: Exception) -> AIFeatureError:
    """Translate an Anthropic SDK exception into a safe, actionable message."""
    if isinstance(exc, AuthenticationError):
        return AIFeatureError(
            "Could not connect to the AI service. "
            "Check that ANTHROPIC_API_KEY in .env is valid and active.",
            status_code=503,
        )
    if isinstance(exc, PermissionDeniedError):
        return AIFeatureError(
            "This AI feature is not available for this API key. "
            "Confirm your Anthropic account has API access enabled.",
            status_code=503,
        )
    if isinstance(exc, NotFoundError):
        return AIFeatureError(
            "Could not reach the configured AI model. "
            "The server may need a model update. Try again later.",
            status_code=503,
        )
    if isinstance(exc, RateLimitError):
        return AIFeatureError(
            "Too many requests. Wait a minute and try again.",
            status_code=429,
        )
    if isinstance(exc, (APIConnectionError, APITimeoutError)):
        return AIFeatureError(
            "Could not reach the AI service. Check your network and try again.",
            status_code=503,
        )
    return AIFeatureError(
        "The request could not be completed right now. Try again in a few minutes.",
        status_code=503,
    )

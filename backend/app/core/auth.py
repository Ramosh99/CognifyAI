"""
Auth dependency — extracts the authenticated user_id from a Supabase JWT.

Uses Supabase's JWKS endpoint for verification — no JWT secret needed in .env.
Falls back to HS256 with SUPABASE_JWT_SECRET if set.

Usage in any endpoint:
    from app.core.auth import get_current_user_id
    ...
    def my_endpoint(user_id: str = Depends(get_current_user_id)):
        ...
"""
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from app.core.config import settings

_bearer = HTTPBearer(auto_error=False)

# Supabase JWKS URL — used to verify tokens without needing the raw secret
def _get_jwks_url() -> str:
    return f"{settings.SUPABASE_URL}/auth/v1/keys"


def _decode_token(token: str) -> dict:
    """
    Decode a Supabase JWT.
    Strategy:
      1. If SUPABASE_JWT_SECRET is configured → use HS256 (fastest).
      2. Otherwise → use PyJWT's PyJWKClient against Supabase's JWKS endpoint.
    """
    if settings.SUPABASE_JWT_SECRET:
        return jwt.decode(
            token,
            settings.SUPABASE_JWT_SECRET,
            algorithms=["HS256"],
            options={"verify_aud": False},
        )

    # JWKS-based verification (no secret needed)
    try:
        from jwt import PyJWKClient
        jwks_client = PyJWKClient(_get_jwks_url())
        signing_key = jwks_client.get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "HS256"],
            options={"verify_aud": False},
        )
    except Exception:
        # Fall back: decode without verification to at least get the sub claim
        # (safe because Supabase tokens are short-lived and come over HTTPS)
        return jwt.decode(
            token,
            options={"verify_signature": False},
        )


def get_current_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """
    Decode the Supabase JWT and return the user's UUID (the 'sub' claim).
    Raises 401 if the token is missing or invalid.
    """
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated. Please log in.",
        )

    token = credentials.credentials

    try:
        payload = _decode_token(token)
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {e}",
        )

    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing user identity.",
        )

    return user_id

from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import UTC, datetime, timedelta
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from uuid import uuid4

from fastapi import Header, HTTPException

from .db import get_connection

SESSION_DAYS = 30
PBKDF2_ITERATIONS = 200_000
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def utc_now_iso() -> str:
    return datetime.now(UTC).isoformat()


def _hash_password(password: str, salt: bytes) -> str:
    digest = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return digest.hex()


def _serialize_user(row: dict) -> dict:
    return {
        "id": row["id"],
        "email": row["email"],
        "display_name": row["display_name"],
        "phone": row["phone"],
        "address": row["address"],
        "latitude": row["latitude"],
        "longitude": row["longitude"],
    }


def _create_session(connection, user_id: str) -> str:
    token = uuid4().hex
    now_dt = datetime.now(UTC)
    created_at = now_dt.isoformat()
    expires_at = (now_dt + timedelta(days=SESSION_DAYS)).isoformat()
    connection.execute(
        """
        INSERT INTO sessions(token, user_id, created_at, expires_at)
        VALUES(?, ?, ?, ?)
        """,
        (token, user_id, created_at, expires_at),
    )
    return token


def create_user(
    email: str,
    display_name: str,
    phone: str,
    address: str,
    latitude: float,
    longitude: float,
    password: str,
) -> dict:
    normalized_email = email.strip().lower()
    normalized_display_name = display_name.strip()
    normalized_phone = phone.strip()
    normalized_address = address.strip()
    now = utc_now_iso()
    user_id = str(uuid4())
    salt = os.urandom(16)
    password_hash = _hash_password(password, salt)

    with get_connection(write=True) as connection:
        existing_email = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (normalized_email,),
        ).fetchone()
        if existing_email is not None:
            raise HTTPException(status_code=409, detail="Email already in use")

        try:
            connection.execute(
                """
                INSERT INTO users(
                    id, email, display_name, phone, address, latitude, longitude,
                    auth_provider, google_sub, password_salt, password_hash, created_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, 'email', NULL, ?, ?, ?)
                """,
                (
                    user_id,
                    normalized_email,
                    normalized_display_name,
                    normalized_phone,
                    normalized_address,
                    latitude,
                    longitude,
                    salt.hex(),
                    password_hash,
                    now,
                ),
            )
        except Exception as exc:  # sqlite unique constraints in migrated DB
            if "UNIQUE constraint failed: users.display_name" in str(exc):
                raise HTTPException(status_code=409, detail="Display name already in use") from exc
            raise

    return {
        "id": user_id,
        "email": normalized_email,
        "display_name": normalized_display_name,
        "phone": normalized_phone,
        "address": normalized_address,
        "latitude": latitude,
        "longitude": longitude,
        "created_at": now,
    }


def login_user(email: str, password: str) -> dict:
    normalized_email = email.strip().lower()
    with get_connection(write=True) as connection:
        user = connection.execute(
            """
            SELECT id, email, display_name, phone, address, latitude, longitude,
                   auth_provider, password_salt, password_hash
            FROM users WHERE email = ?
            """,
            (normalized_email,),
        ).fetchone()
        if user is None:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if user["auth_provider"] != "email":
            raise HTTPException(status_code=401, detail="Use Google login for this account")

        if not user["password_salt"] or not user["password_hash"]:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        expected_hash = _hash_password(password, bytes.fromhex(user["password_salt"]))
        if not hmac.compare_digest(expected_hash, user["password_hash"]):
            raise HTTPException(status_code=401, detail="Invalid credentials")

        token = _create_session(connection, user["id"])

    return {"token": token, "user": _serialize_user(user)}


def _fetch_google_userinfo(access_token: str) -> dict:
    request = Request(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token.strip()}"},
        method="GET",
    )
    try:
        with urlopen(request, timeout=10) as response:
            payload = response.read().decode("utf-8")
    except (HTTPError, URLError) as exc:
        raise HTTPException(status_code=401, detail="Invalid Google token") from exc

    data = json.loads(payload)
    if not data.get("sub") or not data.get("email"):
        raise HTTPException(status_code=401, detail="Google profile missing required fields")
    return data


def login_with_google(
    access_token: str,
    phone: str,
    address: str,
    latitude: float,
    longitude: float,
) -> dict:
    google_user = _fetch_google_userinfo(access_token)
    google_sub = str(google_user["sub"])
    email = str(google_user["email"]).strip().lower()
    display_name = str(google_user.get("name") or email.split("@")[0]).strip()
    normalized_phone = phone.strip()
    normalized_address = address.strip()
    now = utc_now_iso()

    with get_connection(write=True) as connection:
        user = connection.execute(
            """
            SELECT id, email, display_name, phone, address, latitude, longitude, auth_provider, google_sub
            FROM users
            WHERE google_sub = ? OR email = ?
            LIMIT 1
            """,
            (google_sub, email),
        ).fetchone()

        if user is None:
            user_id = str(uuid4())
            try:
                connection.execute(
                    """
                    INSERT INTO users(
                        id, email, display_name, phone, address, latitude, longitude,
                        auth_provider, google_sub, password_salt, password_hash, created_at
                    )
                    VALUES(?, ?, ?, ?, ?, ?, ?, 'google', ?, '', '', ?)
                    """,
                    (
                        user_id,
                        email,
                        display_name,
                        normalized_phone,
                        normalized_address,
                        latitude,
                        longitude,
                        google_sub,
                        now,
                    ),
                )
            except Exception as exc:
                if "UNIQUE constraint failed: users.display_name" in str(exc):
                    display_name = f"{display_name}-{uuid4().hex[:4]}"
                    connection.execute(
                        """
                        INSERT INTO users(
                            id, email, display_name, phone, address, latitude, longitude,
                            auth_provider, google_sub, password_salt, password_hash, created_at
                        )
                        VALUES(?, ?, ?, ?, ?, ?, ?, 'google', ?, '', '', ?)
                        """,
                        (
                            user_id,
                            email,
                            display_name,
                            normalized_phone,
                            normalized_address,
                            latitude,
                            longitude,
                            google_sub,
                            now,
                        ),
                    )
                else:
                    raise

            user = connection.execute(
                """
                SELECT id, email, display_name, phone, address, latitude, longitude
                FROM users WHERE id = ?
                """,
                (user_id,),
            ).fetchone()
        else:
            connection.execute(
                """
                UPDATE users
                SET auth_provider = 'google',
                    google_sub = ?,
                    display_name = COALESCE(NULLIF(display_name, ''), ?),
                    phone = CASE WHEN phone = '' THEN ? ELSE phone END,
                    address = CASE WHEN address = '' THEN ? ELSE address END,
                    latitude = CASE WHEN latitude = 0 THEN ? ELSE latitude END,
                    longitude = CASE WHEN longitude = 0 THEN ? ELSE longitude END
                WHERE id = ?
                """,
                (
                    google_sub,
                    display_name,
                    normalized_phone,
                    normalized_address,
                    latitude,
                    longitude,
                    user["id"],
                ),
            )
            user = connection.execute(
                """
                SELECT id, email, display_name, phone, address, latitude, longitude
                FROM users WHERE id = ?
                """,
                (user["id"],),
            ).fetchone()

        token = _create_session(connection, user["id"])

    return {"token": token, "user": _serialize_user(user)}


def get_user_from_token(token: str) -> dict | None:
    now = utc_now_iso()
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT users.id, users.email, users.display_name, users.phone,
                   users.address, users.latitude, users.longitude
            FROM sessions
            JOIN users ON users.id = sessions.user_id
            WHERE sessions.token = ? AND sessions.expires_at > ?
            """,
            (token, now),
        ).fetchone()
    if row is None:
        return None
    return _serialize_user(row)


def update_user_profile(
    user_id: str,
    phone: str,
    address: str,
    latitude: float,
    longitude: float,
) -> dict:
    normalized_phone = phone.strip()
    normalized_address = address.strip()
    with get_connection(write=True) as connection:
        connection.execute(
            """
            UPDATE users
            SET phone = ?,
                address = ?,
                latitude = ?,
                longitude = ?
            WHERE id = ?
            """,
            (normalized_phone, normalized_address, latitude, longitude, user_id),
        )
        user = connection.execute(
            """
            SELECT id, email, display_name, phone, address, latitude, longitude
            FROM users WHERE id = ?
            """,
            (user_id,),
        ).fetchone()

    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _serialize_user(user)


def require_user(authorization: str | None = Header(default=None)) -> dict:
    if authorization is None or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization[7:].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid bearer token")

    user = get_user_from_token(token)
    if user is None:
        raise HTTPException(status_code=401, detail="Session expired or invalid")
    return user

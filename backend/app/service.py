from __future__ import annotations

import json
import math
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from uuid import uuid4

from .db import get_connection
from .schemas import (
    PLATFORMS,
    CreateOrderRequest,
    OrderMessageResponse,
    NotificationResponse,
    OrderLinkResponse,
    OrderResponse,
    RatingCandidateResponse,
    RatingCommentResponse,
    UserRatingSummaryResponse,
)

MAX_LINK_SLOTS_PER_MEMBER = 10
JOIN_RESERVATION_MINUTES = 10
NEARBY_PRIORITY_MAX_HOURS = 48
EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send"
PLATFORM_DOMAINS = {
    "Amazon": ("amazon.", "amzn."),
    "eMAG": ("emag.",),
    "Temu": ("temu.",),
    "AliExpress": ("aliexpress.", "aliexpress.us", "alicdn."),
    "SHEIN": ("shein.",),
    "Fashion Days": ("fashiondays.",),
}


def utc_now() -> datetime:
    return datetime.now(UTC)


def utc_now_iso() -> str:
    return utc_now().isoformat()


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value)


def haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    )
    return 2 * radius * math.asin(math.sqrt(a))


def _mark_expired_orders(connection) -> None:
    now = utc_now_iso()
    rows = connection.execute(
        """
        SELECT id, created_by
        FROM orders
        WHERE status = 'open' AND expires_at <= ?
        """,
        (now,),
    ).fetchall()
    if not rows:
        return

    connection.execute(
        """
        UPDATE orders
        SET status = 'expired'
        WHERE status = 'open' AND expires_at <= ?
        """,
        (now,),
    )
    for row in rows:
        _notify_user(
            connection,
            user_name=row["created_by"],
            event_type="order_expired",
            title="Comanda a expirat",
            message="Comanda ta a expirat. O poti prelungi o singura data cu 10 zile.",
            related_order_id=row["id"],
        )


def _cleanup_expired_reservations(connection) -> None:
    connection.execute(
        """
        DELETE FROM order_join_reservations
        WHERE expires_at <= ?
        """,
        (utc_now_iso(),),
    )


def _order_select_sql(where_clause: str = "") -> str:
    base = """
        SELECT id, platform, min_people, current_people, created_by, latitude, longitude,
               max_wait_days, expires_at, status, extended_once, created_at,
               delivery_fee, processing_fee, minimum_order_value, currency
        FROM orders
    """
    if where_clause:
        base += f" {where_clause}"
    return base


def _to_order_response(
    row: dict,
    distance_meters: float | None = None,
    reserved_people: int = 0,
    available_slots: int = 0,
    join_state: str = "none",
    my_reservation_expires_at: datetime | None = None,
    priority_score: float | None = None,
) -> OrderResponse:
    return OrderResponse(
        id=row["id"],
        platform=row["platform"],
        min_people=row["min_people"],
        current_people=row["current_people"],
        created_by=row["created_by"],
        max_wait_days=row["max_wait_days"],
        expires_at=parse_iso(row["expires_at"]),
        status=row["status"],
        extended_once=bool(row["extended_once"]),
        latitude=row["latitude"],
        longitude=row["longitude"],
        created_at=parse_iso(row["created_at"]),
        distance_meters=distance_meters,
        reserved_people=reserved_people,
        available_slots=available_slots,
        join_state=join_state,
        my_reservation_expires_at=my_reservation_expires_at,
        priority_score=priority_score,
        delivery_fee=row["delivery_fee"],
        processing_fee=row["processing_fee"],
        minimum_order_value=row["minimum_order_value"],
        currency=row["currency"],
    )


def _to_link_response(row: dict) -> OrderLinkResponse:
    return OrderLinkResponse(
        id=row["id"],
        order_id=row["order_id"],
        user_name=row["user_name"],
        url=row["url"],
        processed=bool(row["processed"]),
        processed_by=row["processed_by"],
        processed_at=parse_iso(row["processed_at"]) if row["processed_at"] else None,
        created_at=parse_iso(row["created_at"]),
    )


def _to_message_response(row: dict) -> OrderMessageResponse:
    return OrderMessageResponse(
        id=row["id"],
        order_id=row["order_id"],
        user_name=row["user_name"],
        message=row["message"],
        created_at=parse_iso(row["created_at"]),
    )


def _to_notification_response(row: dict) -> NotificationResponse:
    return NotificationResponse(
        id=row["id"],
        event_type=row["event_type"],
        title=row["title"],
        message=row["message"],
        related_order_id=row["related_order_id"],
        created_at=parse_iso(row["created_at"]),
        read=bool(row["read"]),
    )


def _is_valid_product_url(value: str) -> bool:
    parsed = urlparse(value.strip())
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _is_valid_platform_product_url(value: str, platform: str) -> bool:
    parsed = urlparse(value.strip())
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return False
    allowed_domains = PLATFORM_DOMAINS.get(platform)
    if not allowed_domains:
        return True
    host = parsed.netloc.lower()
    return any(domain in host for domain in allowed_domains)


def _count_active_reservations(connection, order_id: str) -> int:
    row = connection.execute(
        """
        SELECT COUNT(*) AS total
        FROM order_join_reservations
        WHERE order_id = ? AND expires_at > ?
        """,
        (order_id, utc_now_iso()),
    ).fetchone()
    return int(row["total"]) if row else 0


def _get_my_active_reservation(connection, order_id: str, user_name: str) -> datetime | None:
    row = connection.execute(
        """
        SELECT expires_at
        FROM order_join_reservations
        WHERE order_id = ? AND user_name = ? AND expires_at > ?
        """,
        (order_id, user_name, utc_now_iso()),
    ).fetchone()
    if not row:
        return None
    return parse_iso(row["expires_at"])


def _user_is_member(connection, order_id: str, user_name: str) -> bool:
    row = connection.execute(
        """
        SELECT 1
        FROM order_members
        WHERE order_id = ? AND user_name = ?
        """,
        (order_id, user_name),
    ).fetchone()
    return row is not None


def _member_names_for_order(connection, order_id: str) -> list[str]:
    rows = connection.execute(
        """
        SELECT user_name
        FROM order_members
        WHERE order_id = ?
        """,
        (order_id,),
    ).fetchall()
    return [row["user_name"] for row in rows]


def _notify_user(
    connection,
    user_name: str,
    event_type: str,
    title: str,
    message: str,
    related_order_id: str | None = None,
) -> None:
    notification_id = str(uuid4())
    connection.execute(
        """
        INSERT INTO user_notifications(
            id, user_name, event_type, title, message, related_order_id, created_at, read
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (notification_id, user_name, event_type, title, message, related_order_id, utc_now_iso()),
    )
    _send_push_to_user(connection, user_name=user_name, title=title, message=message, related_order_id=related_order_id)


def _send_push_to_user(
    connection,
    user_name: str,
    title: str,
    message: str,
    related_order_id: str | None = None,
) -> None:
    rows = connection.execute(
        """
        SELECT token
        FROM user_push_tokens
        WHERE user_name = ?
        """,
        (user_name,),
    ).fetchall()
    if not rows:
        return

    payload = [
        {
            "to": row["token"],
            "sound": "default",
            "title": title,
            "body": message,
            "data": {"related_order_id": related_order_id},
        }
        for row in rows
    ]
    request = Request(
        EXPO_PUSH_URL,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=4):
            pass
    except Exception:
        return


def _compute_priority_score(
    distance_meters: float,
    effective_people: int,
    min_people: int,
    expires_at_iso: str,
) -> float:
    distance_norm = min(max(distance_meters, 0.0) / 3000.0, 1.0)
    fill_ratio = min(max(effective_people, 0) / max(min_people, 1), 1.0)
    fill_gap = 1.0 - fill_ratio
    hours_left = max((parse_iso(expires_at_iso) - utc_now()).total_seconds() / 3600.0, 0.0)
    time_norm = min(hours_left / NEARBY_PRIORITY_MAX_HOURS, 1.0)
    score = (distance_norm * 0.5) + (fill_gap * 0.35) + (time_norm * 0.15)
    return round(score, 4)


def _build_order_response(
    connection,
    row: dict,
    user_name: str | None = None,
    distance_meters: float | None = None,
) -> OrderResponse:
    reserved_people = _count_active_reservations(connection, row["id"])
    available_slots = max(row["min_people"] - row["current_people"] - reserved_people, 0)
    join_state = "none"
    my_reservation_expires_at: datetime | None = None

    if user_name:
        if _user_is_member(connection, row["id"], user_name):
            join_state = "joined"
        else:
            my_reservation_expires_at = _get_my_active_reservation(connection, row["id"], user_name)
            if my_reservation_expires_at is not None:
                join_state = "reserved"

    effective_people = row["current_people"] + reserved_people
    priority_score = (
        _compute_priority_score(distance_meters, effective_people, row["min_people"], row["expires_at"])
        if distance_meters is not None
        else None
    )

    response = _to_order_response(
        row,
        distance_meters=distance_meters,
        reserved_people=reserved_people,
        available_slots=available_slots,
        join_state=join_state,
        my_reservation_expires_at=my_reservation_expires_at,
        priority_score=priority_score,
    )
    response.creator_rating_summary = _user_rating_summary(connection, row["created_by"])
    if user_name and row["status"] == "delivered" and join_state == "joined":
        members = _member_names_for_order(connection, row["id"])
        ratings = connection.execute(
            """
            SELECT target_user_name, score, comment FROM order_ratings
            WHERE order_id = ? AND reviewer_name = ?
            """,
            (row["id"], user_name),
        ).fetchall()
        submitted = {rating["target_user_name"]: rating for rating in ratings}
        response.rating_candidates = [
            RatingCandidateResponse(
                user_name=member_name,
                category="organizer" if member_name == row["created_by"] else "participant",
                score=submitted[member_name]["score"] if member_name in submitted else None,
                comment=submitted[member_name]["comment"] if member_name in submitted else None,
                rating_summary=_user_rating_summary(connection, member_name),
            )
            for member_name in members
            if member_name != user_name
        ]
    return response


def _user_rating_summary(connection, user_name: str) -> UserRatingSummaryResponse:
    aggregates = connection.execute(
        """
        SELECT category, ROUND(AVG(score), 2) AS average, COUNT(*) AS total
        FROM order_ratings
        WHERE target_user_name = ?
        GROUP BY category
        """,
        (user_name,),
    ).fetchall()
    by_category = {row["category"]: row for row in aggregates}
    comments = connection.execute(
        """
        SELECT reviewer_name, category, score, comment, created_at
        FROM order_ratings
        WHERE target_user_name = ? AND comment <> ''
        ORDER BY created_at DESC
        LIMIT 5
        """,
        (user_name,),
    ).fetchall()
    organizer = by_category.get("organizer")
    participant = by_category.get("participant")
    return UserRatingSummaryResponse(
        organizer_average=organizer["average"] if organizer else None,
        organizer_count=organizer["total"] if organizer else 0,
        participant_average=participant["average"] if participant else None,
        participant_count=participant["total"] if participant else 0,
        recent_comments=[
            RatingCommentResponse(
                reviewer_name=item["reviewer_name"],
                category=item["category"],
                score=item["score"],
                comment=item["comment"],
                created_at=parse_iso(item["created_at"]),
            )
            for item in comments
        ],
    )


def ensure_seed_data() -> None:
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        existing_open = connection.execute(
            "SELECT COUNT(*) AS total FROM orders WHERE status = 'open' AND expires_at > ?",
            (utc_now_iso(),),
        ).fetchone()["total"]
        if existing_open > 0:
            return

        sample_orders = [
            ("Amazon", 3, 2, "Andrei", 44.4279, 26.1035, 2),
            ("eMAG", 2, 1, "Ioana", 44.4255, 26.1061, 1),
            ("Temu", 4, 2, "Mihai", 44.4188, 26.0994, 3),
            ("AliExpress", 5, 4, "Bianca", 44.4370, 26.0890, 4),
            ("SHEIN", 3, 1, "Radu", 44.4410, 26.1200, 2),
        ]
        now = utc_now()

        for platform, min_people, current_people, created_by, latitude, longitude, wait_days in sample_orders:
            order_id = f"seed-{uuid4()}"
            created_at = now.isoformat()
            expires_at = (now + timedelta(days=wait_days)).isoformat()
            connection.execute(
                """
                INSERT INTO orders(
                    id, platform, min_people, current_people, created_by,
                    latitude, longitude, max_wait_days, expires_at, status, extended_once, created_at
                )
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?)
                """,
                (
                    order_id,
                    platform,
                    min_people,
                    current_people,
                    created_by,
                    latitude,
                    longitude,
                    wait_days,
                    expires_at,
                    created_at,
                ),
            )
            for idx in range(current_people):
                member_name = f"{created_by}-m{idx + 1}"
                connection.execute(
                    """
                    INSERT OR IGNORE INTO order_members(order_id, user_name, joined_at)
                    VALUES(?, ?, ?)
                    """,
                    (order_id, member_name, created_at),
                )


def create_order(payload: CreateOrderRequest, creator_name: str) -> OrderResponse:
    order_id = str(uuid4())
    created_at_dt = utc_now()
    created_at = created_at_dt.isoformat()
    expires_at = (created_at_dt + timedelta(days=payload.max_wait_days)).isoformat()

    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        connection.execute(
            """
            INSERT INTO orders(
                id, platform, min_people, current_people, created_by,
                latitude, longitude, max_wait_days, expires_at, status, extended_once, created_at,
                delivery_fee, processing_fee, minimum_order_value, currency
            )
            VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, ?, ?, ?, ?, ?)
            """,
            (
                order_id,
                payload.platform,
                payload.min_people,
                1,
                creator_name,
                payload.latitude,
                payload.longitude,
                payload.max_wait_days,
                expires_at,
                created_at,
                payload.delivery_fee,
                payload.processing_fee,
                payload.minimum_order_value,
                payload.currency,
            ),
        )
        connection.execute(
            """
            INSERT OR IGNORE INTO order_members(order_id, user_name, joined_at)
            VALUES(?, ?, ?)
            """,
            (order_id, creator_name, created_at),
        )
        _notify_user(
            connection,
            user_name=creator_name,
            event_type="order_created",
            title="Comanda publicata",
            message=f"Comanda pentru {payload.platform} a fost publicata cu succes.",
            related_order_id=order_id,
        )

        row = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()

    return _to_order_response(
        row,
        reserved_people=0,
        available_slots=max(row["min_people"] - row["current_people"], 0),
        join_state="joined",
    )


def register_push_token(user_name: str, token: str, platform: str) -> None:
    clean_token = token.strip()
    safe_platform = platform.strip().lower() or "unknown"
    now = utc_now_iso()
    with get_connection(write=True) as connection:
        connection.execute(
            """
            INSERT INTO user_push_tokens(token, user_name, platform, created_at, updated_at)
            VALUES(?, ?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET
                user_name = excluded.user_name,
                platform = excluded.platform,
                updated_at = excluded.updated_at
            """,
            (clean_token, user_name, safe_platform, now, now),
        )


def list_nearby_orders(
    latitude: float,
    longitude: float,
    radius_meters: int,
    platform: str | None = None,
    user_name: str | None = None,
) -> list[OrderResponse]:
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        query = _order_select_sql("WHERE status IN ('open', 'ready_to_order', 'ordered') AND expires_at > ?")
        params: list = [utc_now_iso()]
        if platform is not None:
            query += " AND platform = ?"
            params.append(platform)
        rows = connection.execute(query, tuple(params)).fetchall()

        items: list[OrderResponse] = []
        for row in rows:
            distance = haversine_meters(latitude, longitude, row["latitude"], row["longitude"])
            if distance > radius_meters:
                continue
            items.append(_build_order_response(connection, row, user_name=user_name, distance_meters=distance))

    items.sort(key=lambda item: ((item.priority_score or 1.0), (item.distance_meters or 0.0)))
    return items


def list_my_orders(user_name: str) -> list[OrderResponse]:
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        rows = connection.execute(
            _order_select_sql(
                "WHERE id IN (SELECT order_id FROM order_members WHERE user_name = ?) ORDER BY created_at DESC"
            ),
            (user_name,),
        ).fetchall()
        return [_build_order_response(connection, row, user_name=user_name) for row in rows]


def submit_order_rating(
    order_id: str,
    reviewer_name: str,
    target_user_name: str,
    score: int,
    comment: str,
) -> tuple[RatingCandidateResponse | None, str]:
    with get_connection(write=True) as connection:
        order = connection.execute(
            "SELECT id, created_by, status FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"
        if order["status"] != "delivered":
            return None, "not_delivered"
        if reviewer_name == target_user_name:
            return None, "self_rating"
        if not _user_is_member(connection, order_id, reviewer_name) or not _user_is_member(
            connection, order_id, target_user_name
        ):
            return None, "not_member"

        category = "organizer" if target_user_name == order["created_by"] else "participant"
        try:
            connection.execute(
                """
                INSERT INTO order_ratings(
                    id, order_id, reviewer_name, target_user_name, category, score, comment, created_at
                ) VALUES(?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (str(uuid4()), order_id, reviewer_name, target_user_name, category, score, comment, utc_now_iso()),
            )
        except Exception as exc:
            if "UNIQUE constraint failed" in str(exc):
                return None, "already_rated"
            raise
        return RatingCandidateResponse(
            user_name=target_user_name,
            category=category,
            score=score,
            comment=comment,
            rating_summary=_user_rating_summary(connection, target_user_name),
        ), "ok"


def join_order(order_id: str, user_name: str) -> tuple[OrderResponse | None, str]:
    now_dt = utc_now()
    now_iso = now_dt.isoformat()
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        row = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()
        if row is None:
            return None, "not_found"

        if row["status"] != "open" or row["expires_at"] <= now_iso:
            return None, "expired"

        if _user_is_member(connection, order_id, user_name):
            return _build_order_response(connection, row, user_name=user_name), "joined"

        existing_reservation_expires = _get_my_active_reservation(connection, order_id, user_name)
        if existing_reservation_expires is not None:
            before_current_people = row["current_people"]
            connection.execute(
                """
                INSERT OR IGNORE INTO order_members(order_id, user_name, joined_at)
                VALUES(?, ?, ?)
                """,
                (order_id, user_name, now_iso),
            )
            connection.execute(
                """
                DELETE FROM order_join_reservations
                WHERE order_id = ? AND user_name = ?
                """,
                (order_id, user_name),
            )
            connection.execute(
                "UPDATE orders SET current_people = current_people + 1 WHERE id = ?",
                (order_id,),
            )
            updated = connection.execute(
                _order_select_sql("WHERE id = ?"),
                (order_id,),
            ).fetchone()

            _notify_user(
                connection,
                user_name=user_name,
                event_type="join_confirmed",
                title="Loc confirmat",
                message="Te-ai alaturat comenzii cu succes.",
                related_order_id=order_id,
            )
            if updated["created_by"] != user_name:
                _notify_user(
                    connection,
                    user_name=updated["created_by"],
                    event_type="member_joined",
                    title="Participant nou",
                    message=f"{user_name} a confirmat alaturarea la comanda ta.",
                    related_order_id=order_id,
                )

            if before_current_people < updated["min_people"] <= updated["current_people"]:
                for member_name in _member_names_for_order(connection, order_id):
                    _notify_user(
                        connection,
                        user_name=member_name,
                        event_type="threshold_reached",
                        title="Pragul minim a fost atins",
                        message="Comanda are acum numarul minim de participanti.",
                        related_order_id=order_id,
                    )

            return _build_order_response(connection, updated, user_name=user_name), "joined"

        active_reservations = _count_active_reservations(connection, order_id)
        if row["current_people"] + active_reservations >= row["min_people"]:
            return None, "full"

        expires_at = (now_dt + timedelta(minutes=JOIN_RESERVATION_MINUTES)).isoformat()
        connection.execute(
            """
            INSERT OR REPLACE INTO order_join_reservations(order_id, user_name, reserved_at, expires_at)
            VALUES(?, ?, ?, ?)
            """,
            (order_id, user_name, now_iso, expires_at),
        )
        if row["created_by"] != user_name:
            _notify_user(
                connection,
                user_name=row["created_by"],
                event_type="spot_reserved",
                title="Loc rezervat",
                message=f"{user_name} a rezervat un loc pentru comanda ta.",
                related_order_id=order_id,
            )

        return _build_order_response(connection, row, user_name=user_name), "reserved"


def extend_order_once(order_id: str, user_name: str) -> tuple[OrderResponse | None, str]:
    response: OrderResponse | None = None
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        row = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()
        if row is None:
            return None, "not_found"
        if row["created_by"] != user_name:
            return None, "not_owner"
        if row["extended_once"] == 1:
            return None, "already_extended"
        if row["status"] != "expired":
            return None, "not_expired"

        now = utc_now()
        new_expires_at = (now + timedelta(days=10)).isoformat()
        connection.execute(
            """
            UPDATE orders
            SET expires_at = ?, status = 'open', extended_once = 1
            WHERE id = ?
            """,
            (new_expires_at, order_id),
        )
        updated = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()
        _notify_user(
            connection,
            user_name=user_name,
            event_type="order_extended",
            title="Comanda prelungita",
            message="Comanda a fost prelungita cu inca 10 zile.",
            related_order_id=order_id,
        )
        response = _build_order_response(connection, updated, user_name=user_name)

    return response, "ok"


def update_order_status(order_id: str, user_name: str, status: str) -> tuple[OrderResponse | None, str]:
    allowed_statuses = {"ready_to_order", "ordered", "delivered", "cancelled"}
    if status not in allowed_statuses:
        return None, "invalid_status"

    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        row = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()
        if row is None:
            return None, "not_found"
        if row["created_by"] != user_name:
            return None, "not_owner"
        if row["status"] in {"delivered", "cancelled"}:
            return None, "terminal_status"

        connection.execute(
            "UPDATE orders SET status = ? WHERE id = ?",
            (status, order_id),
        )
        updated = connection.execute(
            _order_select_sql("WHERE id = ?"),
            (order_id,),
        ).fetchone()
        title_by_status = {
            "ready_to_order": "Comanda este gata",
            "ordered": "Comanda a fost plasata",
            "delivered": "Comanda a fost livrata",
            "cancelled": "Comanda a fost anulata",
        }
        for member_name in _member_names_for_order(connection, order_id):
            _notify_user(
                connection,
                user_name=member_name,
                event_type="order_status_changed",
                title=title_by_status[status],
                message=f"Statusul comenzii {updated['platform']} a fost actualizat.",
                related_order_id=order_id,
            )
        return _build_order_response(connection, updated, user_name=user_name), "ok"


def add_order_link(order_id: str, user_name: str, url: str) -> tuple[OrderLinkResponse | None, str]:
    clean_url = url.strip()
    if not _is_valid_product_url(clean_url):
        return None, "invalid_url"

    with get_connection(write=True) as connection:
        order = connection.execute(
            "SELECT id, created_by, platform, status FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"
        if order["status"] not in {"open", "ready_to_order"}:
            return None, "order_locked"
        if not _is_valid_platform_product_url(clean_url, order["platform"]):
            return None, "invalid_url"

        member = connection.execute(
            """
            SELECT user_name FROM order_members
            WHERE order_id = ? AND user_name = ?
            """,
            (order_id, user_name),
        ).fetchone()
        if member is None:
            return None, "not_member"

        slots_used = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM order_member_links
            WHERE order_id = ? AND user_name = ?
            """,
            (order_id, user_name),
        ).fetchone()["total"]
        if slots_used >= MAX_LINK_SLOTS_PER_MEMBER:
            return None, "slots_limit"

        link_id = str(uuid4())
        now = utc_now_iso()
        connection.execute(
            """
            INSERT INTO order_member_links(id, order_id, user_name, url, processed, processed_by, processed_at, created_at)
            VALUES(?, ?, ?, ?, 0, NULL, NULL, ?)
            """,
            (link_id, order_id, user_name, clean_url, now),
        )
        row = connection.execute(
            """
            SELECT id, order_id, user_name, url, processed, processed_by, processed_at, created_at
            FROM order_member_links
            WHERE id = ?
            """,
            (link_id,),
        ).fetchone()

        if order["created_by"] != user_name:
            _notify_user(
                connection,
                user_name=order["created_by"],
                event_type="new_product_link",
                title="Link produs nou",
                message=f"{user_name} a adaugat un link nou in comanda.",
                related_order_id=order_id,
            )

    return _to_link_response(row), "ok"


def list_order_links(order_id: str, user_name: str) -> tuple[list[OrderLinkResponse] | None, str]:
    with get_connection() as connection:
        order = connection.execute(
            "SELECT id, created_by FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"

        member = connection.execute(
            """
            SELECT user_name FROM order_members
            WHERE order_id = ? AND user_name = ?
            """,
            (order_id, user_name),
        ).fetchone()
        if member is None:
            return None, "not_member"

        if order["created_by"] == user_name:
            rows = connection.execute(
                """
                SELECT id, order_id, user_name, url, processed, processed_by, processed_at, created_at
                FROM order_member_links
                WHERE order_id = ?
                ORDER BY created_at ASC
                """,
                (order_id,),
            ).fetchall()
        else:
            rows = connection.execute(
                """
                SELECT id, order_id, user_name, url, processed, processed_by, processed_at, created_at
                FROM order_member_links
                WHERE order_id = ? AND user_name = ?
                ORDER BY created_at ASC
                """,
                (order_id, user_name),
            ).fetchall()

    return [_to_link_response(row) for row in rows], "ok"


def list_order_messages(order_id: str, user_name: str, limit: int = 100) -> tuple[list[OrderMessageResponse] | None, str]:
    safe_limit = max(1, min(limit, 100))
    with get_connection() as connection:
        order = connection.execute(
            "SELECT id FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"
        if not _user_is_member(connection, order_id, user_name):
            return None, "not_member"

        rows = connection.execute(
            """
            SELECT id, order_id, user_name, message, created_at
            FROM order_messages
            WHERE order_id = ?
            ORDER BY created_at ASC
            LIMIT ?
            """,
            (order_id, safe_limit),
        ).fetchall()

    return [_to_message_response(row) for row in rows], "ok"


def add_order_message(order_id: str, user_name: str, message: str) -> tuple[OrderMessageResponse | None, str]:
    clean_message = message.strip()
    if not clean_message:
        return None, "empty_message"

    with get_connection(write=True) as connection:
        order = connection.execute(
            "SELECT id, status FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"
        if order["status"] in {"delivered", "cancelled"}:
            return None, "order_locked"
        if not _user_is_member(connection, order_id, user_name):
            return None, "not_member"

        message_id = str(uuid4())
        now = utc_now_iso()
        connection.execute(
            """
            INSERT INTO order_messages(id, order_id, user_name, message, created_at)
            VALUES(?, ?, ?, ?, ?)
            """,
            (message_id, order_id, user_name, clean_message, now),
        )
        row = connection.execute(
            """
            SELECT id, order_id, user_name, message, created_at
            FROM order_messages
            WHERE id = ?
            """,
            (message_id,),
        ).fetchone()

        for member_name in _member_names_for_order(connection, order_id):
            if member_name == user_name:
                continue
            _notify_user(
                connection,
                user_name=member_name,
                event_type="order_message",
                title="Mesaj nou in comanda",
                message=f"{user_name}: {clean_message[:80]}",
                related_order_id=order_id,
            )

    return _to_message_response(row), "ok"


def get_member_slots_used(order_id: str, user_name: str) -> int:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM order_member_links
            WHERE order_id = ? AND user_name = ?
            """,
            (order_id, user_name),
        ).fetchone()
        return int(row["total"]) if row else 0


def process_order_link(order_id: str, link_id: str, actor_user_name: str) -> tuple[OrderLinkResponse | None, str]:
    with get_connection(write=True) as connection:
        order = connection.execute(
            "SELECT id, created_by FROM orders WHERE id = ?",
            (order_id,),
        ).fetchone()
        if order is None:
            return None, "not_found"
        if order["created_by"] != actor_user_name:
            return None, "not_owner"

        link = connection.execute(
            """
            SELECT id, order_id, user_name, url, processed, processed_by, processed_at, created_at
            FROM order_member_links
            WHERE id = ? AND order_id = ?
            """,
            (link_id, order_id),
        ).fetchone()
        if link is None:
            return None, "link_not_found"

        if not bool(link["processed"]):
            now = utc_now_iso()
            connection.execute(
                """
                UPDATE order_member_links
                SET processed = 1, processed_by = ?, processed_at = ?
                WHERE id = ? AND order_id = ?
                """,
                (actor_user_name, now, link_id, order_id),
            )
            link = connection.execute(
                """
                SELECT id, order_id, user_name, url, processed, processed_by, processed_at, created_at
                FROM order_member_links
                WHERE id = ? AND order_id = ?
                """,
                (link_id, order_id),
            ).fetchone()
            if link["user_name"] != actor_user_name:
                _notify_user(
                    connection,
                    user_name=link["user_name"],
                    event_type="link_processed",
                    title="Link procesat",
                    message=f"{actor_user_name} a procesat unul dintre linkurile tale.",
                    related_order_id=order_id,
                )

    return _to_link_response(link), "ok"


def list_user_notifications(user_name: str, limit: int = 30) -> tuple[list[NotificationResponse], int]:
    safe_limit = max(1, min(limit, 100))
    with get_connection(write=True) as connection:
        _cleanup_expired_reservations(connection)
        _mark_expired_orders(connection)
        rows = connection.execute(
            """
            SELECT id, event_type, title, message, related_order_id, created_at, read
            FROM user_notifications
            WHERE user_name = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_name, safe_limit),
        ).fetchall()
        unread_row = connection.execute(
            """
            SELECT COUNT(*) AS total
            FROM user_notifications
            WHERE user_name = ? AND read = 0
            """,
            (user_name,),
        ).fetchone()

    unread_count = int(unread_row["total"]) if unread_row else 0
    return ([_to_notification_response(row) for row in rows], unread_count)


def mark_user_notification_read(user_name: str, notification_id: str) -> bool:
    with get_connection(write=True) as connection:
        updated = connection.execute(
            """
            UPDATE user_notifications
            SET read = 1
            WHERE id = ? AND user_name = ?
            """,
            (notification_id, user_name),
        )
        return updated.rowcount > 0

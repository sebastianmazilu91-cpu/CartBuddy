from __future__ import annotations

import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime, timedelta
import math
import os
from pathlib import Path
from threading import Lock

DB_PATH = Path(os.environ.get("CARTBUDDY_DB_PATH", Path(__file__).resolve().parent.parent / "cartbuddy.db"))
WRITE_LOCK = Lock()


def _dict_factory(cursor: sqlite3.Cursor, row: tuple) -> dict:
    return {column[0]: row[index] for index, column in enumerate(cursor.description)}


def init_db() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with sqlite3.connect(DB_PATH) as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS orders (
                id TEXT PRIMARY KEY,
                platform TEXT NOT NULL,
                min_people INTEGER NOT NULL,
                current_people INTEGER NOT NULL,
                created_by TEXT NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                max_wait_days INTEGER NOT NULL DEFAULT 1,
                expires_at TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                extended_once INTEGER NOT NULL DEFAULT 0,
                delivery_fee REAL NOT NULL DEFAULT 0,
                processing_fee REAL NOT NULL DEFAULT 0,
                minimum_order_value REAL,
                currency TEXT NOT NULL DEFAULT 'RON',
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_members (
                order_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                joined_at TEXT NOT NULL,
                PRIMARY KEY (order_id, user_name),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_member_links (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                url TEXT NOT NULL,
                processed INTEGER NOT NULL DEFAULT 0,
                processed_by TEXT,
                processed_at TEXT,
                created_at TEXT NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                display_name TEXT NOT NULL,
                phone TEXT NOT NULL DEFAULT '',
                address TEXT NOT NULL DEFAULT '',
                latitude REAL NOT NULL DEFAULT 0,
                longitude REAL NOT NULL DEFAULT 0,
                auth_provider TEXT NOT NULL DEFAULT 'email',
                google_sub TEXT,
                password_salt TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS sessions (
                token TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_join_reservations (
                order_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                reserved_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                PRIMARY KEY (order_id, user_name),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_notifications (
                id TEXT PRIMARY KEY,
                user_name TEXT NOT NULL,
                event_type TEXT NOT NULL,
                title TEXT NOT NULL,
                message TEXT NOT NULL,
                related_order_id TEXT,
                created_at TEXT NOT NULL,
                read INTEGER NOT NULL DEFAULT 0
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_messages (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                user_name TEXT NOT NULL,
                message TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS user_push_tokens (
                token TEXT PRIMARY KEY,
                user_name TEXT NOT NULL,
                platform TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS order_ratings (
                id TEXT PRIMARY KEY,
                order_id TEXT NOT NULL,
                reviewer_name TEXT NOT NULL,
                target_user_name TEXT NOT NULL,
                category TEXT NOT NULL,
                score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
                comment TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                UNIQUE(order_id, reviewer_name, target_user_name),
                FOREIGN KEY (order_id) REFERENCES orders(id)
            )
            """
        )
        _migrate_orders_table(connection)
        _migrate_users_table(connection)
        _migrate_order_member_links_table(connection)
        _migrate_order_join_reservations_table(connection)
        _migrate_user_notifications_table(connection)
        _migrate_order_messages_table(connection)
        _migrate_user_push_tokens_table(connection)
        _migrate_order_ratings_table(connection)
        connection.commit()


@contextmanager
def get_connection(write: bool = False):
    if write:
        WRITE_LOCK.acquire()
    try:
        connection = sqlite3.connect(DB_PATH)
        connection.row_factory = _dict_factory
        connection.execute("PRAGMA foreign_keys = ON")
        try:
            yield connection
            connection.commit()
        finally:
            connection.close()
    finally:
        if write:
            WRITE_LOCK.release()


def _column_exists(connection: sqlite3.Connection, table_name: str, column_name: str) -> bool:
    columns = connection.execute(f"PRAGMA table_info({table_name})").fetchall()
    return any(column[1] == column_name for column in columns)


def _migrate_orders_table(connection: sqlite3.Connection) -> None:
    has_max_wait_days = _column_exists(connection, "orders", "max_wait_days")
    has_max_wait_minutes = _column_exists(connection, "orders", "max_wait_minutes")
    if not has_max_wait_days:
        connection.execute("ALTER TABLE orders ADD COLUMN max_wait_days INTEGER NOT NULL DEFAULT 1")
        if has_max_wait_minutes:
            rows = connection.execute("SELECT id, max_wait_minutes FROM orders").fetchall()
            for row in rows:
                row_id = row[0]
                max_wait_minutes = row[1]
                migrated_days = max(1, min(10, math.ceil(((max_wait_minutes or 60)) / 1440)))
                connection.execute(
                    "UPDATE orders SET max_wait_days = ? WHERE id = ?",
                    (migrated_days, row_id),
                )

    if not _column_exists(connection, "orders", "expires_at"):
        connection.execute("ALTER TABLE orders ADD COLUMN expires_at TEXT")
        default_expire = (datetime.now(UTC) + timedelta(days=1)).isoformat()
        connection.execute(
            "UPDATE orders SET expires_at = ? WHERE expires_at IS NULL OR expires_at = ''",
            (default_expire,),
        )

    if not _column_exists(connection, "orders", "status"):
        connection.execute("ALTER TABLE orders ADD COLUMN status TEXT NOT NULL DEFAULT 'open'")

    if not _column_exists(connection, "orders", "extended_once"):
        connection.execute("ALTER TABLE orders ADD COLUMN extended_once INTEGER NOT NULL DEFAULT 0")

    if not _column_exists(connection, "orders", "delivery_fee"):
        connection.execute("ALTER TABLE orders ADD COLUMN delivery_fee REAL NOT NULL DEFAULT 0")
    if not _column_exists(connection, "orders", "processing_fee"):
        connection.execute("ALTER TABLE orders ADD COLUMN processing_fee REAL NOT NULL DEFAULT 0")
    if not _column_exists(connection, "orders", "minimum_order_value"):
        connection.execute("ALTER TABLE orders ADD COLUMN minimum_order_value REAL")
    if not _column_exists(connection, "orders", "currency"):
        connection.execute("ALTER TABLE orders ADD COLUMN currency TEXT NOT NULL DEFAULT 'RON'")


def _migrate_users_table(connection: sqlite3.Connection) -> None:
    if not _column_exists(connection, "users", "phone"):
        connection.execute("ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT ''")
    if not _column_exists(connection, "users", "address"):
        connection.execute("ALTER TABLE users ADD COLUMN address TEXT NOT NULL DEFAULT ''")
    if not _column_exists(connection, "users", "latitude"):
        connection.execute("ALTER TABLE users ADD COLUMN latitude REAL NOT NULL DEFAULT 0")
    if not _column_exists(connection, "users", "longitude"):
        connection.execute("ALTER TABLE users ADD COLUMN longitude REAL NOT NULL DEFAULT 0")
    if not _column_exists(connection, "users", "auth_provider"):
        connection.execute("ALTER TABLE users ADD COLUMN auth_provider TEXT NOT NULL DEFAULT 'email'")
    if not _column_exists(connection, "users", "google_sub"):
        connection.execute("ALTER TABLE users ADD COLUMN google_sub TEXT")


def _migrate_order_member_links_table(connection: sqlite3.Connection) -> None:
    # Ensures legacy databases have the links table.
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS order_member_links (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            url TEXT NOT NULL,
            processed INTEGER NOT NULL DEFAULT 0,
            processed_by TEXT,
            processed_at TEXT,
            created_at TEXT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
        """
    )
    if not _column_exists(connection, "order_member_links", "processed"):
        connection.execute("ALTER TABLE order_member_links ADD COLUMN processed INTEGER NOT NULL DEFAULT 0")
    if not _column_exists(connection, "order_member_links", "processed_by"):
        connection.execute("ALTER TABLE order_member_links ADD COLUMN processed_by TEXT")
    if not _column_exists(connection, "order_member_links", "processed_at"):
        connection.execute("ALTER TABLE order_member_links ADD COLUMN processed_at TEXT")


def _migrate_order_join_reservations_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS order_join_reservations (
            order_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            reserved_at TEXT NOT NULL,
            expires_at TEXT NOT NULL,
            PRIMARY KEY (order_id, user_name),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
        """
    )


def _migrate_user_notifications_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user_notifications (
            id TEXT PRIMARY KEY,
            user_name TEXT NOT NULL,
            event_type TEXT NOT NULL,
            title TEXT NOT NULL,
            message TEXT NOT NULL,
            related_order_id TEXT,
            created_at TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    if not _column_exists(connection, "user_notifications", "read"):
        connection.execute("ALTER TABLE user_notifications ADD COLUMN read INTEGER NOT NULL DEFAULT 0")


def _migrate_order_messages_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS order_messages (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            user_name TEXT NOT NULL,
            message TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
        """
    )


def _migrate_user_push_tokens_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS user_push_tokens (
            token TEXT PRIMARY KEY,
            user_name TEXT NOT NULL,
            platform TEXT NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )
        """
    )


def _migrate_order_ratings_table(connection: sqlite3.Connection) -> None:
    connection.execute(
        """
        CREATE TABLE IF NOT EXISTS order_ratings (
            id TEXT PRIMARY KEY,
            order_id TEXT NOT NULL,
            reviewer_name TEXT NOT NULL,
            target_user_name TEXT NOT NULL,
            category TEXT NOT NULL,
            score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),
            comment TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL,
            UNIQUE(order_id, reviewer_name, target_user_name),
            FOREIGN KEY (order_id) REFERENCES orders(id)
        )
        """
    )
    if not _column_exists(connection, "order_ratings", "comment"):
        connection.execute("ALTER TABLE order_ratings ADD COLUMN comment TEXT NOT NULL DEFAULT ''")

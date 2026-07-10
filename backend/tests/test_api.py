from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from backend.app import db
from backend.app.main import app


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setattr(db, "DB_PATH", tmp_path / "cartbuddy-test.db")
    monkeypatch.setattr("backend.app.main.ensure_seed_data", lambda: None)
    monkeypatch.setattr("backend.app.service._send_push_to_user", lambda *args, **kwargs: None)
    db.init_db()
    with TestClient(app) as test_client:
        yield test_client


def register_user(client: TestClient, display_name: str) -> dict:
    suffix = uuid4().hex[:8]
    response = client.post(
        "/auth/register",
        json={
            "email": f"{display_name.lower()}-{suffix}@example.com",
            "display_name": display_name,
            "phone": "+40740111222",
            "address": "Bulevardul Unirii, Bucuresti",
            "latitude": 44.4268,
            "longitude": 26.1025,
            "password": "secret123",
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(auth_response: dict) -> dict[str, str]:
    return {"Authorization": f"Bearer {auth_response['token']}"}


def test_health_includes_build_marker(client: TestClient) -> None:
    health_response = client.get("/health")
    version_response = client.get("/version")

    assert health_response.status_code == 200
    assert health_response.json()["status"] == "ok"
    assert health_response.json()["build"] == "2026-07-08-legal-pages"
    assert version_response.status_code == 200
    assert version_response.json()["build"] == "2026-07-08-legal-pages"


def test_account_deletion_page_is_public(client: TestClient) -> None:
    response = client.get("/account-deletion")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "CartBuddy - solicitare stergere cont si date" in response.text


def test_privacy_policy_page_is_public(client: TestClient) -> None:
    response = client.get("/privacy")

    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "CartBuddy - Politica de confidentialitate" in response.text


def create_order(
    client: TestClient,
    auth_response: dict,
    min_people: int = 2,
    platform: str = "Amazon",
) -> dict:
    response = client.post(
        "/orders",
        headers=auth_headers(auth_response),
        json={
            "platform": platform,
            "min_people": min_people,
            "max_wait_days": 1,
            "latitude": 44.4268,
            "longitude": 26.1025,
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_register_login_and_me(client: TestClient) -> None:
    registered = register_user(client, "Alice")

    me_response = client.get("/auth/me", headers=auth_headers(registered))
    assert me_response.status_code == 200
    assert me_response.json()["display_name"] == "Alice"

    login_response = client.post(
        "/auth/login",
        json={"email": registered["user"]["email"], "password": "secret123"},
    )
    assert login_response.status_code == 200
    login_payload = login_response.json()
    assert login_payload["token"]
    assert login_payload["user"]["email"] == registered["user"]["email"]


def test_update_profile_phone_and_address(client: TestClient) -> None:
    registered = register_user(client, "ProfileUser")

    response = client.patch(
        "/auth/me",
        headers=auth_headers(registered),
        json={
            "phone": "+40744123456",
            "address": "Strada Academiei 1, Bucuresti",
            "latitude": 44.4355,
            "longitude": 26.1018,
        },
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["email"] == registered["user"]["email"]
    assert payload["display_name"] == "ProfileUser"
    assert payload["phone"] == "+40744123456"
    assert payload["address"] == "Strada Academiei 1, Bucuresti"
    assert payload["latitude"] == 44.4355
    assert payload["longitude"] == 26.1018


def test_create_order_and_nearby(client: TestClient) -> None:
    creator = register_user(client, "Creator")
    order = create_order(client, creator, min_people=3)

    assert order["platform"] == "Amazon"
    assert order["current_people"] == 1
    assert order["join_state"] == "joined"

    nearby_response = client.get(
        "/orders/nearby",
        headers=auth_headers(creator),
        params={
            "latitude": 44.4268,
            "longitude": 26.1025,
            "radius_meters": 1000,
            "platform": "Amazon",
        },
    )
    assert nearby_response.status_code == 200
    nearby_ids = {item["id"] for item in nearby_response.json()["items"]}
    assert order["id"] in nearby_ids


def test_create_order_with_custom_platform(client: TestClient) -> None:
    creator = register_user(client, "CustomPlatformOwner")
    order = create_order(client, creator, platform="Zalando")

    assert order["platform"] == "Zalando"

    nearby_response = client.get(
        "/orders/nearby",
        headers=auth_headers(creator),
        params={
            "latitude": 44.4268,
            "longitude": 26.1025,
            "radius_meters": 1000,
            "platform": "Zalando",
        },
    )
    assert nearby_response.status_code == 200
    nearby_ids = {item["id"] for item in nearby_response.json()["items"]}
    assert order["id"] in nearby_ids


def test_join_order_requires_reservation_then_confirmation(client: TestClient) -> None:
    creator = register_user(client, "Owner")
    member = register_user(client, "Member")
    order = create_order(client, creator, min_people=2)

    reserve_response = client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))
    assert reserve_response.status_code == 200
    reserved = reserve_response.json()
    assert reserved["join_state"] == "reserved"
    assert reserved["reserved_people"] == 1
    assert reserved["current_people"] == 1
    assert reserved["my_reservation_expires_at"] is not None

    confirm_response = client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))
    assert confirm_response.status_code == 200
    confirmed = confirm_response.json()
    assert confirmed["join_state"] == "joined"
    assert confirmed["current_people"] == 2
    assert confirmed["available_slots"] == 0


def test_product_link_limit_is_enforced(client: TestClient) -> None:
    creator = register_user(client, "LinkOwner")
    member = register_user(client, "LinkMember")
    order = create_order(client, creator, min_people=2)

    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))
    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))

    for index in range(10):
        response = client.post(
            f"/orders/{order['id']}/links",
            headers=auth_headers(member),
            json={"url": f"https://amazon.com/product/{index}"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["slots_used"] == index + 1

    over_limit_response = client.post(
        f"/orders/{order['id']}/links",
        headers=auth_headers(member),
        json={"url": "https://amazon.com/product/overflow"},
    )
    assert over_limit_response.status_code == 409
    assert "Maximum 10 product link slots reached" in over_limit_response.text


def test_product_links_must_match_order_platform(client: TestClient) -> None:
    creator = register_user(client, "PlatformOwner")
    order = create_order(client, creator, min_people=2)

    invalid_response = client.post(
        f"/orders/{order['id']}/links",
        headers=auth_headers(creator),
        json={"url": "https://emag.ro/product/123"},
    )
    assert invalid_response.status_code == 422

    valid_response = client.post(
        f"/orders/{order['id']}/links",
        headers=auth_headers(creator),
        json={"url": "https://amazon.com/product/123"},
    )
    assert valid_response.status_code == 200


def test_push_token_registration(client: TestClient) -> None:
    user = register_user(client, "PushUser")

    response = client.post(
        "/push-tokens",
        headers=auth_headers(user),
        json={"token": "ExponentPushToken[test-token]", "platform": "android"},
    )
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

    with db.get_connection() as connection:
        row = connection.execute(
            "SELECT user_name, platform FROM user_push_tokens WHERE token = ?",
            ("ExponentPushToken[test-token]",),
        ).fetchone()
    assert row["user_name"] == "PushUser"
    assert row["platform"] == "android"


def test_order_chat_requires_membership_and_lists_messages(client: TestClient) -> None:
    creator = register_user(client, "ChatOwner")
    member = register_user(client, "ChatMember")
    outsider = register_user(client, "ChatOutsider")
    order = create_order(client, creator, min_people=2)

    outsider_response = client.get(f"/orders/{order['id']}/messages", headers=auth_headers(outsider))
    assert outsider_response.status_code == 403

    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))
    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))

    post_response = client.post(
        f"/orders/{order['id']}/messages",
        headers=auth_headers(member),
        json={"message": "Salut, pot intra si eu in comanda?"},
    )
    assert post_response.status_code == 200, post_response.text
    posted_items = post_response.json()["items"]
    assert len(posted_items) == 1
    assert posted_items[0]["user_name"] == "ChatMember"
    assert posted_items[0]["message"] == "Salut, pot intra si eu in comanda?"

    creator_messages_response = client.get(
        f"/orders/{order['id']}/messages",
        headers=auth_headers(creator),
    )
    assert creator_messages_response.status_code == 200
    creator_items = creator_messages_response.json()["items"]
    assert [item["message"] for item in creator_items] == ["Salut, pot intra si eu in comanda?"]


def test_expired_order_can_be_extended_once(client: TestClient) -> None:
    creator = register_user(client, "ExtendOwner")
    order = create_order(client, creator, min_people=2)
    expired_at = (datetime.now(UTC) - timedelta(minutes=1)).isoformat()

    with db.get_connection(write=True) as connection:
        connection.execute(
            "UPDATE orders SET expires_at = ?, status = 'open' WHERE id = ?",
            (expired_at, order["id"]),
        )

    extend_response = client.post(f"/orders/{order['id']}/extend", headers=auth_headers(creator))
    assert extend_response.status_code == 200, extend_response.text
    extended = extend_response.json()
    assert extended["status"] == "open"
    assert extended["extended_once"] is True

    second_extend_response = client.post(f"/orders/{order['id']}/extend", headers=auth_headers(creator))
    assert second_extend_response.status_code == 409
    assert "Order already extended once" in second_extend_response.text


def test_creator_can_update_order_status(client: TestClient) -> None:
    creator = register_user(client, "StatusOwner")
    member = register_user(client, "StatusMember")
    order = create_order(client, creator, min_people=2)

    forbidden_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(member),
        json={"status": "ordered"},
    )
    assert forbidden_response.status_code == 403

    ready_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(creator),
        json={"status": "ready_to_order"},
    )
    assert ready_response.status_code == 200
    assert ready_response.json()["status"] == "ready_to_order"

    delivered_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(creator),
        json={"status": "delivered"},
    )
    assert delivered_response.status_code == 200
    assert delivered_response.json()["status"] == "delivered"

    terminal_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(creator),
        json={"status": "cancelled"},
    )
    assert terminal_response.status_code == 409


def test_order_flow_locks_links_after_ordered_and_chat_after_delivered(client: TestClient) -> None:
    creator = register_user(client, "FlowOwner")
    member = register_user(client, "FlowMember")
    order = create_order(client, creator, min_people=2)

    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))
    client.post(f"/orders/{order['id']}/join", headers=auth_headers(member))

    ready_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(creator),
        json={"status": "ordered"},
    )
    assert ready_response.status_code == 200

    locked_link_response = client.post(
        f"/orders/{order['id']}/links",
        headers=auth_headers(member),
        json={"url": "https://amazon.com/product/locked"},
    )
    assert locked_link_response.status_code == 409

    message_response = client.post(
        f"/orders/{order['id']}/messages",
        headers=auth_headers(member),
        json={"message": "Comanda a fost plasata?"},
    )
    assert message_response.status_code == 200

    delivered_response = client.post(
        f"/orders/{order['id']}/status",
        headers=auth_headers(creator),
        json={"status": "delivered"},
    )
    assert delivered_response.status_code == 200

    locked_chat_response = client.post(
        f"/orders/{order['id']}/messages",
        headers=auth_headers(member),
        json={"message": "Multumesc!"},
    )
    assert locked_chat_response.status_code == 409

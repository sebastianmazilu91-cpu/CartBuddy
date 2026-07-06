from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from .auth import create_user, login_user, login_with_google, require_user
from .db import init_db
from .schemas import (
    AddOrderLinkRequest,
    AddOrderMessageRequest,
    AuthResponse,
    CreateOrderRequest,
    GoogleLoginRequest,
    LoginRequest,
    NotificationsResponse,
    OrderLinksResponse,
    OrderMessagesResponse,
    NearbyOrdersResponse,
    OrderResponse,
    PLATFORMS,
    RegisterPushTokenRequest,
    RegisterRequest,
    UpdateOrderStatusRequest,
    UserResponse,
)
from .service import (
    MAX_LINK_SLOTS_PER_MEMBER,
    add_order_message,
    add_order_link,
    create_order,
    ensure_seed_data,
    extend_order_once,
    get_member_slots_used,
    join_order,
    list_order_links,
    list_order_messages,
    list_user_notifications,
    list_my_orders,
    list_nearby_orders,
    mark_user_notification_read,
    process_order_link,
    register_push_token,
    update_order_status,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    ensure_seed_data()
    yield


app = FastAPI(title="CartBuddy API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/platforms")
def platforms() -> dict:
    return {"items": list(PLATFORMS)}


@app.post("/auth/register", response_model=AuthResponse)
def auth_register(payload: RegisterRequest) -> AuthResponse:
    create_user(
        email=payload.email,
        display_name=payload.display_name,
        phone=payload.phone,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        password=payload.password,
    )
    login = login_user(email=payload.email, password=payload.password)
    return AuthResponse(token=login["token"], user=UserResponse(**login["user"]))


@app.post("/auth/login", response_model=AuthResponse)
def auth_login(payload: LoginRequest) -> AuthResponse:
    result = login_user(email=payload.email, password=payload.password)
    return AuthResponse(token=result["token"], user=UserResponse(**result["user"]))


@app.post("/auth/google", response_model=AuthResponse)
def auth_google(payload: GoogleLoginRequest) -> AuthResponse:
    result = login_with_google(
        access_token=payload.access_token,
        phone=payload.phone,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    return AuthResponse(token=result["token"], user=UserResponse(**result["user"]))


@app.get("/auth/me", response_model=UserResponse)
def auth_me(current_user: dict = Depends(require_user)) -> UserResponse:
    return UserResponse(**current_user)


@app.post("/push-tokens")
def post_push_token(payload: RegisterPushTokenRequest, current_user: dict = Depends(require_user)) -> dict:
    register_push_token(
        user_name=current_user["display_name"],
        token=payload.token,
        platform=payload.platform,
    )
    return {"status": "ok"}


@app.post("/orders", response_model=OrderResponse)
def post_order(payload: CreateOrderRequest, current_user: dict = Depends(require_user)) -> OrderResponse:
    return create_order(payload, creator_name=current_user["display_name"])


@app.get("/orders/nearby", response_model=NearbyOrdersResponse)
def get_nearby_orders(
    current_user: dict = Depends(require_user),
    latitude: float = Query(ge=-90, le=90),
    longitude: float = Query(ge=-180, le=180),
    radius_meters: int = Query(default=1000, ge=50, le=3000),
    platform: str | None = Query(default=None),
):
    return NearbyOrdersResponse(
        items=list_nearby_orders(
            latitude=latitude,
            longitude=longitude,
            radius_meters=radius_meters,
            platform=platform,
            user_name=current_user["display_name"],
        )
    )


@app.get("/orders/mine", response_model=NearbyOrdersResponse)
def get_my_orders(current_user: dict = Depends(require_user)) -> NearbyOrdersResponse:
    return NearbyOrdersResponse(items=list_my_orders(current_user["display_name"]))


@app.post("/orders/{order_id}/join", response_model=OrderResponse)
def post_join_order(order_id: str, current_user: dict = Depends(require_user)) -> OrderResponse:
    item, reason = join_order(order_id=order_id, user_name=current_user["display_name"])
    if item is None:
        if reason == "expired":
            raise HTTPException(status_code=409, detail="Order has expired")
        if reason == "full":
            raise HTTPException(status_code=409, detail="Order is full")
        raise HTTPException(status_code=404, detail="Order not found")
    return item


@app.post("/orders/{order_id}/extend", response_model=OrderResponse)
def post_extend_order(order_id: str, current_user: dict = Depends(require_user)) -> OrderResponse:
    item, reason = extend_order_once(order_id=order_id, user_name=current_user["display_name"])
    if item is None:
        if reason == "not_owner":
            raise HTTPException(status_code=403, detail="Only creator can extend this order")
        if reason == "already_extended":
            raise HTTPException(status_code=409, detail="Order already extended once")
        if reason == "not_expired":
            raise HTTPException(status_code=409, detail="Order is not expired")
        raise HTTPException(status_code=404, detail="Order not found")
    return item


@app.post("/orders/{order_id}/status", response_model=OrderResponse)
def post_order_status(
    order_id: str,
    payload: UpdateOrderStatusRequest,
    current_user: dict = Depends(require_user),
) -> OrderResponse:
    item, reason = update_order_status(
        order_id=order_id,
        user_name=current_user["display_name"],
        status=payload.status,
    )
    if item is None:
        if reason == "not_owner":
            raise HTTPException(status_code=403, detail="Only creator can update this order")
        if reason == "terminal_status":
            raise HTTPException(status_code=409, detail="Order is already terminal")
        if reason == "invalid_status":
            raise HTTPException(status_code=422, detail="Invalid order status")
        raise HTTPException(status_code=404, detail="Order not found")
    return item


@app.get("/orders/{order_id}/links", response_model=OrderLinksResponse)
def get_order_links(order_id: str, current_user: dict = Depends(require_user)) -> OrderLinksResponse:
    items, reason = list_order_links(order_id=order_id, user_name=current_user["display_name"])
    if items is None:
        if reason == "not_member":
            raise HTTPException(status_code=403, detail="Join order first to manage links")
        raise HTTPException(status_code=404, detail="Order not found")
    slots_used = get_member_slots_used(order_id=order_id, user_name=current_user["display_name"])
    return OrderLinksResponse(
        items=items,
        slots_used=slots_used,
        slots_max=MAX_LINK_SLOTS_PER_MEMBER,
    )


@app.post("/orders/{order_id}/links", response_model=OrderLinksResponse)
def post_order_link(
    order_id: str,
    payload: AddOrderLinkRequest,
    current_user: dict = Depends(require_user),
) -> OrderLinksResponse:
    _, reason = add_order_link(
        order_id=order_id,
        user_name=current_user["display_name"],
        url=payload.url,
    )
    if reason == "not_found":
        raise HTTPException(status_code=404, detail="Order not found")
    if reason == "not_member":
        raise HTTPException(status_code=403, detail="Join order first to add links")
    if reason == "invalid_url":
        raise HTTPException(status_code=422, detail="Invalid product URL")
    if reason == "slots_limit":
        raise HTTPException(status_code=409, detail="Maximum 10 product link slots reached")
    if reason == "order_locked":
        raise HTTPException(status_code=409, detail="Order no longer accepts product links")

    items, _ = list_order_links(order_id=order_id, user_name=current_user["display_name"])
    safe_items = items or []
    slots_used = get_member_slots_used(order_id=order_id, user_name=current_user["display_name"])
    return OrderLinksResponse(
        items=safe_items,
        slots_used=slots_used,
        slots_max=MAX_LINK_SLOTS_PER_MEMBER,
    )


@app.post("/orders/{order_id}/links/{link_id}/process", response_model=OrderLinksResponse)
def post_process_order_link(
    order_id: str,
    link_id: str,
    current_user: dict = Depends(require_user),
) -> OrderLinksResponse:
    _, reason = process_order_link(
        order_id=order_id,
        link_id=link_id,
        actor_user_name=current_user["display_name"],
    )
    if reason == "not_owner":
        raise HTTPException(status_code=403, detail="Only order creator can process member links")
    if reason == "link_not_found":
        raise HTTPException(status_code=404, detail="Link not found")
    if reason == "not_found":
        raise HTTPException(status_code=404, detail="Order not found")

    items, _ = list_order_links(order_id=order_id, user_name=current_user["display_name"])
    safe_items = items or []
    slots_used = get_member_slots_used(order_id=order_id, user_name=current_user["display_name"])
    return OrderLinksResponse(
        items=safe_items,
        slots_used=slots_used,
        slots_max=MAX_LINK_SLOTS_PER_MEMBER,
    )


@app.get("/orders/{order_id}/messages", response_model=OrderMessagesResponse)
def get_order_messages(
    order_id: str,
    current_user: dict = Depends(require_user),
    limit: int = Query(default=100, ge=1, le=100),
) -> OrderMessagesResponse:
    items, reason = list_order_messages(
        order_id=order_id,
        user_name=current_user["display_name"],
        limit=limit,
    )
    if items is None:
        if reason == "not_member":
            raise HTTPException(status_code=403, detail="Join order first to read messages")
        raise HTTPException(status_code=404, detail="Order not found")
    return OrderMessagesResponse(items=items)


@app.post("/orders/{order_id}/messages", response_model=OrderMessagesResponse)
def post_order_message(
    order_id: str,
    payload: AddOrderMessageRequest,
    current_user: dict = Depends(require_user),
) -> OrderMessagesResponse:
    _, reason = add_order_message(
        order_id=order_id,
        user_name=current_user["display_name"],
        message=payload.message,
    )
    if reason == "not_found":
        raise HTTPException(status_code=404, detail="Order not found")
    if reason == "not_member":
        raise HTTPException(status_code=403, detail="Join order first to send messages")
    if reason == "empty_message":
        raise HTTPException(status_code=422, detail="Message cannot be empty")
    if reason == "order_locked":
        raise HTTPException(status_code=409, detail="Order chat is read-only")

    items, _ = list_order_messages(order_id=order_id, user_name=current_user["display_name"])
    return OrderMessagesResponse(items=items or [])


@app.get("/notifications", response_model=NotificationsResponse)
def get_notifications(
    current_user: dict = Depends(require_user),
    limit: int = Query(default=30, ge=1, le=100),
) -> NotificationsResponse:
    items, unread_count = list_user_notifications(current_user["display_name"], limit=limit)
    return NotificationsResponse(items=items, unread_count=unread_count)


@app.post("/notifications/{notification_id}/read", response_model=NotificationsResponse)
def post_notification_read(notification_id: str, current_user: dict = Depends(require_user)) -> NotificationsResponse:
    updated = mark_user_notification_read(current_user["display_name"], notification_id)
    if not updated:
        raise HTTPException(status_code=404, detail="Notification not found")
    items, unread_count = list_user_notifications(current_user["display_name"], limit=30)
    return NotificationsResponse(items=items, unread_count=unread_count)

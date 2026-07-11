from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

from .auth import create_user, login_user, login_with_google, require_user, update_user_profile
from .db import init_db
from .schemas import (
    AddOrderLinkRequest,
    AddOrderMessageRequest,
    AuthResponse,
    CapacityRequestResponse,
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
    RatingCandidateResponse,
    SubmitRatingRequest,
    UpdateOrderStatusRequest,
    UpdateOrderCostsRequest,
    UpdateOrderLocationRequest,
    UpdateProfileRequest,
    UserResponse,
    UserRatingSummaryResponse,
)
from .service import (
    MAX_LINK_SLOTS_PER_MEMBER,
    add_order_message,
    add_order_link,
    create_order,
    delete_user_notifications,
    ensure_seed_data,
    extend_order_once,
    get_member_slots_used,
    get_user_rating_summary,
    join_order,
    list_order_links,
    list_order_messages,
    list_user_notifications,
    list_my_orders,
    list_nearby_orders,
    mark_user_notification_read,
    process_order_link,
    register_push_token,
    request_extra_order_spot,
    resolve_extra_order_spot_request,
    submit_order_rating,
    update_order_status,
    update_order_costs,
    update_order_location,
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    ensure_seed_data()
    yield


APP_BUILD = "2026-07-08-legal-pages"

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
    return {"status": "ok", "build": APP_BUILD}


@app.get("/version")
def version() -> dict:
    return {"name": "CartBuddy API", "build": APP_BUILD}


@app.get("/account-deletion", response_class=HTMLResponse, include_in_schema=False)
def account_deletion() -> str:
    return """
    <!doctype html>
    <html lang="ro">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>CartBuddy - Stergerea contului</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.55; margin: 0; color: #1f2937; background: #f8fafc; }
          main { max-width: 760px; margin: 0 auto; padding: 40px 20px; background: #fff; min-height: 100vh; }
          h1 { color: #111827; margin-top: 0; }
          h2 { color: #111827; margin-top: 28px; }
          li { margin-bottom: 8px; }
          .note { background: #eef2ff; border-left: 4px solid #4f46e5; padding: 12px 16px; }
        </style>
      </head>
      <body>
        <main>
          <h1>CartBuddy - solicitare stergere cont si date</h1>
          <p>
            Aceasta pagina explica modul in care utilizatorii CartBuddy pot solicita stergerea
            contului si a datelor asociate.
          </p>

          <h2>Cum soliciti stergerea</h2>
          <ol>
            <li>Trimite o cerere de stergere folosind adresa de contact a dezvoltatorului afisata in Google Play pentru CartBuddy.</li>
            <li>Include adresa de email folosita la autentificarea in CartBuddy si numele de utilizator, daca il cunosti.</li>
            <li>Scrie in subiect: "Stergere cont CartBuddy".</li>
            <li>Vei primi confirmarea dupa procesarea cererii.</li>
          </ol>

          <h2>Date sterse</h2>
          <ul>
            <li>Contul utilizatorului: email, nume afisat, telefon, adresa si coordonate salvate.</li>
            <li>Sesiunile de autentificare active.</li>
            <li>Tokenurile pentru notificari push.</li>
            <li>Notificarile asociate contului.</li>
            <li>Datele operationale legate direct de cont, acolo unde stergerea nu afecteaza obligatii legale sau integritatea comenzilor existente.</li>
          </ul>

          <h2>Date care pot fi pastrate temporar</h2>
          <p>
            Unele informatii pot fi pastrate pentru o perioada limitata daca sunt necesare pentru
            securitate, prevenirea abuzurilor, solutionarea disputelor, evidenta comenzilor sau
            respectarea obligatiilor legale.
          </p>

          <p class="note">
            CartBuddy nu vinde datele utilizatorilor. Datele sunt folosite pentru functionalitatea
            aplicatiei: autentificare, comenzi, cautare nearby, chat pe comanda si notificari.
          </p>
        </main>
      </body>
    </html>
    """


@app.get("/privacy", response_class=HTMLResponse, include_in_schema=False)
def privacy_policy() -> str:
    return """
    <!doctype html>
    <html lang="ro">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>CartBuddy - Politica de confidentialitate</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.55; margin: 0; color: #1f2937; background: #f8fafc; }
          main { max-width: 820px; margin: 0 auto; padding: 40px 20px; background: #fff; min-height: 100vh; }
          h1 { color: #111827; margin-top: 0; }
          h2 { color: #111827; margin-top: 28px; }
          li { margin-bottom: 8px; }
          .muted { color: #6b7280; }
        </style>
      </head>
      <body>
        <main>
          <h1>CartBuddy - Politica de confidentialitate</h1>
          <p class="muted">Ultima actualizare: 8 iulie 2026</p>

          <p>
            Aceasta politica explica modul in care CartBuddy colecteaza, foloseste si protejeaza
            datele utilizatorilor. CartBuddy ajuta utilizatorii sa creeze si sa se alature comenzilor
            comune, sa comunice pe comenzi si sa primeasca notificari relevante.
          </p>

          <h2>Date colectate</h2>
          <ul>
            <li>Date de cont: email, nume afisat, telefon, adresa si date de autentificare.</li>
            <li>Date de locatie: coordonate aproximative folosite pentru gasirea comenzilor nearby.</li>
            <li>Date despre comenzi: platforma, numar minim de participanti, status, linkuri produse si detalii operationale.</li>
            <li>Mesaje: continutul chatului asociat unei comenzi.</li>
            <li>Notificari: tokenuri de notificari push si istoricul notificarilor din aplicatie.</li>
            <li>Date tehnice de baza necesare functionarii serviciului.</li>
          </ul>

          <h2>Cum folosim datele</h2>
          <ul>
            <li>Pentru autentificarea si administrarea contului.</li>
            <li>Pentru crearea, afisarea si gestionarea comenzilor.</li>
            <li>Pentru cautarea comenzilor din apropiere.</li>
            <li>Pentru chatul dintre membrii unei comenzi.</li>
            <li>Pentru notificari despre comenzi, mesaje si schimbari de status.</li>
            <li>Pentru securitate, prevenirea abuzurilor si imbunatatirea functionarii aplicatiei.</li>
          </ul>

          <h2>Partajarea datelor</h2>
          <p>
            CartBuddy nu vinde datele utilizatorilor. Datele pot fi procesate prin furnizori tehnici
            necesari functionarii aplicatiei, cum ar fi hostingul backend-ului, serviciile de autentificare
            si serviciile de notificari push.
          </p>

          <h2>Securitatea datelor</h2>
          <p>
            Datele sunt transmise prin conexiuni securizate HTTPS. Accesul la functionalitatile contului
            este protejat prin autentificare.
          </p>

          <h2>Pastrarea si stergerea datelor</h2>
          <p>
            Datele sunt pastrate atat timp cat este necesar pentru functionarea contului si a comenzilor,
            pentru securitate sau pentru respectarea obligatiilor legale. Utilizatorii pot solicita stergerea
            contului si a datelor asociate folosind pagina:
            <a href="/account-deletion">Stergere cont CartBuddy</a>.
          </p>

          <h2>Copii</h2>
          <p>
            CartBuddy nu este destinat copiilor sub 13 ani si nu colecteaza intentionat date de la acestia.
          </p>

          <h2>Contact</h2>
          <p>
            Pentru intrebari despre aceasta politica sau despre datele tale, foloseste adresa de contact
            a dezvoltatorului afisata in pagina CartBuddy din Google Play.
          </p>
        </main>
      </body>
    </html>
    """


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


@app.patch("/auth/me", response_model=UserResponse)
def patch_auth_me(payload: UpdateProfileRequest, current_user: dict = Depends(require_user)) -> UserResponse:
    user = update_user_profile(
        user_id=current_user["id"],
        phone=payload.phone,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
    )
    return UserResponse(**user)


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
    radius_meters: int = Query(default=1000, ge=50, le=5000),
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


@app.get("/auth/me/ratings", response_model=UserRatingSummaryResponse)
def get_my_ratings(current_user: dict = Depends(require_user)) -> UserRatingSummaryResponse:
    return get_user_rating_summary(current_user["display_name"])


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


@app.post("/orders/{order_id}/capacity-requests", response_model=CapacityRequestResponse)
def post_capacity_request(order_id: str, current_user: dict = Depends(require_user)) -> CapacityRequestResponse:
    request, reason = request_extra_order_spot(order_id, current_user["display_name"])
    if request is None:
        if reason in {"already_member", "already_requested"}:
            raise HTTPException(status_code=409, detail="Already a member or request already sent")
        if reason == "not_full":
            raise HTTPException(status_code=409, detail="Order still has available spots")
        if reason == "max_capacity":
            raise HTTPException(status_code=409, detail="Maximum capacity reached")
        if reason == "not_open":
            raise HTTPException(status_code=409, detail="Order is not open")
        raise HTTPException(status_code=404, detail="Order not found")
    return request


@app.post("/orders/{order_id}/capacity-requests/{request_id}", response_model=OrderResponse)
def post_capacity_request_resolution(
    order_id: str,
    request_id: str,
    approve: bool = Query(),
    current_user: dict = Depends(require_user),
) -> OrderResponse:
    order, reason = resolve_extra_order_spot_request(
        order_id, request_id, current_user["display_name"], approve
    )
    if order is None:
        if reason == "not_owner":
            raise HTTPException(status_code=403, detail="Only organizer can resolve requests")
        if reason == "cannot_expand":
            raise HTTPException(status_code=409, detail="Order cannot be expanded")
        raise HTTPException(status_code=404, detail="Order or request not found")
    return order


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


@app.patch("/orders/{order_id}/costs", response_model=OrderResponse)
def patch_order_costs(order_id: str, payload: UpdateOrderCostsRequest,
                      current_user: dict = Depends(require_user)) -> OrderResponse:
    item, reason = update_order_costs(
        order_id, current_user["display_name"], payload.delivery_fee,
        payload.processing_fee, payload.minimum_order_value,
    )
    if item is None:
        if reason == "not_owner":
            raise HTTPException(status_code=403, detail="Only creator can update costs")
        if reason == "terminal_status":
            raise HTTPException(status_code=409, detail="Order is already terminal")
        raise HTTPException(status_code=404, detail="Order not found")
    return item


@app.patch("/orders/{order_id}/location", response_model=OrderResponse)
def patch_order_location(order_id: str, payload: UpdateOrderLocationRequest,
                         current_user: dict = Depends(require_user)) -> OrderResponse:
    item, reason = update_order_location(
        order_id, current_user["display_name"], payload.latitude, payload.longitude
    )
    if item is None:
        if reason == "not_owner":
            raise HTTPException(status_code=403, detail="Only creator can update location")
        if reason == "has_participants":
            raise HTTPException(status_code=409, detail="Location is locked after a participant joins")
        if reason == "terminal_status":
            raise HTTPException(status_code=409, detail="Order is already terminal")
        raise HTTPException(status_code=404, detail="Order not found")
    return item


@app.post("/orders/{order_id}/ratings", response_model=RatingCandidateResponse)
def post_order_rating(
    order_id: str,
    payload: SubmitRatingRequest,
    current_user: dict = Depends(require_user),
) -> RatingCandidateResponse:
    rating, reason = submit_order_rating(
        order_id=order_id,
        reviewer_name=current_user["display_name"],
        target_user_name=payload.target_user_name,
        score=payload.score,
        comment=payload.comment,
    )
    if rating is None:
        if reason in {"not_member", "self_rating"}:
            raise HTTPException(status_code=403, detail="Only other order members can be rated")
        if reason == "not_delivered":
            raise HTTPException(status_code=409, detail="Order must be delivered before rating")
        if reason == "already_rated":
            raise HTTPException(status_code=409, detail="User already rated for this order")
        raise HTTPException(status_code=404, detail="Order not found")
    return rating


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


@app.delete("/notifications", response_model=NotificationsResponse)
def delete_notifications(current_user: dict = Depends(require_user)) -> NotificationsResponse:
    delete_user_notifications(current_user["display_name"])
    return NotificationsResponse(items=[], unread_count=0)

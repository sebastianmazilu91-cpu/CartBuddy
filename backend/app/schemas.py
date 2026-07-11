from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Platform = str
PLATFORMS: tuple[str, ...] = ("Amazon", "eMAG", "Temu", "AliExpress", "SHEIN", "Fashion Days")


class RegisterRequest(BaseModel):
    email: str = Field(min_length=5, max_length=128)
    display_name: str = Field(min_length=2, max_length=64)
    phone: str = Field(min_length=7, max_length=20)
    address: str = Field(min_length=5, max_length=256)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    password: str = Field(min_length=6, max_length=128)


class LoginRequest(BaseModel):
    email: str = Field(min_length=5, max_length=128)
    password: str = Field(min_length=6, max_length=128)


class GoogleLoginRequest(BaseModel):
    access_token: str = Field(min_length=20, max_length=4096)
    phone: str = Field(default="", max_length=20)
    address: str = Field(min_length=5, max_length=256)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class UserResponse(BaseModel):
    id: str
    email: str
    display_name: str
    phone: str
    address: str
    latitude: float
    longitude: float


class UpdateProfileRequest(BaseModel):
    phone: str = Field(default="", max_length=20)
    address: str = Field(min_length=5, max_length=256)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


class AuthResponse(BaseModel):
    token: str
    user: UserResponse


class CreateOrderRequest(BaseModel):
    platform: Platform = Field(min_length=2, max_length=64)
    min_people: int = Field(ge=2, le=10)
    max_wait_days: int = Field(ge=1, le=10)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    delivery_fee: float = Field(ge=0, le=1_000_000)
    processing_fee: float = Field(ge=0, le=1_000_000)
    minimum_order_value: float | None = Field(default=None, ge=0, le=1_000_000)
    currency: Literal["EUR", "USD", "RON", "GBP", "MDL", "CHF", "CAD", "AUD", "JPY", "CNY", "PLN", "HUF", "TRY"]

    @field_validator("platform")
    @classmethod
    def clean_platform(cls, value: str) -> str:
        normalized = " ".join(value.strip().split())
        if len(normalized) < 2:
            raise ValueError("Platform name is too short")
        return normalized


class RatingCommentResponse(BaseModel):
    reviewer_name: str
    category: Literal["organizer", "participant"]
    score: int
    comment: str
    created_at: datetime


class UserRatingSummaryResponse(BaseModel):
    organizer_average: float | None = None
    organizer_count: int = 0
    participant_average: float | None = None
    participant_count: int = 0
    recent_comments: list[RatingCommentResponse] = Field(default_factory=list)


class RatingCandidateResponse(BaseModel):
    user_name: str
    category: Literal["organizer", "participant"]
    score: int | None = None
    comment: str | None = None
    rating_summary: UserRatingSummaryResponse | None = None


class CapacityRequestResponse(BaseModel):
    id: str
    user_name: str
    status: Literal["pending", "approved", "rejected"]
    created_at: datetime


class OrderResponse(BaseModel):
    id: str
    platform: Platform
    min_people: int
    current_people: int
    created_by: str
    max_wait_days: int
    expires_at: datetime
    status: Literal["open", "expired", "closed", "ready_to_order", "ordered", "delivered", "cancelled"]
    extended_once: bool
    latitude: float
    longitude: float
    created_at: datetime
    distance_meters: float | None = None
    reserved_people: int = 0
    available_slots: int = 0
    join_state: Literal["none", "reserved", "joined"] = "none"
    my_reservation_expires_at: datetime | None = None
    priority_score: float | None = None
    delivery_fee: float
    processing_fee: float
    minimum_order_value: float | None = None
    currency: str
    rating_candidates: list[RatingCandidateResponse] = Field(default_factory=list)
    creator_rating_summary: UserRatingSummaryResponse | None = None
    capacity_requests: list[CapacityRequestResponse] = Field(default_factory=list)
    my_capacity_request_status: Literal["pending", "approved", "rejected"] | None = None
    member_names: list[str] = Field(default_factory=list)
    member_details: list[RatingCandidateResponse] = Field(default_factory=list)


class NearbyOrdersResponse(BaseModel):
    items: list[OrderResponse]


class UpdateOrderStatusRequest(BaseModel):
    status: Literal["ready_to_order", "ordered", "delivered", "cancelled"]


class UpdateOrderCostsRequest(BaseModel):
    delivery_fee: float = Field(ge=0)
    processing_fee: float = Field(ge=0)
    minimum_order_value: float | None = Field(default=None, ge=0)


class SubmitRatingRequest(BaseModel):
    target_user_name: str = Field(min_length=2, max_length=64)
    score: int = Field(ge=1, le=5)
    comment: str = Field(min_length=2, max_length=500)

    @field_validator("comment")
    @classmethod
    def clean_comment(cls, value: str) -> str:
        return " ".join(value.strip().split())


class AddOrderLinkRequest(BaseModel):
    url: str = Field(min_length=8, max_length=2048)


class OrderLinkResponse(BaseModel):
    id: str
    order_id: str
    user_name: str
    url: str
    processed: bool
    processed_by: str | None = None
    processed_at: datetime | None = None
    created_at: datetime


class OrderLinksResponse(BaseModel):
    items: list[OrderLinkResponse]
    slots_used: int
    slots_max: int = 10


class AddOrderMessageRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)


class OrderMessageResponse(BaseModel):
    id: str
    order_id: str
    user_name: str
    message: str
    created_at: datetime


class OrderMessagesResponse(BaseModel):
    items: list[OrderMessageResponse]


class RegisterPushTokenRequest(BaseModel):
    token: str = Field(min_length=10, max_length=512)
    platform: Literal["ios", "android", "web", "unknown"] = "unknown"


class NotificationResponse(BaseModel):
    id: str
    event_type: str
    title: str
    message: str
    related_order_id: str | None = None
    created_at: datetime
    read: bool


class NotificationsResponse(BaseModel):
    items: list[NotificationResponse]
    unread_count: int

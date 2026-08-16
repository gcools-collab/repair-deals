from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator


class SearchCriteria(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    query: str = Field(min_length=1, max_length=200)
    min_price: int | None = Field(default=None, ge=0)
    max_price: int | None = Field(default=None, ge=0)
    postal_code: str | None = Field(default=None, min_length=2, max_length=12)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_km: int | None = Field(default=None, ge=1, le=500)
    limit: int = Field(default=20, ge=1, le=35)
    broken_only: bool = False

    @model_validator(mode="after")
    def validate_ranges(self) -> "SearchCriteria":
        for minimum, maximum, label in ((self.min_price, self.max_price, "price"),):
            if minimum is not None and maximum is not None and minimum > maximum:
                raise ValueError(f"min_{label} cannot exceed max_{label}")
        if (self.latitude is None) != (self.longitude is None):
            raise ValueError("latitude and longitude must be provided together")
        return self


class ListingRequest(BaseModel):
    url: HttpUrl

    @field_validator("url")
    @classmethod
    def require_leboncoin_url(cls, value: HttpUrl) -> HttpUrl:
        host = (value.host or "").lower()
        if host != "leboncoin.fr" and not host.endswith(".leboncoin.fr"):
            raise ValueError("url must target leboncoin.fr")
        return value


class LeboncoinAttribute(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    key: str
    key_label: str | None = Field(default=None, alias="keyLabel")
    value: str | int | float | bool | None = None
    value_label: str | None = Field(default=None, alias="valueLabel")
    values: list[str] = Field(default_factory=list)
    values_label: list[str] = Field(default_factory=list, alias="valuesLabel")


class LeboncoinLocation(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    city: str | None = None
    city_label: str | None = Field(default=None, alias="cityLabel")
    zipcode: str | None = None
    department_name: str | None = Field(default=None, alias="departmentName")
    region_name: str | None = Field(default=None, alias="regionName")
    latitude: float | None = None
    longitude: float | None = None


class LeboncoinListing(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str
    title: str
    description: str | None = None
    brand: str | None = None
    model_reference: str | None = Field(default=None, alias="modelReference")
    url: str
    price: float | None = Field(default=None, ge=0)
    images: list[str] = Field(default_factory=list)
    attributes: dict[str, LeboncoinAttribute] = Field(default_factory=dict)
    location: LeboncoinLocation | None = None
    published_at: str | None = Field(default=None, alias="publishedAt")
    detected_fault_keywords: list[str] = Field(
        default_factory=list, alias="detectedFaultKeywords"
    )
    likely_broken: bool = Field(default=False, alias="likelyBroken")


class HealthResponse(BaseModel):
    status: Literal["ok"] = "ok"
    provider: Literal["lbc"] = "lbc"


class ErrorBody(BaseModel):
    code: str
    message: str


class ErrorResponse(BaseModel):
    error: ErrorBody

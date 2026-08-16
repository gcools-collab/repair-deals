from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Protocol

from app.broken_detection import detect_fault_keywords, normalize_text
from app.models import LeboncoinAttribute, LeboncoinListing, LeboncoinLocation


Scalar = str | int | float | bool | None
INVALID_IDENTITIES = {"", "leboncoin", "lbc", "unknown", "inconnu"}


class AttributeLike(Protocol):
    key: str
    key_label: str | None
    value: Scalar
    value_label: str | None
    values: Sequence[str] | None
    values_label: Sequence[str] | None


class LocationLike(Protocol):
    city: str | None
    city_label: str | None
    zipcode: str | None
    department_name: str | None
    region_name: str | None
    lat: float | None
    lng: float | None


class AdLike(Protocol):
    id: int | str
    subject: str
    body: str | None
    brand: str | None
    url: str
    price: float | int | None
    images: Sequence[str]
    attributes: Mapping[str, AttributeLike] | Sequence[AttributeLike]
    location: LocationLike | None
    first_publication_date: str | None


def _attribute_items(ad: AdLike) -> list[tuple[str, AttributeLike]]:
    if isinstance(ad.attributes, Mapping):
        return list(ad.attributes.items())
    return [(attribute.key, attribute) for attribute in ad.attributes]


def _attribute_value(ad: AdLike, *names: str) -> str | None:
    normalized_names = {normalize_text(name).replace(" ", "") for name in names}
    for _, attribute in _attribute_items(ad):
        if any(
            normalize_text(candidate or "").replace(" ", "") in normalized_names
            for candidate in (attribute.key, attribute.key_label)
        ):
            value = attribute.value_label or attribute.value
            if value is not None and str(value).strip():
                return str(value).strip()
    return None


def _credible_identity(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip()
    return None if normalize_text(cleaned) in INVALID_IDENTITIES else cleaned


def map_listing(ad: AdLike) -> LeboncoinListing:
    attributes = {
        name: LeboncoinAttribute(
            key=attribute.key,
            key_label=attribute.key_label,
            value=attribute.value,
            value_label=attribute.value_label,
            values=list(attribute.values or []),
            values_label=list(attribute.values_label or []),
        )
        for name, attribute in _attribute_items(ad)
    }
    location = None
    if ad.location is not None:
        location = LeboncoinLocation(
            city=ad.location.city,
            city_label=ad.location.city_label,
            zipcode=ad.location.zipcode,
            department_name=ad.location.department_name,
            region_name=ad.location.region_name,
            latitude=ad.location.lat,
            longitude=ad.location.lng,
        )

    brand = _attribute_value(ad, "brand", "marque", "u_car_brand")
    model_reference = _attribute_value(
        ad, "model", "modele", "modèle", "reference", "référence", "u_car_model"
    )
    fault_keywords = detect_fault_keywords(ad.subject, ad.body)

    return LeboncoinListing(
        id=str(ad.id),
        title=ad.subject,
        description=ad.body,
        brand=_credible_identity(brand) or _credible_identity(ad.brand),
        model_reference=_credible_identity(model_reference),
        url=ad.url,
        price=float(ad.price) if ad.price is not None else None,
        images=list(ad.images or []),
        attributes=attributes,
        location=location,
        published_at=ad.first_publication_date,
        detected_fault_keywords=fault_keywords,
        likely_broken=bool(fault_keywords),
    )

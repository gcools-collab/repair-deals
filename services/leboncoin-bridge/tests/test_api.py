from __future__ import annotations

from dataclasses import dataclass, field

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app
from app.mapper import AdLike
from app.models import SearchCriteria

API_KEY = "test-internal-key"
HEADERS = {"X-Internal-Api-Key": API_KEY}


@dataclass
class FakeLocation:
    city: str | None = "Paris"
    city_label: str | None = "Paris (75000)"
    zipcode: str | None = "75000"
    department_name: str | None = "Paris"
    region_name: str | None = "Île-de-France"
    lat: float | None = 48.8566
    lng: float | None = 2.3522


@dataclass
class FakeAttribute:
    key: str
    key_label: str | None
    value: str | None
    value_label: str | None
    values: list[str] = field(default_factory=list)
    values_label: list[str] = field(default_factory=list)


@dataclass
class FakeAd:
    id: int | str = 1234567890
    subject: str = "PlayStation 5 HDMI HS"
    body: str | None = "Console vendue en l'état"
    brand: str | None = "leboncoin"
    url: str = "https://www.leboncoin.fr/ad/consoles/1234567890"
    price: float | int | None = 120
    images: list[str] = field(default_factory=lambda: ["https://img.example.test/ps5.jpg"])
    attributes: list[FakeAttribute] = field(default_factory=lambda: [
        FakeAttribute("brand", "Marque", "SONY", "Sony"),
        FakeAttribute("model", "Modèle", "CFI-1216A", "PlayStation 5 CFI-1216A"),
    ])
    location: FakeLocation | None = field(default_factory=FakeLocation)
    first_publication_date: str | None = "2026-01-01 10:00:00"


class FakeGateway:
    def search(self, criteria: SearchCriteria) -> list[AdLike]:
        return [FakeAd(), FakeAd(id=2, subject="PlayStation 5 excellent état", body="Fonctionne parfaitement")]

    def get_listing(self, url: str) -> AdLike:
        return FakeAd(url=url)


def make_client() -> TestClient:
    app = create_app(
        settings=Settings(internal_api_key=API_KEY, request_timeout_seconds=2),
        gateway=FakeGateway(),
    )
    return TestClient(app)


def test_health_and_authentication() -> None:
    assert make_client().get("/health", headers=HEADERS).json() == {
        "status": "ok",
        "provider": "lbc",
    }
    assert make_client().get("/health").status_code == 401


def test_search_rejects_invalid_range() -> None:
    response = make_client().post(
        "/search",
        headers=HEADERS,
        json={"query": "console", "min_price": 200, "max_price": 100},
    )
    assert response.status_code == 422


def test_search_returns_repair_deals_shape() -> None:
    response = make_client().post(
        "/search", headers=HEADERS, json={"query": "PlayStation 5", "limit": 10}
    )
    assert response.status_code == 200
    body = response.json()
    listing = body["results"][0]
    assert body["rawCount"] == 2
    assert listing["title"] == "PlayStation 5 HDMI HS"
    assert listing["description"] == "Console vendue en l'état"
    assert listing["brand"] == "Sony"
    assert listing["modelReference"] == "PlayStation 5 CFI-1216A"
    assert listing["publishedAt"] == "2026-01-01 10:00:00"
    assert listing["likelyBroken"] is True
    assert "HDMI HS" in listing["detectedFaultKeywords"]
    assert listing["location"]["latitude"] == 48.8566


def test_broken_only_removes_working_listings() -> None:
    response = make_client().post(
        "/search",
        headers=HEADERS,
        json={"query": "PlayStation 5", "broken_only": True},
    )
    assert response.status_code == 200
    assert [listing["id"] for listing in response.json()["results"]] == ["1234567890"]


def test_search_accepts_geographic_contract() -> None:
    response = make_client().post(
        "/search",
        headers=HEADERS,
        json={
            "query": "ordinateur portable",
            "postal_code": "59590",
            "latitude": 50.389,
            "longitude": 3.485,
            "radius_km": 50,
        },
    )
    assert response.status_code == 200


def test_search_rejects_partial_coordinates() -> None:
    response = make_client().post(
        "/search", headers=HEADERS, json={"query": "MacBook", "latitude": 50.389}
    )
    assert response.status_code == 422


def test_listing_rejects_non_leboncoin_url() -> None:
    response = make_client().post(
        "/listing", headers=HEADERS, json={"url": "https://example.com/ad/1234567890"}
    )
    assert response.status_code == 422

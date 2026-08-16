from __future__ import annotations

from dataclasses import dataclass

from app.gateway import LbcGateway
from app.models import SearchCriteria


@dataclass
class SearchResult:
    ads: list


class RecordingClient:
    def __init__(self) -> None:
        self.arguments: dict | None = None

    def search(self, **arguments):
        self.arguments = arguments
        return SearchResult(ads=[])


def gateway_with(client: RecordingClient) -> LbcGateway:
    gateway = object.__new__(LbcGateway)
    gateway._client = client
    return gateway


def test_gateway_sends_real_city_radius_to_lbc() -> None:
    client = RecordingClient()
    gateway_with(client).search(SearchCriteria(
        query="MacBook écran cassé",
        postal_code="59590",
        latitude=50.389,
        longitude=3.485,
        radius_km=50,
    ))
    assert client.arguments is not None
    locations = client.arguments["locations"]
    assert len(locations) == 1
    assert locations[0].lat == 50.389
    assert locations[0].lng == 3.485
    assert locations[0].radius == 50_000
    assert locations[0].city == "59590"


def test_gateway_degrades_without_coordinates() -> None:
    client = RecordingClient()
    gateway_with(client).search(SearchCriteria(
        query="MacBook écran cassé",
        postal_code="59590",
        radius_km=25,
    ))
    assert client.arguments is not None
    assert client.arguments["locations"] is None

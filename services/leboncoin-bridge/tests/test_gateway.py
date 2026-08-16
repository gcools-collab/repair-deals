from __future__ import annotations

from dataclasses import dataclass, field

import lbc

from app.gateway import LbcGateway
from app.models import SearchCriteria


@dataclass
class FakeSearchResult:
    ads: list[object] = field(default_factory=list)


class RecordingClient:
    def __init__(self) -> None:
        self.arguments: dict[str, object] = {}

    def search(self, **kwargs: object) -> FakeSearchResult:
        self.arguments = kwargs
        return FakeSearchResult()


def test_gateway_uses_generic_query_price_and_category() -> None:
    client = RecordingClient()
    gateway = object.__new__(LbcGateway)
    gateway._client = client

    result = gateway.search(
        SearchCriteria(query="ampli hi-fi en panne", min_price=10, max_price=250, limit=12)
    )

    assert result == []
    assert client.arguments["text"] == "ampli hi-fi en panne"
    assert client.arguments["price"] == [10, 250]
    assert client.arguments["limit"] == 12
    assert client.arguments["category"] is lbc.Category.TOUTES_CATEGORIES

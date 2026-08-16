from __future__ import annotations

import re
import logging
from typing import Protocol, cast

import lbc
from curl_cffi.requests.exceptions import RequestException
from lbc.exceptions import InvalidValue, RequestError

from app.mapper import AdLike
from app.models import SearchCriteria

logger = logging.getLogger("leboncoin_bridge.gateway")


class UpstreamError(RuntimeError):
    """The upstream client failed or returned an unusable response."""


class ProviderCriteriaError(RuntimeError):
    """The provider library rejected locally built search criteria."""


class ProviderInternalError(RuntimeError):
    """The provider failed outside a network or criteria error."""


class LeboncoinGateway(Protocol):
    def search(self, criteria: SearchCriteria) -> list[AdLike]: ...

    def get_listing(self, url: str) -> AdLike: ...


class LbcGateway:
    def __init__(self, timeout_seconds: float) -> None:
        self._client = lbc.Client(timeout=timeout_seconds, max_retries=1, proxy=None)

    def search(self, criteria: SearchCriteria) -> list[AdLike]:
        filters: dict[str, object] = {}
        locations: list[lbc.City] | None = None
        if criteria.latitude is not None and criteria.longitude is not None:
            locations = [
                lbc.City(
                    lat=criteria.latitude,
                    lng=criteria.longitude,
                    radius=(criteria.radius_km or 100) * 1_000,
                    city=criteria.postal_code,
                )
            ]
        if criteria.min_price is not None or criteria.max_price is not None:
            filters["price"] = [criteria.min_price or 0, criteria.max_price or 999_999_999]
        try:
            result = self._client.search(
                text=criteria.query,
                page=1,
                limit=criteria.limit,
                sort=lbc.Sort.NEWEST,
                ad_type=lbc.AdType.OFFER,
                category=lbc.Category.TOUTES_CATEGORIES,
                locations=locations,
                **filters,
            )
        except InvalidValue as error:
            logger.error(
                "provider=lbc operation=search error_type=%s category=invalid_criteria",
                type(error).__name__,
            )
            raise ProviderCriteriaError("Leboncoin search criteria were rejected") from error
        except (RequestError, RequestException) as error:
            status_code = getattr(getattr(error, "response", None), "status_code", None)
            logger.error(
                "provider=lbc operation=search error_type=%s upstream_status=%s",
                type(error).__name__,
                status_code,
            )
            raise UpstreamError("Leboncoin search failed") from error
        except Exception as error:
            logger.error(
                "provider=lbc operation=search error_type=%s category=internal",
                type(error).__name__,
            )
            raise ProviderInternalError("Leboncoin provider failed internally") from error
        logger.info("provider=lbc operation=search result_count=%d", len(result.ads))
        return cast(list[AdLike], result.ads)

    def get_listing(self, url: str) -> AdLike:
        match = re.search(r"/(?:[^/?]+/)*(\d{6,})(?:[/?#]|$)", url)
        if match is None:
            raise ValueError("the Leboncoin URL does not contain a listing id")
        try:
            return cast(AdLike, self._client.get_ad(int(match.group(1))))
        except Exception as error:
            raise UpstreamError("Leboncoin listing retrieval failed") from error

from __future__ import annotations

import os

from pydantic import BaseModel, Field, SecretStr


class Settings(BaseModel):
    internal_api_key: SecretStr
    request_timeout_seconds: float = Field(default=20.0, gt=0, le=60)

    @classmethod
    def from_environment(cls) -> "Settings":
        api_key = os.getenv("LEBONCOIN_BRIDGE_API_KEY")
        if not api_key:
            raise RuntimeError("LEBONCOIN_BRIDGE_API_KEY must be configured")

        return cls(
            internal_api_key=api_key,
            request_timeout_seconds=os.getenv("LEBONCOIN_REQUEST_TIMEOUT_SECONDS", "20"),
        )

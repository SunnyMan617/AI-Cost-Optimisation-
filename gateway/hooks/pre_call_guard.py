"""
LiteLLM pre-call hook for masking request content before provider calls.
"""

from __future__ import annotations

import json
import os
from typing import Any, Dict
from urllib.error import URLError
from urllib.request import Request, urlopen

from litellm.integrations.custom_logger import CustomLogger


class PrivacyPreCallGuard(CustomLogger):
    def __init__(self) -> None:
        super().__init__()
        self.privacy_url = os.getenv("PRIVACY_URL", "http://privacy:8000")

    def _mask_text(self, text: str) -> str:
        request = Request(
            url=f"{self.privacy_url}/mask",
            data=json.dumps({"text": text}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=10) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except URLError as exc:
            raise RuntimeError(f"privacy masking request failed: {exc}") from exc
        return payload.get("masked_text", text)

    async def async_pre_call_hook(self, user_api_key_dict: Any, cache: Any, data: dict, call_type: str):
        messages = data.get("messages")
        if not isinstance(messages, list):
            return data

        for message in messages:
            if not isinstance(message, dict):
                continue
            content = message.get("content")

            if isinstance(content, str):
                if "<PII_" in content:
                    continue
                message["content"] = self._mask_text(content)
                continue

            if isinstance(content, list):
                for part in content:
                    if not isinstance(part, dict):
                        continue
                    if part.get("type") != "text":
                        continue
                    text = part.get("text")
                    if not isinstance(text, str) or "<PII_" in text:
                        continue
                    part["text"] = self._mask_text(text)

        return data


proxy_handler_instance = PrivacyPreCallGuard()

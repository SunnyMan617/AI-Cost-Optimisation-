"""
Example LiteLLM hook module.

This file is intentionally lightweight for MVP demos. In production you can wire
it into LiteLLM callbacks and enrich metadata (tenant, request class, budget tags).
"""

from typing import Any, Dict


def build_metadata(tenant_id: str, can_wait: bool) -> Dict[str, Any]:
    return {
        "tenant_id": tenant_id,
        "can_wait": can_wait,
        "gateway_version": "mvp-demo",
    }

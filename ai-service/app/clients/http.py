"""HTTP client dùng chung để gọi service khác bằng header X-Internal-Token."""
import httpx

from app import config

_clients: dict[str, httpx.AsyncClient] = {}


def client_for(base_url: str) -> httpx.AsyncClient:
    if base_url not in _clients:
        _clients[base_url] = httpx.AsyncClient(
            base_url=base_url,
            timeout=config.SERVICE_TIMEOUT_SECONDS,
            headers={"X-Internal-Token": config.INTERNAL_API_KEY},
        )
    return _clients[base_url]


async def close_clients() -> None:
    for c in _clients.values():
        await c.aclose()
    _clients.clear()

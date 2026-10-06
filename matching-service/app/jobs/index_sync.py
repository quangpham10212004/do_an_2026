"""
IndexSyncJob — lưới an toàn cho chỉ mục embedding.

profile-service báo thay đổi theo kiểu best-effort (không chờ kết quả, không retry),
nên thông báo có thể mất: matching-service đang khởi động lại, mạng lỗi, hoặc hồ sơ
được sửa trực tiếp trong DB lúc seed/demo. Job này định kỳ so hash text giữa
profile_db và chỉ mục rồi embed lại phần lệch, nên chỉ mục luôn hội tụ về nguồn sự
thật mà không cần profile-service biết gì về embedding.

Tương đương EmbeddingRetryJob cũ ở profile-service, nhưng mạnh hơn: nó phát hiện
cả hồ sơ chưa từng được báo, chứ không chỉ hồ sơ từng embed lỗi.
"""
import asyncio
import logging

from app import config
from app.services import index_service

log = logging.getLogger(__name__)


async def run_once() -> dict:
    return await index_service.reconcile(config.INDEX_SYNC_BATCH)


async def run_forever() -> None:
    # Hoãn vòng đầu để service kịp load model và các pool kịp sẵn sàng.
    await asyncio.sleep(min(config.INDEX_SYNC_INTERVAL, 30))
    while True:
        try:
            stats = await run_once()
            if stats["reindexed"] or stats["pending"] or stats["pruned"]:
                log.info("IndexSyncJob: %s", stats)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.warning("IndexSyncJob thất bại: %s", exc)
        await asyncio.sleep(config.INDEX_SYNC_INTERVAL)

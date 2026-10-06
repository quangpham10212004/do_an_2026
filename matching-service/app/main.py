import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config
from app.db import close_pools
from app.jobs import index_sync
from app.routers import index, matching
from app.services import embedding_service

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI):
    for warning in config.dev_secret_warnings():
        log.warning(warning)
    # Load model 1 lần lúc startup — không load lại mỗi request.
    if config.PRELOAD_MODEL:
        embedding_service.load_model()
    # IndexSyncJob giữ chỉ mục embedding đồng bộ với profile_db (xem app/jobs/index_sync.py).
    sync_task = asyncio.create_task(index_sync.run_forever()) if config.INDEX_SYNC_ENABLED else None
    try:
        yield
    finally:
        if sync_task is not None:
            sync_task.cancel()
            try:
                await sync_task
            except asyncio.CancelledError:
                pass
        await close_pools()


app = FastAPI(title="matching-service", version="1.0.0", lifespan=lifespan)


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    """Chuẩn hoá lỗi theo format chung: { "error": { "code", "message" } }."""
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        body = exc.detail
    else:
        body = {"code": "HTTP_" + str(exc.status_code), "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": body})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    message = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": message}})


@app.get("/health")
def health() -> dict:
    return {"status": "UP", "service": "matching-service", "modelLoaded": embedding_service.is_loaded()}


app.include_router(index.router)
app.include_router(matching.router)

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config
from app.db import close_pool
from app.routers import embed, matching
from app.services import embedding_service

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Load model 1 lần lúc startup — không load lại mỗi request.
    if config.PRELOAD_MODEL:
        embedding_service.load_model()
    yield
    await close_pool()


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


app.include_router(embed.router)
app.include_router(matching.router)

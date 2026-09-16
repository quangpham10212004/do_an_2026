import logging

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app import config
from app.errors import AiError
from app.llm.deepseek import get_client
from app.routers import cv, enrichment, interview

logging.basicConfig(level=logging.INFO)

app = FastAPI(
    title="ai-service",
    version="1.0.0",
    description="AI Interview, CV Parsing, Chatbot enrichment — DeepSeek + engine rule-based (fallback).",
)


@app.exception_handler(AiError)
async def ai_error_handler(_: Request, exc: AiError) -> JSONResponse:
    return JSONResponse(status_code=exc.status, content={"error": {"code": exc.code, "message": exc.message}})


@app.exception_handler(HTTPException)
async def http_exception_handler(_: Request, exc: HTTPException) -> JSONResponse:
    body = exc.detail if isinstance(exc.detail, dict) and "code" in exc.detail else {
        "code": f"HTTP_{exc.status_code}", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content={"error": body})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_: Request, exc: RequestValidationError) -> JSONResponse:
    message = "; ".join(f"{'.'.join(str(p) for p in e['loc'])}: {e['msg']}" for e in exc.errors())
    return JSONResponse(status_code=400, content={"error": {"code": "VALIDATION_ERROR", "message": message}})


@app.get("/health")
def health() -> dict:
    client = get_client()
    return {
        "status": "UP",
        "service": "ai-service",
        "llmEnabled": client.enabled,
        "llmProvider": "deepseek" if client.enabled else None,
        "model": config.DEEPSEEK_MODEL if client.enabled else None,
    }


app.include_router(interview.router)
app.include_router(cv.router)
app.include_router(enrichment.router)

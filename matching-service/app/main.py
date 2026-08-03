from fastapi import FastAPI
from app.routers import embed, matching
from app.services.embedding_service import load_model

app = FastAPI(title="matching-service", version="0.1.0")


@app.on_event("startup")
def startup_event() -> None:
    # Load model 1 lần lúc startup — không load lại mỗi request.
    load_model()


@app.get("/health")
def health() -> dict:
    return {"status": "UP", "service": "matching-service"}


app.include_router(embed.router)
app.include_router(matching.router)

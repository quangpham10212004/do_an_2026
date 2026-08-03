from sentence_transformers import SentenceTransformer

# Model được load 1 lần lúc startup app (xem app/main.py), không load lại
# mỗi request — load lại mỗi request sẽ rất chậm.
_model: SentenceTransformer | None = None

MODEL_NAME = "all-MiniLM-L6-v2"  # 384 chiều


def load_model() -> None:
    global _model
    if _model is None:
        _model = SentenceTransformer(MODEL_NAME)


def embed_text(text: str) -> list[float]:
    if _model is None:
        raise RuntimeError("Embedding model chưa được load — gọi load_model() lúc startup")
    return _model.encode(text).tolist()

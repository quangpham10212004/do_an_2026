from sentence_transformers import SentenceTransformer

from app import config

# Model được load 1 lần lúc startup app (xem app/main.py), không load lại
# mỗi request — load lại mỗi request sẽ rất chậm.
_model: SentenceTransformer | None = None

EMBEDDING_DIM = 384


def load_model() -> None:
    global _model
    if _model is None:
        _model = SentenceTransformer(config.EMBEDDING_MODEL)


def is_loaded() -> bool:
    return _model is not None


def embed_text(text: str) -> list[float]:
    if _model is None:
        load_model()
    # normalize_embeddings=True: vector đơn vị => cosine similarity = tích vô hướng,
    # ổn định hơn khi so sánh các đoạn text có độ dài khác nhau.
    return _model.encode(text, normalize_embeddings=True).tolist()

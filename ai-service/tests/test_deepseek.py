import json

import httpx
from pydantic import BaseModel

from app.cv import deepseek_parser
from app.interview import deepseek_engine, rule_based
from app.interview.models import InterviewContext, TurnRecord
from app.llm.deepseek import DeepSeekClient


class Answer(BaseModel):
    topic: str
    score: float


class FakeDeepSeek:
    """Giả lập API DeepSeek: xếp hàng các phản hồi (status, content, finish_reason) và ghi lại request."""

    def __init__(self):
        self.replies = []
        self.requests = []

    def reply(self, content="", status=200, finish_reason="stop"):
        self.replies.append((status, content, finish_reason))

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        status, content, finish = self.replies.pop(0) if self.replies else (200, "", "stop")
        if status != 200:
            return httpx.Response(status, json={"error": {"message": "boom"}})
        return httpx.Response(200, json={"choices": [{"finish_reason": finish,
                                                      "message": {"role": "assistant", "content": content}}]})

    def client(self) -> DeepSeekClient:
        return DeepSeekClient("sk-test", "https://api.deepseek.test", "deepseek-flash", 1000, 5,
                              transport=httpx.MockTransport(self.handler))


CTX = InterviewContext(domain="backend", skills=["Java"], years_experience=3, max_turns=5)


def test_disabled_without_api_key():
    client = DeepSeekClient("", "https://unused", "deepseek-flash")
    assert not client.enabled
    assert client.json("s", "u", Answer, "{}") is None


def test_sends_openai_compatible_json_mode_request():
    fake = FakeDeepSeek()
    fake.reply('{"topic": "Caching", "score": 8.5, "extra": true}')
    assert fake.client().json("Bạn là người phỏng vấn.", "Câu trả lời", Answer, '{"topic":"x","score":1}') == Answer(topic="Caching", score=8.5)

    req = fake.requests[0]
    body = json.loads(req.content)
    assert req.url.path == "/chat/completions"
    assert req.headers["Authorization"] == "Bearer sk-test"
    assert body["model"] == "deepseek-flash"
    assert body["response_format"] == {"type": "json_object"}
    assert body["max_tokens"] == 1000
    # DeepSeek JSON mode yêu cầu prompt chứa chữ "json" và ví dụ mẫu
    assert body["messages"][0]["role"] == "system"
    assert "json" in body["messages"][0]["content"] and '{"topic":"x","score":1}' in body["messages"][0]["content"]
    assert body["messages"][1] == {"role": "user", "content": "Câu trả lời"}


def test_retries_once_on_empty_content():
    fake = FakeDeepSeek()
    fake.reply("")
    fake.reply('{"topic": "Retry", "score": 5}')
    assert fake.client().json("s", "u", Answer, "{}") == Answer(topic="Retry", score=5)
    assert len(fake.requests) == 2


def test_retries_server_errors_but_not_client_errors():
    fake = FakeDeepSeek()
    fake.reply(status=503)
    fake.reply('{"topic": "Ok", "score": 1}')
    assert fake.client().json("s", "u", Answer, "{}") is not None

    fake = FakeDeepSeek()
    fake.reply(status=401)
    assert fake.client().json("s", "u", Answer, "{}") is None
    assert len(fake.requests) == 1


def test_invalid_truncated_or_fenced_json():
    fake = FakeDeepSeek()
    fake.reply("đây không phải json")
    fake.reply('{"topic": "cut', finish_reason="length")
    fake.reply('```json\n{"topic": "Fence", "score": 2}\n```')
    client = fake.client()
    assert client.json("s", "u", Answer, "{}") is None
    assert client.json("s", "u", Answer, "{}") is None
    assert client.json("s", "u", Answer, "{}") == Answer(topic="Fence", score=2)


def test_interview_engine_uses_model_output_and_clamps_score():
    fake = FakeDeepSeek()
    fake.reply('{"score": 42, "feedback": "Tốt", "next": {"topic": "Bảo mật", "strategy": "pivot", "question": "JWT là gì?"}}')
    current = TurnRecord(turn_no=1, topic="API", strategy="OPENING", question="q", answer="a")
    ev, fallback = deepseek_engine.evaluate(fake.client(), CTX, [], current, False)
    assert not fallback
    assert ev.score == 10
    assert ev.next.strategy == "PIVOT" and ev.next.question == "JWT là gì?"


def test_interview_engine_falls_back_when_next_question_missing():
    fake = FakeDeepSeek()
    fake.reply('{"score": 3, "feedback": "Thiếu", "next": null}')
    current = TurnRecord(turn_no=1, topic="Caching & hiệu năng", strategy="OPENING", question="q", answer="Không biết")
    ev, fallback = deepseek_engine.evaluate(fake.client(), CTX, [], current, False)
    assert fallback
    assert ev == rule_based.evaluate(CTX, [], current, False)


def test_cv_parser_sanitizes_model_output():
    fake = FakeDeepSeek()
    fake.reply('{"current_role": "Dev", "skills": ["Java", "Java", " "], "years_experience": 60, '
               '"projects": [{"name": "A"}, {"name": null}], "education": [], "summary": "x"}')
    cv, fallback = deepseek_parser.parse(fake.client(), "cv text")
    assert not fallback
    assert cv.skills == ["Java"] and cv.years_experience == 45 and [p.name for p in cv.projects] == ["A"]

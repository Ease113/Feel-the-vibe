"""LLMClient provider chain 회귀 테스트.

- env/CLI 모두 없음 → template fallback
- env 있음 (mock 성공) → gemini 경로
- env 있음 (mock 실패) → CLI 또는 template으로 graceful degradation
- CLI 감지 (mock 성공) → cli 경로
- CLI 응답이 markdown code fence를 감싸도 JSON 추출 성공
- JSON schema 미준수 시 다음 단계로 fallback
"""

from __future__ import annotations

import json
import subprocess
import types
from typing import Any
from unittest.mock import patch

import pytest

from app.services import llm_client as llm_client_module
from app.services.llm_client import LLMClient


@pytest.fixture
def explain_payload() -> dict[str, Any]:
    return {
        "comparison_state": {"objective_delta": 12.34},
        "comparison_summary": "현재 순서는 약간 비쌉니다.",
        "risk_warnings": [{"severity": "HIGH", "message": "BLACK→WHITE 위험"}],
        "priority_profile": {"priorities": {"wash_cost": {"label": "HIGH"}}},
    }


def test_template_fallback_when_no_provider(explain_payload):
    """env 미설정 + CLI 미감지 → generation_mode == template."""
    with patch.object(LLMClient, "_claude_cli_available", staticmethod(lambda: False)):
        client = LLMClient(api_key=None)
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "template"
    assert result.model_version == "template-v1"
    assert result.prompt_version == "explain-v1"
    assert "explanation" in result.content
    assert isinstance(result.content["explanation"], str)


def test_gemini_path_success(explain_payload):
    """Gemini SDK가 정상 JSON을 반환 → generation_mode == gemini."""
    fake_response = types.SimpleNamespace(
        text=json.dumps({"explanation": "AI 한 마디"}, ensure_ascii=False)
    )

    class _FakeModels:
        def generate_content(self, **kwargs):  # noqa: ANN001 — SDK signature
            return fake_response

    class _FakeClient:
        def __init__(self, **kwargs):  # noqa: ANN001
            self.models = _FakeModels()

    fake_genai = types.SimpleNamespace(Client=_FakeClient)
    fake_google = types.ModuleType("google")
    fake_google.genai = fake_genai  # type: ignore[attr-defined]

    with patch.dict(
        "sys.modules",
        {"google": fake_google, "google.genai": fake_genai},
    ):
        client = LLMClient(api_key="dummy-key", model="gemini-test")
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "gemini"
    assert result.model_version == "gemini-test"
    assert result.content == {"explanation": "AI 한 마디"}


def test_gemini_path_failure_falls_back_to_template(explain_payload):
    """Gemini가 예외 → CLI 미감지 → template으로 graceful degradation."""

    class _FailingModels:
        def generate_content(self, **kwargs):  # noqa: ANN001
            raise RuntimeError("simulated network failure")

    class _FailingClient:
        def __init__(self, **kwargs):  # noqa: ANN001
            self.models = _FailingModels()

    fake_genai = types.SimpleNamespace(Client=_FailingClient)
    fake_google = types.ModuleType("google")
    fake_google.genai = fake_genai  # type: ignore[attr-defined]

    with patch.dict(
        "sys.modules", {"google": fake_google, "google.genai": fake_genai}
    ), patch.object(LLMClient, "_claude_cli_available", staticmethod(lambda: False)):
        client = LLMClient(api_key="dummy-key")
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "template"


def test_cli_path_with_code_fence(explain_payload):
    """CLI stdout가 ``` ```json fence ``` 형태여도 JSON 추출 성공."""
    stdout = """LLM intro line
```json
{"explanation": "CLI generated"}
```
trailing"""
    completed = subprocess.CompletedProcess(args=["claude"], returncode=0, stdout=stdout, stderr="")

    with patch.object(LLMClient, "_claude_cli_available", staticmethod(lambda: True)), patch.object(
        llm_client_module.subprocess, "run", return_value=completed
    ):
        client = LLMClient(api_key=None)
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "cli"
    assert result.model_version == "claude-cli-local"
    assert result.content == {"explanation": "CLI generated"}


def test_cli_failure_falls_back_to_template(explain_payload):
    """CLI가 exit non-zero → template으로 fallback."""
    completed = subprocess.CompletedProcess(
        args=["claude"], returncode=2, stdout="", stderr="boom"
    )
    with patch.object(LLMClient, "_claude_cli_available", staticmethod(lambda: True)), patch.object(
        llm_client_module.subprocess, "run", return_value=completed
    ):
        client = LLMClient(api_key=None)
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "template"


def test_gemini_schema_violation_falls_back(explain_payload):
    """Gemini가 필수 키 누락된 JSON을 반환 → template fallback."""

    class _BadModels:
        def generate_content(self, **kwargs):  # noqa: ANN001
            return types.SimpleNamespace(text=json.dumps({"wrong_key": "value"}))

    class _BadClient:
        def __init__(self, **kwargs):  # noqa: ANN001
            self.models = _BadModels()

    fake_genai = types.SimpleNamespace(Client=_BadClient)
    fake_google = types.ModuleType("google")
    fake_google.genai = fake_genai  # type: ignore[attr-defined]

    with patch.dict(
        "sys.modules", {"google": fake_google, "google.genai": fake_genai}
    ), patch.object(LLMClient, "_claude_cli_available", staticmethod(lambda: False)):
        client = LLMClient(api_key="dummy-key")
        result = client.generate("explain-v1", explain_payload)
    assert result.generation_mode == "template"


def test_unknown_prompt_id_raises():
    """등록되지 않은 prompt_id는 KeyError로 caller에 노출(서버에서는 500)."""
    client = LLMClient(api_key=None)
    with pytest.raises(KeyError):
        client.generate("nonexistent-prompt", {})

"""LLM provider chain: Gemini API → claude CLI → template fallback.

Caller는 ``LLMClient().generate(prompt_id, payload)`` 하나만 사용한다. provider
순서·timeout·예외 캐치·JSON 파싱·fallback 라우팅은 모두 본 모듈이 책임진다.
어떤 단계도 caller에 예외를 전파하지 않으며 항상 ``LLMResult``를 반환한다.
"""

from __future__ import annotations

import json
import logging
import re
import shutil
import subprocess
from dataclasses import dataclass
from typing import Any

from app.core.config import LLM_API_KEY, LLM_CLI_TIMEOUT_SEC, LLM_MODEL, LLM_TIMEOUT_SEC
from app.services.prompts import PromptDef, get_prompt

_log = logging.getLogger(__name__)

_CODE_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)\s*```", re.DOTALL)


@dataclass(frozen=True)
class LLMResult:
    """LLM 호출 결과 + 어느 경로로 생성되었는지를 가시화하는 응답 구조."""

    content: dict[str, Any]
    generation_mode: str  # "gemini" | "cli" | "template"
    model_version: str
    prompt_version: str


class LLMClient:
    """Gemini → claude CLI → template fallback chain을 캡슐화한다."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str | None = None,
        api_timeout: float | None = None,
        cli_timeout: float | None = None,
    ) -> None:
        """Provider chain에 필요한 설정을 주입한다.

        Args:
            api_key: Gemini API key. None이면 env(SMARTFACTORY_LLM_API_KEY) 사용.
            model: Gemini 모델명. None이면 env 또는 기본값 사용.
            api_timeout: Gemini HTTPS timeout(초).
            cli_timeout: claude CLI subprocess timeout(초).
        """
        self.api_key = api_key if api_key is not None else LLM_API_KEY
        self.model = model or LLM_MODEL
        self.api_timeout = api_timeout if api_timeout is not None else LLM_TIMEOUT_SEC
        self.cli_timeout = cli_timeout if cli_timeout is not None else LLM_CLI_TIMEOUT_SEC

    def generate(self, prompt_id: str, payload: dict[str, Any]) -> LLMResult:
        """등록된 prompt_id로 LLM 호출을 시도하고 fallback chain 결과를 반환한다.

        Args:
            prompt_id: ``prompts.PROMPT_REGISTRY``에 등록된 식별자.
            payload: prompt 생성 함수와 template fallback 함수에 그대로 전달되는 dict.

        Returns:
            content, generation_mode, model_version, prompt_version을 포함한 LLMResult.
        """
        prompt = get_prompt(prompt_id)

        if self.api_key:
            gemini = self._try_gemini(prompt, payload)
            if gemini is not None:
                return gemini

        if self._claude_cli_available():
            cli = self._try_cli(prompt, payload)
            if cli is not None:
                return cli

        return self._fallback(prompt, payload)

    # ------------------------------------------------------------------
    # provider: Gemini API
    # ------------------------------------------------------------------

    def _try_gemini(self, prompt: PromptDef, payload: dict[str, Any]) -> LLMResult | None:
        """Gemini API를 호출해 응답을 schema 기준으로 검증한 LLMResult 또는 None을 반환한다."""
        try:
            from google import genai  # type: ignore[import-not-found]
        except ImportError:
            _log.warning("llm_client provider=gemini status=sdk_missing")
            return None

        try:
            client = genai.Client(api_key=self.api_key)
            response = client.models.generate_content(
                model=self.model,
                contents=[
                    {"role": "user", "parts": [{"text": prompt.system_prompt}]},
                    {"role": "user", "parts": [{"text": prompt.user_prompt_fn(payload)}]},
                ],
            )
        except Exception as exc:  # noqa: BLE001 — network/timeout/auth 모두 같은 fallback
            _log.warning(
                "llm_client provider=gemini status=error prompt_id=%s exc=%s",
                prompt.prompt_id,
                type(exc).__name__,
            )
            return None

        text = getattr(response, "text", None)
        if not text:
            _log.warning("llm_client provider=gemini status=empty prompt_id=%s", prompt.prompt_id)
            return None

        content = self._parse_json(text, prompt)
        if content is None:
            _log.warning(
                "llm_client provider=gemini status=parse_error prompt_id=%s",
                prompt.prompt_id,
            )
            return None

        return LLMResult(
            content=content,
            generation_mode="gemini",
            model_version=self.model,
            prompt_version=prompt.prompt_version,
        )

    # ------------------------------------------------------------------
    # provider: claude CLI
    # ------------------------------------------------------------------

    @staticmethod
    def _claude_cli_available() -> bool:
        """``shutil.which("claude")``로 CLI 존재 여부를 확인한다."""
        return shutil.which("claude") is not None

    def _try_cli(self, prompt: PromptDef, payload: dict[str, Any]) -> LLMResult | None:
        """``claude --print`` stdin으로 호출하고 JSON을 추출한 LLMResult 또는 None을 반환한다."""
        text = f"{prompt.system_prompt}\n\n{prompt.user_prompt_fn(payload)}"
        try:
            completed = subprocess.run(
                ["claude", "--print"],
                input=text,
                capture_output=True,
                text=True,
                timeout=self.cli_timeout,
                check=False,
            )
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as exc:
            _log.warning(
                "llm_client provider=cli status=error prompt_id=%s exc=%s",
                prompt.prompt_id,
                type(exc).__name__,
            )
            return None

        if completed.returncode != 0 or not completed.stdout:
            _log.warning(
                "llm_client provider=cli status=non_zero prompt_id=%s rc=%s",
                prompt.prompt_id,
                completed.returncode,
            )
            return None

        content = self._parse_json(completed.stdout, prompt)
        if content is None:
            _log.warning(
                "llm_client provider=cli status=parse_error prompt_id=%s",
                prompt.prompt_id,
            )
            return None

        return LLMResult(
            content=content,
            generation_mode="cli",
            model_version="claude-cli-local",
            prompt_version=prompt.prompt_version,
        )

    # ------------------------------------------------------------------
    # provider: template fallback
    # ------------------------------------------------------------------

    @staticmethod
    def _fallback(prompt: PromptDef, payload: dict[str, Any]) -> LLMResult:
        """등록된 template fallback 함수를 호출해 항상 동작하는 응답을 만든다."""
        content = prompt.template_fallback_fn(payload)
        return LLMResult(
            content=content,
            generation_mode="template",
            model_version="template-v1",
            prompt_version=prompt.prompt_version,
        )

    # ------------------------------------------------------------------
    # helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_json(text: str, prompt: PromptDef) -> dict[str, Any] | None:
        """Raw text에서 JSON dict를 추출하고 prompt.output_schema 키 존재 여부를 검증한다.

        markdown code fence(``` ... ```)로 감싼 케이스를 대비해 1회 재시도한다.
        필수 키가 누락되거나 타입이 어긋나면 None을 반환한다.

        Args:
            text: LLM 응답 raw 문자열.
            prompt: 응답 검증에 사용할 PromptDef.

        Returns:
            schema를 만족하는 dict, 또는 검증 실패 시 None.
        """
        candidate = text.strip()
        parsed: Any
        try:
            parsed = json.loads(candidate)
        except json.JSONDecodeError:
            match = _CODE_FENCE_RE.search(candidate)
            if not match:
                return None
            try:
                parsed = json.loads(match.group(1))
            except json.JSONDecodeError:
                return None

        if not isinstance(parsed, dict):
            return None

        for key, expected_type in prompt.output_schema.items():
            if key not in parsed:
                return None
            if not isinstance(parsed[key], expected_type):
                return None
        return parsed

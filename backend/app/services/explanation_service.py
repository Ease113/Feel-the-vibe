"""`/explain` 호출지점의 LLM 분기 + template fallback 서비스."""

from typing import Any

from app.services.llm_client import LLMClient


class ExplanationService:
    """Workbench AI 요약을 LLM 우선 + template fallback으로 생성한다."""

    def __init__(self, llm_client: LLMClient | None = None) -> None:
        """LLM client를 주입받거나 기본 인스턴스를 사용한다.

        Args:
            llm_client: 테스트 시 mock 주입. None이면 기본 LLMClient.
        """
        self.llm_client = llm_client or LLMClient()

    def explain(self, payload: dict[str, Any]) -> dict[str, Any]:
        """비교 결과·warning·우선순위 payload를 LLMClient에 전달해 한국어 설명을 생성한다.

        provider chain은 Gemini → claude CLI → template 순으로 graceful degradation한다.

        Args:
            payload: comparison_state, comparison_summary, risk_warnings,
                priority_profile을 포함한 dict.

        Returns:
            explanation 문자열과 model_version/prompt_version/generation_mode provenance를 담은 dict.
        """
        result = self.llm_client.generate("explain-v1", payload)
        return {
            "explanation": result.content["explanation"],
            "model_version": result.model_version,
            "prompt_version": result.prompt_version,
            "generation_mode": result.generation_mode,
        }

"""순서 최적화, 예측, 검증, 설명 엔드포인트의 요청·응답 스키마."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class OperatingContextOverride(BaseModel):
    """프론트엔드 운영 컨텍스트 dropdown 선택값. 누락 필드는 plan_context 기본값을 사용한다.

    docs/design/operating-context-cost-multiplier.md 의 Decision 1·2 참고.
    shift, crew_size만 사용자 조작 대상이며 다른 컨텍스트 필드는 서버 측 값을 유지한다.
    """

    shift: Literal["day", "night"] | None = None
    crew_size: int | None = Field(default=None, ge=1, le=6)


class OptimizeRequest(BaseModel):
    """POST /optimize 요청 바디: 최적화할 plan_item_id 목록과 우선순위 프로파일."""

    plan_id: str
    plan_item_ids: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)
    operating_context: OperatingContextOverride | None = None


class PredictRequest(BaseModel):
    """POST /predict 요청 바디: 추천 순서와 현재 순서를 비교할 때 사용한다."""

    plan_id: str
    recommended_sequence: list[str]
    current_sequence: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)
    operating_context: OperatingContextOverride | None = None


class ValidateRequest(BaseModel):
    """POST /validate 요청 바디: 단일 순서의 규칙 위반을 검사한다."""

    plan_id: str
    current_sequence: list[str]


class ExplainRequest(BaseModel):
    """POST /explain 요청 바디: 비교 결과로 한국어 설명 문장을 생성한다."""

    comparison_state: dict[str, Any] = Field(default_factory=dict)
    comparison_summary: str = ""
    risk_warnings: list[dict[str, Any]] = Field(default_factory=list)
    priority_profile: dict[str, Any] = Field(default_factory=dict)


class ExplainResponse(BaseModel):
    """POST /explain 응답: 설명 문장 + LLM provenance 3종."""

    explanation: str
    model_version: str
    prompt_version: str
    generation_mode: Literal["gemini", "cli", "template"]

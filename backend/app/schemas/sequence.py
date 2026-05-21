"""순서 최적화, 예측, 검증, 설명 엔드포인트의 요청·응답 스키마."""

from typing import Any, Literal

from pydantic import BaseModel, Field


class OptimizeRequest(BaseModel):
    """POST /optimize 요청 바디: 최적화할 plan_item_id 목록과 우선순위 프로파일."""

    plan_id: str
    plan_item_ids: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)


class PredictRequest(BaseModel):
    """POST /predict 요청 바디: 추천 순서와 현재 순서를 비교할 때 사용한다."""

    plan_id: str
    recommended_sequence: list[str]
    current_sequence: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)


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

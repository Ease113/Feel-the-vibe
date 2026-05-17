"""의사결정 저장 및 reviewed 업데이트 요청 스키마."""

from typing import Any

from pydantic import BaseModel, Field


class DecisionCreateRequest(BaseModel):
    """확정 순서를 저장할 때 프론트엔드가 전송하는 요청 바디."""

    plan_id: str
    recommended_sequence: list[str]
    confirmed_sequence: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)
    recommended_cost: dict[str, Any] = Field(default_factory=dict)
    confirmed_cost: dict[str, Any] = Field(default_factory=dict)
    comparison_state: dict[str, Any] = Field(default_factory=dict)
    violation_details: list[dict[str, Any]] = Field(default_factory=list)
    decision_memo: str | None = None


class ReviewedUpdateRequest(BaseModel):
    """PATCH /decisions/{id}/reviewed 엔드포인트의 요청 바디."""

    reviewed: bool

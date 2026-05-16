from typing import Any

from pydantic import BaseModel, Field


class DecisionCreateRequest(BaseModel):
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
    reviewed: bool

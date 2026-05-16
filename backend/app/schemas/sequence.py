from typing import Any

from pydantic import BaseModel, Field


class OptimizeRequest(BaseModel):
    plan_id: str
    plan_item_ids: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)


class PredictRequest(BaseModel):
    plan_id: str
    recommended_sequence: list[str]
    current_sequence: list[str]
    priority_profile: dict[str, Any] = Field(default_factory=dict)


class ValidateRequest(BaseModel):
    plan_id: str
    current_sequence: list[str]


class ExplainRequest(BaseModel):
    comparison_state: dict[str, Any] = Field(default_factory=dict)
    comparison_summary: str = ""
    risk_warnings: list[dict[str, Any]] = Field(default_factory=list)
    priority_profile: dict[str, Any] = Field(default_factory=dict)

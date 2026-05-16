export type PriorityLabel = 'VERY_LOW' | 'LOW' | 'NORMAL' | 'HIGH' | 'VERY_HIGH';

export interface PrioritySetting {
  label: PriorityLabel;
  multiplier: number;
}

export interface Sku {
  sku_id: string;
  sku_name: string;
  color_family: string;
  color_hex: string;
  category: string;
  is_metallic: string;
  brightness_level: string;
  viscosity_level: string;
}

export interface PlanItem {
  plan_id: string;
  plan_item_id: string;
  plan_date: string;
  sku_id: string;
  quantity: number;
  package_size: string;
  due_priority: number;
  line_id: string;
  sku: Sku;
}

export interface PlanResponse {
  plan_id: string;
  plan_items: PlanItem[];
  operating_context: Record<string, unknown>;
  default_priority_profile: Record<string, PrioritySetting>;
}

export interface DashboardResponse {
  dashboard_summary: {
    decision_count: number;
    average_objective_score: number;
    high_risk_transition_count: number;
  };
  kpi_trend: Array<Record<string, unknown>>;
  risk_patterns: Array<Record<string, unknown>>;
  recent_decisions: Array<Record<string, unknown>>;
  weekly_summary: string;
}

CREATE TABLE IF NOT EXISTS decisions (
  decision_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL,
  recommended_sequence TEXT NOT NULL,
  confirmed_sequence TEXT NOT NULL,
  priority_profile TEXT NOT NULL,
  recommended_cost TEXT NOT NULL,
  confirmed_cost TEXT NOT NULL,
  comparison_state TEXT NOT NULL,
  violation_details TEXT NOT NULL,
  decision_memo TEXT,
  reviewed INTEGER NOT NULL DEFAULT 0,
  model_version TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_context (
  plan_id TEXT PRIMARY KEY,
  line_id TEXT NOT NULL,
  shift TEXT NOT NULL,
  crew_size INTEGER NOT NULL,
  worker_skill REAL NOT NULL,
  days_since_last_clean INTEGER NOT NULL,
  equipment_condition REAL NOT NULL,
  day_of_week INTEGER NOT NULL,
  context_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS weekly_report_cache (
  report_id TEXT PRIMARY KEY,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  source_decision_ids TEXT NOT NULL,
  kpi_snapshot TEXT NOT NULL,
  cost_summary TEXT NOT NULL,
  risk_summary TEXT NOT NULL,
  llm_summary TEXT NOT NULL,
  generated_at TEXT NOT NULL
);

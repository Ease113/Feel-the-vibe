-- =============================================================
-- SmartFactoryV2 SQLite physical schema
-- 기준 문서:
--   - docs/roadmap.md
--   - docs/source/DB_state_v1.3.md
--
-- Notes:
--   - Runtime source data remains CSV/JSON for the MVP.
--   - SQLite is the durable log store for decisions and dashboard sources.
--   - Sequences are always plan_item_id[] JSON arrays, never sku_id[].
-- =============================================================

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;


-- =============================================================
-- 1. sku_master
--    색상 SKU 기준정보. 현재 MVP는 CSV를 원천으로 사용하지만,
--    향후 SQLite 적재가 가능하도록 물리 테이블을 둔다.
-- =============================================================
CREATE TABLE IF NOT EXISTS sku_master (
    sku_id              TEXT    NOT NULL,
    sku_name            TEXT    NOT NULL,
    category            TEXT    NOT NULL
                            CHECK (category IN ('light', 'mid', 'dark', 'metal', 'special', 'normal')),
    color_family        TEXT    NOT NULL,

    -- DB_state v1.3 canonical feature columns.
    pigment_intensity   REAL    CHECK (pigment_intensity BETWEEN 0.0 AND 1.0),
    gloss_level         REAL    CHECK (gloss_level BETWEEN 0.0 AND 1.0),
    viscosity           REAL    CHECK (viscosity BETWEEN 0.0 AND 1.0),
    hex_code            TEXT    CHECK (hex_code IS NULL OR hex_code LIKE '#______'),

    -- Current synthetic-data compatibility columns.
    color_hex           TEXT    CHECK (color_hex IS NULL OR color_hex LIKE '#______'),
    is_metallic         INTEGER CHECK (is_metallic IS NULL OR is_metallic IN (0, 1)),
    brightness_level    REAL    CHECK (brightness_level IS NULL OR brightness_level BETWEEN 0.0 AND 100.0),
    viscosity_level     REAL    CHECK (viscosity_level IS NULL OR viscosity_level BETWEEN 0.0 AND 100.0),

    PRIMARY KEY (sku_id),
    CHECK (hex_code IS NOT NULL OR color_hex IS NOT NULL)
);


-- =============================================================
-- 2. sequence_rules
--    색상 전환 penalty + soft warning rule.
--    현재 JSON 룰과 DB_state v1.3 룰 표현을 모두 수용한다.
-- =============================================================
CREATE TABLE IF NOT EXISTS sequence_rules (
    rule_id             TEXT    NOT NULL,
    rule_version        TEXT    NOT NULL DEFAULT 'rules-2026.05.v1',
    rule_type           TEXT    NOT NULL DEFAULT 'color_transition'
                            CHECK (rule_type = 'color_transition'),

    -- Current synthetic JSON compatibility.
    condition           TEXT,
    severity            TEXT    CHECK (
                              severity IS NULL
                              OR severity IN ('LOW', 'MEDIUM', 'HIGH', 'MEDIUM_OR_HIGH')
                            ),

    -- DB_state v1.3 matching fields.
    from_sku_id         TEXT,
    to_sku_id           TEXT,
    from_category       TEXT,
    to_category         TEXT,
    from_category_in    TEXT,
    to_category_in      TEXT,

    penalty             REAL    NOT NULL CHECK (penalty >= 0),
    risk                TEXT    CHECK (risk IS NULL OR risk IN ('low', 'mid', 'high')),
    commit_blocking     INTEGER NOT NULL DEFAULT 0 CHECK (commit_blocking IN (0, 1)),
    reason              TEXT,
    recommendation      TEXT,

    PRIMARY KEY (rule_id)
);


-- =============================================================
-- 3. daily_plan
--    오늘 생산할 개별 항목 목록. 추천/확정 순서의 stable key는
--    plan_item_id이며, 같은 plan_id에 여러 plan_item_id가 존재한다.
-- =============================================================
CREATE TABLE IF NOT EXISTS daily_plan (
    plan_id             TEXT    NOT NULL,
    plan_item_id        TEXT    NOT NULL,
    plan_date           TEXT    NOT NULL,
    sku_id              TEXT    NOT NULL,
    quantity            REAL    NOT NULL CHECK (quantity > 0),
    package_size        TEXT    NOT NULL CHECK (package_size IN ('1L', '4L', '18L')),
    due_priority        INTEGER CHECK (due_priority IS NULL OR due_priority BETWEEN 1 AND 5),
    line_id             TEXT    DEFAULT 'LINE-01',

    PRIMARY KEY (plan_id, plan_item_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_plan_plan
    ON daily_plan (plan_id);

CREATE INDEX IF NOT EXISTS idx_daily_plan_date
    ON daily_plan (plan_date);

CREATE INDEX IF NOT EXISTS idx_daily_plan_sku
    ON daily_plan (sku_id);


-- =============================================================
-- 4. plan_context
--    생산계획의 운영 조건. plan_id는 CSV 기반 daily_plan과 논리적으로
--    연결되므로 FK를 강제하지 않는다.
-- =============================================================
CREATE TABLE IF NOT EXISTS plan_context (
    plan_id                 TEXT    NOT NULL,
    line_id                 TEXT    NOT NULL DEFAULT 'LINE-01',
    shift                   TEXT    NOT NULL CHECK (shift IN ('day', 'night')),
    crew_size               INTEGER NOT NULL CHECK (crew_size BETWEEN 1 AND 10),
    worker_skill            REAL    NOT NULL CHECK (worker_skill IN (0.3, 0.6, 0.9)),
    days_since_last_clean   INTEGER NOT NULL CHECK (days_since_last_clean BETWEEN 0 AND 7),
    equipment_condition     REAL    NOT NULL CHECK (equipment_condition IN (0.3, 0.7, 1.0)),
    day_of_week             INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
    context_version         TEXT    NOT NULL DEFAULT 'context-v1',

    PRIMARY KEY (plan_id)
);


-- =============================================================
-- 5. decisions
--    최종 확정 의사결정 로그. 서버 재계산 결과만 저장한다.
-- =============================================================
CREATE TABLE IF NOT EXISTS decisions (
    decision_id                 TEXT    NOT NULL,
    plan_id                     TEXT    NOT NULL,
    user_id                     TEXT    NOT NULL DEFAULT 'demo-manager',

    recommended_sequence        TEXT    NOT NULL,
    confirmed_sequence          TEXT    NOT NULL,
    priority_profile            TEXT    NOT NULL,
    applied_weights             TEXT    NOT NULL,
    context_snapshot            TEXT    NOT NULL,

    recommended_cost_vector     TEXT,
    confirmed_cost_vector       TEXT    NOT NULL,
    transition_costs            TEXT,

    total_weighted_cost         REAL    NOT NULL CHECK (total_weighted_cost >= 0),
    sequence_penalty            REAL    NOT NULL DEFAULT 0 CHECK (sequence_penalty >= 0),
    objective_score             REAL    NOT NULL CHECK (objective_score >= 0),

    comparison_state            TEXT    NOT NULL,
    comparison_summary          TEXT    NOT NULL,
    cost_delta_vs_recommended   TEXT,

    violation_count             INTEGER NOT NULL DEFAULT 0 CHECK (violation_count >= 0),
    violation_details           TEXT    NOT NULL DEFAULT '[]',

    explanation_summary         TEXT,
    decision_memo               TEXT,
    reviewed                    INTEGER NOT NULL DEFAULT 0 CHECK (reviewed IN (0, 1)),

    model_version               TEXT    NOT NULL DEFAULT 'heuristic-v1',
    rule_version                TEXT    NOT NULL DEFAULT 'rules-2026.05.v1',
    confirmed_at                TEXT    NOT NULL,

    PRIMARY KEY (decision_id)
);

CREATE INDEX IF NOT EXISTS idx_decisions_plan
    ON decisions (plan_id);

CREATE INDEX IF NOT EXISTS idx_decisions_confirmed_at
    ON decisions (confirmed_at);

CREATE INDEX IF NOT EXISTS idx_decisions_reviewed
    ON decisions (reviewed);


-- =============================================================
-- 6. weekly_report_cache
--    주간 KPI 요약 캐시. P1 시연용이며 decisions와 FK로 묶지 않는다.
-- =============================================================
CREATE TABLE IF NOT EXISTS weekly_report_cache (
    report_id               TEXT    NOT NULL,
    period_start            TEXT    NOT NULL,
    period_end              TEXT    NOT NULL,
    source_decision_ids     TEXT    NOT NULL,
    kpi_snapshot            TEXT    NOT NULL,
    cost_summary            TEXT    NOT NULL,
    risk_summary            TEXT    NOT NULL,
    llm_summary             TEXT    NOT NULL,
    llm_key_findings        TEXT,
    llm_recommendations     TEXT,
    prompt_version          TEXT    NOT NULL DEFAULT 'weekly-prompt-v1',
    model_version           TEXT    NOT NULL DEFAULT 'heuristic-v1',
    rule_version            TEXT    NOT NULL DEFAULT 'rules-2026.05.v1',
    generation_mode         TEXT    NOT NULL DEFAULT 'template'
                            CHECK (generation_mode IN ('live', 'cached', 'template')),
    generated_at            TEXT    NOT NULL,

    PRIMARY KEY (report_id)
);

CREATE INDEX IF NOT EXISTS idx_weekly_report_period
    ON weekly_report_cache (period_start, period_end);

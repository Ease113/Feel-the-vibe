# Codex Init Prompt — SmartFactoryV2

아래 내용을 Codex 첫 입력으로 그대로 사용하세요.

```text
You are working as a senior full-stack + ML engineer inside this repository.

Project name:
SmartFactoryV2

Project purpose:
Build a hackathon MVP for a multi-product paint manufacturing production-sequence decision support system.

The MVP must demonstrate the following operating loop:

1. Load today’s production plan.
2. Generate an AI-recommended production sequence.
3. Preserve the recommended sequence as the baseline.
4. Let the user modify the current sequence through drag and drop.
5. Recalculate transition costs and sequence risks after each change.
6. Show comparison between the recommended baseline and the current sequence.
7. Confirm the final sequence.
8. Store the decision log in SQLite.
9. Show a KPI dashboard based on saved decision logs.

This is a hackathon MVP.
Do not over-engineer.
Prioritize a working vertical slice over architectural completeness.

============================================================
0. Source Documents and Roadmap Handling
============================================================

Before starting implementation, create and/or verify the project documentation source pack.

Expected source files:
- docs/source/roadmap.jpeg
- docs/source/DB_state_v1.3.md
- docs/source/final_proposal.pdf

The roadmap image is the original roadmap source.
However, do not rely only on the image during implementation.
Use the text roadmap file as the main execution reference:

- docs/roadmap.md

If docs/roadmap.md does not exist, create it first by converting the roadmap source into an implementation-oriented plan.
The roadmap must include:
- Day-by-day implementation sequence
- P0/P1/P2 priority separation
- Backend, frontend, ML, data, and demo responsibilities
- Definition of done for each stage
- Current init step scope

After docs/roadmap.md exists, use it as the primary roadmap for all following implementation work.
When implementation decisions conflict with the roadmap, prefer the roadmap unless the code cannot run. If the code cannot run, choose a runnable fallback and document the reason in docs/implementation_log.md.

Also read DB_state_v1.3.md if available.
It defines the current screen State, DB schema, API assumptions, and MVP constraints.
Use it as the domain contract for:
- plan_item_id-based sequence handling
- recommendedSequence/currentSequence/committedSequence
- /optimize and /predict policy
- color-transition-only OR-tools P0 constraint
- objectiveScore = totalWeightedCost + sequencePenalty
- decisions table and KPI linkage

============================================================
1. Implementation Priority
============================================================

Follow this priority order strictly.

P0 — Must work in real time:
- Synthetic data generation
- XGBoost-based transition cost prediction
- OR-tools-based sequence optimization
- Drag-and-drop UI
- Sequence risk validation
- Priority/weight profile adjustment
- SQLite decision log saving
- Basic KPI data retrieval from saved logs

P1 — Include in demo, but fallback is allowed:
- LLM-style cost difference explanation
- KPI dashboard charts
- 7-dimensional cost trend
- Weekly summary
- Cached/template explanation is acceptable

P2 — Do not implement unless P0 and P1 are stable:
- Worker view
- Quality impact prediction
- Real MES/ERP integration
- Multi-line optimization
- Real-time equipment logs

Important:
If there is any conflict between “nice architecture” and “working demo”, choose working demo.

============================================================
2. Technical Stack
============================================================

Use a monorepo structure.

Frontend:
- React
- TypeScript
- Vite
- dnd-kit for drag and drop
- Recharts for dashboard charts
- Basic CSS or Tailwind if already convenient
- Do not spend time on advanced UI frameworks unless setup is trivial

Backend:
- FastAPI
- Python 3.11+
- SQLite
- Pandas
- XGBoost
- Google OR-tools
- Pydantic

Data:
- Synthetic CSV files
- SQLite for decision logs and dashboard source data

Do not require external database servers.
Do not require Docker for the first working version.
The app should run locally on a laptop.

============================================================
3. Repository Structure
============================================================

Create or align the repository with this structure:

smartfactory-v2/
  README.md
  AGENTS.md
  docs/
    source/
      roadmap.jpeg
      DB_state_v1.3.md
      final_proposal.pdf
    roadmap.md
    architecture.md
    api_contract.md
    db_schema.md
    data_schema.md
    demo_flow.md
    implementation_log.md
  backend/
    app/
      main.py
      api/
        routes_health.py
        routes_plans.py
        routes_optimize.py
        routes_predict.py
        routes_validate.py
        routes_decisions.py
        routes_dashboard.py
        routes_explain.py
      core/
        config.py
      schemas/
        plan.py
        sequence.py
        cost.py
        decision.py
        dashboard.py
      services/
        data_loader.py
        feature_builder.py
        cost_predictor.py
        optimizer.py
        rule_engine.py
        decision_logger.py
        dashboard_service.py
        explanation_service.py
      db/
        sqlite.py
        schema.sql
      ml/
        train_xgboost.py
        model_registry.py
      data/
        raw/
        processed/
        models/
    tests/
    pyproject.toml
  frontend/
    src/
      main.tsx
      App.tsx
      api/
        client.ts
        types.ts
      pages/
        DecisionPage.tsx
        DashboardPage.tsx
      components/
        SequenceWorkspace.tsx
        SkuCard.tsx
        CostSummaryPanel.tsx
        PriorityProfilePanel.tsx
        TransitionDetailPanel.tsx
        WarningPanel.tsx
        DashboardCharts.tsx
      state/
        decisionState.ts
      utils/
        costFormat.ts
    package.json
    vite.config.ts
    tsconfig.json
  scripts/
    seed_data.py
    reset_demo_db.py

If a simpler structure is required to make the first run successful, simplify only after documenting the reason in docs/implementation_log.md.

============================================================
4. Core Domain Assumptions
============================================================

Use the following MVP assumptions.

Business scenario:
- Multi-product paint manufacturing line
- Product transition cost depends on previous SKU and next SKU
- The key issue is not one fixed cost, but compound transition cost
- The UI helps an operations manager compare AI recommendation and manual what-if changes

SKU:
- Create 12 SKU master records.
- Each SKU should have:
  - sku_id
  - sku_name
  - color_family
  - color_hex
  - category
  - is_metallic
  - brightness_level
  - viscosity_level

Daily production plan:
- The optimization target must be plan_item_id, not sku_id.
- Create one default plan for demo.
- Default demo plan may show 5 production items for a simple MVP screen.
- Also prepare seed data so it can be expanded to 12 items if needed.

Cost dimensions:
Use 7 cost dimensions in API responses and UI:
- setup_time
- labor_cost
- material_loss
- wash_cost
- downtime
- sequence_risk
- packaging_time

Implementation detail:
- XGBoost predicts 6 numeric transition costs:
  - setup_time
  - labor_cost
  - material_loss
  - wash_cost
  - downtime
  - packaging_time
- Rule engine calculates sequence_risk.
- The final total weighted cost combines all 7 dimensions.

Sequence risk rules:
Keep the MVP rule engine simple.
Implement explicit color-transition rules only:
- black -> white: high risk
- dark -> light: medium/high risk depending on brightness gap
- metallic -> non-metallic: medium/high risk
- similar color family transition: low risk
- same SKU or same color family: low cost/risk

Do not add delivery-date constraints, multi-line constraints, or complex scheduling constraints in the first implementation.

Priority profile:
Do not use free-form numeric sliders first.
Use 5-level priority labels:
- VERY_LOW
- LOW
- NORMAL
- HIGH
- VERY_HIGH

Map them internally to numeric multipliers:
- VERY_LOW: 0.70
- LOW: 0.85
- NORMAL: 1.00
- HIGH: 1.15
- VERY_HIGH: 1.30

The UI may display these as selectable labels.
The backend should receive and return both label and multiplier.

============================================================
5. SQLite Schema
============================================================

Implement the first SQLite schema in backend/app/db/schema.sql.

Minimum P0 tables:
- decisions

Recommended P0/P1 tables:
- plan_context
- weekly_report_cache

The master and training data may remain as CSV for MVP.

decisions table must store:
- decision_id
- plan_id
- recommended_sequence as JSON text
- confirmed_sequence as JSON text
- priority_profile as JSON text
- recommended_cost as JSON text
- confirmed_cost as JSON text
- comparison_state as JSON text
- violation_details as JSON text
- decision_memo as text nullable
- reviewed as boolean/integer default false
- model_version
- rule_version
- created_at

weekly_report_cache can be a simple P1 cache table:
- report_id
- period_start
- period_end
- source_decision_ids as JSON text
- kpi_snapshot as JSON text
- cost_summary as JSON text
- risk_summary as JSON text
- llm_summary as text
- generated_at

============================================================
6. Synthetic Data
============================================================

Create scripts/seed_data.py or backend/app/ml/train_xgboost.py to generate:

CSV/JSON files:
- backend/app/data/raw/sku_master.csv
- backend/app/data/raw/daily_plan.csv
- backend/app/data/raw/transition_history.csv
- backend/app/data/raw/sequence_rules.json

Synthetic data requirements:
- sku_master should contain 12 color SKUs.
- transition_history should contain enough rows to train a simple XGBoost model.
- Include transition examples for all meaningful color patterns:
  - dark -> light
  - light -> dark
  - black -> white
  - white -> black
  - metallic -> normal
  - normal -> metallic
  - same family
  - different family
- Cost values must be deterministic enough for demo behavior.
- Add small controlled noise, but do not make the results random and confusing.
- Use a fixed random seed.

The model does not need high accuracy.
The model must produce plausible and stable cost behavior.

If XGBoost training fails or model file is missing:
- Use a deterministic heuristic fallback.
- The API must still work.

============================================================
7. Backend API Contract
============================================================

Implement these endpoints.

GET /health
Purpose:
- Health check.

GET /plans/{plan_id}
Purpose:
- Load today’s production plan and screen context.

Response:
- plan_id
- plan_items
- operating_context
- default_priority_profile

POST /optimize
Purpose:
- Generate the recommended sequence.
- Called once when the decision page opens.
- Also callable when priority profile changes if implementation remains simple.

Request:
- plan_id
- plan_item_ids
- priority_profile

Response:
- recommended_sequence
- transition_costs
- aggregated_cost
- total_weighted_cost
- sequence_penalty
- objective_score
- risk_warnings
- model_version
- rule_version

POST /predict
Purpose:
- Recalculate cost for the current user-edited sequence.
- Compare current sequence against recommended baseline.

Request:
- plan_id
- recommended_sequence
- current_sequence
- priority_profile

Response:
- current_evaluation
- baseline_evaluation
- comparison_state
- comparison_summary
- applied_weights

POST /validate
Purpose:
- Validate current sequence against rule engine.
- This may internally reuse the same rule engine as /predict.

Request:
- plan_id
- current_sequence

Response:
- violation_count
- warnings

POST /decisions
Purpose:
- Save final confirmed decision to SQLite.
- The backend must recalculate before saving.

Request:
- plan_id
- recommended_sequence
- confirmed_sequence
- priority_profile
- recommended_cost
- confirmed_cost
- comparison_state
- violation_details
- decision_memo

Response:
- decision_id
- committed_at

GET /decisions/{decision_id}
Purpose:
- Load saved final decision.

GET /dashboard
Purpose:
- Return KPI summary from saved decision logs.

Response:
- dashboard_summary
- kpi_trend
- risk_patterns
- recent_decisions
- weekly_summary

POST /explain
Purpose:
- Return explanation text.
- For P1, implement template-based explanation first.
- Do not call a real LLM unless environment variables are already available.

PATCH /decisions/{decision_id}/reviewed
Purpose:
- Mark or unmark a saved decision as reviewed.
- This is P1 and may be implemented after the main P0 flow.

============================================================
8. Frontend Behavior
============================================================

Implement the decision screen first.

Decision page flow:
1. On page load:
   - call GET /plans/{plan_id}
   - call POST /optimize
   - store recommendedSequence
   - initialize currentSequence as recommendedSequence

2. User drags SKU cards:
   - update currentSequence
   - call POST /predict after drop
   - render updated cost and comparison

3. User changes priority profile:
   - call POST /predict for current sequence
   - optionally call POST /optimize again only if recomputing recommendation is simple

4. User clicks a transition pair:
   - set selectedTransition
   - show transition details in the middle/right panel

5. User clicks explanation button:
   - call POST /explain
   - do not automatically regenerate explanation on every drag
   - when sequence or priority changes, mark previous explanation as stale

6. User clicks confirm:
   - call POST /decisions
   - show saved result
   - dashboard should be able to reflect it

Frontend state must include:
- planItems
- recommendedSequence
- currentSequence
- priorityProfile
- currentEvaluation
- baselineEvaluation
- comparisonState
- comparisonSummary
- selectedTransition
- warnings
- savedDecisionId
- isExplanationStale

Dashboard page:
- call GET /dashboard
- show:
  - decision count
  - average total weighted cost or objective score
  - risk transition count
  - recent decisions
  - simple cost trend chart
  - weekly summary text

Do not build authentication.
Do not build multi-user support.
Do not build admin screens.

============================================================
9. OR-tools Optimization
============================================================

Use OR-tools for the P0 optimizer.

The optimizer should:
- Receive plan_item_ids.
- Build pairwise transition costs between all plan items.
- Minimize total weighted adjacent transition cost.
- Return an ordered list of plan_item_ids.

If OR-tools setup is too slow or unavailable:
- Keep the OR-tools implementation file.
- Add a documented fallback brute-force optimizer for small N.
- For demo plan size 5, brute-force fallback is acceptable.
- The public API should not fail.

Important:
OR-tools must be present in the design and code path because it is part of the project proposal.

============================================================
10. XGBoost Cost Predictor
============================================================

Implement a CostPredictor service.

It should:
- Load trained model if available.
- Train model from synthetic transition_history.csv if model is missing.
- Predict 6 numeric cost dimensions.
- Return a CostVector-like object.
- Use heuristic fallback if model cannot load.

Feature examples:
- from_color_family
- to_color_family
- brightness_gap
- from_is_metallic
- to_is_metallic
- package_size_changed
- viscosity_gap
- worker_skill
- equipment_condition
- shift
- day_of_week
- days_since_last_cleaning

Do not over-focus on ML quality.
Focus on stable, explainable behavior for demo.

============================================================
11. Explanation Service
============================================================

Implement explanation_service.py as template-based first.

It should generate Korean explanation strings such as:
- “현재 순서는 추천안보다 세척 비용이 증가했지만 고위험 전환이 줄었습니다.”
- “검정에서 흰색으로 전환되는 구간이 있어 세척 리스크가 높게 감지되었습니다.”
- “세척 비용 우선순위가 높게 설정되어 유사 색상군을 연속 배치하는 방향이 유리합니다.”

Do not hallucinate numbers.
Only use values already present in cost breakdown and comparison state.

============================================================
12. Coding Rules
============================================================

General:
- Prefer readable code over clever code.
- Add docstrings to important services.
- Use explicit names.
- Avoid hidden global state.
- Keep fallback behavior documented.
- Do not silently swallow errors.
- Write clear TODO comments only when necessary.

Backend:
- Use Pydantic schemas for request/response models.
- Separate route handlers from service logic.
- Keep SQLite access in decision_logger.py or db/sqlite.py.
- Use JSON text fields in SQLite for complex objects.

Frontend:
- Keep API types in frontend/src/api/types.ts.
- Avoid over-complicated state libraries.
- useState/useEffect is enough.
- Use dnd-kit only for sequence drag and drop.
- Keep visual styling clean but simple.

Tests:
- Add minimal backend tests if quick:
  - health endpoint
  - predict endpoint
  - decision save/load
  - rule engine high-risk transition
- Do not block MVP progress on large test suites.

============================================================
13. First Task
============================================================

Start by inspecting the current repository.

Then perform the following init work:

1. Create or normalize the monorepo folder structure.
2. Copy source documents into docs/source if they are available.
3. Create or verify docs/roadmap.md using the roadmap specification.
4. Create README.md with:
   - project overview
   - run instructions
   - demo flow
   - P0/P1/P2 scope
5. Create AGENTS.md with:
   - project rules
   - implementation priority
   - fallback policy
   - no-overengineering rule
6. Create docs/api_contract.md.
7. Create docs/db_schema.md.
8. Create docs/data_schema.md.
9. Create docs/demo_flow.md.
10. Create backend FastAPI skeleton.
11. Create SQLite schema file.
12. Create seed data generator.
13. Create basic synthetic CSV/JSON files.
14. Create initial CostPredictor, RuleEngine, Optimizer, DecisionLogger service stubs with working fallback logic.
15. Create frontend Vite React skeleton if frontend does not exist.
16. Implement enough UI to call backend health or show placeholder decision page.
17. Update docs/implementation_log.md with what was created and what remains.

Do not try to complete the entire MVP in one huge change.
However, the initialized repository must be runnable.

============================================================
14. Expected Run Commands
============================================================

Try to make these commands work.

Backend:
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -e .
python ../scripts/seed_data.py
uvicorn app.main:app --reload --port 8000

Frontend:
cd frontend
npm install
npm run dev

If you choose different commands, document them clearly in README.md.

============================================================
15. Definition of Done for This Init Step
============================================================

This init step is complete when:

- Repository structure exists.
- README.md explains how to run the project.
- AGENTS.md tells future Codex sessions how to proceed.
- docs contain roadmap, API contract, DB schema, data schema, and demo flow.
- Backend starts without crashing.
- /health returns OK.
- Synthetic data generation works.
- SQLite schema exists.
- P0 service files exist with fallback-safe behavior.
- Frontend starts or has a clear documented setup.
- docs/implementation_log.md records current status.

After completing the init step, print:
1. Files created/modified
2. How to run backend
3. How to run frontend
4. Current limitations
5. Recommended next task
```

---

## 다음 Codex 후속 프롬프트

초기 세팅이 끝나면 아래 프롬프트로 이어가면 됩니다.

```text
Continue from the initialized SmartFactoryV2 repository.

First read:
- docs/roadmap.md
- docs/implementation_log.md
- docs/api_contract.md
- docs/db_schema.md

Now implement the P0 backend vertical slice.

Goal:
Make GET /plans/{plan_id}, POST /optimize, POST /predict, POST /validate, POST /decisions, and GET /dashboard work with synthetic data and SQLite.

Do not focus on frontend polish yet.
Do not add P2 features.

Use fallback logic whenever XGBoost or OR-tools is unavailable, but keep the XGBoost and OR-tools code paths present and documented.

After implementation, run or describe tests for:
- loading demo plan
- generating recommended sequence
- predicting current sequence cost
- detecting black -> white or metallic -> normal risk
- saving confirmed decision
- reading dashboard summary

Update docs/implementation_log.md.
```

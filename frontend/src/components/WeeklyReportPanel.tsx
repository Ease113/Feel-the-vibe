import { FileText, RotateCcw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { postWeeklyReport, postWeeklySummary } from '../api/client';
import type { GenerationMode, KpiTrendPoint, WeeklyReportPayload } from '../api/types';
import { generationModeLabel } from '../utils/generationModeLabel';
import WeeklyReportModal from './WeeklyReportModal';

interface Props {
  weeklySummary: string | null;
  weeklyReport: WeeklyReportPayload | null;
  kpiTrend: KpiTrendPoint[];
  onRefresh: () => Promise<void>;
}

function fmtPeriod(start: string, end: string) {
  return `${start} ~ ${end}`;
}

const SUMMARY_MODE_STORAGE_KEY = 'ftv-weekly-summary-generation-mode';

function readPersistedSummaryGenerationMode(): GenerationMode | null {
  try {
    const raw = sessionStorage.getItem(SUMMARY_MODE_STORAGE_KEY);
    if (raw === 'gemini' || raw === 'cli' || raw === 'template') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

function persistSummaryGenerationMode(mode: GenerationMode) {
  try {
    sessionStorage.setItem(SUMMARY_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

/**
 * 대시보드 주간 요약·보고서 패널.
 *
 * 상단(주간 요약): 1문장 상태 라벨. localSummary를 우선 표시해 보고서 생성 시
 * llm_summary 덮어쓰기로 인한 오염을 세션 동안 방지한다.
 * 하단(주간 보고서): 리뷰 클로징 산출물. 모달에서 전체 본문 확인.
 * LLM은 명시 버튼(POST /reports/*)에서만 호출하고, 표시는 GET /dashboard cache 기준.
 */
export default function WeeklyReportPanel({
  weeklySummary,
  weeklyReport,
  kpiTrend,
  onRefresh,
}: Props) {
  const [localSummary, setLocalSummary] = useState<string | null>(null);
  const [summaryMode, setSummaryMode] = useState<GenerationMode | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);

  const reloadDashboard = () =>
    onRefresh().catch(() => setError('대시보드를 다시 불러오지 못했습니다.'));

  const handleWeeklySummary = async () => {
    setError(null);
    setLoadingSummary(true);
    try {
      const res = await postWeeklySummary();
      setLocalSummary(res.summary);
      setSummaryMode(res.generation_mode);
      persistSummaryGenerationMode(res.generation_mode);
      await reloadDashboard();
    } catch {
      setError('주간 요약 생성에 실패했습니다.');
    } finally {
      setLoadingSummary(false);
    }
  };

  const handleWeeklyReport = async () => {
    setError(null);
    setLoadingReport(true);
    try {
      await postWeeklyReport();
      await reloadDashboard();
      // localSummary·summaryMode 갱신 없음 — 보고서 summary(3~5문장)가 주간 요약 영역을 덮지 않게 유지
      setReportModalOpen(true);
    } catch {
      setError('주간 보고서 생성에 실패했습니다.');
    } finally {
      setLoadingReport(false);
    }
  };

  // localSummary 우선, 없으면 서버 캐시값 (보고서 생성 후 오염됐을 수 있음)
  const displaySummary = localSummary ?? weeklySummary;
  const summaryGenerationMode: GenerationMode | null =
    summaryMode
    ?? weeklyReport?.generation_mode
    ?? readPersistedSummaryGenerationMode()
    ?? (displaySummary != null ? 'gemini' : null);
  const period = weeklyReport != null
    ? fmtPeriod(weeklyReport.period_start, weeklyReport.period_end)
    : null;
  const busy = loadingSummary || loadingReport;

  return (
    <div className="weekly-card">

      {/* ── 상단: 주간 요약 ── */}
      <div className="weekly-head">
        <div className="weekly-label">주간 요약</div>
        {displaySummary != null && summaryGenerationMode != null && (
          <span
            className="generation-badge"
            title={weeklyReport?.model_version}
          >
            {generationModeLabel(summaryGenerationMode)}
          </span>
        )}
      </div>

      {period != null && <p className="weekly-period">{period} (진행 중 주)</p>}

      {displaySummary != null ? (
        <p className="weekly-summary-text">{displaySummary}</p>
      ) : (
        <p className="weekly-empty">
          아직 생성된 주간 요약이 없습니다. 아래 버튼으로 생성하세요.
        </p>
      )}

      <div className="weekly-actions">
        <button
          type="button"
          className="btn-sm"
          disabled={busy}
          onClick={() => void handleWeeklySummary()}
        >
          <Sparkles size={11} />
          {loadingSummary ? '생성 중…' : displaySummary != null ? '요약 재생성' : '주간 요약 생성'}
        </button>
      </div>

      {/* ── 구분선 ── */}
      <div className="weekly-divider" />

      {/* ── 하단: 주간 보고서 ── */}
      <div className="weekly-report-sec">
        <div className="weekly-head">
          <div className="weekly-label">주간 보고서</div>
          {weeklyReport != null && (
            <span
              className="generation-badge"
              title={weeklyReport.model_version}
            >
              {generationModeLabel(weeklyReport.generation_mode)}
            </span>
          )}
        </div>

        {weeklyReport != null ? (
          <p className="weekly-report-hint">
            주간 보고서가 준비되었습니다.
          </p>
        ) : (
          <p className="weekly-empty">
            보고서를 생성하면 주요 발견·권장 사항을 확인할 수 있습니다.
          </p>
        )}

        <div className="weekly-actions">
          {weeklyReport != null ? (
            <>
              <button
                type="button"
                className="btn-sm"
                disabled={busy}
                onClick={() => setReportModalOpen(true)}
              >
                확인하기
              </button>
              <button
                type="button"
                className="btn-sm btn-sm--ghost"
                disabled={busy}
                onClick={() => void handleWeeklyReport()}
              >
                <RotateCcw size={11} />
                {loadingReport ? '생성 중…' : '재생성'}
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn-sm"
              disabled={busy}
              onClick={() => void handleWeeklyReport()}
            >
              <FileText size={11} />
              {loadingReport ? '생성 중…' : '주간 보고서 생성'}
            </button>
          )}
        </div>
      </div>

      {error != null && <p className="weekly-error">{error}</p>}

      {reportModalOpen && weeklyReport != null && (
        <WeeklyReportModal
          report={weeklyReport}
          weeklySummary={displaySummary}
          kpiTrend={kpiTrend}
          onClose={() => setReportModalOpen(false)}
        />
      )}
    </div>
  );
}

import { Download, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { WeeklyKpiSnapshot, WeeklyReportPayload } from '../api/types';
import { formatLiters, formatMinutes, formatScore, formatWon } from '../utils/costFormat';
import {
  downloadElementAsPdf,
  weeklyReportPdfFilename,
} from '../utils/exportWeeklyReportPdf';
import { generationModeLabel } from '../utils/generationModeLabel';
import { getSequenceRuleCopy } from '../utils/sequenceRuleCopy';

interface Props {
  report: WeeklyReportPayload;
  weeklySummary: string | null;
  onClose: () => void;
}

const COST_DIMS: {
  key: string;
  label: string;
  format: (v: number) => string;
}[] = [
  { key: 'setup_time', label: '셋업시간', format: v => `${formatMinutes(v)}분` },
  { key: 'labor_cost', label: '인건비', format: v => `${formatWon(v)}원` },
  { key: 'material_loss', label: '자재손실', format: v => `${formatLiters(v)}L` },
  { key: 'wash_cost', label: '세척비용', format: v => `${formatWon(v)}원` },
  { key: 'downtime', label: '정지시간', format: v => `${formatMinutes(v)}분` },
  { key: 'packaging_time', label: '패키징시간', format: v => `${formatMinutes(v)}분` },
  { key: 'sequence_risk', label: '순서패널티', format: v => `${formatScore(v)} pt` },
];

function fmtPeriod(start: string, end: string) {
  return `${start} ~ ${end}`;
}

function fmtDatetime(iso: string) {
  try {
    return new Date(iso).toLocaleString('ko-KR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function fmtKpiScore(v: number) {
  return Math.round(v).toLocaleString() + ' pt';
}

function parseKpi(snapshot: Record<string, unknown>): WeeklyKpiSnapshot | null {
  const dc = snapshot.decision_count;
  const avg = snapshot.average_objective_score;
  const hr = snapshot.high_risk_transition_count;
  if (
    typeof dc !== 'number' ||
    typeof avg !== 'number' ||
    typeof hr !== 'number'
  ) {
    return null;
  }
  return {
    decision_count: dc,
    average_objective_score: avg,
    high_risk_transition_count: hr,
  };
}

function numRecord(raw: Record<string, unknown>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
  }
  return out;
}

/**
 * 주간 보고서 전체 본문 — 대시보드 카드 밖 모달로 표시.
 */
export default function WeeklyReportModal({
  report,
  weeklySummary,
  onClose,
}: Props) {
  const exportRef = useRef<HTMLDivElement>(null);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleDownloadPdf = async () => {
    const el = exportRef.current;
    if (el == null) return;
    setExportError(null);
    setExportingPdf(true);
    try {
      await downloadElementAsPdf(
        el,
        weeklyReportPdfFilename(report.period_start, report.period_end),
      );
    } catch {
      setExportError('PDF 저장에 실패했습니다. 다시 시도해 주세요.');
    } finally {
      setExportingPdf(false);
    }
  };

  const overview =
    (report.summary?.trim() || weeklySummary?.trim() || '').trim();
  const findings = report.key_findings?.filter(Boolean) ?? [];
  const recommendations = report.recommendations?.filter(Boolean) ?? [];
  const kpi = parseKpi(report.kpi_snapshot);
  const costs = numRecord(report.cost_summary);
  const risks = Object.entries(numRecord(report.risk_summary)).sort(
    (a, b) => b[1] - a[1],
  );

  return (
    <div className="modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={exportRef}
        className="weekly-report-modal"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="weekly-report-modal-title"
      >
        <header className="weekly-report-modal__hd">
          <div className="weekly-report-modal__hd-main">
            <p className="weekly-report-modal__eyebrow">주간 보고서</p>
            <h2 id="weekly-report-modal-title" className="weekly-report-modal__title">
              {fmtPeriod(report.period_start, report.period_end)}
            </h2>
            <p className="weekly-report-modal__sub">진행 중인 ISO 주 · 월요일부터 기준일까지 집계</p>
          </div>
          <div className="weekly-report-modal__hd-meta">
            <span className="generation-badge" title={report.model_version}>
              {generationModeLabel(report.generation_mode)}
            </span>
            <button
              type="button"
              className="weekly-report-modal__close"
              data-pdf-hide
              onClick={onClose}
              aria-label="닫기"
            >
              <X size={18} />
            </button>
          </div>
        </header>

        <div className="weekly-report-modal__bd">
          {overview ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">개요</h3>
              <p className="weekly-report-modal__overview">{overview}</p>
            </section>
          ) : null}

          {kpi != null ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">주간 KPI</h3>
              <div className="weekly-report-modal__kpi-grid">
                <div className="weekly-report-modal__kpi">
                  <span className="weekly-report-modal__kpi-label">저장된 결정</span>
                  <span className="weekly-report-modal__kpi-val">
                    {kpi.decision_count.toLocaleString()}건
                  </span>
                </div>
                <div className="weekly-report-modal__kpi">
                  <span className="weekly-report-modal__kpi-label">평균 목적 점수</span>
                  <span className="weekly-report-modal__kpi-val">
                    {kpi.decision_count > 0
                      ? fmtKpiScore(kpi.average_objective_score)
                      : '—'}
                  </span>
                </div>
                <div
                  className={`weekly-report-modal__kpi${
                    kpi.high_risk_transition_count > 0
                      ? ' weekly-report-modal__kpi--warn'
                      : ''
                  }`}
                >
                  <span className="weekly-report-modal__kpi-label">고위험 색상 전환</span>
                  <span className="weekly-report-modal__kpi-val">
                    {kpi.high_risk_transition_count.toLocaleString()}건
                  </span>
                </div>
              </div>
            </section>
          ) : null}

          {Object.keys(costs).length > 0 ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">비용 요약 (주간 평균)</h3>
              <dl className="weekly-report-modal__metrics">
                {COST_DIMS.filter(d => costs[d.key] != null).map(d => (
                  <div key={d.key} className="weekly-report-modal__metric">
                    <dt>{d.label}</dt>
                    <dd>{d.format(costs[d.key])}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          {risks.length > 0 ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">리스크 패턴</h3>
              <ul className="weekly-report-modal__risk-list">
                {risks.map(([ruleId, count]) => {
                  const copy = getSequenceRuleCopy(ruleId);
                  return (
                    <li key={ruleId} className="weekly-report-modal__risk-item">
                      <div className="weekly-report-modal__risk-head">
                        <span className="weekly-report-modal__risk-id">{ruleId}</span>
                        <span className="weekly-report-modal__risk-count">{count}건</span>
                      </div>
                      {copy != null ? (
                        <p className="weekly-report-modal__risk-reason">{copy.reason}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {findings.length > 0 ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">주요 발견</h3>
              <ol className="weekly-report-modal__list">
                {findings.map((item, i) => (
                  <li key={`f-${i}`}>{item}</li>
                ))}
              </ol>
            </section>
          ) : null}

          {recommendations.length > 0 ? (
            <section className="weekly-report-modal__sec">
              <h3 className="weekly-report-modal__sec-hd">다음 주 권장</h3>
              <ol className="weekly-report-modal__list weekly-report-modal__list--rec">
                {recommendations.map((item, i) => (
                  <li key={`r-${i}`}>{item}</li>
                ))}
              </ol>
            </section>
          ) : null}
        </div>

        <footer className="weekly-report-modal__ft">
          <p className="weekly-report-modal__meta">
            생성 {fmtDatetime(report.generated_at)}
            {report.prompt_version ? ` · ${report.prompt_version}` : ''}
          </p>
          <div className="weekly-report-modal__ft-actions" data-pdf-hide>
            {exportError != null ? (
              <p className="weekly-report-modal__export-err" role="alert">
                {exportError}
              </p>
            ) : null}
            <button
              type="button"
              className="btn-sm"
              disabled={exportingPdf}
              onClick={() => void handleDownloadPdf()}
            >
              <Download size={12} />
              {exportingPdf ? 'PDF 생성 중…' : 'PDF 저장'}
            </button>
            <button type="button" className="btn-sm" onClick={onClose}>
              닫기
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

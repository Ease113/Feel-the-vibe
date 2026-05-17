interface Props {
  data: Array<Record<string, unknown>>;
}

/**
 * 의사결정 로그의 KPI 트렌드를 차트로 표시하는 컴포넌트 (P1 구현 예정).
 *
 * 현재는 데이터 건수를 텍스트로 표시하는 플레이스홀더다.
 * Recharts 라인차트로 교체될 때까지 레이아웃 자리를 확보한다.
 *
 * @param data - /dashboard API의 kpi_trend 배열.
 */
export default function DashboardCharts({ data }: Props) {
  return (
    <section className="chart-placeholder">
      <strong>Cost Trend</strong>
      <p>{data.length ? `${data.length}개 decision trend point` : '저장된 decision이 없습니다.'}</p>
    </section>
  );
}

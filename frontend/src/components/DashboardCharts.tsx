interface Props {
  data: Array<Record<string, unknown>>;
}

export default function DashboardCharts({ data }: Props) {
  return (
    <section className="chart-placeholder">
      <strong>Cost Trend</strong>
      <p>{data.length ? `${data.length}개 decision trend point` : '저장된 decision이 없습니다.'}</p>
    </section>
  );
}

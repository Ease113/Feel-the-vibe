import { useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Factory } from 'lucide-react';
import { getHealth, getPlan } from '../api/client';
import type { PlanResponse } from '../api/types';
import SequenceWorkspace from '../components/SequenceWorkspace';

/**
 * 생산순서 의사결정 메인 페이지.
 *
 * 마운트 시 /health와 /plans/demo-plan-001을 병렬 호출해 백엔드 상태와 계획 데이터를 로드한다.
 * 백엔드가 오프라인이면 status를 'offline'으로 표시하고 에러 메시지를 렌더링한다.
 */
export default function DecisionPage() {
  const [health, setHealth] = useState<string>('checking');
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    async function load() {
      try {
        const healthResult = await getHealth();
        setHealth(healthResult.status);
        const planResult = await getPlan('demo-plan-001');
        setPlan(planResult);
      } catch (requestError) {
        setHealth('offline');
        setError(requestError instanceof Error ? requestError.message : 'Unknown API error');
      }
    }
    load();
  }, []);

  return (
    <section className="page-grid">
      <aside className="status-panel">
        <div className="status-row">
          {health === 'ok' ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}
          <span>Backend: {health}</span>
        </div>
        <div className="status-row">
          <Factory size={18} />
          <span>{plan?.operating_context.line_id?.toString() ?? 'LINE-01'}</span>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </aside>
      <SequenceWorkspace plan={plan} />
    </section>
  );
}

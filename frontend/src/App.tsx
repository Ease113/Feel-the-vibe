import { useState } from 'react';
import { Activity, BarChart3 } from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import DecisionPage from './pages/DecisionPage';

type Page = 'decision' | 'dashboard';

/**
 * SmartFactoryV2 루트 컴포넌트.
 *
 * 상단 내비게이션 탭으로 Decision 페이지와 Dashboard 페이지를 전환한다.
 * 페이지 상태는 로컬 useState로만 관리해 라우터 의존성을 배제한다.
 */
export default function App() {
  const [page, setPage] = useState<Page>('decision');

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>SmartFactoryV2</h1>
          <p>도료 생산순서 의사결정 MVP</p>
        </div>
        <nav className="tabs" aria-label="primary navigation">
          <button
            className={page === 'decision' ? 'active' : ''}
            onClick={() => setPage('decision')}
            type="button"
          >
            <Activity size={16} />
            Decision
          </button>
          <button
            className={page === 'dashboard' ? 'active' : ''}
            onClick={() => setPage('dashboard')}
            type="button"
          >
            <BarChart3 size={16} />
            Dashboard
          </button>
        </nav>
      </header>
      {page === 'decision' ? <DecisionPage /> : <DashboardPage />}
    </main>
  );
}

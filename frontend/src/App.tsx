import { useState } from 'react';
import { Activity, BarChart3 } from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import DecisionPage from './pages/DecisionPage';

type Page = 'decision' | 'dashboard';

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

import { useState } from 'react';
import {
  AlertTriangle,
  BarChart2,
  Clock,
  LayoutDashboard,
  List,
  Settings,
} from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import DecisionPage from './pages/DecisionPage';

type Page = 'decision' | 'dashboard';

/**
 * SmartFactoryV2 루트 컴포넌트.
 *
 * 좌측 Nav + 우측 page 구조. Nav 항목으로 Decision/Dashboard를 전환한다.
 */
export default function App() {
  const [page, setPage] = useState<Page>('decision');

  return (
    <div className="wf">
      <nav className="nav" aria-label="주 메뉴">
        <div className="nav-logo">
          <div className="nav-logo-mark"><span>SF</span></div>
          <div>
            <div className="nav-logo-title">Smart Factory</div>
            <div className="nav-logo-sub">도료 생산순서</div>
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-lbl">계획 수립</div>
          <button
            type="button"
            className={`nav-item${page === 'decision' ? ' active' : ''}`}
            onClick={() => setPage('decision')}
          >
            <LayoutDashboard size={16} />
            워크벤치
          </button>
          <div className="nav-item nav-item--disabled">
            <List size={16} />
            시퀀스 계획
          </div>
        </div>

        <div className="nav-group">
          <div className="nav-lbl">운영 관리</div>
          <button
            type="button"
            className={`nav-item${page === 'dashboard' ? ' active' : ''}`}
            onClick={() => setPage('dashboard')}
          >
            <BarChart2 size={16} />
            KPI 검토
          </button>
          <div className="nav-item nav-item--disabled">
            <AlertTriangle size={16} />
            위험 패턴
          </div>
          <div className="nav-item nav-item--disabled">
            <Clock size={16} />
            의사결정 로그
          </div>
        </div>

        <div className="nav-group nav-group--bottom">
          <div className="nav-item nav-item--disabled">
            <Settings size={16} />
            설정
          </div>
        </div>
      </nav>

      <main className="page">
        {page === 'decision' ? <DecisionPage /> : <DashboardPage />}
      </main>
    </div>
  );
}

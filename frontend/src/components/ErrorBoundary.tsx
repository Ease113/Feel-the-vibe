import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

/**
 * 렌더 에러를 잡아 흰 화면 대신 오류 UI를 표시합니다.
 * React function component에서는 에러 경계를 구현할 수 없으므로 class component를 사용합니다.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: '' };

  static getDerivedStateFromError(error: unknown): State {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }

  componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100vh',
          gap: 12,
          fontFamily: 'inherit',
          color: '#18181b',
        }}>
          <p style={{ fontSize: 16, fontWeight: 700 }}>화면을 표시하는 중 오류가 발생했습니다.</p>
          <p style={{ fontSize: 12, color: '#71717a', maxWidth: 480, textAlign: 'center' }}>
            {this.state.message}
          </p>
          <button
            type="button"
            style={{ marginTop: 8, padding: '8px 18px', fontSize: 13, cursor: 'pointer' }}
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            다시 시도
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

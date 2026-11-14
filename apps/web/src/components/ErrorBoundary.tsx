import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    const chunkError = /Failed to fetch dynamically imported module|Loading chunk|Importing a module script failed/.test(this.state.error.message);
    return (
      <div className="mx-auto max-w-lg p-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold">화면을 여는 중 문제가 생겼어요</h1>
          <p className="mt-2 text-sm text-ink-soft">
            {chunkError
              ? '앱이 새 버전으로 업데이트되었거나 인터넷 연결이 끊겨 화면 파일을 받지 못했습니다. 새로고침해 주세요. 공부 기록은 이 기기에 안전하게 저장되어 있습니다.'
              : '공부 기록은 이 기기에 안전하게 저장되어 있습니다. 아래 버튼으로 다시 시도하고, 계속되면 설정 → 백업에서 데이터를 내보내 두세요.'}
          </p>
          <pre className="mt-3 max-h-32 overflow-auto rounded bg-lavender-soft p-2 text-xs">{this.state.error.message}</pre>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" onClick={() => location.reload()}>
              새로고침
            </button>
            <button className="btn-ghost" onClick={() => this.setState({ error: null })}>
              다시 시도
            </button>
            <a className="btn-ghost" href="/">
              홈으로
            </a>
          </div>
        </div>
      </div>
    );
  }
}

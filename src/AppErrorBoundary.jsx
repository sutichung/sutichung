import React from 'react';

export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Keep the diagnostic in the browser console without exposing tokens or
    // application state in the public error screen.
    console.error('[ZENTRAX] UI render failure', error, info?.componentStack || '');
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <main role="alert" style={{
        minHeight: '100vh', boxSizing: 'border-box', display: 'grid',
        placeItems: 'center', padding: 24, background: '#080808',
        color: '#f5f1e8', fontFamily: 'system-ui, sans-serif'
      }}>
        <section style={{
          width: 'min(100%, 520px)', padding: 24, border: '1px solid #594728',
          borderRadius: 18, background: '#12100c', boxSizing: 'border-box'
        }}>
          <div style={{ color: '#d6b56d', fontSize: 12, letterSpacing: 2 }}>ZENTRAX</div>
          <h1 style={{ margin: '12px 0 8px', fontSize: 22 }}>頁面載入遇到問題</h1>
          <p style={{ color: '#b8b1a2', lineHeight: 1.7, margin: '0 0 18px' }}>
            系統已攔截頁面錯誤，避免整個畫面變成空白。請重新載入；若問題持續，請回報下方錯誤代碼。
          </p>
          <code style={{
            display: 'block', padding: 12, borderRadius: 8, overflowWrap: 'anywhere',
            background: '#080808', color: '#f2d99a', fontSize: 12
          }}>{String(this.state.error?.message || 'UI_RENDER_ERROR').slice(0, 240)}</code>
          <button type="button" onClick={() => window.location.reload()} style={{
            marginTop: 18, minHeight: 44, width: '100%', border: 0,
            borderRadius: 10, background: '#d6b56d', color: '#080808',
            fontWeight: 700, cursor: 'pointer'
          }}>重新載入網站</button>
        </section>
      </main>
    );
  }
}

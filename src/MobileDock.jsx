import React, { useEffect, useState } from 'react';

const tabs = [
  { href: '#app-top', label: '總覽', icon: 'grid' },
  { href: '#tw-market', label: '台股', icon: 'chart' },
  { href: '#us-market', label: '美股', icon: 'globe' },
  { href: '#crypto-market', label: '幣市', icon: 'coin' },
];

const moreLinks = [
  { href: '#zentrax-prediction', label: 'ZENTRAX 預測市場', detail: 'BTC／ETH／BNB 價格事件與虛擬點數' },
  { href: '#global-finance', label: '全球金融中心', detail: '匯率、資金與跨市場觀察' },
  { href: '#global-intelligence', label: '全球情報中心', detail: '事件、風險與市場攻防' },
  { href: '#strategy-lab', label: '策略實驗室', detail: '策略研究與驗證' },
];

function Icon({ name, active = false }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  return <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" {...common}>
    {name === 'grid' && <><rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/></>}
    {name === 'chart' && <><path d="M3.5 19.5h17"/><path d="M6 16V9m6 7V4m6 12v-5"/><path d="m4.5 7 6-3 6 4 4-3"/></>}
    {name === 'globe' && <><circle cx="12" cy="12" r="9"/><path d="M3.5 12h17M12 3c2.4 2.5 3.5 5.5 3.5 9S14.4 18.5 12 21c-2.4-2.5-3.5-5.5-3.5-9S9.6 5.5 12 3Z"/></>}
    {name === 'coin' && <><circle cx="12" cy="12" r="9"/><path d="M15.5 8.5c-.7-.8-1.8-1.2-3.2-1.2-1.8 0-3 .8-3 2.1 0 3.4 6.4 1.3 6.4 4.5 0 1.4-1.3 2.4-3.3 2.4-1.4 0-2.7-.5-3.6-1.5M12 5.5v13"/></>}
    {name === 'more' && <><circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/></>}
  </svg>;
}

export default function MobileDock() {
  const [active, setActive] = useState('#app-top');
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    const targets = tabs.map(tab => document.querySelector(tab.href)).filter(Boolean);
    if (!targets.length || !('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActive('#' + visible.target.id);
    }, { rootMargin: '-18% 0px -58% 0px', threshold: [0, .15, .35, .6] });
    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const close = event => { if (event.key === 'Escape') setMoreOpen(false); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [moreOpen]);

  const navigate = href => {
    setActive(href);
    setMoreOpen(false);
    const target = document.querySelector(href);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return <>
    <style>{`
      .mobile-market-dock { display:none; }
      @media (max-width:760px) {
        body { padding-bottom:calc(88px + env(safe-area-inset-bottom)); }
        .stock-app { padding-bottom:calc(104px + env(safe-area-inset-bottom))!important; }
        .mobile-market-dock {
          display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:2px;
          position:fixed; z-index:1000; left:10px; right:10px;
          bottom:0; padding:7px 7px calc(7px + env(safe-area-inset-bottom));
          border:1px solid rgba(142,166,201,.2); border-bottom:0;
          border-radius:20px 20px 0 0;
          background:rgba(9,15,27,.94); backdrop-filter:blur(26px) saturate(165%);
          -webkit-backdrop-filter:blur(26px) saturate(165%);
          box-shadow:0 -10px 34px rgba(0,0,0,.3), inset 0 1px rgba(255,255,255,.055);
        }
        .mobile-market-dock button {
          position:relative; min-width:0; min-height:57px; padding:5px 2px 4px!important;
          display:flex; flex-direction:column; justify-content:center; align-items:center;
          gap:4px; border:0!important; border-radius:13px!important;
          background:transparent!important; color:#8292aa!important;
          font-size:10px!important; font-weight:650!important; line-height:1.1;
          letter-spacing:.01em; cursor:pointer; touch-action:manipulation;
          -webkit-tap-highlight-color:transparent;
        }
        .mobile-market-dock button[aria-current="page"] {
          color:#8fc2ff!important; background:linear-gradient(180deg,rgba(55,119,202,.2),rgba(55,119,202,.07))!important;
        }
        .mobile-market-dock button[aria-current="page"]::before {
          content:""; position:absolute; top:0; left:50%; transform:translateX(-50%);
          width:19px; height:2px; border-radius:0 0 3px 3px; background:#75b6ff;
          box-shadow:0 0 10px rgba(117,182,255,.55);
        }
        .mobile-market-dock button:active { transform:scale(.94); }
        .mobile-market-dock .dock-label { white-space:nowrap; }
        .mobile-more-scrim {
          position:fixed; inset:0; z-index:999; background:rgba(2,6,14,.55);
          backdrop-filter:blur(3px); -webkit-backdrop-filter:blur(3px);
        }
        .mobile-more-sheet {
          position:fixed; z-index:1001; left:10px; right:10px;
          bottom:calc(82px + env(safe-area-inset-bottom)); padding:17px;
          border:1px solid rgba(142,166,201,.22); border-radius:20px;
          background:linear-gradient(155deg,#18253a,#0c1423);
          box-shadow:0 22px 70px rgba(0,0,0,.48);
          animation:mobile-sheet-in .2s ease-out both;
        }
        .mobile-more-sheet h3 { margin:0 0 12px; color:#e8f0fc; font-size:14px; }
        .mobile-more-sheet button {
          display:flex; width:100%; min-height:56px; align-items:center; justify-content:space-between;
          padding:10px 12px!important; margin-top:7px; border:1px solid rgba(148,163,184,.12)!important;
          border-radius:13px!important; background:rgba(255,255,255,.035)!important;
          color:#e5edf9!important; text-align:left;
        }
        .mobile-more-sheet button small { display:block; margin-top:4px; color:#8fa1ba; font-size:10px; }
        .mobile-more-sheet .more-arrow { color:#7fb9ff; font-size:18px; }
      }
      @keyframes mobile-sheet-in { from { opacity:0; transform:translateY(9px) } to { opacity:1; transform:translateY(0) } }
      @media (prefers-reduced-motion:reduce) { .mobile-market-dock *, .mobile-more-sheet { transition:none!important; animation:none!important; } }
    `}</style>
    {moreOpen && <><div className="mobile-more-scrim" onClick={() => setMoreOpen(false)} /><section className="mobile-more-sheet" role="dialog" aria-modal="true" aria-label="更多市場工具">
      <h3>更多市場工具</h3>
      {moreLinks.map(link => <button key={link.href} onClick={() => navigate(link.href)}>
        <span>{link.label}<small>{link.detail}</small></span><span className="more-arrow">›</span>
      </button>)}
    </section></>}
    <nav className="mobile-market-dock" aria-label="主要市場導覽">
      {tabs.map(tab => <button key={tab.href} type="button" aria-current={active === tab.href ? 'page' : undefined} onClick={() => navigate(tab.href)}>
        <Icon name={tab.icon} active={active === tab.href}/><span className="dock-label">{tab.label}</span>
      </button>)}
      <button type="button" aria-expanded={moreOpen} aria-haspopup="dialog" aria-current={moreOpen ? 'page' : undefined} onClick={() => setMoreOpen(value => !value)}>
        <Icon name="more"/><span className="dock-label">更多</span>
      </button>
    </nav>
  </>;
}

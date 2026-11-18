import React from 'react';

const items = [
  { href: '#tw-market', icon: '🇹🇼', label: '台股' },
  { href: '#us-market', icon: '🇺🇸', label: '美股' },
  { href: '#crypto-market', icon: '₿', label: '幣市' },
  { href: '#global-intelligence', icon: '🛡️', label: '情報' },
  { href: '#strategy-lab', icon: '🧪', label: '策略' },
];

export default function MobileDock() {
  return <>
    <style>{`
      .mobile-market-dock { display:none; }
      @media (max-width:760px) {
        .stock-app { padding-bottom: calc(88px + env(safe-area-inset-bottom)) !important; }
        .stock-app .market-zone-nav { display:none !important; }
        .stock-app > header { position:relative; padding:10px 2px 12px !important; margin-bottom:10px !important; }
        .stock-app > header > div:first-child > div { font-size:10px !important; line-height:1.5; }
        .stock-app > header > div:last-child { display:flex; align-items:center; justify-content:space-between; gap:8px; }
        .mobile-market-dock {
          display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:3px;
          position:fixed; z-index:1000; left:10px; right:10px;
          bottom:calc(8px + env(safe-area-inset-bottom));
          padding:7px 6px calc(7px + env(safe-area-inset-bottom));
          border:1px solid rgba(100,140,190,.28); border-radius:18px;
          background:rgba(9,16,29,.92); backdrop-filter:blur(22px);
          box-shadow:0 10px 35px rgba(0,0,0,.42);
        }
        .mobile-market-dock a {
          min-width:0; min-height:48px; display:flex; flex-direction:column;
          justify-content:center; align-items:center; gap:3px; border-radius:12px;
          color:#aabbd1; text-decoration:none; font-size:10px; font-weight:700;
          -webkit-tap-highlight-color:transparent;
        }
        .mobile-market-dock a:active { background:rgba(96,165,250,.18); color:#dbeafe; }
        .mobile-market-dock .dock-icon { font-size:17px; line-height:1.1; }
      }
      @media (prefers-reduced-motion:reduce) { .mobile-market-dock * { transition:none !important; } }
    `}</style>
    <nav className="mobile-market-dock" aria-label="手機版主要導覽">
      {items.map(item => <a key={item.href} href={item.href}>
        <span className="dock-icon" aria-hidden="true">{item.icon}</span>
        <span>{item.label}</span>
      </a>)}
    </nav>
  </>;
}

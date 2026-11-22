import React, { useCallback, useEffect, useState } from 'react';
import { BrowserProvider, Contract, formatUnits, parseUnits } from 'ethers';

const ERC20_ABI = [
  'function allowance(address owner,address spender) view returns (uint256)',
  'function approve(address spender,uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)'
];
const SALE_ABI = ['function buy(uint256 grossUsdt,uint256 minAntOut,uint256 deadline) returns (uint256 antOut)'];
const token = () => localStorage.getItem('ts_access_token') || '';
async function api(path, body) {
  const headers = { Accept: 'application/json' };
  if (token()) headers.Authorization = 'Bearer ' + token();
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || ('HTTP ' + response.status));
  return data;
}
const card = { background:'linear-gradient(145deg,#17140f,#0d0c0a)', border:'1px solid rgba(214,181,109,.35)', borderRadius:16, padding:16, color:'#f5f1e8', minWidth:0 };
const button = { border:'1px solid #8d7442', borderRadius:10, background:'#8d7442', color:'#fff', padding:'11px 14px', fontWeight:800, cursor:'pointer', minHeight:44 };
const muted = { color:'#b8b1a2', fontSize:12, lineHeight:1.7 };
const input = { width:'100%', boxSizing:'border-box', background:'#080808', color:'#fff', border:'1px solid #594728', borderRadius:9, padding:12, fontSize:16, minHeight:46 };
function display(raw, decimals, digits=6) {
  try { return Number(formatUnits(BigInt(raw || '0'), decimals)).toLocaleString('en-US',{maximumFractionDigits:digits}); } catch (_) { return '—'; }
}
export default function AntPayments() {
  const [status,setStatus] = useState(null), [wallet,setWallet] = useState(''), [verified,setVerified] = useState(false);
  const [amount,setAmount] = useState('10'), [quote,setQuote] = useState(null), [order,setOrder] = useState(null);
  const [busy,setBusy] = useState(false), [message,setMessage] = useState(''), [error,setError] = useState('');
  const [finance,setFinance] = useState(null), [financeError,setFinanceError] = useState('');
  const [history,setHistory] = useState([]);
  const [projectedSales,setProjectedSales] = useState('100000');
  const projectionValue = Number(projectedSales);
  const projection = Number.isFinite(projectionValue) ? Math.max(0, projectionValue) : 0;
  const projectedFee = projection * 0.05;
  const projectedCreator = projectedFee * 0.60;
  const decimals = Number(status?.usdtDecimals ?? 18);
  const refreshStatus = useCallback(async()=>{try{setStatus(await api('/api/ant/status'));}catch(e){setError(e.message);}},[]);
  useEffect(()=>{refreshStatus();},[refreshStatus]);
  const refreshHistory = useCallback(async()=>{try{const result=await api('/api/ant/orders');setHistory(result.orders||[]);}catch(_){setHistory([]);}},[]);
  useEffect(()=>{refreshHistory();},[refreshHistory]);
  const connect = async () => {
    setBusy(true);setError('');setMessage('');
    try {
      if (!window.ethereum) throw new Error('請先安裝支援 BNB Chain 的錢包，例如 MetaMask 或 Trust Wallet');
      const provider = new BrowserProvider(window.ethereum);
      await provider.send('eth_requestAccounts',[]);
      let network = await provider.getNetwork();
      if (Number(network.chainId) !== 97) {
        try { await provider.send('wallet_switchEthereumChain',[{chainId:'0x61'}]); }
        catch (switchError) {
          if (switchError.code !== 4902) throw switchError;
          await provider.send('wallet_addEthereumChain',[{chainId:'0x61',chainName:'BNB Smart Chain Testnet',nativeCurrency:{name:'tBNB',symbol:'tBNB',decimals:18},rpcUrls:['https://bsc-testnet-dataseed.bnbchain.org'],blockExplorerUrls:['https://testnet.bscscan.com']}]);
        }
      }
      const signer = await provider.getSigner(), address = await signer.getAddress();
      const challenge = await api('/api/ant/wallet/nonce',{wallet:address,chainId:97});
      const signature = await signer.signMessage(challenge.message);
      await api('/api/ant/wallet/verify',{wallet:address,nonce:challenge.nonce,signature});
      setWallet(address);setVerified(true);setMessage('錢包已驗證並綁定會員帳號。');
    } catch(e) { setError(e.message);setVerified(false); }
    finally { setBusy(false); }
  };
  const makeQuote = async () => {
    setBusy(true);setError('');setQuote(null);setOrder(null);
    try {
      if (!verified || !wallet) throw new Error('請先連接並驗證錢包');
      if (!/^\d+(?:\.\d{1,18})?$/.test(amount) || Number(amount) <= 0) throw new Error('請輸入有效的 USDT 金額');
      const gross = parseUnits(amount,decimals);
      const result = await api('/api/ant/orders',{wallet,grossUsdtRaw:gross.toString()});
      setQuote(result);setOrder({id:result.orderId,status:'created'});setMessage('報價已建立，請在 5 分鐘內完成錢包交易。');refreshHistory();
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  };
  const buy = async () => {
    setBusy(true);setError('');setMessage('');
    try {
      if (!quote || !order) throw new Error('請先取得有效報價');
      const provider = new BrowserProvider(window.ethereum), signer = await provider.getSigner();
      const owner = await signer.getAddress();
      if (owner.toLowerCase() !== wallet.toLowerCase()) throw new Error('目前錢包與已驗證錢包不同，請重新連接');
      const usdt = new Contract(quote.usdtContract,ERC20_ABI,signer);
      const allowance = await usdt.allowance(owner,quote.saleContract);
      if (allowance < BigInt(quote.approvalAmountRaw)) {
        setMessage('請在錢包確認精確額度的 USDT 授權…');
        const approval = await usdt.approve(quote.saleContract,quote.approvalAmountRaw);
        await approval.wait();
      }
      setMessage('請在錢包確認 ANT 購買交易…');
      const sale = new Contract(quote.saleContract,SALE_ABI,signer);
      const tx = await sale.buy(quote.grossUsdtRaw,quote.minAntRaw,quote.deadline);
      setOrder({...order,status:'submitted',txHash:tx.hash});
      await api('/api/ant/orders/'+order.id+'/submit',{txHash:tx.hash});refreshHistory();
      setMessage('交易已送出；等待雙 RPC 鏈上監控與 12 個區塊確認。');
      await tx.wait(1);
    } catch(e) { setError(e.shortMessage || e.message); }
    finally { setBusy(false); }
  };
  useEffect(()=>{
    if (!order?.id || !order?.txHash) return;
    let live=true;
    const poll=async()=>{try{const next=await api('/api/ant/orders/'+order.id);if(live){setOrder(current=>({...current,...next}));if(next.status==='delivered'){setMessage('鏈上交易已確認，ANT 已由銷售合約原子交付。');refreshHistory();}}}catch(e){if(live)setError(e.message);}};
    poll();const timer=setInterval(poll,10000);
    return()=>{live=false;clearInterval(timer);};
  },[order?.id,order?.txHash]);
  const loadFinance = async()=>{setFinanceError('');try{setFinance(await api('/api/ant/admin/finance'));}catch(e){setFinanceError(e.message);}};
  return <section id="ant-payments" aria-label="ANT Testnet payment gateway" style={{...card,margin:'12px 0',scrollMarginTop:80}}>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) minmax(150px,220px)',gap:16,alignItems:'center',background:'radial-gradient(circle at 78% 45%,rgba(214,181,109,.16),transparent 52%),linear-gradient(135deg,#17140f,#090807)',border:'1px solid rgba(214,181,109,.32)',borderRadius:14,padding:14,marginBottom:16}}>
      <div><div style={{fontSize:11,letterSpacing:'.2em',color:'#D6B56D',fontWeight:900}}>THE CREATOR TOKEN</div><div style={{fontSize:28,fontWeight:1000,letterSpacing:'.08em',marginTop:5}}>ZENTRAX <span style={{color:'#D6B56D'}}>ANT</span></div><div style={{...muted,marginTop:6}}>黑金螞蟻幣｜固定初始供應量 200,000 ANT｜BSC Testnet 預覽</div><div style={{...muted,marginTop:8}}>視覺識別已整合；目前是測試網開發版本，並非主網上市或公開市場報價。</div></div>
      <img src="/zentrax-ant-coin.svg" alt="ZENTRAX ANT 黑金代幣圖樣" loading="lazy" style={{width:'100%',maxWidth:190,justifySelf:'center',filter:'drop-shadow(0 8px 20px rgba(214,181,109,.22))'}}/>
    </div>
    <div style={{display:'flex',justifyContent:'space-between',gap:12,alignItems:'center',flexWrap:'wrap'}}>
      <div><div style={{fontSize:19,fontWeight:950,letterSpacing:'.04em',color:'#D6B56D'}}>ZENTRAX · ANT GATEWAY</div><div style={{...muted,marginTop:4}}>BSC Testnet｜固定 5% 佣金｜鏈上驗證交付｜不接收助記詞或私鑰</div></div>
      <span style={{fontSize:11,color:status?.saleConfigured?'#34d399':'#fbbf24'}}>{status?.saleConfigured?'合約設定已填入':'尚未設定測試網合約'}</span>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:8,marginTop:14}}>
      {[['網路','BSC Testnet'],['Chain ID','97'],['佣金','5%']].map(([k,v])=><div key={k} style={{background:'#1b1710',borderRadius:9,padding:10}}><div style={{...muted,fontSize:10}}>{k}</div><b style={{fontSize:15}}>{v}</b></div>)}
    </div>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginTop:14}}>
      <button style={button} disabled={busy} onClick={connect}>{busy?'處理中…':verified?'錢包已驗證':'連接並驗證錢包'}</button>
      {wallet&&<span style={{...muted,overflowWrap:'anywhere'}}>{wallet}</span>}
    </div>
    <div style={{display:'grid',gridTemplateColumns:'minmax(0,1fr) auto',gap:9,alignItems:'end',marginTop:14}}>
      <label style={{fontSize:12,color:'#b8b1a2'}}>購買金額（USDT）
        <input style={{...input,display:'block',marginTop:6}} inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="10.00"/>
      </label>
      <button style={button} disabled={busy||!verified||!status?.saleConfigured} onClick={makeQuote}>取得鏈上報價</button>
    </div>
    {status?.saleConfigured&&<div style={{...muted,marginTop:8}}>銷售狀態：{status.saleActive?'開放期間':'非開放期間'}｜單錢包上限 {display(status.maxWalletGrossUsdtRaw,decimals)} USDT｜總額上限 {display(status.maxGrossUsdtRaw,decimals)} USDT</div>}
    {quote&&<div style={{marginTop:12,padding:12,background:'#1b1710',border:'1px solid #594728',borderRadius:10}}>
      <b style={{color:'#D6B56D'}}>報價明細（有效 5 分鐘）</b>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:8,fontSize:12}}>
        <div>付款總額：{display(quote.grossUsdtRaw,decimals)} USDT</div>
        <div>平台佣金 5%：{display(quote.feeUsdtRaw,decimals)} USDT</div>
        <div>金庫淨額（95%）：{display(quote.netUsdtRaw,decimals)} USDT</div>
        <div>預估 ANT：{display(quote.quotedAntRaw,18)} ANT</div>
      </div>
      <div style={{...muted,marginTop:8}}>95% 淨額匯入金庫；創作者分配另依 5% 平台費的分配政策核算，不是直接從此淨額支付。創作者款項目前僅有測試／帳務草稿流程，尚未執行實際付款。實際 ANT 數量依交易執行時的鏈上預言機價格計算，並受最低交付量與鏈上報價期限保護。</div>
      <button style={{...button,width:'100%',marginTop:12}} disabled={busy} onClick={buy}>授權 USDT 並購買 ANT</button>
    </div>}
    {order&&<div style={{marginTop:12,padding:12,background:'#101a15',border:'1px solid #28543d',borderRadius:10,fontSize:12}}>
      <b>訂單狀態：{order.status}</b>
      {order.txHash&&<div style={{marginTop:6,overflowWrap:'anywhere'}}>交易：<a style={{color:'#86efac'}} href={'https://testnet.bscscan.com/tx/'+order.txHash} target="_blank" rel="noreferrer">{order.txHash}</a></div>}
      {order.confirmations!==undefined&&<div>確認數：{order.confirmations}</div>}
    </div>}
    {message&&<div role="status" style={{...muted,marginTop:10,color:'#a7f3d0'}}>{message}</div>}
    {error&&<div role="alert" style={{marginTop:10,color:'#fda4af',fontSize:12}}>{error}</div>}
    {history.length>0&&<div style={{marginTop:14,borderTop:'1px solid #594728',paddingTop:12}}>
      <b style={{color:'#D6B56D',fontSize:13}}>我的 ANT 訂單紀錄</b>
      <div style={{display:'grid',gap:7,marginTop:8}}>
        {history.slice(0,10).map(item=><div key={item.id} style={{background:'#1b1710',borderRadius:8,padding:10,fontSize:12,display:'grid',gridTemplateColumns:'1fr auto',gap:8}}>
          <div><b>{display(item.gross_usdt_raw,decimals)} USDT</b><div style={muted}>{new Date(item.created_at).toLocaleString()}</div>
            {item.tx_hash&&<a style={{color:'#86efac',overflowWrap:'anywhere'}} href={'https://testnet.bscscan.com/tx/'+item.tx_hash} target="_blank" rel="noreferrer">{item.tx_hash.slice(0,12)}…{item.tx_hash.slice(-8)}</a>}
          </div><div style={{textAlign:'right'}}><b>{item.status}</b><div style={muted}>{item.confirmations||0} confirmations</div></div>
        </div>)}
      </div>
    </div>}
    <div style={{marginTop:14,borderTop:'1px solid #594728',paddingTop:12}}>
      <button style={{...button,background:'#282116'}} onClick={loadFinance}>管理員財務報表</button>
      {financeError&&<div style={{...muted,color:'#fda4af',marginTop:8}}>{financeError}</div>}
      {finance&&<div style={{marginTop:10,display:'grid',gap:7}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,minmax(0,1fr))',gap:7}}>
          <div style={{background:'#1b1710',padding:9,borderRadius:8}}><small>累計總額</small><b style={{display:'block'}}>{display(finance.totals.grossUsdtRaw,decimals)} USDT</b></div>
          <div style={{background:'#1b1710',padding:9,borderRadius:8}}><small>5% 佣金</small><b style={{display:'block'}}>{display(finance.totals.feeUsdtRaw,decimals)} USDT</b></div>
          <div style={{background:'#1b1710',padding:9,borderRadius:8}}><small>淨額</small><b style={{display:'block'}}>{display(finance.totals.netUsdtRaw,decimals)} USDT</b></div>
        </div>
        <div style={muted}>最近訂單 {finance.orders.length} 筆；帳本紀錄 {finance.ledger.length} 筆。所有金額均以測試網原始單位記錄。</div>
      </div>}
    </div>
    <div style={{marginTop:14,padding:12,background:'#17140f',border:'1px solid rgba(214,181,109,.28)',borderRadius:10}}>
      <b style={{color:'#D6B56D',fontSize:13}}>創作者收益試算（非實際收入）</b>
      <label style={{display:'block',fontSize:12,color:'#b8b1a2',marginTop:9}}>假設累計銷售額（USDT）
        <input aria-label="假設累計銷售額 USDT" type="number" min="0" step="any" style={{...input,display:'block',marginTop:6}} inputMode="decimal" value={projectedSales} onChange={e=>setProjectedSales(e.target.value)} placeholder="100000"/>
      </label>
      <div style={{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:8,marginTop:10}}>
        <div style={{background:'#1b1710',padding:10,borderRadius:8}}><small>假設 5% 平台費</small><b style={{display:'block',color:'#D6B56D'}}>{projectedFee.toLocaleString('en-US',{maximumFractionDigits:2})} USDT</b></div>
        <div style={{background:'#1b1710',padding:10,borderRadius:8}}><small>創作者分配 60%（稅費前試算）</small><b style={{display:'block',color:'#D6B56D'}}>{projectedCreator.toLocaleString('en-US',{maximumFractionDigits:2})} USDT</b></div>
        <div style={{background:'#1b1710',padding:10,borderRadius:8}}><small>產品營運 25%</small><b style={{display:'block'}}>{(projectedFee*0.25).toLocaleString('en-US',{maximumFractionDigits:2})} USDT</b></div>
        <div style={{background:'#1b1710',padding:10,borderRadius:8}}><small>安全法遵 10%＋預備金 5%</small><b style={{display:'block'}}>{(projectedFee*0.15).toLocaleString('en-US',{maximumFractionDigits:2})} USDT</b></div>
      </div>
      <div style={{...muted,marginTop:8}}>依目前 5% 費率及提案 60/25/10/5 分配計算。不是報酬承諾或實際收入；創作者分配為稅務、退款及法定準備金前的示意值；分配政策尚未由多簽金庫執行。</div>
    </div>
    <div style={{marginTop:14,padding:12,background:'#17140f',border:'1px solid rgba(214,181,109,.28)',borderRadius:10}}>
      <b style={{color:'#D6B56D',fontSize:13}}>創作者權益與反砸盤規則</b>
      <div style={{...muted,marginTop:7}}>ANT 固定初始供應 200,000 枚，部署時全數鑄造至初始持有人；創作者應使用自己控制的安全錢包作為初始持有人，並公開鏈上持倉與資金流。</div>
      <ul style={{...muted,paddingLeft:18,margin:'7px 0 0'}}>
        <li>創作者可透過公開治理／多簽管理平台參數與金庫，不可暗中改寫持幣者餘額。</li>
        <li>大額轉帳與集中賣壓只做即時告警、公開揭露及風險提示。</li>
        <li>不設秘密黑名單、任意凍結、沒收代幣或針對個別交易者的報復功能。</li>
        <li>若要設交易冷卻或熔斷，必須事前公開規則、適用所有人並經獨立審查；目前合約沒有這些限制。</li>
      </ul>
    </div>
    <div style={{...muted,marginTop:12}}>測試網功能。正式收款仍須完成獨立合約審計、TWAP 預言機、法遵審查及主網重新部署；目前不會收取真實 USDT。</div>
  </section>;
}

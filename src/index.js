import React,{useEffect} from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import AuthGate from './AuthGate.jsx';

// Classify the current browsing layout from the live viewport, not a one-time
// user-agent guess. Re-evaluate on resize, rotation, and pointer changes.
function DeviceProfile({children}){
  useEffect(()=>{
    const phone=window.matchMedia('(max-width: 760px)');
    const tablet=window.matchMedia('(min-width: 761px) and (max-width: 1024px)');
    const coarse=window.matchMedia('(pointer: coarse)');
    const update=()=>{
      const width=window.innerWidth||document.documentElement.clientWidth||0;
      const kind=phone.matches?'phone':tablet.matches?'tablet':'desktop';
      document.documentElement.dataset.device=kind;
      document.documentElement.dataset.input=coarse.matches?'touch':'pointer';
      document.documentElement.dataset.layout=width<=760?'compact':width<=1024?'medium':'wide';
    };
    update();
    const queries=[phone,tablet,coarse];
    queries.forEach(q=>q.addEventListener?.('change',update));
    window.addEventListener('resize',update,{passive:true});
    window.addEventListener('orientationchange',update,{passive:true});
    return()=>{
      queries.forEach(q=>q.removeEventListener?.('change',update));
      window.removeEventListener('resize',update);
      window.removeEventListener('orientationchange',update);
    };
  },[]);
  return children;
}
const root=ReactDOM.createRoot(document.getElementById('root'));
root.render(<DeviceProfile><AuthGate><App/></AuthGate></DeviceProfile>);

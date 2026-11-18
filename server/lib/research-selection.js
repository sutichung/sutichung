'use strict';

function buildResearchLists(rows, limit=30) {
  const usable=(Array.isArray(rows)?rows:[]).filter(x=>
    x && x.scorecard && x.scorecard.status==='research-ready' &&
    typeof x.scorecard.score==='number' && Number.isFinite(x.scorecard.score)
  );
  const bullish=usable.filter(x=>x.scorecard.direction==='偏向買進')
    .sort((a,b)=>Number(b.scorecard.score)-Number(a.scorecard.score));
  const bearish=usable.filter(x=>x.scorecard.direction==='偏向賣出／避險')
    .sort((a,b)=>Number(a.scorecard.score)-Number(b.scorecard.score));
  const neutral=usable.filter(x=>x.scorecard.direction==='中性觀望'||x.scorecard.direction==='觀望');
  return {
    topBullish:bullish.slice(0,limit),
    topBearish:bearish.slice(0,limit),
    neutralCount:neutral.length,
    researchReadyCount:usable.length,
    bullishCount:bullish.length,
    bearishCount:bearish.length
  };
}

module.exports={buildResearchLists};

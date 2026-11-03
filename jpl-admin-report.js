'use strict';
// Read-only JPL operator report. Routes MUST enforce requireAdmin before invoking.
function report(db, options={}) {
  const rawSeason=db.prepare('SELECT value FROM game_state WHERE key=?').get('jpl:v1:current');
  let currentSeason='S1';
  try { if(rawSeason)currentSeason=String(JSON.parse(rawSeason.value).id||currentSeason); } catch {}
  const seasonArg=String(options.season||'current');
  const season=seasonArg==='current'?currentSeason:seasonArg;
  if(season!=='all'&&!/^S[0-9]{1,6}$/.test(season))throw Error('시즌 선택이 올바르지 않습니다.');
  const state=String(options.status||'ALL').toUpperCase();
  if(!['ALL','OPEN','WIN','LOSE','FORFEITED'].includes(state))throw Error('베팅 상태가 올바르지 않습니다.');
  const userTerm=String(options.user||'').trim().toLocaleLowerCase('ko-KR').slice(0,40);
  const page=Math.min(10000,Math.max(1,parseInt(options.page,10)||1));
  const limit=30;
  const users=new Map(db.prepare('SELECT id,username,nickname FROM users').all()
    .map(u=>[Number(u.id),{username:String(u.username||''),nickname:String(u.nickname||u.username||'회원')}]));
  const rows=db.prepare('SELECT value FROM game_state WHERE key LIKE ?').all('jpl:v1:ticket:%');
  const seasons=new Set([currentSeason]);
  const tickets=[];
  for(const row of rows){
    let t;
    try { t=JSON.parse(row.value); } catch {continue}
    if(!t||!Array.isArray(t.legs)||!t.legs.length)continue;
    const seasonId=String(t.seasonId||'');
    if(/^S[0-9]{1,6}$/.test(seasonId))seasons.add(seasonId);
    if(season!=='all'&&seasonId!==season)continue;
    if(state!=='ALL'&&String(t.status)!==state)continue;
    const owner=users.get(Number(t.userId))||{username:'',nickname:'탈퇴한 회원 #'+String(t.userId)};
    if(userTerm&&!(owner.nickname.toLocaleLowerCase('ko-KR').includes(userTerm)||owner.username.toLocaleLowerCase('ko-KR').includes(userTerm)))continue;
    tickets.push({
      id:String(t.id||''),seasonId,userId:Number(t.userId),nickname:owner.nickname,username:owner.username,
      receiptNumber:String(t.receiptNumber||''),placedAt:Number(t.placedAt)||0,
      status:String(t.status||'OPEN'),stake:String(t.stake||'0'),totalOdds:String(t.totalOdds||'0'),
      potential:String(t.potential||'0'),expectedNet:String(t.expectedNet||t.potential||'0'),
      paid:String(t.paid||'0'),tax:String(t.tax||'0'),settledAt:Number(t.settledAt)||0,
      legs:t.legs.map(l=>({matchId:String(l.matchId||''),home:String(l.home||''),away:String(l.away||''),
        kickoff:Number(l.kickoff)||0,market:l.market==='HDP'?'HDP':'NORMAL',line:Number(l.line)||0,
        pick:['H','D','A'].includes(l.pick)?l.pick:'?',odds100:Number(l.odds100)||0}))
    });
  }
  tickets.sort((a,b)=>b.placedAt-a.placedAt||b.userId-a.userId);
  const metrics={tickets:tickets.length,open:0,win:0,lose:0,forfeited:0,bettors:new Set(),
    staked:0n,paid:0n,expected:0n,tax:0n};
  const matches=new Map();
  for(const t of tickets){
    metrics.bettors.add(t.userId);
    if(t.status==='OPEN')metrics.open++;
    if(t.status==='WIN')metrics.win++;
    if(t.status==='LOSE')metrics.lose++;
    if(t.status==='FORFEITED')metrics.forfeited++;
    const stake=BigInt(t.stake);
    metrics.staked+=stake;
    metrics.paid+=BigInt(t.paid);
    metrics.tax+=BigInt(t.tax);
    if(t.status==='OPEN')metrics.expected+=BigInt(t.expectedNet);
    for(const leg of t.legs){
      const key=t.seasonId+':'+leg.matchId+':'+leg.market;
      if(!matches.has(key))matches.set(key,{
        seasonId:t.seasonId,matchId:leg.matchId,home:leg.home,away:leg.away,
        kickoff:leg.kickoff,market:leg.market,line:leg.line,tickets:0,
        picks:{H:{count:0,stake:0n},D:{count:0,stake:0n},A:{count:0,stake:0n}}
      });
      const m=matches.get(key);
      m.tickets++;
      if(m.picks[leg.pick]){m.picks[leg.pick].count++;m.picks[leg.pick].stake+=stake}
    }
  }
  const summary={tickets:metrics.tickets,open:metrics.open,win:metrics.win,lose:metrics.lose,
    forfeited:metrics.forfeited,bettors:metrics.bettors.size,
    staked:String(metrics.staked),paid:String(metrics.paid),expected:String(metrics.expected),tax:String(metrics.tax)};
  const matchItems=[...matches.values()].sort((a,b)=>b.kickoff-a.kickoff).slice(0,100).map(m=>({
    ...m,picks:Object.fromEntries(Object.entries(m.picks).map(([pick,v])=>[pick,{count:v.count,stake:String(v.stake)}]))
  }));
  const total=tickets.length,pages=Math.max(1,Math.ceil(total/limit)),safePage=Math.min(page,pages);
  return {ok:true,currentSeason,filters:{season,status:state,user:userTerm},
    seasons:[...seasons].sort((a,b)=>Number(b.slice(1))-Number(a.slice(1))),
    summary,matches:matchItems,
    tickets:tickets.slice((safePage-1)*limit,safePage*limit),
    pagination:{page:safePage,pages,total,limit},
    // On multi-leg tickets a stake appears in each fixture's exposure; unique money is summary.staked.
    exposureNote:'경기별 선택금액은 조합 티켓의 판돈을 각 경기마다 포함한 노출액이며 실제 총 베팅금과 합산 기준이 다릅니다.'};
}
module.exports={report};

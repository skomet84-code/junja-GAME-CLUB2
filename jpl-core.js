'use strict';
// JUNJA PREMIER LEAGUE — fictional G-only football season, never a real sporting event.
// Server owns all fixtures, odds, results, wallets and betting settlement.
const crypto=require('node:crypto');
const {addTradingFee}=require('./slot-jackpot-pool');
const DAY=86400000,HOUR=3600000,KST=9*HOUR,MATCH_MS=60000;
const MIN_STAKE=1000n,MAX_STAKE=1000000000000n,MAX_RETURN=1000000000000000000n;
const TAX_THRESHOLD=10000000000000000n,TAX_RATE=20n; // 1경 G; 100x win or over 1경 gross.
const KEY='jpl:v1:current',TICKET_PREFIX='jpl:v1:ticket:',ARCHIVE='jpl:v1:archive:';
const HOURS=[12,15,18,21,23],MAX_LEGS=5;
const kstMidnight=ms=>Math.floor((ms+KST)/DAY)*DAY-KST;
const openingDay=ms=>{
 const start=kstMidnight(ms);
 return ms<start+23*HOUR?start:start+DAY;
};
const CLUB_SYMBOLS=Object.freeze({
 junja:'♛',happy:'✦',ara:'🦅',pig:'🐗',tuna:'⚓',haehyun:'🌙',ubi:'⚔',
 chacha:'🐓',wooni:'🐿',dodo:'🔱',bisha:'🦁',shasha:'🏹',dongdong:'🐺',
 bbobbo:'♥',nada:'🪽',gogi:'🐂',haengju:'⚜',sugeon:'⚡',mint:'🌲',
 hunt:'🦌',cherry:'🍒',hari:'◆',dupal:'🛡',saram:'🌟'
});
const ALL_CLUBS=Object.freeze([
 ['junja','준자 마드리드 CF','준자','JUN',95,92,'#e4c275','#f5f4eb','J','로얄 베르나베우'],
 ['happy','햅피 바르셀로나 FC','햅피','HAP',94,90,'#9a2548','#2750ae','H','햅피 캄프 누'],
 ['ara','아라 이글스 FC','아라','ARA',88,82,'#d84937','#f4ece2','A','아라 올드파크'],
 ['pig','돼지 시티 FC','돼지','PIG',86,83,'#7ac6e6','#f4d2da','P','포크 에티하드'],
 ['tuna','참치 오션 FC','참치','TUN',80,81,'#0f87b5','#eaf9fa','T','참치 오션돔'],
 ['haehyun','해현 루나 FC','해현','HAE',82,86,'#e56b9e','#ffe1f0','H','해현 파크'],
 ['ubi','유비 인터 밀라노','유비','UBI',83,83,'#202d47','#e6edf7','U','유비 아레나'],
 ['chacha','차차 스퍼스 FC','차차','CHA',84,77,'#ebeaf6','#263459','C','차차 스타디움'],
 ['wooni','우니 로열스 FC','우니','WOO',79,79,'#eab459','#18354a','W','우니 브리지'],
 ['dodo','도도 리버풀 FC','도도','DOD',89,85,'#b72c48','#f4d5ca','D','도도 앤필드'],
 ['bisha','비샤 첼시 FC','비샤','BIS',87,84,'#2d5fca','#e5b45e','B','비샤 브리지'],
 ['shasha','샤샤 아스널 FC','샤샤','SHA',90,81,'#d43837','#f3f4f6','S','샤샤 에미레이트'],
 ['dongdong','동동 울브스 FC','동동','DON',75,77,'#c08a4d','#252424','D','동동 메트로폴'],
 ['bbobbo','뽀뽀 하트 FC','뽀뽀','BBO',76,74,'#f48eab','#fbeade','B','뽀뽀 하트필드'],
 ['nada','나다 애스턴 FC','나다','NAD',83,77,'#82364c','#87c6db','N','나다 빌라파크'],
 ['gogi','고기 레드불스 FC','고기','GOG',80,72,'#a83833','#e3aa6e','G','고기 불아레나'],
 ['haengju','행주 레인저스 FC','행주','HAJ',77,81,'#4a72c2','#f3f6fb','H','행주 아이언파크'],
 ['sugeon','수건 타이탄 FC','수건','SUG',73,75,'#6b75a3','#d6e1f2','S','수건 웨스트필드'],
 ['mint','민트 포레스트 FC','민트','MIN',77,82,'#28a891','#effaf5','M','민트 포레스트'],
 ['hunt','훈트 뮌헨 FC','훈트','HUN',89,87,'#c82c36','#f5efea','H','훈트 알리안츠'],
 ['cherry','체리 로즈 FC','체리','CHE',82,78,'#d1457c','#ffe6f2','C','체리 킹파크'],
 ['hari','하리 팰리스 FC','하리','HAR',75,81,'#345cbb','#a94456','H','하리 팰리스'],
 ['dupal','두팔 올림피크','두팔','DUP',81,79,'#e79652','#163f62','D','두팔 올림피크 스타디움'],
 ['saram','사람 피닉스 FC','사람','SAR',79,80,'#9c7ee8','#e6a768','S','사람 피닉스 아레나']
].map(([id,name,short,code,attack,defense,primary,secondary,emblem,stadium])=>Object.freeze({id,name,short,code,attack,defense,primary,secondary,emblem,stadium,symbol:CLUB_SYMBOLS[id]})));
const CLUBS=Object.freeze(ALL_CLUBS.slice(0,22));
const RESERVES=Object.freeze(ALL_CLUBS.slice(22));
const CLUB_MAP=new Map(ALL_CLUBS.map(c=>[c.id,c]));
function kstDate(ms){return new Date(ms+KST).toISOString().slice(0,10)}
function nextKstDay(ms){return Math.floor((ms+KST)/DAY)*DAY-KST+DAY}
function meanGoals(home,away){
 const h=CLUB_MAP.get(home),a=CLUB_MAP.get(away);
 const clamp=n=>Math.max(.35,Math.min(3.2,n));
 // Strong clubs consistently generate more scoring opportunities; home advantage persists.
 return [clamp(1.40+.041*(h.attack-a.defense)+.24),clamp(1.20+.041*(a.attack-h.defense))];
}
function probabilities(home,away){
 const [h,a]=meanGoals(home,away);
 const poisson=m=>{const p=[Math.exp(-m)];for(let i=1;i<=12;i++)p[i]=p[i-1]*m/i;return p};
 const hp=poisson(h),ap=poisson(a);let H=0,D=0,A=0,total=0;
 for(let i=0;i<=12;i++)for(let j=0;j<=12;j++){
  const p=hp[i]*ap[j];total+=p;if(i>j)H+=p;else if(i===j)D+=p;else A+=p;
 }
 return {H:H/total,D:D/total,A:A/total};
}
function oddsFor(home,away){
 const ps=probabilities(home,away);
 return Object.fromEntries(['H','D','A'].map(k=>[k,Math.max(108,Math.min(1850,Math.round(100/(ps[k]*1.075))))]));
}
function handicapLine(home,away){
 const h=CLUB_MAP.get(home),a=CLUB_MAP.get(away);
 const gap=(h.attack+h.defense-a.attack-a.defense)/2+3;
 return gap>=20?-2:gap>=5?-1:gap<=-20?2:gap<=-5?1:-1;
}
function handicapResult(score,line){
 const delta=score.home+line-score.away;
 return delta>0?'H':delta<0?'A':'D';
}
function handicapOddsFor(home,away,line=handicapLine(home,away)){
 const [h,a]=meanGoals(home,away),pm=m=>{const p=[Math.exp(-m)];for(let i=1;i<=15;i++)p[i]=p[i-1]*m/i;return p};
 const hp=pm(h),ap=pm(a);const p={H:0,D:0,A:0};let total=0;
 for(let i=0;i<hp.length;i++)for(let j=0;j<ap.length;j++){
  const chance=hp[i]*ap[j];total+=chance;
  p[handicapResult({home:i,away:j},line)]+=chance;
 }
 return Object.fromEntries(['H','D','A'].map(k=>[k,Math.max(108,Math.min(7000,Math.round(100/(p[k]/total*1.085))))]));
}
function makeRoundRobin(clubIds=CLUBS.map(c=>c.id)){
 const n=clubIds.length,a=clubIds.slice(),matches=[];let rotation=a.slice();
 for(let r=0;r<2*(n-1);r++){
  for(let i=0;i<n/2;i++){
   let home=rotation[i],away=rotation[n-1-i];
   if(i===0&&(r%(n-1))%2)[home,away]=[away,home];
   if(r>=n-1)[home,away]=[away,home];
   matches.push({round:r%(n-1)+1+(r>=n-1?n-1:0),home,away});
  }
  rotation=[rotation[0],rotation[n-1],...rotation.slice(1,n-1)];
 }
 return matches;
}
function createSchedule(startAt,clubIds=CLUBS.map(c=>c.id)){
 const pending=makeRoundRobin(clubIds),fixtures=[];
 for(let day=0;pending.length;day++){
  const occupied=new Set();let slot=0;
  for(let i=0;i<pending.length&&slot<5;){
   const m=pending[i];
   if(occupied.has(m.home)||occupied.has(m.away)){i++;continue}
   occupied.add(m.home);occupied.add(m.away);pending.splice(i,1);
   fixtures.push({...m,id:'JPL-'+String(fixtures.length+1).padStart(3,'0'),
    day:day+1,kickoff:startAt+day*DAY+HOURS[slot]*HOUR,
    odds:oddsFor(m.home,m.away),handicap:{line:handicapLine(m.home,m.away),odds:handicapOddsFor(m.home,m.away)},score:null,events:null,seed:null});
   slot++;
  }
  if(!slot)throw Error('축구 일정 생성 실패');
 }
 return fixtures;
}
function createSeason(time,index=1,clubIds=CLUBS.map(c=>c.id),reserveIds=RESERVES.map(c=>c.id)){
 if(clubIds.length!==22||new Set(clubIds).size!==22)throw Error('1부 축구팀은 정확히 22개여야 합니다.');
 const startAt=openingDay(time);
 const fixtures=createSchedule(startAt,clubIds);
 return {id:'S'+index,number:index,startedAt:time,startAt,
  endAt:fixtures[fixtures.length-1].kickoff+MATCH_MS,fixtures,clubs:clubIds.slice(),reserves:reserveIds.slice(),champion:null};
}
function createJPL({db,exactWallet,now=Date.now,random=()=>crypto.randomBytes(4).readUInt32BE()/4294967296}){
 const getKey=db.prepare('SELECT value FROM game_state WHERE key=?');
 const putKey=db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=excluded.updated_at');
 const delKey=db.prepare('DELETE FROM game_state WHERE key=?');
 const ledger=db.prepare('INSERT INTO ledger(user_id,amount,balance_after,amount_exact,balance_after_exact,type,memo,created_at) VALUES(?,?,?,?,?,?,?,?)');
 const userGet=db.prepare('SELECT id,is_disabled,balance,balance_exact,balance_base FROM users WHERE id=?');
 const userSet=db.prepare('UPDATE users SET balance=?,balance_exact=?,balance_base=? WHERE id=?');
 const read=k=>{const r=getKey.get(k);return r?JSON.parse(r.value):null};
 const save=(k,val)=>putKey.run(k,JSON.stringify(val),now());
 const roll=()=>Math.min(.999999999,Math.max(.000000001,random()));
 const randomInt=(min,max)=>min+Math.floor(roll()*(max-min+1));
 const user=id=>{const u=userGet.get(id);if(!u||u.is_disabled)throw Error('축구 리그를 이용할 수 없는 계정입니다.');return u};
 const today=()=>kstDate(now());
 function poissonSample(mean){
  const limit=Math.exp(-mean);let p=1,k=0;
  do{k++;p*=roll()}while(p>limit&&k<10);
  return Math.min(8,k-1);
 }
 function kick(f){
  if(f.events)return false;
  const [mh,ma]=meanGoals(f.home,f.away);
  const hs=poissonSample(mh),as=poissonSample(ma),events=[];
  const newGoal=(side,count)=>{
   for(let i=0;i<count;i++){
    const minute=randomInt(3,89);
    events.push({minute,kind:'GOAL',side,player:CLUB_MAP.get(side==='H'?f.home:f.away).short+' '+randomInt(7,22),text:'GOAL!'});
   }
  };
  newGoal('H',hs);newGoal('A',as);
  for(let i=0;i<16;i++){
   const minute=randomInt(2,89),side=roll()<.52?'H':'A',x=roll();
   events.push({minute,kind:x<.45?'SHOT':x<.73?'SAVE':x<.91?'CORNER':'CARD',
    side,text:x<.45?'강력한 슈팅!':x<.73?'슈퍼 세이브':x<.91?'코너킥':'옐로카드'});
  }
  events.sort((a,b)=>a.minute-b.minute||(a.kind==='GOAL'?-1:1));
  f.score={home:hs,away:as};f.seed=randomInt(1,2147483647);f.events=events;
  return true;
 }
 const resultOf=f=>f.score.home>f.score.away?'H':f.score.home<f.score.away?'A':'D';
 const legResult=(f,leg)=>leg.market==='HDP'?handicapResult(f.score,leg.line??f.handicap?.line??0):resultOf(f);
 const bettingTax=legs=>{
  let odds=1n,denom=1n;
  for(const leg of legs){odds*=BigInt(leg.odds100);denom*=100n}
  return odds>=100n*denom;
 };
 const ticketsForSeason=seasonId=>db.prepare('SELECT key,value FROM game_state WHERE key LIKE ?')
  .all(TICKET_PREFIX+seasonId+':%').map(r=>({key:r.key,ticket:JSON.parse(r.value)}));
 const ticketsForUser=id=>db.prepare('SELECT value FROM game_state WHERE key LIKE ?')
  .all(TICKET_PREFIX+'%:'+id+':%')
  .map(r=>JSON.parse(r.value)).filter(t=>Number(t.userId)===Number(id))
  .sort((a,b)=>Number(b.placedAt)-Number(a.placedAt)).slice(0,100);
 function settleTickets(s){
  let processed=0;
  const byId=new Map(s.fixtures.map(f=>[f.id,f]));
  for(const {key,ticket} of ticketsForSeason(s.id)){
   if(ticket.status!=='OPEN')continue;
   const finished=ticket.legs.map(leg=>byId.get(leg.matchId));
   const lose=ticket.legs.some((leg,i)=>finished[i]?.finishedAt&&legResult(finished[i],leg)!==leg.pick);
   const complete=finished.every(f=>f?.finishedAt);
   if(!lose&&!complete)continue;
   ticket.status=lose?'LOSE':'WIN';ticket.settledAt=now();
   if(!lose){
    const u=userGet.get(ticket.userId);
    if(!u)throw Error('축구 당첨자 계정을 찾을 수 없습니다.');
    const gross=BigInt(ticket.potential);
    const taxable=bettingTax(ticket.legs)||gross>TAX_THRESHOLD;
    const tax=taxable?gross*TAX_RATE/100n:0n,payout=gross-tax;
    if(tax>0n)addTradingFee(db,tax,ticket.settledAt);
    const next=exactWallet.read(u)+payout,m=exactWallet.mirror(next);
    userSet.run(m,String(next),String(m),ticket.userId);
    ledger.run(ticket.userId,exactWallet.mirror(payout),m,String(payout),String(next),'jpl_win',
      'JPL '+s.id+' '+ticket.legs.length+'폴더 적중 · 배당 '+ticket.totalOdds+' · 잭팟 적립 '+tax,ticket.settledAt);
    ticket.gross=String(gross);ticket.tax=String(tax);ticket.paid=String(payout);
   }else ticket.paid='0';
   save(key,ticket);processed++;
  }
  return processed;
 }
 function tableFor(s){
  const table=(s.clubs||CLUBS.map(c=>c.id)).map(id=>CLUB_MAP.get(id)).map(c=>({...c,played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0,lastFive:[]}));
  const map=new Map(table.map(t=>[t.id,t]));
  for(const f of s.fixtures){
   if(!f.finishedAt)continue;
   const h=map.get(f.home),a=map.get(f.away),x=f.score.home,y=f.score.away;
   h.played++;a.played++;h.for+=x;h.against+=y;a.for+=y;a.against+=x;
   if(x>y){h.won++;a.lost++;h.points+=3;h.lastFive.push('W');a.lastFive.push('L')}
   else if(x<y){a.won++;h.lost++;a.points+=3;a.lastFive.push('W');h.lastFive.push('L')}
   else {h.drawn++;a.drawn++;h.points++;a.points++;h.lastFive.push('D');a.lastFive.push('D')}
  }
  table.forEach(t=>{t.gd=t.for-t.against;t.lastFive=t.lastFive.slice(-5)});
  table.sort((a,b)=>b.points-a.points||b.gd-a.gd||b.for-a.for||a.name.localeCompare(b.name,'ko'));
  return table.map((t,i)=>({rank:i+1,...t}));
 }
 function nextSeason(s){
  const standings=tableFor(s),champion=standings[0]?.id;
  const relegated=standings.slice(-2).map(c=>c.id);
  const promoted=(s.reserves||RESERVES.map(c=>c.id)).slice(0,2);
  if(promoted.length!==2||new Set(promoted).size!==2)throw Error('2군 승격팀이 2팀 필요합니다.');
  const active=(s.clubs||CLUBS.map(c=>c.id)).filter(id=>!relegated.includes(id)).concat(promoted);
  const reserves=(s.reserves||RESERVES.map(c=>c.id)).filter(id=>!promoted.includes(id)).concat(relegated);
  save(ARCHIVE+s.id,{id:s.id,number:s.number,startAt:s.startAt,endAt:s.endAt,champion,
    relegated,promoted,table:standings,results:s.fixtures.map(f=>({id:f.id,home:f.home,away:f.away,score:f.score}))});
  // Two relegated clubs swap with the two second-division clubs. The reserve pool
  // becomes next season's Championship, allowing future promotion/return cycles.
  const fresh=createSeason(Math.max(now(),s.endAt),s.number+1,active,reserves);
  save(KEY,fresh);
  return fresh;
 }
 function advance(){
  db.exec('BEGIN IMMEDIATE');
  try{
   let s=read(KEY),changed=false;
   if(!s){s=createSeason(now());save(KEY,s);changed=true}
   // Correct the inaugural tomorrow-only fixture bug without breaking sold slips.
   // Reschedule only an entirely unplayed, unbet season, on its launch KST day.
   if(s.number===1&&s.startAt===nextKstDay(s.startedAt)&&
      kstDate(s.startedAt)===kstDate(now())&&
      now()<kstMidnight(now())+23*HOUR&&
      s.fixtures.every(f=>!f.events&&!f.finishedAt)&&ticketsForSeason(s.id).length===0){
    s.startAt-=DAY;s.endAt-=DAY;
    for(const f of s.fixtures)f.kickoff-=DAY;
    s.migratedKickoffsToTodayAt=now();changed=true;
   }
   // Upgrade persisted pre-handicap schedules in place: never reroll a played match.
   for(const f of s.fixtures)if(!f.handicap){
    f.handicap={line:handicapLine(f.home,f.away),odds:handicapOddsFor(f.home,f.away)};changed=true;
   }
   for(const f of s.fixtures){
    if(f.kickoff>now())break;
    if(!f.events){kick(f);changed=true}
    if(!f.finishedAt&&now()>=f.kickoff+MATCH_MS){
     f.finishedAt=f.kickoff+MATCH_MS;changed=true;
    }
   }
   if(changed)save(KEY,s);
   if(settleTickets(s))changed=true;
   if(s.fixtures.every(f=>f.finishedAt)&&now()>s.endAt+DAY){
    s=nextSeason(s);changed=true;
   }
   db.exec('COMMIT');return {season:s,changed};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 function fixturePublic(f,time=now()){
  const started=f.kickoff<=time,finished=!!f.finishedAt;
  const minute=Math.min(90,Math.max(0,Math.floor((time-f.kickoff)/MATCH_MS*90)));
  const visible=started&&f.events?f.events.filter(e=>finished||e.minute<=minute):[];
  const score=started&&f.events?{
   home:visible.filter(e=>e.kind==='GOAL'&&e.side==='H').length,
   away:visible.filter(e=>e.kind==='GOAL'&&e.side==='A').length}:null;
  return {id:f.id,round:f.round,day:f.day,kickoff:f.kickoff,home:f.home,away:f.away,
   odds:f.odds,handicap:f.handicap,status:finished?'FINAL':started?'LIVE':'SCHEDULED',
   minute:finished?90:started?minute:0,score,events:visible,seed:started?f.seed:null,
   outcome:finished?resultOf(f):null};
 }
 function status(id){
  const {season,changed}=advance(),t=now(),u=user(id),date=today();
  const todayMatches=season.fixtures.filter(f=>kstDate(f.kickoff)===date);
  const upcoming=season.fixtures.filter(f=>f.kickoff>=t).slice(0,20);
  const recently=season.fixtures.filter(f=>f.finishedAt).slice(-12).reverse();
  const live=season.fixtures.filter(f=>f.kickoff<=t&&t<f.kickoff+MATCH_MS);
  const tickets=ticketsForUser(id);
  return {ok:true,changed,serverNow:t,day:date,season:{id:season.id,number:season.number,
   startAt:season.startAt,endAt:season.endAt,totalGames:season.fixtures.length,finished:season.fixtures.filter(f=>f.finishedAt).length,
   matchdays:93,relegationCount:2,
    promotedFromLastSeason:season.number>1?(read(ARCHIVE+'S'+(season.number-1))?.promoted||[]):[],
    relegatedFromLastSeason:season.number>1?(read(ARCHIVE+'S'+(season.number-1))?.relegated||[]):[]},
   rules:{minStake:String(MIN_STAKE),maxStake:String(MAX_STAKE),maxReturn:String(MAX_RETURN),maxLegs:MAX_LEGS,durationMs:MATCH_MS,fixturesPerDay:5,virtual:true,jackpotTaxRatePct:20,jackpotTaxAtOdds:100,jackpotTaxAbove:String(TAX_THRESHOLD)},
   wallet:String(exactWallet.read(u)),clubs:(season.clubs||CLUBS.map(c=>c.id)).map(cid=>CLUB_MAP.get(cid)),reserves:(season.reserves||RESERVES.map(c=>c.id)).map(cid=>CLUB_MAP.get(cid)),table:tableFor(season),
   today:todayMatches.map(f=>fixturePublic(f,t)),
   upcoming:upcoming.map(f=>fixturePublic(f,t)),recent:recently.map(f=>fixturePublic(f,t)),
   live:live.map(f=>fixturePublic(f,t)),tickets};
 }
 function schedule(id){
  user(id);const {season,changed}=advance();
  return {ok:true,changed,season:season.id,fixtures:season.fixtures.map(f=>fixturePublic(f))};
 }
 function bet(id,legs,amount,requestId){
  id=Number(id);
  if(!Number.isSafeInteger(id)||id<1)throw Error('계정을 확인할 수 없습니다.');
  if(!Array.isArray(legs)||legs.length<1||legs.length>MAX_LEGS)throw Error('단폴부터 최대 5폴더까지 선택할 수 있어요.');
  if(typeof amount!=='string'||!/^[1-9][0-9]{0,30}$/.test(amount))throw Error('베팅 금액은 정수로 입력하세요.');
  const stake=BigInt(amount);
  if(stake<MIN_STAKE||stake>MAX_STAKE)throw Error('베팅 금액은 1,000 G부터 최대 1조 G입니다.');
  if(typeof requestId!=='string'||!/^[A-Za-z0-9_-]{12,80}$/.test(requestId))throw Error('베팅 요청번호가 올바르지 않습니다.');
  advance(); // Start/finish matches and settle previously locked tickets before a new wager.
  db.exec('BEGIN IMMEDIATE');
  try{
   const u=user(id),s=read(KEY),key=TICKET_PREFIX+s.id+':'+id+':'+requestId;
   const previous=read(key);
   if(previous){
    const norm=x=>({matchId:x.matchId,pick:x.pick,market:x.market||'NORMAL'});
    if(previous.stake!==String(stake)||JSON.stringify(previous.legs.map(norm))!==JSON.stringify(legs.map(norm)))
     throw Error('이미 다른 베팅에 사용된 요청번호입니다.');
    db.exec('COMMIT');return {ok:true,duplicate:true,ticket:previous};
   }
   const byId=new Map(s.fixtures.map(f=>[f.id,f])),seen=new Set();
   const chosen=legs.map(x=>{
    const matchId=String(x?.matchId||''),pick=String(x?.pick||''),market=String(x?.market||'NORMAL');
    const f=byId.get(matchId);
    if(!f||!['H','D','A'].includes(pick)||!['NORMAL','HDP'].includes(market))throw Error('경기와 승무패 선택을 확인하세요.');
    if(seen.has(matchId))throw Error('동일한 경기는 한 번만 선택할 수 있어요.');
    seen.add(matchId);
    if(now()>=f.kickoff)throw Error('킥오프한 경기는 베팅할 수 없어요.');
    return {matchId,pick,market,line:market==='HDP'?f.handicap.line:0,odds100:market==='HDP'?f.handicap.odds[pick]:f.odds[pick],home:f.home,away:f.away,kickoff:f.kickoff};
   });
   let numerator=stake,denominator=1n;
   for(const leg of chosen){numerator*=BigInt(leg.odds100);denominator*=100n}
   const potential=numerator/denominator;
   if(potential>MAX_RETURN)throw Error('예상 당첨금은 최대 100경 G입니다. 베팅금액이나 폴더 수를 낮춰주세요.');
   const before=exactWallet.read(u);
   if(before<stake)throw Error('보유 게임머니가 부족합니다.');
   const after=before-stake,m=exactWallet.mirror(after);
   userSet.run(m,String(after),String(m),id);
   ledger.run(id,exactWallet.mirror(-stake),m,String(-stake),String(after),'jpl_bet',
    'JPL '+s.id+' '+chosen.length+'폴더 · 승무패 확정 배당',now());
   const taxable=bettingTax(chosen)||potential>TAX_THRESHOLD;
   const tax=taxable?potential*TAX_RATE/100n:0n;
   const ticket={id:requestId,seasonId:s.id,userId:id,placedAt:now(),status:'OPEN',receiptNumber:'JPL-'+s.id+'-'+id+'-'+requestId.slice(-8).toUpperCase(),
    legs:chosen,stake:String(stake),potential:String(potential),
    expectedTax:String(tax),expectedNet:String(potential-tax),
    totalOdds:(Number(numerator/stake)/Number(denominator)).toFixed(2),paid:'0'};
   // Total decimal odds are display-only; all payouts use BigInt exact numerator above.
   save(key,ticket);
   db.exec('COMMIT');return {ok:true,duplicate:false,ticket,wallet:String(after)};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 return {status,schedule,bet,tick:()=>advance().changed,clubs:CLUBS};
}
module.exports={createJPL,CLUBS,RESERVES,ALL_CLUBS,makeRoundRobin,createSchedule,createSeason,oddsFor,probabilities,handicapOddsFor,handicapLine,handicapResult,DAY,MATCH_MS,MIN_STAKE,MAX_STAKE,MAX_RETURN};

'use strict';
// JUNJA PREMIER LEAGUE — fictional G-only football season, never a real sporting event.
// Server owns all fixtures, odds, results, wallets and betting settlement.
const crypto=require('node:crypto');
const DAY=86400000,HOUR=3600000,KST=9*HOUR,MATCH_MS=120000;
const MIN_STAKE=1000n,MAX_STAKE=1000000000000n,MAX_RETURN=100000000000000n;
const KEY='jpl:v1:current',TICKET_PREFIX='jpl:v1:ticket:',ARCHIVE='jpl:v1:archive:';
const HOURS=[12,15,18,21,23];
const CLUBS=Object.freeze([
 ['junja','레알 준자 CF','준자','JUN',95,92,'#e4c275','#f5f4eb','J','로얄 베르나베우'],
 ['happy','FC 햅피','햅피','HAP',94,90,'#9a2548','#2750ae','H','햅피 캄프 누'],
 ['ara','아라 유나이티드','아라','ARA',88,82,'#d84937','#f4ece2','A','아라 올드파크'],
 ['pig','돼지 시티 FC','돼지','PIG',86,83,'#7ac6e6','#f4d2da','P','포크 에티하드'],
 ['tuna','참치 마리너스','참치','TUN',80,81,'#0f87b5','#eaf9fa','T','참치 오션돔'],
 ['haehyun','해현 애슬레틱','해현','HAE',82,86,'#e56b9e','#ffe1f0','H','해현 파크'],
 ['ubi','유비 인터 FC','유비','UBI',83,83,'#202d47','#e6edf7','U','유비 아레나'],
 ['chacha','차차 홋스퍼','차차','CHA',84,77,'#ebeaf6','#263459','C','차차 스타디움'],
 ['wooni','우니 로버스','우니','WOO',79,79,'#eab459','#18354a','W','우니 브리지'],
 ['dodo','도도 레즈 FC','도도','DOD',89,85,'#b72c48','#f4d5ca','D','도도 앤필드'],
 ['bisha','비샤 블루스','비샤','BIS',87,84,'#2d5fca','#e5b45e','B','비샤 브리지'],
 ['shasha','샤샤 캐논스','샤샤','SHA',90,81,'#d43837','#f3f4f6','S','샤샤 에미레이트'],
 ['dongdong','동동 원더러스','동동','DON',75,77,'#c08a4d','#252424','D','동동 메트로폴'],
 ['bbobbo','뽀뽀 로열스','뽀뽀','BBO',76,74,'#f48eab','#fbeade','B','뽀뽀 하트필드'],
 ['nada','나다 빌라','나다','NAD',83,77,'#82364c','#87c6db','N','나다 빌라파크'],
 ['gogi','고기 불스 FC','고기','GOG',80,72,'#a83833','#e3aa6e','G','고기 불아레나'],
 ['haengju','행주 레인저스','행주','HAJ',77,81,'#4a72c2','#f3f6fb','H','행주 아이언파크'],
 ['sugeon','수건 타이탄즈','수건','SUG',73,75,'#6b75a3','#d6e1f2','S','수건 웨스트필드'],
 ['mint','민트 포레스트','민트','MIN',77,82,'#28a891','#effaf5','M','민트 포레스트'],
 ['hunt','훈트 바이에른','훈트','HUN',89,87,'#c82c36','#f5efea','H','훈트 알리안츠'],
 ['cherry','체리 체스터 FC','체리','CHE',82,78,'#d1457c','#ffe6f2','C','체리 킹파크'],
 ['hari','하리 크리스털 FC','하리','HAR',75,81,'#345cbb','#a94456','H','하리 팰리스']
].map(([id,name,short,code,attack,defense,primary,secondary,emblem,stadium])=>Object.freeze({id,name,short,code,attack,defense,primary,secondary,emblem,stadium})));
const CLUB_MAP=new Map(CLUBS.map(c=>[c.id,c]));
function kstDate(ms){return new Date(ms+KST).toISOString().slice(0,10)}
function nextKstDay(ms){return Math.floor((ms+KST)/DAY)*DAY-KST+DAY}
function meanGoals(home,away){
 const h=CLUB_MAP.get(home),a=CLUB_MAP.get(away);
 const clamp=n=>Math.max(.48,Math.min(2.72,n));
 return [clamp(1.42+.023*(h.attack-a.defense)+.22),clamp(1.22+.023*(a.attack-h.defense))];
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
function makeRoundRobin(){
 const n=CLUBS.length,a=CLUBS.map(c=>c.id),matches=[];let rotation=a.slice();
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
function createSchedule(startAt){
 const pending=makeRoundRobin(),fixtures=[];
 for(let day=0;pending.length;day++){
  const occupied=new Set();let slot=0;
  for(let i=0;i<pending.length&&slot<5;){
   const m=pending[i];
   if(occupied.has(m.home)||occupied.has(m.away)){i++;continue}
   occupied.add(m.home);occupied.add(m.away);pending.splice(i,1);
   fixtures.push({...m,id:'JPL-'+String(fixtures.length+1).padStart(3,'0'),
    day:day+1,kickoff:startAt+day*DAY+HOURS[slot]*HOUR,
    odds:oddsFor(m.home,m.away),score:null,events:null,seed:null});
   slot++;
  }
  if(!slot)throw Error('축구 일정 생성 실패');
 }
 return fixtures;
}
function createSeason(time,index=1){
 const startAt=nextKstDay(time);
 const fixtures=createSchedule(startAt);
 return {id:'S'+index,number:index,startedAt:time,startAt,
  endAt:fixtures[fixtures.length-1].kickoff+MATCH_MS,fixtures,champion:null};
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
 const ticketsForSeason=seasonId=>db.prepare('SELECT key,value FROM game_state WHERE key LIKE ?')
  .all(TICKET_PREFIX+seasonId+':%').map(r=>({key:r.key,ticket:JSON.parse(r.value)}));
 function settleTickets(s){
  let processed=0;
  const byId=new Map(s.fixtures.map(f=>[f.id,f]));
  for(const {key,ticket} of ticketsForSeason(s.id)){
   if(ticket.status!=='OPEN')continue;
   const finished=ticket.legs.map(leg=>byId.get(leg.matchId));
   const lose=ticket.legs.some((leg,i)=>finished[i]?.finishedAt&&resultOf(finished[i])!==leg.pick);
   const complete=finished.every(f=>f?.finishedAt);
   if(!lose&&!complete)continue;
   ticket.status=lose?'LOSE':'WIN';ticket.settledAt=now();
   if(!lose){
    const u=userGet.get(ticket.userId);
    if(!u)throw Error('축구 당첨자 계정을 찾을 수 없습니다.');
    const payout=BigInt(ticket.potential),next=exactWallet.read(u)+payout,m=exactWallet.mirror(next);
    userSet.run(m,String(next),String(m),ticket.userId);
    ledger.run(ticket.userId,exactWallet.mirror(payout),m,String(payout),String(next),'jpl_win',
      'JPL '+s.id+' '+ticket.legs.length+'폴더 적중 · 배당 '+ticket.totalOdds,ticket.settledAt);
    ticket.paid=String(payout);
   }else ticket.paid='0';
   save(key,ticket);processed++;
  }
  return processed;
 }
 function tableFor(s){
  const table=CLUBS.map(c=>({...c,played:0,won:0,drawn:0,lost:0,for:0,against:0,points:0,lastFive:[]}));
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
  save(ARCHIVE+s.id,{id:s.id,number:s.number,startAt:s.startAt,endAt:s.endAt,champion,
    table:standings,results:s.fixtures.map(f=>({id:f.id,home:f.home,away:f.away,score:f.score}))});
  // Kick off new season after the old one is fully completed, never reset open tickets.
  const fresh=createSeason(Math.max(now(),s.endAt),s.number+1);
  save(KEY,fresh);
  return fresh;
 }
 function advance(){
  db.exec('BEGIN IMMEDIATE');
  try{
   let s=read(KEY),changed=false;
   if(!s){s=createSeason(now());save(KEY,s);changed=true}
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
   odds:f.odds,status:finished?'FINAL':started?'LIVE':'SCHEDULED',
   minute:finished?90:started?minute:0,score,events:visible,seed:started?f.seed:null,
   outcome:finished?resultOf(f):null};
 }
 function status(id){
  const {season,changed}=advance(),t=now(),u=user(id),date=today();
  const todayMatches=season.fixtures.filter(f=>kstDate(f.kickoff)===date);
  const upcoming=season.fixtures.filter(f=>f.kickoff>=t).slice(0,20);
  const recently=season.fixtures.filter(f=>f.finishedAt).slice(-12).reverse();
  const live=season.fixtures.filter(f=>f.kickoff<=t&&t<f.kickoff+MATCH_MS);
  const tickets=ticketsForSeason(season.id).filter(x=>x.ticket.userId===Number(id))
   .map(x=>x.ticket).sort((a,b)=>b.placedAt-a.placedAt).slice(0,40);
  return {ok:true,changed,serverNow:t,day:date,season:{id:season.id,number:season.number,
   startAt:season.startAt,endAt:season.endAt,totalGames:season.fixtures.length,finished:season.fixtures.filter(f=>f.finishedAt).length,
   matchdays:93},
   rules:{minStake:String(MIN_STAKE),maxStake:String(MAX_STAKE),maxReturn:String(MAX_RETURN),maxLegs:10,durationMs:MATCH_MS,fixturesPerDay:5,virtual:true},
   wallet:String(exactWallet.read(u)),clubs:CLUBS,table:tableFor(season),
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
  if(!Array.isArray(legs)||legs.length<1||legs.length>10)throw Error('단폴부터 최대 10폴더까지 선택할 수 있어요.');
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
    if(previous.stake!==String(stake)||JSON.stringify(previous.legs.map(x=>({matchId:x.matchId,pick:x.pick})))!==JSON.stringify(legs))
     throw Error('이미 다른 베팅에 사용된 요청번호입니다.');
    db.exec('COMMIT');return {ok:true,duplicate:true,ticket:previous};
   }
   const byId=new Map(s.fixtures.map(f=>[f.id,f])),seen=new Set();
   const chosen=legs.map(x=>{
    const matchId=String(x?.matchId||''),pick=String(x?.pick||'');
    const f=byId.get(matchId);
    if(!f||!['H','D','A'].includes(pick))throw Error('경기와 승무패 선택을 확인하세요.');
    if(seen.has(matchId))throw Error('동일한 경기는 한 번만 선택할 수 있어요.');
    seen.add(matchId);
    if(now()>=f.kickoff)throw Error('킥오프한 경기는 베팅할 수 없어요.');
    return {matchId,pick,odds100:f.odds[pick],home:f.home,away:f.away,kickoff:f.kickoff};
   });
   let numerator=stake,denominator=1n;
   for(const leg of chosen){numerator*=BigInt(leg.odds100);denominator*=100n}
   const potential=numerator/denominator;
   if(potential>MAX_RETURN)throw Error('예상 당첨금은 최대 100조 G입니다. 베팅금액이나 폴더 수를 낮춰주세요.');
   const before=exactWallet.read(u);
   if(before<stake)throw Error('보유 게임머니가 부족합니다.');
   const after=before-stake,m=exactWallet.mirror(after);
   userSet.run(m,String(after),String(m),id);
   ledger.run(id,exactWallet.mirror(-stake),m,String(-stake),String(after),'jpl_bet',
    'JPL '+s.id+' '+chosen.length+'폴더 · 승무패 확정 배당',now());
   const ticket={id:requestId,seasonId:s.id,userId:id,placedAt:now(),status:'OPEN',
    legs:chosen,stake:String(stake),potential:String(potential),
    totalOdds:(Number(numerator/stake)/Number(denominator)).toFixed(2),paid:'0'};
   // Total decimal odds are display-only; all payouts use BigInt exact numerator above.
   save(key,ticket);
   db.exec('COMMIT');return {ok:true,duplicate:false,ticket,wallet:String(after)};
  }catch(err){try{db.exec('ROLLBACK')}catch{}throw err}
 }
 return {status,schedule,bet,tick:()=>advance().changed,clubs:CLUBS};
}
module.exports={createJPL,CLUBS,makeRoundRobin,createSchedule,createSeason,oddsFor,probabilities,DAY,MATCH_MS,MIN_STAKE,MAX_STAKE,MAX_RETURN};

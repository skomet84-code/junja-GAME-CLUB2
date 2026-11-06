'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const exactWallet=require('../exact-wallet');
const {createJPL,CLUBS,RESERVES,createSchedule,createSeason,probabilities,oddsFor,handicapOddsFor,handicapLine,handicapResult,DAY,MATCH_MS,MAX_STAKE,ANALYSIS_PRICE}=require('../jpl-core');
const {readPool,BASE}=require('../slot-jackpot-pool');
const dbNative=new DatabaseSync(':memory:');
dbNative.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER,balance_exact TEXT,balance_base TEXT,is_disabled INTEGER DEFAULT 0);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER)');
const db={exec:q=>dbNative.exec(q),prepare:q=>{const stmt=dbNative.prepare(q);stmt.setReadBigInts(true);return stmt}};
const balanceOf=id=>exactWallet.read(db.prepare('SELECT balance,balance_exact,balance_base FROM users WHERE id=?').get(id));
const add=(id,amount)=>db.prepare('INSERT INTO users(id,balance,balance_exact,balance_base) VALUES(?,?,?,?)').run(id,exactWallet.mirror(amount),String(amount),String(exactWallet.mirror(amount)));
add(1,1000000000000000n);add(2,1000000000000000n);add(3,1000000000000000n);
const names=['준자','햅피','아라','돼지','참치','해현','유비','차차','우니','도도','비샤','샤샤','동동','뽀뽀','나다','고기','행주','수건','민트','훈트','체리','하리'];
assert.equal(CLUBS.length,22);
// Non-owner accounts cannot view the football page, read its static assets, place bets,
// buy scouting reports or inspect the operator's betting ledger by calling APIs directly.
const privateServer=fs.readFileSync('server.js','utf8');
const privateLobby=fs.readFileSync('public/index.html','utf8');
const privateApp=fs.readFileSync('public/app.js','utf8');
assert.ok(privateServer.includes("jpl_access:!!u.is_admin&&String(u.username).toLowerCase()===ADMIN_USERNAME"),'JPL owner permission is bound to the primary verified admin login');
assert.ok(privateServer.includes("url.pathname==='/football'||url.pathname.startsWith('/football/')"),'JPL page and assets are server-protected');
assert.ok(privateServer.includes("url.pathname==='/api/jpl'||url.pathname.startsWith('/api/jpl/')"),'all JPL APIs are protected');
assert.ok(privateServer.includes("if(!viewer?.jpl_access)"),'non-owner football requests are refused by the server');
assert.ok(privateServer.includes("if(!admin.jpl_access)"),'JPL admin betting reports are restricted to the same owner');
assert.ok(privateLobby.includes('class="game-card football-jpl" href="/football/" style="display:none"'),'private league card is hidden before authentication');
assert.ok(privateApp.includes("const allowed=me.jpl_access===true"),'only the owner sees the private league card after login');

assert.equal(MATCH_MS,60000,'90-minute match sim completes in 60 real seconds');
assert.equal(MAX_STAKE,1000000000000000n,'maximum football bet is 1000 trillion G');
assert.equal(ANALYSIS_PRICE,1000000000000n,'per-fixture scouting information costs 1 trillion G');
const gameSource=fs.readFileSync('public/football/game.js','utf8');
assert.ok(gameSource.includes('home:demo.source.home,away:demo.source.away'),'demo follows selected real fixture clubs');
assert.ok(gameSource.includes('source:{id:f.id,home:f.home,away:f.away'),'preview snapshots selected fixture');
assert.ok(!gameSource.includes("home:'junja',away:'happy'"),'demo must never force 준자 vs 햅피');
assert.ok(gameSource.includes("const tm=playing?tick*1.9"),'live players move faster');
assert.ok(gameSource.includes('createDemoEvents(h,a)'),'exhibition independently generates goals rather than using actual result');
assert.ok(gameSource.includes('data-analyze')&&gameSource.includes("'/api/jpl/analysis'"),'paid scouting controls are connected to API');
assert.ok(gameSource.includes("const finishedVisual=match?.status==='FINAL'"),'finished fixture freezes motion');
assert.ok(gameSource.includes("$('#goalMarkers').innerHTML"),'goals are positioned on the 90-minute timeline');
const receiptSource=fs.readFileSync('public/football/receipts.js','utf8');
assert.ok(receiptSource.includes('<th>HOME</th><th>AWAY</th>'),'receipt has separate home and away columns');
assert.ok(receiptSource.includes("jpl-home-cell")&&receiptSource.includes("jpl-away-cell"),'compact home and away table cells');
const footballHtml=fs.readFileSync('public/football/index.html','utf8');
assert.ok(footballHtml.includes('id="pitchFinalBanner"')&&footballHtml.includes('id="goalMarkers"'),'full-time overlay and goal markers are mounted');
assert.ok(footballHtml.includes('id="jplTodayCount"')&&footballHtml.includes('id="jplSyncState"'),'verified premium progress board is present');
assert.ok(gameSource.includes('renderLeagueOperations()'),'client renders authoritative status without recomputing completed matches');
assert.ok(gameSource.includes('Math.abs((e.minute/90*(MATCH_MS/1000))'),'goal animation uses current shortened duration');
assert.equal(CLUBS.find(c=>c.id==='junja').name,'준자 마드리드 CF');
assert.equal(CLUBS.find(c=>c.id==='happy').name,'햅피 바르셀로나 FC');
assert.equal(RESERVES.length,2,'two second-division promotion clubs');
assert.deepEqual(RESERVES.map(c=>c.short),['두팔','사람']);
assert.equal(handicapResult({home:3,away:1},-1),'H','3:1 minus1 is home handicap win');
assert.equal(handicapResult({home:2,away:1},-1),'D','2:1 minus1 is handicap draw');
assert.equal(handicapResult({home:1,away:1},-1),'A','1:1 minus1 is away handicap win');
assert.equal(handicapResult({home:1,away:1},1),'H','home plus1 handicap wins');
assert.ok(handicapLine('junja','sugeon')<=-1,'strong favorite gives goal handicap');
assert.ok(handicapLine('sugeon','junja')>=1,'weak home side receives goal handicap');
for(const value of Object.values(handicapOddsFor('junja','sugeon',-1)))assert.ok(value>=108&&value<=7000);
assert.equal((fs.readFileSync('public/football/club-icons.js','utf8').match(/:[']?<path/g)||[]).length>=20,true,'club insignia shapes are available');
const crestSource=fs.readFileSync('public/football/club-icons.js','utf8');
assert.ok(crestSource.includes("premiumSpecial={")&&crestSource.includes("radialGradient")&&crestSource.includes("#METAL#"),'premium crest designs include per-club hero motifs, embossed metals and depth');
assert.ok(crestSource.includes("role=\"img\"")&&crestSource.includes('aria-label'),'crests expose an accessible name');
assert.ok(fs.readFileSync('public/football/index.html','utf8').includes('royal-heraldry-v4'),'updated crests use a new browser cache key');

assert.deepEqual(CLUBS.map(c=>c.short),names);
assert.equal(new Set(CLUBS.map(c=>c.id)).size,22);
const at=Date.parse('2026-11-05T00:00:00+09:00');
const fixtureList=createSchedule(at),season=createSeason(Date.parse('2026-11-04T12:00:00+09:00'));
assert.equal(fixtureList.length,462,'22 clubs double round robin = 462 fixtures');
assert.equal(season.fixtures.length,462);
assert.equal(new Set(fixtureList.map(f=>f.home+':'+f.away)).size,462,'each directed home-away pairing exactly once');
assert.equal(new Set(fixtureList.map(f=>[f.home,f.away].sort().join(':'))).size,231,'231 pairs twice');
assert.equal(new Set(fixtureList.map(f=>f.round)).size,42,'42 league rounds');
for(const club of CLUBS){
 assert.equal(fixtureList.filter(f=>f.home===club.id).length,21,'each club 21 home fixtures: '+club.short);
 assert.equal(fixtureList.filter(f=>f.away===club.id).length,21,'each club 21 away fixtures: '+club.short);
}
const byDay=new Map();
for(const f of fixtureList){
 const day=Math.floor((f.kickoff-at)/DAY);
 if(!byDay.has(day))byDay.set(day,[]);
 byDay.get(day).push(f);
 assert.deepEqual(Object.keys(f.odds).sort(),['A','D','H']);
 for(const val of Object.values(f.odds))assert.ok(Number.isInteger(val)&&val>=108&&val<=1850);
}
assert.equal(byDay.size,93,'93 days including 2-match final day');
for(const [day,fixtures] of byDay){
 assert.equal(fixtures.length,day===92?2:5,'five matches per day, final day two');
 assert.equal(new Set(fixtures.flatMap(f=>[f.home,f.away])).size,fixtures.length*2,'no club plays twice in one day');
}
const p=probabilities('junja','happy');
assert.ok(Math.abs(p.H+p.D+p.A-1)<.000001);
assert.ok(p.H>0&&p.D>0&&p.A>0);
let clock=Date.parse('2026-11-04T03:15:00+09:00');
const jpl=createJPL({db,exactWallet,now:()=>clock,random:()=>.48});
const first=jpl.status(1);
assert.equal(first.changed,true);
assert.equal(first.season.id,'S1');
assert.equal(first.season.totalGames,462);
assert.equal(first.season.matchdays,93);
assert.equal(first.progress.scheduled,462,'progress uses actual persisted fixture count');
assert.equal(first.progress.completed,0);
assert.equal(first.progress.todayScheduled,5);
assert.equal(first.progress.todayFinal,0);
assert.equal(first.progress.matchdays,93);
assert.equal(first.progress.integrity.ok,true);
assert.equal(first.progress.integrity.appearanceCount,0);

assert.equal(first.today.length,5,'five matches on launch day (Nov 4 KST)');
assert.equal(first.upcoming[0].kickoff,Date.parse('2026-11-04T12:00:00+09:00'),'opening kickoff at noon today');
assert.equal(first.rules.maxLegs,5,'server advertises maximum five-fold combinations');
assert.equal(first.rules.maxStake,String(MAX_STAKE));
assert.equal(first.rules.analysisPrice,String(ANALYSIS_PRICE));
assert.ok(!Object.hasOwn(first.today[0],'report'),'unpaid fixture API does not leak paid scouting');
assert.equal(first.upcoming.length,20);
assert.equal(first.upcoming[0].score,null,'unplayed result is private');
assert.equal(first.upcoming[0].seed,null,'outcome random seed not available before kick-off');
assert.equal(first.wallet,'1000000000000000');
assert.ok(fs.readFileSync('server.js','utf8').includes("'/api/jpl/bet'"),'authenticated bet API exists');
assert.ok(fs.readFileSync('server.js','utf8').includes("'/api/jpl/status'"));
assert.ok(fs.readFileSync('public/index.html','utf8').includes('href="/football/"'),'lobby entry');
assert.ok(fs.readFileSync('public/football/index.html','utf8').includes('id="pitch"'),'broadcast canvas');
assert.ok(fs.readFileSync('public/football/game.js','utf8').includes('requestAnimationFrame(canvasDraw)'),'live 2D render');
assert.equal(jpl.status(1).changed,false);
const match=first.upcoming[0],second=first.upcoming[1],third=first.upcoming[2];
const before=balanceOf(1),betId='jpl_bet_user1_000001';
assert.throws(()=>jpl.bet(1,first.upcoming.slice(0,6).map(m=>({matchId:m.id,pick:'H'})),'1000000','jpl_six_legs_invalid'),/최대 5폴더/,'six-leg wager rejected by server');
const wager=jpl.bet(1,[{matchId:match.id,pick:'H'}],'1000000',betId);
assert.equal(wager.duplicate,false);assert.equal(balanceOf(1),before-1000000n);
assert.equal(wager.ticket.status,'OPEN');assert.equal(wager.ticket.potential,String(1000000n*BigInt(match.odds.H)/100n));
assert.equal(jpl.bet(1,[{matchId:match.id,pick:'H'}],'1000000',betId).duplicate,true,'same request id replay cannot double-debit');
assert.equal(balanceOf(1),before-1000000n);
assert.throws(()=>jpl.bet(1,[{matchId:match.id,pick:'D'}],'1000000',betId),/다른 베팅/);
assert.throws(()=>jpl.bet(1,[{matchId:match.id,pick:'H'},{matchId:match.id,pick:'D'}],'1000000','jpl_duplicate_match_0001'),/동일한 경기/);
assert.throws(()=>jpl.bet(1,[{matchId:match.id,pick:'H'}],'1000000000000001','jpl_high_stake_00001'),/최대 1,000조/);
assert.throws(()=>jpl.bet(1,[{matchId:match.id,pick:'H'}],'999','jpl_low_stake_000001'),/1,000/);
const combo=jpl.bet(2,[{matchId:match.id,pick:'H'},{matchId:second.id,pick:'D'},{matchId:third.id,pick:'A'}],'1000000','jpl_parlay_test_000001');
assert.equal(combo.ticket.legs.length,3);
const thirdBet=jpl.bet(3,[{matchId:match.id,pick:'D'}],'2500000','jpl_draw_bet_0000001');
assert.equal(thirdBet.ticket.status,'OPEN');
clock=match.kickoff;
assert.throws(()=>jpl.bet(1,[{matchId:match.id,pick:'H'}],'1000000','jpl_closed_bet_00001'),/킥오프/);
const live=jpl.status(1);
assert.equal(live.live.length,1);
assert.equal(live.live[0].status,'LIVE');
assert.equal(live.live[0].minute,0);
assert.deepEqual(live.live[0].score,{home:0,away:0},'pre-goal live scoreboard cannot reveal final score');
const loaded=db.prepare("SELECT value FROM game_state WHERE key='jpl:v1:current'").get();
const raw=JSON.parse(loaded.value),actual=raw.fixtures[0];
assert.ok(actual.score&&actual.events,'server persists full simulation exactly once at kickoff');
assert.equal(jpl.status(1).changed,false,'refreshing a live match does not reroll outcome');
clock=match.kickoff+MATCH_MS/2;
const halftime=jpl.status(1).live[0];
assert.equal(halftime.minute,45);
assert.ok(halftime.events.every(e=>e.minute<=45),'events only appear when match minute is reached');
clock=match.kickoff+MATCH_MS;
const final=jpl.status(1);
assert.equal(final.recent[0].status,'FINAL');
assert.deepEqual(final.recent[0].score,actual.score);
assert.equal(final.progress.completed,1,'first completed match increments season progress');
assert.equal(final.progress.todayFinal,1,'daily counter increments exactly once');
assert.equal(final.progress.integrity.ok,true,'played team appearances and goals match score ledger');
assert.equal(final.progress.integrity.appearanceCount,2);
assert.equal(final.progress.integrity.totalGoals,actual.score.home+actual.score.away);
assert.equal(final.progress.lastFinished.id,match.id);
assert.equal(final.progress.lastFinished.finishedAt,match.kickoff+MATCH_MS);

const result=actual.score.home>actual.score.away?'H':actual.score.home<actual.score.away?'A':'D';
const settled=jpl.status(1).tickets.find(x=>x.id===betId);
assert.equal(settled.status,result==='H'?'WIN':'LOSE');
assert.equal(balanceOf(1),before-1000000n+(result==='H'?BigInt(settled.potential):0n));
const thirdStatus=jpl.status(3).tickets.find(x=>x.id===thirdBet.ticket.id);
assert.equal(thirdStatus.status,result==='D'?'WIN':'LOSE');
const beforeReplay=balanceOf(1);
assert.equal(jpl.tick(),false,'idle scheduler cannot settle a ticket twice');
assert.equal(balanceOf(1),beforeReplay,'idempotent payout');
const comboNow=jpl.status(2).tickets.find(x=>x.id===combo.ticket.id);
assert.equal(comboNow.status,result==='H'?'OPEN':'LOSE');
clock=second.kickoff+MATCH_MS;
jpl.tick();
clock=third.kickoff+MATCH_MS;
jpl.tick();
const comboFinal=jpl.status(2).tickets.find(x=>x.id===combo.ticket.id);
assert.ok(comboFinal.status==='WIN'||comboFinal.status==='LOSE');
assert.equal(comboFinal.status==='WIN',comboFinal.legs.every(l=>{
 const f=JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jpl:v1:current'").get().value).fixtures.find(x=>x.id===l.matchId);
 return (f.score.home>f.score.away?'H':f.score.home<f.score.away?'A':'D')===l.pick;
}));
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE type='jpl_bet'").get().n,3n,'every unique ticket debits exactly once');
const all=jpl.schedule(1);
assert.equal(all.fixtures.length,462,'full season calendar is available');
assert.equal(all.fixtures[0].outcome,result,'completed results visible');
const firstEnd=Number(first.season.endAt);
clock=firstEnd+DAY+1000;
const next=jpl.status(1);
assert.equal(next.season.number,2,'season rolls only after the full 462-match season');
assert.equal(next.season.finished,0);
assert.ok(next.tickets.some(t=>t.id===betId),'last season purchases remain visible after promotion/relegation');
assert.ok(next.tickets.find(t=>t.id===betId)?.receiptNumber,'each ticket has a stable receipt number');
assert.ok(db.prepare("SELECT value FROM game_state WHERE key='jpl:v1:archive:S1'").get(),'old champions and results archived');

// Verify the actual 21st/22nd league places are relegated and the named reserves promoted.
const archive=JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jpl:v1:archive:S1'").get().value);
assert.deepEqual(archive.promoted,['dupal','saram'],'two named reserve teams promoted after first season');
assert.deepEqual(archive.relegated,archive.table.slice(-2).map(t=>t.id));
assert.equal(next.table.length,22);
assert.ok(next.table.some(t=>t.id==='dupal'));
assert.ok(next.table.some(t=>t.id==='saram'));
assert.ok(!next.table.some(t=>archive.relegated.includes(t.id)));
// Direct league test of a locked 3-way handicap. Server selects its own frozen line
// and fixes payouts at purchase time, not at settlement or by browser-side calculation.
const newFixture=next.upcoming[0],hdp=newFixture.handicap;
assert.ok(hdp&&Number.isInteger(hdp.line));
const hdpTicket=jpl.bet(1,[{matchId:newFixture.id,market:'HDP',pick:'H'}],'1000000','jpl_handicap_leg_test_1');
assert.equal(hdpTicket.ticket.legs[0].market,'HDP');
assert.equal(hdpTicket.ticket.legs[0].line,hdp.line);
assert.equal(hdpTicket.ticket.legs[0].odds100,hdp.odds.H);
assert.throws(()=>jpl.bet(1,[{matchId:newFixture.id,market:'NORMAL',pick:'H'},
 {matchId:newFixture.id,market:'HDP',pick:'A'}],'1000000','jpl_duplicate_market_12'),/동일한 경기/);
// Settlement of synthetic winning tickets exercises exact threshold math and
// existing shared slot-jackpot pool on both threshold conditions independently.
const jackpotBefore=readPool(db);
const seasonRow=JSON.parse(db.prepare("SELECT value FROM game_state WHERE key='jpl:v1:current'").get().value);
const ff=seasonRow.fixtures[0];
ff.score={home:5,away:0};
ff.events=[{minute:9,kind:'GOAL',side:'H',text:'GOAL!'}];
ff.finishedAt=ff.kickoff+MATCH_MS;
db.prepare("UPDATE game_state SET value=? WHERE key='jpl:v1:current'").run(JSON.stringify(seasonRow));
const putTicket=(uid,suffix,odds100,gross,pick='H')=>{
 const t={id:suffix,seasonId:seasonRow.id,userId:uid,status:'OPEN',placedAt:clock,
  legs:[{matchId:ff.id,pick,odds100,market:'NORMAL'}],stake:'1000000',
  potential:gross,paid:'0',totalOdds:(odds100/100).toFixed(2)};
 db.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(
  'jpl:v1:ticket:'+seasonRow.id+':'+uid+':'+suffix,JSON.stringify(t),clock);
 return t;
};
putTicket(1,'tax_100x',10000,'100000000'); // exactly 100x => 20% levy
putTicket(2,'tax_1gyeong',200,'20000000000000000'); // over 1경 => 20% levy, despite 2x
putTicket(3,'tax_no_pay',10000,'100000000','D'); // missed bet, no levy
const jackpotTarget=100000000n/5n+20000000000000000n/5n;
clock=ff.finishedAt+1;
jpl.tick();
assert.equal(readPool(db),jackpotBefore+jackpotTarget,'20% of gross winning amounts deposited into existing slot jackpot');
const readTicket=(uid,suffix)=>JSON.parse(db.prepare('SELECT value FROM game_state WHERE key=?')
 .get('jpl:v1:ticket:'+seasonRow.id+':'+uid+':'+suffix).value);
assert.equal(readTicket(1,'tax_100x').tax,'20000000');
assert.equal(readTicket(1,'tax_100x').paid,'80000000');
assert.equal(readTicket(2,'tax_1gyeong').tax,'4000000000000000');
assert.equal(readTicket(2,'tax_1gyeong').paid,'16000000000000000');
assert.equal(readTicket(3,'tax_no_pay').paid,'0');
const afterTaxJackpot=readPool(db);
jpl.tick();
assert.equal(readPool(db),afterTaxJackpot,'no double jackpot levy after repeat tick');


// Migration regression: existing launch-day season incorrectly scheduled for tomorrow.
// Re-date only when unsold, never alter an already bought ticket's kickoff.
function legacyEngine(withSoldTicket){
 const native=new DatabaseSync(':memory:');
 native.exec('CREATE TABLE users(id INTEGER PRIMARY KEY,balance INTEGER,balance_exact TEXT,balance_base TEXT,is_disabled INTEGER DEFAULT 0);CREATE TABLE game_state(key TEXT PRIMARY KEY,value TEXT,updated_at INTEGER);CREATE TABLE ledger(id INTEGER PRIMARY KEY AUTOINCREMENT,user_id INTEGER,amount INTEGER,balance_after INTEGER,amount_exact TEXT,balance_after_exact TEXT,type TEXT,memo TEXT,created_at INTEGER)');
 const wrapped={exec:q=>native.exec(q),prepare:q=>{const stmt=native.prepare(q);stmt.setReadBigInts(true);return stmt}};
 native.prepare('INSERT INTO users(id,balance,balance_exact,balance_base) VALUES(?,?,?,?)').run(1,100000, '100000', '100000');
 const now=Date.parse('2026-11-04T03:15:00+09:00');
 const legacy=createSeason(now);
 legacy.startAt+=DAY;legacy.endAt+=DAY;
 for(const f of legacy.fixtures)f.kickoff+=DAY;
 native.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run('jpl:v1:current',JSON.stringify(legacy),now);
 if(withSoldTicket){
  native.prepare('INSERT INTO game_state(key,value,updated_at) VALUES(?,?,?)').run(
   'jpl:v1:ticket:S1:1:existing_ticket_1111',
   JSON.stringify({userId:1,id:'existing_ticket_1111',seasonId:'S1',status:'OPEN',stake:'1000',placedAt:now,
    legs:[{matchId:legacy.fixtures[0].id,pick:'H',market:'NORMAL',odds100:legacy.fixtures[0].odds.H}],
    potential:'1000',totalOdds:'1.00',paid:'0'}),now);
 }
 const eng=createJPL({db:wrapped,exactWallet,now:()=>now,random:()=>.5});
 return eng.status(1);
}
const fixedToday=legacyEngine(false);
assert.equal(fixedToday.today.length,5,'unbet original season moves from tomorrow to today');
assert.equal(fixedToday.upcoming[0].kickoff,Date.parse('2026-11-04T12:00:00+09:00'));
const preservedTomorrow=legacyEngine(true);
assert.equal(preservedTomorrow.today.length,0,'old booked fixtures are not silently moved');
assert.equal(preservedTomorrow.upcoming[0].kickoff,Date.parse('2026-11-05T12:00:00+09:00'));
assert.equal(preservedTomorrow.tickets[0].status,'OPEN');
// Per-fixture 1-trillion information purchase must be private, permanent for the season,
// and charged exactly once, while a genuine 1000-trillion bet must be accepted.
add(4,3000000000000000n);
const future=next.upcoming[1];
assert.ok(future.kickoff>clock,'second fixture remains available for paid pre-match scouting');
assert.equal(jpl.analysis(4,future.id,false).locked,true,'scouting starts locked for this user');
assert.equal(jpl.analysis(4,future.id,false).report,null,'locked user cannot read scouting metrics');
assert.equal(jpl.analysis(3,future.id,false).locked,true,'other account has separate access');
const bigBefore=balanceOf(4);
const vipBet=jpl.bet(4,[{matchId:future.id,pick:'H'}],String(MAX_STAKE),'jpl_vip_1000t_stake');
assert.equal(vipBet.ticket.stake,String(MAX_STAKE),'one match accepts the new maximum stake');
assert.equal(balanceOf(4),bigBefore-MAX_STAKE,'exact 1000-trillion debit');
const scoutingBefore=balanceOf(4);
const scouting=jpl.analysis(4,future.id,true);
assert.equal(scouting.alreadyPurchased,false);
assert.equal(scouting.wallet,String(scoutingBefore-ANALYSIS_PRICE));
assert.equal(balanceOf(4),scoutingBefore-ANALYSIS_PRICE);
for(const side of ['home','away']){
 const report=scouting.report[side];
 assert.ok(report.fitness>=61&&report.fitness<=97);
 assert.ok(report.condition>=58&&report.condition<=96);
 assert.ok(report.motivation>=57&&report.motivation<=98);
 assert.equal(report.absent,report.injured+report.suspended);
}
assert.deepEqual(jpl.analysis(4,future.id,false).report,scouting.report,'purchased report stable on reload');
assert.equal(jpl.analysis(4,future.id,true).alreadyPurchased,true,'repeated purchase is idempotent');
assert.equal(balanceOf(4),scoutingBefore-ANALYSIS_PRICE,'repeated purchase does not charge again');
assert.ok(jpl.status(4).analysisUnlocked.includes(future.id),'unlock is persistent in account status');
assert.ok(!jpl.status(3).analysisUnlocked.includes(future.id),'report ownership is user-scoped');
assert.equal(db.prepare("SELECT COUNT(*) AS n FROM ledger WHERE type='jpl_analysis'").get().n,1n,'scouting purchase logged only once');
assert.ok(fs.readFileSync('server.js','utf8').includes("'/api/jpl/analysis'"),'authenticated paid scouting endpoint exists');
console.log('JPL_SCOUTING_OK: paid 1-trillion account-scoped, idempotent scouting with all four metrics and exact 1000-trillion wager');

console.log('JPL_LAUNCH_TICKETS_OK: same-day 5 matches, strict five-fold limit, persistent receipts and no reschedule of purchased bets');

console.log('JPL_OK: 22 clubs, 42 rounds, 462 home-away fixtures, 5/day, 60s broadcast, pre-kickoff odds lock, exact BigInt single/parlay betting, 1x settlement and two relegated + promoted clubs, 3-way handicap & shared 20% jackpot levy');

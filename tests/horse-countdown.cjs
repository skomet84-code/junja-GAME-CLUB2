'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const app=fs.readFileSync('public/app.js','utf8');
const begin=app.indexOf('function horseSecondsRemaining('),end=app.indexOf('function renderHorseParticipants(',begin);
assert.ok(begin>0&&end>begin,'Race countdown functions must exist');
assert.ok(app.includes('horseCountdownTimer=setInterval'),'local timer must update between network polls');
assert.ok(app.includes('clearInterval(horseCountdownTimer)'),'timer must stop when leaving game');
assert.ok(app.includes('id="horseWaitingCountdown"'),'race state must be shown in the participants ticker');
assert.ok(!app.includes('14초 후 자동 출발'),'fixed waiting copy must not mask a real countdown');
let tick=1000,refreshes=0;
const small={textContent:''},bold={textContent:''},hint={textContent:''};
const clock={querySelector:(s)=>s==='small'?small:s==='b'?bold:null};
const round={id:'TEST',phase:'betting',openedAt:1000,betClosesAt:15000,participants:[]};
const ctx={Date:{now:()=>tick},horseServerClockOffset:0,horseMeetData:round,
  horsePollBusy:false,horseExpiredRefreshRound:null,currentView:'horse',
  $:(selector)=>selector==='#horseMeetClock'?clock:selector==='#horseWaitingCountdown'?hint:null,
  loadHorseMeet:()=>{refreshes++;}};
vm.createContext(ctx);vm.runInContext(app.slice(begin,end),ctx);
for(const [time,expected] of [[1000,14],[2000,13],[14001,1],[15000,0]]){
  tick=time;ctx.paintHorseCountdown();assert.equal(bold.textContent,expected+'초');assert.ok(hint.textContent.includes(expected+'초 후 자동 출발'));
}
ctx.paintHorseCountdown();assert.equal(refreshes,1,'deadline should only request one immediate sync');
round.participants=[{userId:1}];tick=2000;ctx.paintHorseCountdown();
assert.ok(hint.textContent.includes('전체 동시 출발'),'bettors also see live countdown');
round.phase='running';ctx.paintHorseCountdown();
assert.equal(bold.textContent,'🏇 경주 중');assert.ok(!hint.textContent.includes('초 후 자동 출발'));
round.phase='result';round.resultUntil=21000;tick=17000;ctx.paintHorseCountdown();
assert.equal(bold.textContent,'4초 후 새 경주');assert.ok(hint.textContent.includes('4초 후 다음 경주'));
console.log('HORSE_COUNTDOWN_OK: 14-to-zero ticking, single server sync, shared bettor and running/result labels');

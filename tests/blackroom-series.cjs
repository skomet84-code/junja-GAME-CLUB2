'use strict';
/* BLACK ROOM 13-case end-to-end deterministic campaign tests.
   Verify every file can be completed in order and that old EP01 saves survive. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const original=require('../public/blackroom/engine.js');
const S=require('../public/blackroom/series-engine.js');
assert.equal(S.CASES.length,12,'12 linked case definitions following episode 001');
assert.deepEqual(S.CASES.map(c=>c.id),Array.from({length:12},(_,i)=>i+2));
const ep=original.initial();
assert.equal(ep.series.v,S.VERSION,'EP01 snapshot includes series by default');
assert.equal(S.unlocked(S.fresh(),2,false),false,'episode 002 locked before true ending');
const raw=JSON.parse(JSON.stringify(ep));
ep.ending='true';ep.solved=true;
ep.series=S.fresh();
let run=original.hydrate(ep);
assert.equal(run.ending,'true');
assert.equal(S.unlocked(run.series,2,true),true);
assert.equal(S.unlocked(run.series,3,true),false);
for(const c of S.CASES){
 const id=c.id,game=run.series;
 assert.ok(S.unlocked(game,id,true),'case '+id+' must unlock after the previous verdict');
 if(id<13)assert.equal(S.unlocked(game,id+1,true),false,'future case prematurely opened: '+(id+1));
 const p=()=>game.cases[id];
 assert.equal(S.travel(game,id,2).ok,false,'cannot skip rooms');
 assert.equal(S.unlock(game,id,'gate1',c.puzzles[0].answer).ok,false,'cannot guess keypad without clues');
 for(const clue of ['e0','e1','e2'])assert.equal(S.inspect(game,id,clue).ok,true,id+':'+clue);
 assert.equal(S.unlock(game,id,'gate1',c.puzzles[0].answer).ok,true,'first keypad: '+id);
 assert.equal(S.travel(game,id,2).ok,false,'second area must remain locked');
 for(const clue of ['e3','e4','e5'])assert.equal(S.inspect(game,id,clue).ok,true,id+':'+clue);
 assert.equal(S.unlock(game,id,'gate2',c.puzzles[1].answer).ok,true,'second keypad: '+id);
 for(const clue of ['e6','e7'])assert.equal(S.inspect(game,id,clue).ok,true,id+':'+clue);
 assert.equal(S.verdict(game,id,c.verdict).ok,false,'cannot convict without theory and witnesses');
 for(const t of c.theories){assert.equal(S.connect(game,id,...t.pair).ok,true,id+':'+t.id);}
 for(const witness of c.witnesses)assert.equal(S.question(game,id,witness.id).reveal,true,'witness '+witness.id+' case '+id);
 const opts=['culprit','act','motive'];
 for(const type of opts)assert.ok(S.options(id,type).includes(c.verdict[type]),'answer hidden from options for '+id);
 assert.equal(S.verdict(game,id,{culprit:'wrong',act:'wrong',motive:'wrong'}).ok,false);
 const verdict=S.verdict(game,id,c.verdict);
 assert.equal(verdict.ok,true,'must complete case '+id);
 assert.ok(p().score>0);assert.equal(p().solved,true);
 assert.equal(S.verdict(game,id,c.verdict).already,true,'duplicate finish should not replay');
 run=original.hydrate(JSON.parse(JSON.stringify(run)));
 assert.equal(run.series.cases[id]?.solved,true,'reconnect must keep completed case '+id);
 assert.ok(run.series.cases[id].clues.length===8);
}
assert.equal(run.series.cases[13].solved,true);
assert.equal(Object.values(run.series.cases).filter(x=>x.solved).length,12);
assert.equal(S.highestUnlocked(run.series,true),13);
assert.equal(original.hydrate({...run,solved:false,ending:'pending'}).series.cases[2],undefined,
 'linked campaign must not unlock if episode 001 progress invalid');
const historic=original.hydrate(raw);
assert.equal(historic.v,1);assert.equal(historic.started,false);
assert.equal(historic.series.v,1,'legacy EP01 save upgrade remains compatible');
const clone=original.hydrate(JSON.parse(JSON.stringify(run)));
assert.equal(S.merge(run.series,clone.series,true).cases[13].solved,true,'conflict merge never erases highest progress');
assert.equal(S.merge(run.series,clone.series,false).cases[2],undefined,'locked guest series must not pass authorization');
const ui=fs.readFileSync(path.join(__dirname,'../public/blackroom/series-ui.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'../public/blackroom/series.html'),'utf8');
const ep1UI=fs.readFileSync(path.join(__dirname,'../public/blackroom/game.js'),'utf8');
for(const token of ['srCaseList','srApp','srModal','srHint','series-ui.js'])assert.ok(html.includes(token),'missing '+token);
for(const token of ['S.inspect(','S.unlock(','S.connect(','S.question(','S.verdict(','/api/blackroom/state'])assert.ok(ui.includes(token),'UI missing '+token);
assert.ok(ep1UI.includes('/blackroom/series.html'),'EP01 true ending must link to 13-case campaign');
console.log('BLACKROOM_13_CASES_OK — episode 001 migration, 12 unlocks, 96 clues, 24 locks, 36 theories, 24 witnesses, 12 verdicts, save/merge/UI link');

'use strict';
const assert=require('node:assert/strict');
const E=require('../public/blackroom/engine.js');
const s=E.initial();
for(const id of ['guest','clock','thread','latch'])assert.equal(E.collect(s,id).ok,true);
assert.equal(E.puzzle(s,'door','2317').ok,true);
for(const id of ['footprint','cup','invitation','lock','mirror','sync','ledger'])assert.equal(E.collect(s,id).ok,true);
assert.equal(E.puzzle(s,'archive','0713').ok,true);
assert.equal(E.collect(s,'footage').ok,true);
for(const [a,b] of [['clock','sync'],['guest','lock'],['invitation','footage']])assert.equal(E.connect(s,a,b).ok,true);
assert.equal(E.ready(s),false,'3 core theories do not unlock shortcut');
for(const [a,b] of [['thread','footprint'],['lock','ledger']])assert.equal(E.connect(s,a,b).ok,true);
for(const id of ['kang','yoon'])assert.equal(E.interrogate(s,id).reveal,true);
assert.equal(E.ready(s),true);
let result=E.verdict(s,{culprit:'kang',time:'offset',method:'maintenance',timeProof:'sync',entryProof:'lock',identityProof:'ledger'});
assert.equal(result.ok,true);assert.equal(result.ending,'partial');
assert.equal(s.ending,'partial');assert.ok(s.score<=79,'no premature perfect S rank');
assert.equal(E.fullTruth(s),false);
assert.equal(E.revealTruth(s).ok,false,'true ending cannot be guessed');
for(const [a,b] of [['thread','footprint'],['lock','ledger']])assert.equal(E.connect(s,a,b).ok,true);
for(const id of Object.keys(E.PEOPLE))assert.equal(E.interrogate(s,id).reveal,true);
assert.equal(E.fullTruth(s),true);
result=E.revealTruth(s);
assert.equal(result.ok,true);assert.equal(s.ending,'true');assert.equal(s.score,100);
assert.equal(E.hydrate(JSON.parse(JSON.stringify(s))).ending,'true');
const old={...s};delete old.ending;
assert.equal(E.hydrate(old).ending,'partial','v1 saves migrate without erasing progress');
console.log('BLACKROOM_STORY_OK — partial verdict, five evidence theories, three interrogations, guarded true ending');

{
 const fs=require('node:fs'),assert=require('node:assert/strict');
 const ui=fs.readFileSync(require('node:path').join(__dirname,'../public/blackroom/game.js'),'utf8');
 for(const token of ['sceneChapterNav','사건 002 · 사라진 기록 시작','1화 내부 장소 이동','offerGuestImport','mergeProgress(state,legacyGuestState)','dismiss-import'])
  assert.ok(ui.includes(token),'first case continuation missing: '+token);
 console.log('BLACKROOM_CHAPTER_NAV_OK');
}

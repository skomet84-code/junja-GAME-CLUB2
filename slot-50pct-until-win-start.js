'use strict';

// TEMPORARY ONE-SHOT SLOT EVENT PATCH
// 777 jackpot chance is exactly 10% per spin while this event is active.
// After the first 777 jackpot winner, the event is persisted as inactive in
// game_state and all following spins immediately return to the original odds.
// A fresh event key is used for the Docker deployment fix so prior test state
// cannot suppress activation after the corrected Render container starts.

const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.resolve(__dirname, 'server.js');
const originalReadFileSync = fs.readFileSync.bind(fs);

const poolInitAnchor = "if(gameStateGet('slot_jackpot_pool',null)==null)gameStateSet('slot_jackpot_pool',SLOT_JACKPOT_BASE);";
const eventStatePatch = `${poolInitAnchor}\n\nconst TEMP_SLOT_777_EVENT_KEY='slot_777_event_20260919_10pct_restart';\nif(gameStateGet(TEMP_SLOT_777_EVENT_KEY,null)==null){\n  gameStateSet(TEMP_SLOT_777_EVENT_KEY,{active:true,startedAt:Date.now(),targetPct:10});\n}\nfunction tempSlot777EventActive(){\n  const state=gameStateGet(TEMP_SLOT_777_EVENT_KEY,null);\n  return state===true||!!state?.active;\n}`;

const oldGridBuild = "      const grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));";
const temporaryGridBuild = `      // TEMP EVENT: exactly 10% total 777 jackpot chance until first winner.
      const sevenEventActive=tempSlot777EventActive();
      const hasSevenPayline=(g)=>SLOT_LINES.some(line=>line.cells.every(([r,c])=>g[r][c]==='7️⃣'));
      const forceSevenJackpot=sevenEventActive&&crypto.randomInt(1000000)<100000;
      let grid;
      if(forceSevenJackpot){
        grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
        grid[1][0]='7️⃣';grid[1][1]='7️⃣';grid[1][2]='7️⃣';
      }else if(sevenEventActive){
        do{grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));}while(hasSevenPayline(grid));
      }else{
        grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      }`;

const sevenJackpotAnchor = "      const sevenJackpot=winLines.some(w=>!w.scatter&&w.symbols?.[0]==='7️⃣');";
const autoRestorePatch = `${sevenJackpotAnchor}\n      if(sevenJackpot&&sevenEventActive){\n        gameStateSet(TEMP_SLOT_777_EVENT_KEY,{active:false,startedAt:gameStateGet(TEMP_SLOT_777_EVENT_KEY,{})?.startedAt||null,endedAt:Date.now(),targetPct:10,winnerUserId:u.id,winnerNickname:u.nickname||null});\n      }`;

fs.readFileSync = function temporarySlotOddsRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  if (path.resolve(String(filePath)) !== serverPath) return result;

  const isBuffer = Buffer.isBuffer(result);
  let source = isBuffer ? result.toString('utf8') : String(result);
  if (!source.includes(poolInitAnchor)) {
    throw new Error('[JUNJA SLOT TEMP] jackpot pool anchor not found; refusing unsafe startup');
  }
  if (!source.includes(oldGridBuild)) {
    throw new Error('[JUNJA SLOT TEMP] slot grid target not found; refusing unsafe startup');
  }
  if (!source.includes(sevenJackpotAnchor)) {
    throw new Error('[JUNJA SLOT TEMP] 777 result anchor not found; refusing unsafe startup');
  }

  source = source.replace(poolInitAnchor, eventStatePatch);
  source = source.replace(oldGridBuild, temporaryGridBuild);
  source = source.replace(sevenJackpotAnchor, autoRestorePatch);
  return isBuffer ? Buffer.from(source, 'utf8') : source;
};

try {
  require('./admin-unlimited-start.js');
} finally {
  fs.readFileSync = originalReadFileSync;
}

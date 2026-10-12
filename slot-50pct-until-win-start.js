'use strict';

// TEMPORARY ONE-SHOT SLOT EVENT PATCH
// 777 jackpot chance is exactly 5% per spin while this event is active.
// After the first 777 jackpot winner, the event is persisted as inactive in
// game_state and all following spins immediately return to the original odds.
// A fresh event key is used for the Docker deployment fix so prior test state
// cannot suppress activation after the corrected Render container starts.

const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.resolve(__dirname, 'server.js');
const originalReadFileSync = fs.readFileSync.bind(fs);

const poolInitAnchor = "if(gameStateGet('slot_jackpot_pool',null)==null)gameStateSet('slot_jackpot_pool',SLOT_JACKPOT_BASE);";
const eventStatePatch = `${poolInitAnchor}\n\nconst TEMP_SLOT_777_EVENT_KEY='slot_777_event_20260920_5pct_restart';\nif(gameStateGet(TEMP_SLOT_777_EVENT_KEY,null)==null){\n  gameStateSet(TEMP_SLOT_777_EVENT_KEY,{active:true,startedAt:Date.now(),targetPct:5});\n}\nfunction tempSlot777EventActive(){\n  const state=gameStateGet(TEMP_SLOT_777_EVENT_KEY,null);\n  return state===true||!!state?.active;\n}`;

const modernGridBuild = `      let grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      const slot777EventTriggered=slot777EventActive()&&(crypto.randomInt(1000000)/1000000)<SLOT_777_EVENT_CHANCE;
      if(slot777EventTriggered){
        const eventLine=SLOT_LINES[crypto.randomInt(SLOT_LINES.length)];
        for(const [r,c] of eventLine.cells)grid[r][c]='7️⃣';
      }`;
const temporaryGridBuild = `      // Legacy temporary 5% event, adapted to the current native slot engine.
      // The active flag and normal slot bet boosts still use the native engine
      // after the temporary event's first confirmed jackpot.
      const temporaryFiveActive=tempSlot777EventActive();
      const slot777EventTriggered=temporaryFiveActive
        ?crypto.randomInt(1000000)<50000
        :slot777EventActive()&&(crypto.randomInt(1000000)/1000000)<SLOT_777_EVENT_CHANCE;
      let grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      if(temporaryFiveActive&&!slot777EventTriggered){
        // Avoid accidental 777 wins on untriggered temporary-event spins.
        const has777=g=>SLOT_LINES.some(line=>line.cells.every(([r,c])=>g[r][c]==='7️⃣'));
        while(has777(grid))grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
      }
      if(slot777EventTriggered){
        const eventLine=SLOT_LINES[crypto.randomInt(SLOT_LINES.length)];
        for(const [r,c] of eventLine.cells)grid[r][c]='7️⃣';
      }`;
const sevenJackpotAnchor = "      const sevenJackpot=winLines.some(w=>!w.scatter&&w.symbols?.[0]==='7️⃣');";
const autoRestorePatch = `${sevenJackpotAnchor}
      if(sevenJackpot&&temporaryFiveActive){
        gameStateSet(TEMP_SLOT_777_EVENT_KEY,{active:false,startedAt:gameStateGet(TEMP_SLOT_777_EVENT_KEY,{})?.startedAt||null,endedAt:Date.now(),targetPct:5,winnerUserId:u.id,winnerNickname:u.nickname||null});
      }`;

fs.readFileSync = function temporarySlotOddsRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  if (path.resolve(String(filePath)) !== serverPath) return result;

  const isBuffer = Buffer.isBuffer(result);
  let source = isBuffer ? result.toString('utf8') : String(result);
  if (!source.includes(poolInitAnchor)) {
    throw new Error('[JUNJA SLOT TEMP] jackpot pool anchor not found; refusing unsafe startup');
  }
  if (!source.includes(modernGridBuild)) {
    throw new Error('[JUNJA SLOT TEMP] slot grid target not found; refusing unsafe startup');
  }
  if (!source.includes(sevenJackpotAnchor)) {
    throw new Error('[JUNJA SLOT TEMP] 777 result anchor not found; refusing unsafe startup');
  }

  source = source.replace(poolInitAnchor, eventStatePatch);
  source = source.replace(modernGridBuild, temporaryGridBuild);
  source = source.replace(sevenJackpotAnchor, autoRestorePatch);
  return isBuffer ? Buffer.from(source, 'utf8') : source;
};

try {
  require('./admin-unlimited-start.js');
} finally {
  fs.readFileSync = originalReadFileSync;
}

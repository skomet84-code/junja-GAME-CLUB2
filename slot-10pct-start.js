'use strict';

// TEMPORARY SLOT EVENT PATCH
// Makes the total 777 jackpot chance exactly 10% per spin while this wrapper is active.
// The normal 90% branch rejects naturally generated 777 paylines so the total rate
// does not exceed 10%. Remove this wrapper and restore package.json start to
// admin-unlimited-start.js to return to the normal slot odds.

const fs = require('node:fs');
const path = require('node:path');

const serverPath = path.resolve(__dirname, 'server.js');
const originalReadFileSync = fs.readFileSync.bind(fs);

const oldGridBuild = "      const grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));";
const temporaryGridBuild = `      // TEMP: 777 jackpot event = exactly 10% per spin.
      const hasSevenPayline=(g)=>SLOT_LINES.some(line=>line.cells.every(([r,c])=>g[r][c]==='7️⃣'));
      const forceSevenJackpot=crypto.randomInt(1000000)<100000;
      let grid;
      if(forceSevenJackpot){
        grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));
        grid[1][0]='7️⃣';grid[1][1]='7️⃣';grid[1][2]='7️⃣';
      }else{
        do{grid=Array.from({length:3},()=>Array.from({length:3},()=>pick()));}while(hasSevenPayline(grid));
      }`;

fs.readFileSync = function temporarySlotOddsRead(filePath, ...args) {
  const result = originalReadFileSync(filePath, ...args);
  if (path.resolve(String(filePath)) !== serverPath) return result;

  const isBuffer = Buffer.isBuffer(result);
  let source = isBuffer ? result.toString('utf8') : String(result);
  if (!source.includes(oldGridBuild)) {
    throw new Error('[JUNJA SLOT TEMP] slot grid target not found; refusing unsafe startup');
  }
  source = source.replace(oldGridBuild, temporaryGridBuild);
  return isBuffer ? Buffer.from(source, 'utf8') : source;
};

try {
  require('./admin-unlimited-start.js');
} finally {
  fs.readFileSync = originalReadFileSync;
}

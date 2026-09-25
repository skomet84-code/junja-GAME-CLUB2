'use strict';

// JUNJA LAND v2.5 runtime integration layer.
// Keeps the stable v2.4.3 core files intact while applying the v2.5 feature set
// as one atomic boot patch. This makes rollback to the pre-v2.5 branch trivial.

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const Module = require('node:module');

const originalCreateReadStream = fs.createReadStream.bind(fs);
const originalStatSync = fs.statSync.bind(fs);
const appJsPath = path.join(__dirname, 'public', 'app.js');
const indexPath = path.join(__dirname, 'public', 'index.html');

function replaceOne(source, oldText, newText, label, required = true) {
  if (!source.includes(oldText)) {
    const msg = `[JUNJA v2.5] patch target missing: ${label}`;
    if (required) throw new Error(msg);
    console.warn(msg);
    return source;
  }
  return source.replace(oldText, newText);
}

// ---- Static client patch ---------------------------------------------------
let appSource = fs.readFileSync(appJsPath, 'utf8');

// Admin wallet limits are handled by the BigInt-backed core; keep the legacy HTML max removed.
appSource = appSource.replace('max="1000000000"', ' '.repeat('max="1000000000"'.length));

// All game wager controls: fixed 100k client caps become wallet-limited.
appSource = replaceOne(
  appSource,
  'function normalizeWagerInput(target,min=5000,max=100000)',
  'function normalizeWagerInput(target,min=5000,max=Number.MAX_SAFE_INTEGER)',
  'generic wager input cap', false
);
appSource = replaceOne(
  appSource,
  'v=Math.max(1000,Math.min(100000,v));',
  'v=Math.max(1000,Math.min(Math.floor(Number(me?.balance||0)/1000)*1000,v));',
  'slot wager normalization', false
);
appSource = replaceOne(
  appSource,
  'n>=1000&&n<=100000&&n%1000===0',
  'n>=1000&&n<=Math.floor(Number(me?.balance||0)/1000)*1000&&n%1000===0',
  'slot live wager input', false
);
appSource = appSource.split('Math.min(100000,Math.floor(Number(').join('Math.min(Math.floor(Number(me?.balance||0)/1000)*1000,Math.floor(Number(');

let indexSource = fs.readFileSync(indexPath, 'utf8');
indexSource = indexSource.replace(/\smax="100000"/g, '');
indexSource = indexSource.replace(/MAX\s*100,000\s*G/g, '보유머니 한도까지').replace(/MAX\s*100,000G/g, '보유머니 한도까지');
if (!indexSource.includes('/v25-overhaul.css')) {
  indexSource = indexSource.replace('</head>', '<link rel="stylesheet" href="/v25-overhaul.css?v=270"></head>');
}
if (!indexSource.includes('/v25-overhaul.js')) {
  indexSource = indexSource.replace('</body>', '<script defer src="/v25-overhaul.js?v=270"></script></body>');
}

const staticBuffers = new Map([
  [path.resolve(appJsPath), Buffer.from(appSource, 'utf8')],
  [path.resolve(indexPath), Buffer.from(indexSource, 'utf8')]
]);

fs.statSync = function patchedStatSync(filePath, ...args) {
  const st = originalStatSync(filePath, ...args);
  const buf = staticBuffers.get(path.resolve(String(filePath)));
  if (!buf) return st;
  return new Proxy(st, {
    get(target, prop) {
      if (prop === 'size') return buf.length;
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
};

fs.createReadStream = function patchedStaticReadStream(filePath, options) {
  try {
    const buf = staticBuffers.get(path.resolve(String(filePath)));
    if (buf) return Readable.from([buf]);
  } catch (error) {
    console.error('[JUNJA v2.5] static patch failed:', error);
  }
  return originalCreateReadStream(filePath, options);
};

// ---- Server core patch ----------------------------------------------------
const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

// Large admin grants and wallet overflow checks now live in server.js using exact BigInt-backed text balances.
// Do not re-apply the old Number.MAX_SAFE_INTEGER runtime guards here.

// Remove the fixed game wager ceiling globally. Individual endpoints already
// reject bets larger than the user's wallet; walletWager() remains wallet-capped.
const oldGameWager = "function gameWager(v,min=1000,max=5000000,step=1000){\n  const n=Math.floor(Number(v));\n  if(!Number.isFinite(n)||n<min||n>max||n%step!==0) throw new Error(`금액은 ${formatMoney(min)}G~${formatMoney(max)}G 범위에서 ${formatMoney(step)}G 단위로 입력하세요.`);\n  return n;\n}";
const newGameWager = "function gameWager(v,min=1000,max=Number.MAX_SAFE_INTEGER,step=1000){\n  const n=Math.floor(Number(v));\n  if(!Number.isSafeInteger(n)||n<min||n%step!==0) throw new Error(`금액은 최소 ${formatMoney(min)}G부터 ${formatMoney(step)}G 단위로 입력하세요.`);\n  return n;\n}";
source = replaceOne(source, oldGameWager, newGameWager, 'global game wager ceiling');

// Yut: preserve the v2.8.8+ finish rule while applying the center shortcut.
// A new piece starts at O1; a returning piece reaches HOME (START) first and
// only the next step exits HOME to FINISH. The center shortcut must not bypass HOME.
source = replaceOne(
  source,
  "  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['START','B']};",
  "  if(node==='CA')return firstStep&&routeChoice!=='outer'?{node:'B4',route:'B'}:{node:'A4',route:'A'};\n  const map={A1:['A2','A'],A2:['CA','A'],CA:['A4','A'],A4:['A5','A'],A5:['O15','outer'],B1:['B2','B'],B2:['CB','B'],CB:['B4','B'],B4:['B5','B'],B5:['START','B']};",
  'yut center shortcut'
);

// Hold'em AI is maintained in holdem-ai.js; use the server's decision path.

const runtimeServer = new Module(serverPath, module);
runtimeServer.filename = serverPath;
runtimeServer.paths = Module._nodeModulePaths(__dirname);
runtimeServer._compile(source, serverPath);
// Release boot-time source copies after compilation to stay within the 512MB plan.
source = null; appSource = null; indexSource = null;

'use strict';

// Runtime hotfix for the JUNJA LAND administrator wallet.
// Removes the old 1,000,000,000 G per-adjustment cap while keeping integer safety.

const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('node:stream');
const Module = require('node:module');

const appJsPath = path.join(__dirname, 'public', 'app.js');
const originalCreateReadStream = fs.createReadStream.bind(fs);

// The admin amount field had an HTML max=1,000,000,000 attribute.
// Serve app.js with that attribute removed. The replacement is the same byte
// length so server.js can keep using the original Content-Length safely.
fs.createReadStream = function createReadStreamWithoutAdminCap(filePath, options) {
  try {
    if (path.resolve(String(filePath)) === path.resolve(appJsPath)) {
      const source = fs.readFileSync(filePath, 'utf8');
      const target = 'max="1000000000"';
      const patched = source.replace(target, ' '.repeat(target.length));
      return Readable.from([Buffer.from(patched, 'utf8')]);
    }
  } catch (error) {
    console.error('Admin amount UI patch failed:', error);
  }
  return originalCreateReadStream(filePath, options);
};

const serverPath = path.join(__dirname, 'server.js');
let source = fs.readFileSync(serverPath, 'utf8');

const oldAdminValidation = "if(!Number.isInteger(raw)||raw<1||raw>1000000000)return json(res,400,{error:'조정 금액은 1~1,000,000,000 G 범위의 정수로 입력하세요.'});";
const newAdminValidation = "if(!Number.isSafeInteger(raw)||raw<1)return json(res,400,{error:'조정 금액은 1G 이상의 안전한 정수로 입력하세요.'});";

if (!source.includes(oldAdminValidation)) {
  throw new Error('Admin wallet limit patch target was not found in server.js.');
}
source = source.replace(oldAdminValidation, newAdminValidation);

const oldBalanceGuard = "const next=u.balance+amount;\n    if(next<0) throw new Error('게임머니가 부족합니다.');";
const newBalanceGuard = "const next=u.balance+amount;\n    if(!Number.isSafeInteger(next)) throw new Error('잔액이 시스템 안전 정수 범위를 초과합니다.');\n    if(next<0) throw new Error('게임머니가 부족합니다.');";
if (!source.includes(oldBalanceGuard)) {
  throw new Error('Wallet balance safety patch target was not found in server.js.');
}
source = source.replace(oldBalanceGuard, newBalanceGuard);

const runtimeServer = new Module(serverPath, module);
runtimeServer.filename = serverPath;
runtimeServer.paths = Module._nodeModulePaths(__dirname);
runtimeServer._compile(source, serverPath);

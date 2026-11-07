import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const full=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/casino-receipts.css'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/casino-receipts-ui.js'),'utf8');
const begin=full.indexOf('<section class="round-proof" id="roundReceiptPanel"');
const end=full.indexOf('</section>',begin);
assert(begin>=0&&end>begin,'Member receipt panel must be part of wallet history');
const section=full.slice(begin,end+'</section>'.length);
const pageHtml='<!DOCTYPE html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0c0d13;color:white;font:14px system-ui}#view-ledger{padding:12px;max-width:1050px;margin:auto}'+css+'</style></head><body><section id="view-ledger">'+section+'</section><script defer src="/casino-receipts-ui.js"></script></body></html>';
const payload={
 version:7,kind:'LEDGER_BACKED_ROUND_RECEIPTS',nextBeforeId:41,
 rows:[
 {receiptId:50,reference:'JRR7-L50',game:'roulette',createdAt:1793900000000,userId:1,status:'verified',wagerG:'1000',spentG:'1000',payoutG:'2000',balanceG:'100000000000000000000',free:false,won:true,outcome:{number:2,color:'black'},bets:[{kind:'black',target:null,amountG:'1000',won:true,returnedG:'2000'}],errors:[]},
 {receiptId:41,reference:'JRR7-L41',game:'bigwheel',createdAt:1793900000000,userId:1,status:'mismatch',wagerG:'10000',spentG:'0',payoutG:'0',balanceG:'100000000000000000000',free:true,won:false,outcome:{index:3,key:'x2',multiplier:2,label:'<svg onload=alert(1)>'},selection:'x5',errors:['TEST_INVALID_AMOUNT'],bets:[]}
 ]};
const srv=http.createServer((req,res)=>{
 const path=new URL(req.url,'http://127.0.0.1');
 if(path.pathname==='/preview'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(pageHtml);return;}
 if(path.pathname==='/casino-receipts-ui.js'){res.setHeader('Content-Type','application/javascript');res.end(ui);return;}
 if(path.pathname==='/api/casino/receipts'){
  res.setHeader('Content-Type','application/json');
  if(path.searchParams.has('beforeId'))res.end(JSON.stringify({...payload,rows:[{...payload.rows[0],receiptId:30,reference:'JRR7-L30'}],nextBeforeId:null}));
  else res.end(JSON.stringify(payload));
  return;
 }
 res.writeHead(404);res.end('not found');
});
await new Promise(done=>srv.listen(0,'127.0.0.1',done));
const base='http://127.0.0.1:'+srv.address().port;
let passed=0;
try{
 for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  const browser=await engine.launch();
  try{
   for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:850},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/preview');
    await page.locator('#roundReceiptReload').click();
    await page.waitForFunction(()=>document.querySelectorAll('.round-proof-item').length===2);
    assert.equal(await page.locator('.round-proof-item').count(),2);
    assert.equal(await page.locator('.round-proof-item svg').count(),0,'Outcome labels must render literally');
    assert((await page.locator('#roundReceiptRows').innerText()).includes('<svg onload=alert(1)>'),'Malicious text must be escaped');
    assert((await page.locator('#roundReceiptRows').innerText()).includes('JRR7-L50'));
    const dim=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,width:window.innerWidth}));
    assert(dim.scroll<=dim.width+2,name+' '+width+'px horizontal overflow '+JSON.stringify(dim));
    await page.locator('#roundReceiptMore').click();
    await page.waitForFunction(()=>document.querySelectorAll('.round-proof-item').length===3);
    assert(await page.locator('#roundReceiptMore').isHidden());
    assert.deepEqual(errors,[],'No browser errors for '+name+' '+width);
    if(width===390)await page.screenshot({path:'/tmp/junja-round-receipts-'+name+'.png',fullPage:false});
    console.log('ROUND_RECEIPT_BROWSER_OK '+name+' '+width+'px, XSS-safe, full amount, pagination and no overflow');
    await page.close();
    passed++;
   }
  }finally{await browser.close();}
 }
 assert.equal(passed,8);
}finally{await new Promise(resolve=>srv.close(resolve));}

import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const index=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/casino-audit.css'),'utf8');
const js=fs.readFileSync(path.join(root,'public/casino-audit-ui.js'),'utf8');
const start=index.indexOf('<section class="panel casino-watch"');
const end=index.indexOf('</section>',start);
assert(start>=0&&end>start,'Operator section missing');
const section=index.slice(start,end+'</section>'.length);
const body='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#0e0e12;color:#fff;font:14px system-ui}#view-admin{max-width:980px;margin:0 auto;padding:10px}'+css+'</style></head><body><main id="view-admin">'+section+'</main><script src="/casino-audit-ui.js" defer></script></body></html>';
const mock={
 kind:'READ_ONLY_LEDGER_REVIEW',game:'all',userId:null,scannedRows:8,shown:2,
 totals:{matched:1,mismatch:1,unknown:0,unpaired:0},nextBeforeId:12,
 events:[
  {id:19,game:'roulette',userId:1,nickname:'준자',createdAt:1793800000000,status:'matched',betG:'1000000000000000',payoutG:'2000000000000000',afterG:'100000000000000000000',landing:'2 BLACK',ledgerIds:[19,20],issues:[],notes:[]},
  {id:12,game:'bigwheel',userId:2,nickname:'<img src=x onerror=alert(1)>',createdAt:1793800000000,status:'mismatch',betG:'10000',payoutG:'20000',afterG:'1020000',landing:'×5',ledgerIds:[12,13],issues:['BIGWHEEL_PAYOUT_MISMATCH'],notes:['수동 확인 필요']}
 ]
};
const srv=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/preview'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(body);return;}
 if(u.pathname==='/casino-audit-ui.js'){res.setHeader('Content-Type','application/javascript');res.end(js);return;}
 if(u.pathname==='/api/admin/casino-settlements'){
  res.setHeader('Content-Type','application/json');
  if(u.searchParams.has('beforeId')){
   res.end(JSON.stringify({...mock,shown:1,nextBeforeId:null,totals:{matched:0,mismatch:0,unknown:1,unpaired:0},events:[{id:5,game:'roulette',userId:1,nickname:'테스트',createdAt:1793700000000,status:'unknown',betG:'1000',payoutG:'0',afterG:'9000',ledgerIds:[5],issues:[],notes:['결과 번호 미기록']}]}));
  }else res.end(JSON.stringify(mock));
  return;
 }
 res.statusCode=404;res.end('not found');
});
await new Promise(resolve=>srv.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+srv.address().port;
let count=0;
try{
 for(const [engine,browserType] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await browserType.launch();
  try{
   for(const width of [360,390,768,1280]){
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base+'/preview');
    assert(await page.locator('#casinoAuditRefresh').isVisible());
    await page.locator('#casinoAuditRefresh').click();
    await page.locator('.casino-watch-card').first().waitFor();
    assert.equal(await page.locator('.casino-watch-card').count(),2);
    assert.equal(await page.locator('.casino-watch-card img').count(),0,'Nickname must never inject HTML');
    assert((await page.locator('#casinoAuditRows').innerText()).includes('<img src=x onerror=alert(1)>'),'Malicious nickname must remain literal');
    const bounds=await page.evaluate(()=>({doc:document.documentElement.scrollWidth,inner:window.innerWidth}));
    assert(bounds.doc<=bounds.inner+2,engine+' '+width+' horizontal overflow '+JSON.stringify(bounds));
    assert.deepEqual(errors,[],'Browser script errors');
    await page.locator('#casinoAuditMore').click();
    assert.equal(await page.locator('.casino-watch-card').count(),3);
    assert(await page.locator('#casinoAuditMore').isHidden());
    if(width===390)await page.screenshot({path:'/tmp/junja-casino-audit-'+engine+'.png',fullPage:false});
    console.log('CASINO_AUDIT_MOBILE_OK '+engine+' '+width+'px, safe nickname, append pagination, zero overflow');
    await page.close();count++;
   }
  }finally{await browser.close();}
 }
 assert.equal(count,8);
}finally{await new Promise(resolve=>srv.close(resolve));}

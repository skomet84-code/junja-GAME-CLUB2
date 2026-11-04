import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium,webkit} from 'playwright';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const html=fs.readFileSync(path.join(root,'public/index.html'),'utf8');
const css=fs.readFileSync(path.join(root,'public/support-center.css'),'utf8');
const script=fs.readFileSync(path.join(root,'public/support-center-ui.js'),'utf8');
const modalStart=html.indexOf('<div id="supportCenterModal"'),modalEnd=html.indexOf('</body>',modalStart);
const adminStart=html.indexOf('<section class="panel support-admin"'),adminEnd=html.indexOf('</section>',adminStart);
assert(modalStart>=0&&modalEnd>modalStart&&adminStart>=0&&adminEnd>adminStart);
const body='<!doctype html><html lang="ko"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#111;color:#eee}#view-admin{padding:10px}'+css+'</style></head><body><button id="supportCenterBtn">고객센터</button><div id="view-admin" class="view active">'+html.slice(adminStart,adminEnd+10)+'</div>'+html.slice(modalStart,modalEnd).replace(/<script src="\\/support-center-ui\\.js[^>]*><\\/script>/,'')+'<script src="/support-center-ui.js" defer></script></body></html>';
const safeMessage='<img src=x onerror=alert(1)> 이 구문은 문의 내용입니다.';
let tickets=[{id:1,reference:'JCS-00000001',category:'game_settlement',subject:'정산 확인',message:safeMessage,status:'OPEN',createdAt:1793833000000,updatedAt:1793833000000,version:1,adminNote:'',history:[],userId:2,nickname:'<svg onload=alert(2)>'}];
const counters={created:0,updated:0};
const server=http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1');
 if(u.pathname==='/preview'){res.setHeader('Content-Type','text/html;charset=utf-8');res.end(body);return}
 if(u.pathname==='/support-center-ui.js'){res.setHeader('Content-Type','application/javascript');res.end(script);return}
 if(u.pathname==='/api/support/cases'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,items:tickets}));return}
 if(u.pathname==='/api/admin/support/cases'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,items:tickets}));return}
 if(u.pathname==='/api/support/cases'&&req.method==='POST'){
  counters.created++;const parts=[];for await(const p of req)parts.push(p);
  const x=JSON.parse(Buffer.concat(parts).toString());
  const item={id:2,reference:'JCS-00000002',category:x.category,subject:x.subject,message:x.message,status:'OPEN',createdAt:1793833000000,updatedAt:1793833000000,version:1,adminNote:'',history:[]};
  tickets=[item,...tickets];res.statusCode=201;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,item}));return;
 }
 if(u.pathname==='/api/admin/support/cases'&&req.method==='POST'){
  counters.updated++;const parts=[];for await(const p of req)parts.push(p);
  const x=JSON.parse(Buffer.concat(parts).toString());
  tickets=tickets.map(t=>t.id===x.id?{...t,status:x.status,adminNote:x.adminNote,version:t.version+1}:t);
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:true,item:tickets.find(t=>t.id===x.id)}));return;
 }
 res.statusCode=404;res.end('not found');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port;
try{
 for(const [name,driver] of [['chromium',chromium],['webkit',webkit]]){
  const browser=await driver.launch();
  try{
   for(const width of [360,390,768,1280]){
    tickets=[{id:1,reference:'JCS-00000001',category:'game_settlement',subject:'정산 확인',message:safeMessage,status:'OPEN',createdAt:1793833000000,updatedAt:1793833000000,version:1,adminNote:'',history:[],userId:2,nickname:'<svg onload=alert(2)>'}];
    const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1});
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
    await page.goto(base+'/preview',{waitUntil:'networkidle'});
    await page.locator('#supportCenterBtn').click();
    assert(await page.locator('#supportCenterModal').isVisible());
    await page.locator('#supportForm input').fill('정산 결과 문의 테스트');
    await page.locator('#supportMessage').fill('룰렛 123회차 금액 검증이 필요해요.');
    await page.locator('#supportSubmit').click();
    await page.waitForFunction(()=>document.querySelector('#supportStatus')?.textContent.includes('JCS-00000002'));
    assert.equal(await page.locator('#supportMyRows img').count(),0,'Support message cannot execute HTML');
    assert((await page.locator('#supportMyRows').innerText()).includes(safeMessage));
    await page.locator('#supportCenterClose').click();
    assert(await page.locator('#supportCenterModal').isHidden());
    await page.locator('#supportAdminRefresh').click();
    await page.locator('.support-ticket-tools button').first().click();
    await page.waitForFunction(()=>document.querySelector('#supportAdminRows .support-ticket-state')?.textContent==='검토 중');
    assert.equal(await page.locator('#supportAdminRows svg').count(),0,'Operator view cannot execute nickname HTML');
    const bounds=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,inner:innerWidth}));
    assert(bounds.scroll<=bounds.inner+2,name+' '+width+' horizontal overflow '+JSON.stringify(bounds));
    assert.deepEqual(errors,[]);
    if(width===390)await page.screenshot({path:'/tmp/junja-support-'+name+'.png',fullPage:false});
    await page.close();
    console.log('SUPPORT_V9_BROWSER_OK '+name+' '+width+'px secure messages, create ticket, owner triage, modal and overflow');
   }
  }finally{await browser.close()}
 }
}finally{await new Promise(resolve=>server.close(resolve))}

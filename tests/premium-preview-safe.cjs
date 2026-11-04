'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const html=fs.readFileSync(path.join(root,'public/premium-preview.html'),'utf8');
const gates=fs.readFileSync(path.join(root,'docs/MONETIZATION_RELEASE_GATES.md'),'utf8');
const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
const {PRODUCTS}=require('../premium-purchase-core');
// Public concept must never accept payment, user data or change virtual balances.
assert.match(html,/<meta name="robots" content="noindex,nofollow">/);
assert.match(html,/실제 판매\/결제 불가/);
assert.match(html,/카지노 게임머니와 연동되지 않습니다/);
assert.match(html,/J-GOLD/);
assert.doesNotMatch(html,/<script\b/i);
assert.doesNotMatch(html,/<form\b/i);
assert.doesNotMatch(html,/(?:<a[^>]*href|window\.location)\s*=\s*["'][^"']*(?:checkout|pay|purchase)/i);
assert.doesNotMatch(html,/api\/(?:pay|cash|payment|wallet|deposit)/i);
const cards=(html.match(/<article class="item">/g)||[]).length;
const disabled=(html.match(/<button disabled type="button">판매 준비 중<\/button>/g)||[]).length;
assert.equal(cards,6,'Six real catalog previews');
assert.equal(disabled,cards,'Every commerce action must be disabled');
assert.equal(cards,PRODUCTS.length,'Every purchasable SKU must have one preview card');
for(const p of PRODUCTS){
 assert(html.includes('<h3>'+p.name+'</h3>'),'Missing SKU in premium preview: '+p.id);
 assert(html.includes('<strong>₩ '+p.priceKrw.toLocaleString('en-US')+'</strong>'),'Preview price mismatch for '+p.id);
}
assert.doesNotMatch(server,/require\(['"]\.\/premium-(?:pg-core|purchase-core|toss-readonly)['"]\)/,'Cash prototype must not be mounted in the live game server');
for(const name of ['watch','car','jewelry','yacht','jet','estate']){
  const asset=path.join(root,'public/art/royal/cinematic',name+'-showroom.webp');
  assert(fs.existsSync(asset),'Missing cinematic asset: '+name);
  assert(html.includes('/art/royal/cinematic/'+name+'-showroom.webp'));
}
assert.match(html,/@media\(max-width:620px\)/,'Mobile responsive');
assert.match(html,/:focus-visible/,'Keyboard navigation visible');
assert.match(gates,/기능 플래그 기본 OFF/);
assert.match(gates,/PG사에 사전 업종 심사/);
assert.match(gates,/유료 상품을 여기에 그대로 추가하지 않는다/);
console.log('PREMIUM_PREVIEW_SAFE_OK: catalog-price match, 6 cards, disabled purchasing, approved assets, no payment or conversion surface');

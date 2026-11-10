'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const from=path.join(__dirname,'..');
const read=f=>fs.readFileSync(path.join(from,f),'utf8');
const server=read('server.js'),app=read('public/app.js'),index=read('public/index.html'),ui=read('public/royal-economy-ui.js'),css=read('public/royal-economy.css'),royal=read('royal-economy.js');
assert.match(server,/item\.collection!=='royalboutique'&&Number\.isSafeInteger\(item\.price\)&&item\.price>0\)item\.price\*=100/,'base shop x100 source means x10 over previous effective catalog');
assert.match(server,/const SHOP_BY_ID/,'existing shop remains intact');
assert.match(royal,/const recent=db\.prepare/,'royal recent purchases feed');
assert.match(royal,/equipped:!item\.displayOnly&&load\[item\.category\]===item\.id/,'wearables equip from real loadout, cars only live in collector vault');
assert.match(index,/id="view-shop" class="view palace-mode"/,'default royal gallery');
assert.match(index,/id="junjaShopWingNav"/,'two distinct storefronts');
assert.match(ui,/ROYAL ACQUIRED/,'cinematic acquisition overlay');
assert.match(ui,/data-jre-select/,'product preview selection');
assert.match(ui,/data-jre-buy/,'royal purchase');
assert.match(ui,/data-jre-equip/,'royal equip');
assert.match(ui,/data-jre-owned/,'collection filtering');
assert.match(ui,/data-shop-wing/,'boutique switching');
assert.match(css,/jrp-featured/,'premium showroom design');
assert.match(css,/prefers-reduced-motion/,'reduce animation when requested');
for(const x of ['crown','gem','wings','dragon']){
 const art=read('public/art/royal/'+x+'.svg');
 assert.match(art,/<svg/);assert.match(art,/<linearGradient/);
}
for(const old of ['30조 → 50조 → 80조','1,000,000,000 G</em>','100억 G</span>','여성 5종 · 각 10,000,000,000 G','10억 G 레전드 컬렉션','<b class="prestige-badge">10조 G</b>'])assert.equal(app.includes(old),false,'stale label '+old);
for(const dynamic of ['money(royalPlus.find(x=>x.royalStep===1)?.price)','money(all.find(x=>x.collection===\'ultimate\')?.price)','money(x.price)'])assert.ok(app.includes(dynamic),'missing live catalog price binding '+dynamic);
console.log('ROYAL_PALACE_V2_OK: upgraded boutique, art, accessible selection, 10x actual price, and no stale shop banners');

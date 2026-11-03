'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const {ROYAL_ITEMS}=require('../royal-economy');
const branded=ROYAL_ITEMS.filter(x=>x.brand);
assert.equal(ROYAL_ITEMS.length,40,'28 previous pieces and 12 photo-reference car models');
assert.equal(branded.length,12,'4 Rolls-Royce + 4 Bentley + 4 Aston Martin');
for(const brand of ['rolls-royce','bentley','aston-martin'])assert.equal(branded.filter(x=>x.brand===brand).length,4,'four '+brand+' variants');
assert.equal(new Set(branded.map(x=>x.id)).size,12,'brand stock-keeping units are unique');
assert(ROYAL_ITEMS.every(x=>BigInt(x.price)>=10n**16n),'all boutique items start at one gyeong');
assert(branded.every(x=>x.displayOnly&&x.category==='car'),'collector cars cannot enter avatar equipment');
assert(branded.every(x=>typeof x.photoFile==='string'&&/\.jpg$/i.test(x.photoFile)),'photo must be a real sourced JPG file');
assert(branded.every(x=>typeof x.photoBy==='string'&&typeof x.photoLicense==='string'&&x.photoLicense.length>2),'photographer and CC license credits');
for(const [id,stock,gyeong] of [
 ['car_royalboutique_rr_one',3,300],['car_royalboutique_bentley_emperor',5,500],
 ['car_royalboutique_aston_valhalla',3,700]]){
 const x=branded.find(z=>z.id===id);assert(x,id+' SKU');assert.equal(x.stock,stock);assert.equal(BigInt(x.price),BigInt(gyeong)*10n**16n);
}
const media=read('public/royal-photo.js');
const store=read('public/royal-economy-ui.js');
const museum=read('public/royal-gallery.js');
const app=read('public/app.js');
const html=read('public/index.html');
const css=read('public/royal-economy.css');
const gc=read('public/royal-gallery.css');
assert.match(media,/Special:FilePath/,'source photos are backed by Commons file links');
assert.match(media,/data-junja-photo/,'photographic fallback image interception');
assert.match(media,/dataset\.photoFallback/,'local art survives lost photo connections');
assert.match(store,/jrp-motors-hero/,'photo-first featured showroom');
assert.match(store,/jrp-motors-photo-row/,'three original brand models in showcase');
assert.match(store,/jrp-brand-nav/,'brand strip');
assert.match(store,/brands\.map/,'three brand options');
assert.match(store,/photoCredit\(featured\)/,'real photo credits in model details');
assert.match(store,/실차 참고 사진/,'disclose real production photos are representations of fictional editions');
assert.match(museum,/imageTag\(selected/,'public gallery uses real model photography');
assert.match(museum,/credit\(selected\)/,'gallery exhibits Commons author and license');
assert.match(museum,/brand-rolls-royce/,'owner gallery has Rolls-Royce filter');
assert.match(museum,/brand-bentley/,'owner gallery has Bentley filter');
assert.match(museum,/brand-aston-martin/,'owner gallery has Aston Martin filter');
assert.match(app,/data-junja-photo/,'friend profile image fallbacks supported');
assert.match(css,/@media\(max-width:700px\)/,'mobile photography gallery');
assert.match(gc,/jrg-real-photo/,'framed private garage photographs');
assert(html.indexOf('/royal-photo.js')>=0&&html.indexOf('/royal-photo.js')<html.indexOf('/app.js'),'shared media helper must load before profile renderer');
for(const p of ['app.js','royal-economy.css','royal-economy-ui.js','royal-gallery.js','royal-gallery.css'])assert(html.includes('/'+p+'?v=20261103-final-assets-v7'),'asset version bump '+p);
console.log('JUNJA_ROYAL_MOTORS_V6_OK: 12 real-photo brand collectibles, 1경+ prices, attribution and responsive museum/gallery integration');

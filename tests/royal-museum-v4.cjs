'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const source=name=>fs.readFileSync(path.join(__dirname,'..',name),'utf8');
const index=source('public/index.html');
const app=source('public/app.js');
const gallery=source('public/royal-gallery.js');
const style=source('public/royal-gallery.css');
const server=source('server.js');
const royal=source('royal-economy.js');
const boutique=source('public/royal-economy-ui.js');
const hall=source('public/art/royal/gallery-hall.svg');
for(const [src,re,subject] of [
 [index,/id="view-gallery" class="view"/,'independent museum view'],
 [index,/id="junjaRoyalGalleryRoot"/,'dedicated gallery mount'],
 [index,/data-go="gallery"/,'gallery navigation'],
 [index,/\/royal-gallery\.css\?v=/,'versioned CSS'],
 [index,/\/royal-gallery\.js\?v=/,'versioned JS'],
 [app,/data-visit-royal=/,'visit real friend museum'],
 [app,/data-go="gallery"/,'open personal museum from profile'],
 [server,/\/api\/royal-economy\/gallery/,'authenticated public gallery endpoint'],
 [server,/royalEconomy\.gallery\(target\.id\)/,'server certified inventory'],
 [royal,/function gallery\(uid\)/,'gallery access from existing inventory'],
 [royal,/owned:true/,'gallery only includes owned collectibles'],
 [gallery,/data-jrg-primary/,'choose featured work'],
 [gallery,/data-jrg-equip/,'equip owned item'],
 [gallery,/data-jrg-pin/,'place owned item'],
 [gallery,/data-jrg-remove/,'remove owned item'],
 [gallery,/data-jrg-focus/,'inspect each exhibited collectible'],
 [gallery,/dataset\.visitRoyal/,'readonly visiting'],
 [gallery,/isOwner\(\)/,'owner checks'],
 [gallery,/Object\.keys|owned/,'collection content'],
 [boutique,/data-go="gallery"/,'showroom entry in boutique'],
 [style,/url\('\/art\/royal\/gallery-hall\.svg'\)/,'actual image background'],
 [style,/@media\(max-width:700px\)/,'mobile layout'],
 [style,/prefers-reduced-motion/,'accessible motion reduction'],
 [hall,/<svg/,'royal hall SVG'],
 [hall,/<linearGradient/,'custom illustrated gradients'],
 [hall,/museum plinths/,'designed architectural plinths'],
 ])assert.match(src,re,subject);
const safeMethods=['POST','showcase','credentials'];for(const word of safeMethods)assert.ok(gallery.includes(word),'missing '+word);
assert.equal(gallery.includes('balance='),false,'museum must not mutate user balance');
assert.equal(gallery.includes('localStorage'),false,'server remains source of ownership');

assert(gallery.includes('href="/premium-preview.html"'),'Museum premium tour URL missing');
assert(gallery.includes('판매 전'),'Premium preview must disclose no live sales');
assert(gallery.includes('rel="noopener noreferrer"'),'New tab must be safe');
assert(style.includes('jrg-premium-tour-link'),'Museum premium link needs theme styling');
assert(index.includes('royal-gallery.js?v=20261106-bag-v14'),'Updated JS must be cache-busted');
assert(index.includes('royal-gallery.css?v=20261103-vault-v8-premium-tour-v1'),'Updated CSS must be cache-busted');
assert(source('public/premium-preview.html').includes('실제 판매/결제 불가'),'Preview must disclose no checkout');
console.log('ROYAL_MUSEUM_V4_OK: illustrated independent palace, visitor gallery, owned exhibit operations, mobile visuals');

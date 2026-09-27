'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const server=fs.readFileSync('server.js','utf8'),app=fs.readFileSync('public/app.js','utf8');
const begin=server.indexOf('const SHOP_ITEMS = ')+19,end=server.indexOf('\nconst SHOP_PERKS',begin);
const items=vm.runInNewContext(server.slice(begin,end).trim().replace(/;$/,''));
const reactions=vm.runInNewContext('('+server.slice(server.indexOf('const ROOM_REACTIONS = ')+'const ROOM_REACTIONS = '.length,server.indexOf('\n};',server.indexOf('const ROOM_REACTIONS = '))+2)+')');
const selected=items.filter(x=>x.collection==='godjunja'),categories=['character','frame','costume','title','pet','table_skin','card_back','bubble_pack'];
assert.equal(selected.length,11);assert.deepEqual([...new Set(selected.map(x=>x.category))].sort(),categories.sort());
const loads={1:{},2:{}},owned=new Set();
const ctx={SHOP_ITEMS:items,SHOP_BY_ID:Object.fromEntries(items.map(x=>[x.id,x])),ROOM_REACTIONS:reactions,LOADOUT_FIELDS:new Set(categories),ensureLoadout:id=>loads[id],inventoryIds:()=>owned,isHappyUser:()=>false,socialRankPerksForUser:()=>({shopTier:0}),cosmeticsPublic:id=>loads[id],db:{prepare:q=>({get:id=>({is_admin:id===1}),run:(item,id)=>{const category=q.match(/SET (\w+)=/)[1];if(q.includes('=NULL'))loads[item][category]=null;else loads[id][category]=item;}})}};
vm.createContext(ctx);
for(const name of ['shopState','equipShopItem','reactionAllowed']){const a=server.indexOf('function '+name+'('),b=server.indexOf('\nfunction ',a+1);vm.runInContext(server.slice(a,b),ctx);}
assert.equal(ctx.shopState(2).items.filter(x=>x.collection==='godjunja').length,0);
assert(ctx.shopState(1).items.filter(x=>x.collection==='godjunja').every(x=>x.owned));
for(const item of selected){assert(item.adminOnly);assert(!item.privateOnly);if(item.asset)assert(fs.existsSync('public'+item.asset));assert.throws(()=>ctx.equipShopItem(2,item.category,item.id),/관리자/);ctx.equipShopItem(1,item.category,item.id);assert.equal(loads[1][item.category],item.id);ctx.equipShopItem(1,item.category,'');assert.equal(loads[1][item.category],null);}
ctx.equipShopItem(1,'bubble_pack','bubble_godjunja_oracle');
for(const key of ['godone','godclass','godworld','godfate']){assert.equal(ctx.reactionAllowed(1,key),true);loads[2].bubble_pack='bubble_godjunja_oracle';assert.equal(ctx.reactionAllowed(2,key),false);assert(app.includes(key+':['));}
loads[1].bubble_pack=null;assert.equal(ctx.reactionAllowed(1,'godone'),false);assert.equal(ctx.reactionAllowed(2,'laugh'),true);
const ui={me:{avatar:0,nickname:'갓준자',cosmetics:{}},shopData:null,shopCategory:'godjunja',shopCharacterGender:'all',shopOwnedOnly:false,money:n=>String(n),window:{scrollTo(){}},console};
ui.me.cosmetics.character=selected.find(x=>x.id==='char_godjunja_signature');
vm.createContext(ui);
for(const name of ['html','cosmeticId','cosmeticIcon','styledAvatar','avatarImg','equippedTitle'])vm.runInContext(app.split('\n').find(l=>l.startsWith('function '+name+'(')),ui);
for(const name of ['SHOP_CATEGORY_LABELS','SHOP_RARITY_LABELS'])vm.runInContext(app.split('\n').find(l=>l.startsWith('const '+name+'=')),ui);
vm.runInContext(app.slice(app.indexOf('function shopPreview('),app.indexOf('\nfunction renderShop(')),ui);
const root={innerHTML:'',querySelectorAll:()=>[]};ui.$=q=>q==='#shopContent'?root:null;ui.$$=()=>[];
vm.runInContext(app.slice(app.indexOf('function renderShop('),app.indexOf('\nasync function loadShop(')),ui);
ui.shopData={items:selected.map(x=>({...x,owned:true})),loadout:{},ownedCount:11};ui.renderShop();assert.equal((root.innerHTML.match(/data-shop-equip=/g)||[]).length,11);assert(root.innerHTML.includes('god-vault'));
const cosmetics=Object.fromEntries(selected.map(x=>[x.category,x]));const avatar=ui.styledAvatar(0,'갓준자','profile-face',cosmetics);assert(avatar.includes('god-orbit'));assert(avatar.includes('god-costume-art'));assert(avatar.includes('god-pet-art'));assert(avatar.includes('god-name-seal'));
fs.writeFileSync('/tmp/god-shop-preview.html',root.innerHTML);fs.writeFileSync('/tmp/god-avatar-preview.html',avatar);
console.log('GOD_COLLECTION_OK: 8 categories, 11 items, admin equip/unequip, access denial, 4 reactions, shop render');

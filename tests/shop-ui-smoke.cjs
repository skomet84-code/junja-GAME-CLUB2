'use strict';
const fs=require('node:fs'),path=require('node:path');
const src=fs.readFileSync(path.join(__dirname,'..','public','app.js'),'utf8');
if(src.includes("$('[data-shop-buy]',root).forEach"))throw new Error('Broken shop purchase binding: single-element selector cannot use forEach');
if(!src.includes("root.querySelectorAll('[data-shop-buy]').forEach"))throw new Error('Native shop purchase binding missing');
console.log('SHOP_UI_TESTS_OK');

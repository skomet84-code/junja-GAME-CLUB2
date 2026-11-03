#!/usr/bin/env node
'use strict';
/*
  Pin licensed Wikimedia Commons photo thumbnails into public/art/royal/photos
  so iOS WebKit does not rely on hotlink redirects at runtime. This script is
  intended for GitHub Actions. It has no database or user-account access.
*/
const fs=require('node:fs/promises');
const path=require('node:path');
const {ROYAL_ITEMS}=require('../royal-economy');
const ROOT=path.join(__dirname,'..','public','art','royal','photos');
const EXT=new Set(['image/jpeg','image/png','image/webp']);
const UA='JUNJA-Land-Media-Archive/1.0 (licensed Commons images for game gallery; https://github.com/skomet84-code/junja-GAME-CLUB2)';
const MAX=5*1024*1024;
const pause=n=>new Promise(ok=>setTimeout(ok,n));
const valid=x=>typeof x==='string'&&x.length<150&&/\.(jpe?g|png)$/i.test(x);
const photoItems=ROYAL_ITEMS.filter(x=>valid(x.photoFile)&&/^[a-z0-9_]+$/.test(x.id));

async function download(url,tries=2){
 for(let attempt=0;attempt<tries;attempt++){
  try{
    const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),25000);
    try{
      const r=await fetch(url,{redirect:'follow',signal:controller.signal,
       headers:{'User-Agent':UA,'Accept':'image/jpeg,image/png,image/webp,*/*;q=0.2'}});
      const mime=(r.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
      if(!r.ok||!EXT.has(mime))throw Error('HTTP '+r.status+' content-type '+mime+' '+r.url.slice(0,120));
      const length=Number(r.headers.get('content-length')||0);
      if(length>MAX)throw Error('Source larger than 5MB');
      const data=Buffer.from(await r.arrayBuffer());
      if(data.length<1200||data.length>MAX)throw Error('Unexpected image size: '+data.length);
      if(!((data[0]===0xff&&data[1]===0xd8)||(data[0]===0x89&&data[1]===0x50)))throw Error('Image signature invalid');
      return data;
    }finally{clearTimeout(deadline)}
  }catch(e){if(attempt>=tries-1)throw e;await pause(1100*(attempt+1))}
 }
}
async function resolve(file){
 const title='File:'+file.replaceAll(' ','_');
 const api=new URL('https://commons.wikimedia.org/w/api.php');
 api.search=new URLSearchParams({action:'query',prop:'imageinfo',iiprop:'url',iiurlwidth:'960',titles:title,format:'json',formatversion:'2'}).toString();
 try{
  const controller=new AbortController(),deadline=setTimeout(()=>controller.abort(),16000);
  try{
    const r=await fetch(api.toString(),{signal:controller.signal,headers:{'User-Agent':UA,'Accept':'application/json'}});
    if(!r.ok)throw Error('API HTTP '+r.status);
    const json=await r.json();
    const info=json?.query?.pages?.[0]?.imageinfo?.[0];
    if(info?.thumburl?.startsWith('https://upload.wikimedia.org/'))return info.thumburl;
    if(info?.url?.startsWith('https://upload.wikimedia.org/'))return info.url;
    throw Error('Missing Commons thumbnail URL');
  }finally{clearTimeout(deadline)}
 }catch(e){
  console.warn('COMMONS_API_FALLBACK',file,e.message);
  return 'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(file)+'?width=960';
 }
}
async function one(item){
 const dest=path.join(ROOT,item.id+'.jpg');
 try{
  const stat=await fs.stat(dest);
  if(stat.size>1500){console.log('PHOTO_EXISTING',item.id,stat.size);return {id:item.id,bytes:stat.size,skipped:true}}
 }catch{}
 const link=await resolve(item.photoFile);
 let buffer;
 try{buffer=await download(link,2)}
 catch(e){
  const direct='https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(item.photoFile)+'?width=960';
  if(direct===link)throw e;
  buffer=await download(direct,2);
 }
 await fs.writeFile(dest,buffer);
 console.log('PHOTO_ARCHIVED',item.id,buffer.length);
 return {id:item.id,bytes:buffer.length,source:item.photoFile,license:item.photoLicense,author:item.photoBy};
}
async function main(){
 await fs.mkdir(ROOT,{recursive:true});
 const successes=[],errors=[];
 // Wikimedia Commons throttles bulk downloads; proceed serially and preserve provenance.
 for(const item of photoItems){
  try{successes.push(await one(item))}
  catch(e){console.error('PHOTO_ARCHIVE_ERROR',item.id,e.message);errors.push(item.id+': '+e.message)}
  await pause(350);
 }
 const manifest={
  generatedAt:new Date().toISOString(),licenseNotice:'Each picture retains the original Wikimedia Commons license. Attribution and original-source links are displayed in JUNJA LAND.',
  photos:successes.map(x=>{const item=photoItems.find(z=>z.id===x.id);return {...x,photoFile:item.photoFile,author:item.photoBy,license:item.photoLicense,source:'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(item.photoFile.replaceAll(' ','_'))}})
 };
 await fs.writeFile(path.join(ROOT,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
 console.log('PHOTO_ARCHIVE_SUMMARY',JSON.stringify({expected:photoItems.length,downloaded:successes.length,errors}));
 // A partial archive is still useful; do not falsely report missing files as present.
 if(errors.length)process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=1});

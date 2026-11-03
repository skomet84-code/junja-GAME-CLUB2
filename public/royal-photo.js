'use strict';
/* JUNJA luxury visuals. Actual model reference photographs from Wikimedia Commons.
 * All product images are sourced by trusted, static server catalog fields.
 * Preserve original local illustrations as graceful offline/network fallbacks.
 */
(()=>{
 const valid=name=>typeof name==='string'&&name.length<160&&/\.(jpe?g|png)$/i.test(name)&&!/[<>]/.test(name);
 const safeArt=art=>typeof art==='string'&&/^[a-z-]{2,40}$/.test(art)?art:'crown';
 const fallback=item=>'/art/royal/'+safeArt(item?.art)+'.svg';
 const credits=window.JunjaRoyalPhotoCredits||{};
 const verified=item=>item?.id&&Object.prototype.hasOwnProperty.call(credits,item.id)?credits[item.id]:null;
 const external=item=>valid(item?.photoFile)?'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(item.photoFile)+'?width=1000':null;
 const photo=item=>verified(item)?.file||external(item);
 const picture=item=>photo(item)||fallback(item);
 const sourceUrl=item=>verified(item)?.source||(valid(item?.photoFile)?'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(item.photoFile.replaceAll(' ','_')):null);
 const licenseUrl=item=>verified(item)?.licenseUrl||(item?.photoLicense==='CC0 1.0'?'https://creativecommons.org/publicdomain/zero/1.0/':
  item?.photoLicense==='CC BY-SA 4.0'?'https://creativecommons.org/licenses/by-sa/4.0/':
  'https://commons.wikimedia.org/wiki/Commons:Licensing');
 const creditName=item=>verified(item)?.author||item?.photoBy||'Wikimedia Commons';
 const licenseName=item=>verified(item)?.license||item?.photoLicense||'사진 이용 조건';
 const isPhoto=item=>!!photo(item);
 document.addEventListener('error',e=>{
  const img=e.target;
  if(!(img instanceof HTMLImageElement)||!img.hasAttribute('data-junja-photo'))return;
  if(img.dataset.photoFallbackDone)return;
  img.dataset.photoFallbackDone='1';
  const fb=img.dataset.photoFallback;
  if(fb&&fb.startsWith('/art/royal/')){
    img.src=fb;
    img.classList.add('jrp-media-fallback');
    img.closest('.jrp-real-photo,.jrg-real-photo')?.classList.add('jrp-photo-unavailable');
  }
 },true);
 window.JunjaRoyalMedia=Object.freeze({picture,photo,fallback,sourceUrl,licenseUrl,creditName,licenseName,isPhoto});
})();

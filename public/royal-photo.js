'use strict';
/* JUNJA luxury visuals. Actual model reference photographs from Wikimedia Commons.
 * All product images are sourced by trusted, static server catalog fields.
 * Preserve original local illustrations as graceful offline/network fallbacks.
 */
(()=>{
 const valid=name=>typeof name==='string'&&name.length<160&&/\.(jpe?g|png)$/i.test(name)&&!/[<>]/.test(name);
 const safeArt=art=>typeof art==='string'&&/^[a-z-]{2,40}$/.test(art)?art:'crown';
 const fallback=item=>'/art/royal/'+safeArt(item?.art)+'.svg';
 const remote=item=>valid(item?.photoFile)?'https://commons.wikimedia.org/wiki/Special:FilePath/'+encodeURIComponent(item.photoFile)+'?width=960':null;
 const photo=item=>valid(item?.photoFile)&&/^[a-z0-9_]+$/.test(item?.id||'')?'/art/royal/photos/'+item.id+'.jpg':null;
 const picture=item=>photo(item)||fallback(item);
 const sourceUrl=item=>valid(item?.photoFile)?'https://commons.wikimedia.org/wiki/File:'+encodeURIComponent(item.photoFile.replaceAll(' ','_')):null;
 const licenseUrl=item=>item?.photoLicense==='CC0 1.0'?'https://creativecommons.org/publicdomain/zero/1.0/':
  item?.photoLicense==='CC BY-SA 4.0'?'https://creativecommons.org/licenses/by-sa/4.0/':
  'https://commons.wikimedia.org/wiki/Commons:Licensing';
 const isPhoto=item=>!!photo(item);
 const cinemaRooms=Object.freeze({car:'car',watch:'watch',yacht:'yacht',jet:'jet',estate:'estate',frame:'jewelry',art:'jewelry',vault:'jewelry',title:'jewelry',costume:'jewelry',pet:'jewelry'});
 const scene=item=>'/art/royal/cinematic/'+(cinemaRooms[String(item?.category||'')]||'jewelry')+'-showroom.webp';
 document.addEventListener('error',e=>{
  const img=e.target;
  if(!(img instanceof HTMLImageElement)||!img.hasAttribute('data-junja-photo'))return;
  const stage=Number(img.dataset.photoFallbackStage||0);
  const remoteUrl=img.dataset.photoRemote;
  // First retry the Commons origin if a locally mirrored photograph is unavailable.
  if(stage===0&&/^https:\/\/commons\.wikimedia\.org\/wiki\/Special:FilePath\//.test(remoteUrl||'')){
    img.dataset.photoFallbackStage='1';
    img.src=remoteUrl;
    return;
  }
  if(stage>1)return;
  img.dataset.photoFallbackStage='2';
  const fb=img.dataset.photoFallback;
  if(fb&&fb.startsWith('/art/royal/')){
    img.src=fb;
    img.classList.add('jrp-media-fallback');
    img.closest('.jrp-real-photo,.jrg-real-photo')?.classList.add('jrp-photo-unavailable');
  }
 },true);
 window.JunjaRoyalMedia=Object.freeze({picture,photo,remote,fallback,sourceUrl,licenseUrl,isPhoto,scene});
})();

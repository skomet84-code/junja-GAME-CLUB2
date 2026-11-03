#!/usr/bin/env python3
"""Build locally hosted, licensed photorealistic JUNJA luxury catalog assets.
Run in CI with python scripts/build_royal_photos.py --items /tmp/royal-items.json.
Only public-domain / CC licenses from Wikimedia Commons are accepted.
"""
import argparse, html, io, json, os, re, sys, time
from pathlib import Path
from urllib.parse import quote
import requests
from PIL import Image, ImageOps, ImageEnhance, ImageFilter, ImageDraw

ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'public/art/royal/photos'
API='https://commons.wikimedia.org/w/api.php'
HEADERS={'User-Agent':'JunjaLandRoyalPhotoAssets/1.0 (https://github.com/skomet84-code/junja-GAME-CLUB2; asset verification)','Accept':'application/json, image/*;q=0.9, */*;q=0.4'}
LICENSES=('CC BY','CC0','PUBLIC DOMAIN','PD-','CC-BY')
session=requests.Session()
session.headers.update(HEADERS)

def get(params):
    for retry in range(3):
        try:
            r=session.get(API,params=params,timeout=35)
            r.raise_for_status()
            return r.json()
        except (requests.RequestException,ValueError) as e:
            if retry==2: raise
            time.sleep((retry+1)*3)

def clean(s):
    return html.unescape(re.sub(r'<[^>]*>','',str(s or ''))).strip().replace('\n',' ')[:200]

def fileinfo(name):
    name=name.removeprefix('File:').replace('_',' ')
    j=get({'action':'query','format':'json','prop':'imageinfo','titles':'File:'+name,'iiprop':'url|size|extmetadata','iiurlwidth':'1000','redirects':1})
    pages=j.get('query',{}).get('pages',{})
    for p in pages.values():
        if 'missing' in p or 'invalid' in p: return None
        arr=p.get('imageinfo',[])
        if not arr:return None
        info=arr[0]; meta=info.get('extmetadata',{})
        lic=clean(meta.get('LicenseShortName',{}).get('value',''))
        if not any(t in lic.upper() for t in LICENSES):return None
        if not (info.get('mime','image/jpeg') or '').startswith('image/'):return None
        author=clean(meta.get('Artist',{}).get('value','')) or 'Wikimedia Commons contributor'
        source=info.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/File:'+quote(name.replace(' ','_'))
        licenseurl=meta.get('LicenseUrl',{}).get('value','') or 'https://commons.wikimedia.org/wiki/Commons:Licensing'
        photo=info.get('thumburl') or info.get('url')
        return {'source':source,'url':photo,'author':author,'license':lic,'licenseUrl':licenseurl,'filename':name}
    return None

def search_alternatives(item):
    brand=item.get('brand','').replace('-',' ')
    model=item.get('model','').replace(' concept','').replace(' VIII','')
    if not brand:
        desc=item.get('name','')
        if item.get('category')=='watch':return ['Rolex Datejust watch']
        if item.get('category')=='yacht':return ['yacht Eclipse']
        if item.get('category')=='jet':return ['Gulfstream G650']
        return []
    if item['brand']=='aston-martin':brand='Aston Martin'
    if item['brand']=='rolls-royce':brand='Rolls Royce'
    return [brand+' '+model,brand+' '+model.split(' ')[0]]

def candidates(item):
    preferred=item.get('photoFile','')
    if preferred:yield preferred
    for q in search_alternatives(item):
        try:
            data=get({'action':'query','format':'json','list':'search','srnamespace':'6','srsearch':q+' filetype:bitmap','srlimit':12})
        except Exception as e:
            print('SEARCH_ERROR',item['id'],str(e),flush=True);continue
        for z in data.get('query',{}).get('search',[]):
            title=z.get('title','').removeprefix('File:')
            if re.search(r'\.(jpe?g|png|webp)$',title,re.I):
                # Prevent the wrong model or a generic grille detail from replacing a collector car.
                model=item.get('model','').replace(' concept','')
                token=(model.split(' ')[0] or '').lower()
                if item.get('brand') and token not in title.lower() and token!='phantom':continue
                yield title

def grade(img):
    """Gently polish actual photograph, preserving model/bodywork (no fake alteration)."""
    img=ImageOps.exif_transpose(img).convert('RGB')
    img.thumbnail((1080,750),Image.Resampling.LANCZOS)
    img=ImageEnhance.Contrast(img).enhance(1.08)
    img=ImageEnhance.Color(img).enhance(1.07)
    # Slight vignette to focus on the photographed car; no overpainting or model edits.
    from PIL import ImageChops
    width,height=img.size
    mask=Image.new('L',(width,height),0)
    md=ImageDraw.Draw(mask)
    md.ellipse((-int(width*.25),-int(height*.37),int(width*1.25),int(height*1.37)),fill=230)
    mask=mask.filter(ImageFilter.GaussianBlur(max(14,width//7)))
    dark=ImageEnhance.Brightness(img).enhance(.76)
    img=Image.composite(img,dark,ImageOps.invert(mask))
    return img

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--items',required=True)
    ap.add_argument('--min-items',type=int,default=13)
    args=ap.parse_args()
    items=[i for i in json.loads(Path(args.items).read_text()) if i.get('photoFile')]
    DEST.mkdir(parents=True,exist_ok=True)
    manifest={}
    missing=[]
    used={}
    for idx,item in enumerate(items):
        found=None
        seen=set()
        for name in candidates(item):
            if name.lower() in seen:continue
            seen.add(name.lower())
            try:
                info=fileinfo(name)
                if not info:continue
                response=session.get(info['url'],timeout=40,headers={'Accept':'image/avif,image/webp,image/jpeg,image/png,*/*'})
                response.raise_for_status()
                if len(response.content)>15*1024*1024:continue
                orig=Image.open(io.BytesIO(response.content))
                if orig.width<400 or orig.height<250:continue
                edited=grade(orig)
                out=DEST/(item['id']+'.webp')
                edited.save(out,'WEBP',quality=83,method=5)
                info.pop('url',None)
                info['file']='/'+str(out.relative_to(ROOT/'public')).replace('\\','/')
                info['width'],info['height']=edited.size
                info['transformation']='Resized for WebP display, slight contrast/color grading and vignette'
                manifest[item['id']]=info
                print('OK',item['id'],info['filename'],out.stat().st_size,flush=True)
                found=True
                break
            except Exception as e:
                print('CANDIDATE_FAILED',item['id'],name,repr(e)[:240],flush=True)
                continue
        if not found:
            missing.append(item['id'])
            print('MISSING',item['id'],item.get('photoFile',''),flush=True)
        time.sleep(.2)
    manifestpath=ROOT/'public/art/royal/photos/credits.json'
    manifestpath.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    js=ROOT/'public/royal-photo-credits.js'
    js.write_text('/* Auto-generated verified Wikimedia Commons credits. */\nwindow.JunjaRoyalPhotoCredits=Object.freeze('+json.dumps(manifest,ensure_ascii=False,separators=(',',':'))+');\n')
    print('RESULT',len(manifest),'/',len(items),'missing',missing,flush=True)
    if len(manifest)<args.min_items:
        print('ERROR: not enough licensed, locally hosted real images',file=sys.stderr)
        return 2
    return 0

if __name__=='__main__':sys.exit(main())

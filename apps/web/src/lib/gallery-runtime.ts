/** Shared non-blocking photo state for the three object/case viewer implementations.
 * Index/counter update synchronously on each interaction; fetching NEVER gates clicks.
 */
export function createPhotoPreloader(maxEntries=8){
 const pool=new Map<string,HTMLImageElement>();
 return {
   warm(src:string){
     if(!src || pool.has(src))return;
     const img=new Image();
     img.decoding='async';img.src=src;
     pool.set(src,img);
     while(pool.size>maxEntries)pool.delete(pool.keys().next().value!);
   },
   neighbors(images:string[],index:number){
     if(images.length<2)return;
     this.warm(images[(index+1)%images.length]);
     this.warm(images[(index+images.length-1)%images.length]);
   },
   clear(){pool.clear();}
 };
}
export function setViewerPhoto(img:HTMLImageElement|undefined|null, src:string, alt:string){
 if(!img)return;
 // The next index is registered before image decode starts; no load-await or button disabling.
 img.setAttribute('aria-busy','true');
 const expected=src;
 img.onload=()=>{if(img.getAttribute('src')===expected)img.removeAttribute('aria-busy')};
 img.onerror=()=>{if(img.getAttribute('src')===expected){img.removeAttribute('aria-busy');img.dataset.loadError='true'}};
 img.removeAttribute('data-load-error');
 img.alt=alt;
 img.src=src;
 if(img.complete){img.removeAttribute('aria-busy');}
}

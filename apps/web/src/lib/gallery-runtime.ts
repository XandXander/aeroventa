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
 // Postbuild adds responsive sets to static images. A viewer changes subjects;
 // its initial srcset must never keep displaying the previous subject.
 img.removeAttribute('srcset');img.removeAttribute('sizes');
 // Never show a previous object's photo while the newly selected resource loads.
 img.removeAttribute('src');
 const expected=src;
 img.parentElement?.querySelector('[data-gallery-load-error]')?.remove();
 img.onload=()=>{if(img.getAttribute('src')===expected)img.removeAttribute('aria-busy')};
 img.onerror=()=>{
   if(img.getAttribute('src')!==expected)return;
   img.removeAttribute('aria-busy');img.dataset.loadError='true';
   const message=document.createElement('p');
   message.dataset.galleryLoadError='';message.className='gallery-load-error';
   message.setAttribute('role','status');
   message.textContent='Фотография не загрузилась. Выберите другой кадр или откройте просмотр заново.';
   img.after(message);
 };
 img.removeAttribute('data-load-error');
 img.alt=alt;
 img.src=src;
 if(img.complete){img.removeAttribute('aria-busy');}
}

/** Same fit, keyboard zoom and touch behavior for documentary photo viewers. */
export function bindPhotoZoom(dialog:HTMLDialogElement|null,stage:HTMLElement|null|undefined,img:HTMLImageElement|null|undefined,onSwipe:(step:number)=>void){
 if(!dialog||!stage||!img)return {reset(){},toggle(){}};
 stage.tabIndex=0;
 stage.setAttribute('role','group');
 stage.setAttribute('aria-label','Фотография. Плюс и минус — масштаб, 0 — вписать. Стрелки перемещают увеличенное изображение.');
 let scale=1,pinchDistance=0,pinchScale=1,start:{x:number;y:number}|null=null;
 const set=(value:number)=>{
   scale=Math.max(1,Math.min(4,value));
   dialog.dataset.zoom=String(scale);dialog.classList.toggle('is-photo-zoomed',scale>1);
   const zoomButton=dialog.querySelector<HTMLElement>('[data-case-zoom]');
   zoomButton?.setAttribute('aria-pressed',String(scale>1));
   zoomButton?.setAttribute('aria-label',scale>1?'Вписать фотографию в экран':'Увеличить фотографию');
   if(scale===1){
     for(const name of ['width','height','max-width','max-height'])img.style.removeProperty(name);
     for(const name of ['display','overflow','align-items','justify-content'])stage.style.removeProperty(name);
     stage.scrollTo({left:0,top:0});return;
   }
   const css=getComputedStyle(stage);
   const width=stage.clientWidth-parseFloat(css.paddingLeft)-parseFloat(css.paddingRight);
   const height=stage.clientHeight-parseFloat(css.paddingTop)-parseFloat(css.paddingBottom);
   const ratio=img.naturalWidth&&img.naturalHeight?img.naturalWidth/img.naturalHeight:1.4;
   const fit=Math.min(width,height*ratio,img.naturalWidth||1600);
   img.style.width=Math.round(Math.max(100,fit)*scale)+'px';
   img.style.maxWidth='none';img.style.maxHeight='none';img.style.height='auto';
   stage.style.display='flex';stage.style.overflow='auto';stage.style.alignItems='flex-start';stage.style.justifyContent='flex-start';
 };
 const reset=()=>set(1);
 stage.addEventListener('keydown',event=>{if(scale>1&&event.key.startsWith('Arrow'))event.stopPropagation();});
 dialog.addEventListener('keydown',event=>{
   if(['+','=','-','_','0'].includes(event.key)){
     event.preventDefault();set(event.key==='0'?1:scale+(['+','='].includes(event.key) ? 0.35 : -0.35));
   }
 });
 stage.addEventListener('dblclick',event=>{event.preventDefault();set(scale>1?1:2);});
 stage.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();set(scale*(event.deltaY<0?1.15:1/1.15));},{passive:false});
 const distance=(a:Touch,b:Touch)=>Math.hypot(a.clientX-b.clientX,a.clientY-b.clientY);
 stage.addEventListener('touchstart',event=>{
   const first=event.touches[0];
   start=event.touches.length===1&&first?{x:first.clientX,y:first.clientY}:null;
   if(event.touches.length===2){pinchDistance=distance(event.touches[0],event.touches[1]);pinchScale=scale;event.preventDefault();}
 },{passive:false});
 stage.addEventListener('touchmove',event=>{
   if(event.touches.length===2&&pinchDistance>0){set(pinchScale*distance(event.touches[0],event.touches[1])/pinchDistance);start=null;event.preventDefault();}
 },{passive:false});
 stage.addEventListener('touchend',event=>{
   const end=event.changedTouches[0];
   if(start&&end&&scale===1){const dx=end.clientX-start.x,dy=end.clientY-start.y;if(Math.abs(dx)>55&&Math.abs(dx)>Math.abs(dy))onSwipe(dx<0?1:-1);}
   start=null;if(event.touches.length<2)pinchDistance=0;
 },{passive:true});
 reset();return {reset,toggle(){set(scale>1?1:2)}};
}

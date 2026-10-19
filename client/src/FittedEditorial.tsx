import {useLayoutEffect,useRef} from 'react';

/** Keep each editorial item intact, including the author's paragraph breaks. */
export function FittedEditorial({body,title,attribution,quote=false}:{body:string;title?:string|null;attribution?:string|null;quote?:boolean}) {
 const box=useRef<HTMLDivElement>(null),content=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const container=box.current,element=content.current;
  if(!container||!element)return;
  let disposed=false;
  const fit=()=>{
   if(disposed||!container.clientWidth||!container.clientHeight)return;
   const preferred=parseFloat(getComputedStyle(container).getPropertyValue('--editorial-preferred-size'))||22;
   let low=.5,high=preferred;
   // Measure in layout pixels: the public canvas may itself be scaled for a TV or mosaic.
   const fits=(size:number)=>{
    element.style.fontSize=`${size}px`;
    return element.scrollHeight<=container.clientHeight-1&&element.scrollWidth<=container.clientWidth;
   };
   if(!fits(high)){
    for(let i=0;i<12;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid;}
    element.style.fontSize=`${Math.floor(low*10)/10}px`;
   }
  };
  fit();
  const observer=new ResizeObserver(fit);observer.observe(container);
  window.addEventListener('resize',fit);
  void document.fonts.ready.then(fit);
  return()=>{disposed=true;observer.disconnect();window.removeEventListener('resize',fit);};
 },[body,title,attribution,quote]);
 return <div ref={box} className={`fitted-editorial ${quote?'fitted-quote':''}`}><div ref={content} className="fitted-editorial-content">{title&&<h3 className="editorial-title">{title}</h3>}<p className="editorial-body">{body}</p>{attribution&&<p className="editorial-attribution">{attribution}</p>}</div></div>;
}

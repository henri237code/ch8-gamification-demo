/** Pages bounded by content length, including unbroken text pasted by an admin. */
export function textPages(text:string,limit=140):string[] {
  const pages:string[]=[];let page='';
  for(const word of text.trim().split(/\s+/)) {
    if(!word)continue;
    if(word.length>limit) {
      if(page){pages.push(page);page='';}
      for(let i=0;i<word.length;i+=limit) pages.push(word.slice(i,i+limit));
      continue;
    }
    if(page&&page.length+word.length+1>limit){pages.push(page);page='';}
    page+=(page?' ':'')+word;
  }
  if(page)pages.push(page);
  return pages.length?pages:[''];
}
/** Traverse every page of each item before switching items; no skipped pages. */
export function rotatingEntry<T>(entries:T[],rotation:number,text:(entry:T)=>string,limit=140) {
  const pages=entries.flatMap(entry=>textPages(text(entry),limit).map((body,index,all)=>({entry,body,index,total:all.length})));
  return pages.length?pages[rotation%pages.length]:undefined;
}
/** Preserve gaps for missing observations and never convert null into a zero. */
export function chartSegments(values:(number|null)[],max:number,width=500,height=140,min=0) {
  const groups:string[]=[];let points:string[]=[];
  values.forEach((v,i)=>{
    if(v===null){if(points.length)groups.push(points.join(' '));points=[];}
    else points.push(`${45+i*(width-65)/Math.max(1,values.length-1)},${height-20-(v-min)/Math.max(Number.EPSILON,max-min)*(height-40)}`);
  });
  if(points.length)groups.push(points.join(' '));return groups;
}

/** Keep every team, including ties, while putting the leading team in the centre. */
export function podiumOrder<T extends {rank:number|null}>(teams:T[]) {
  const sorted=[...teams].sort((a,b)=>(a.rank??Infinity)-(b.rank??Infinity));
  return sorted.length>1?[sorted[1],sorted[0],...sorted.slice(2)]:sorted;
}

/** 1A measures the editable goal only; 1D keeps its separate capacity-based yield. */
export function goalProgressColor(progress:number):'red'|'orange'|'green'|'blue'|'unknown' {
 if(!Number.isFinite(progress)||progress<0)return 'unknown';
 return progress<.5?'red':progress<.7?'orange':progress<.85?'green':'blue';
}

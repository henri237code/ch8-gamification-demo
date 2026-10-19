// Stable inputs, independent of opening time and database-generated identifiers.
// These are fictional demonstration parameters, not measured CH8 standards.
export function shiftPace(startsAt:string,teamId:number,seed:number) {
  const key=`${startsAt}:${teamId}:${seed}:production-v2`;
  let hash=2166136261;
  for(let i=0;i<key.length;i++) hash=Math.imul(hash^key.charCodeAt(i),16777619)>>>0;
  return 0.88+(hash%27)/100;
}

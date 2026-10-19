export const EXPRESS_PRESETS=[
 {code:'sprint',title:'Sprint',description:'Atteignez 500 bouteilles en 20 minutes sans arrêt de ligne.',duration:20,target:500,badge:'SPRINT',color:'#fb923c',rules:{metric:'total',noStops:true}},
 {code:'quality',title:'Qualité maîtrisée',description:'Produisez 300 bouteilles conformes en 10 minutes, avec au moins 99 % de conformité.',duration:10,target:300,badge:'QUALITÉ',color:'#34d399',rules:{metric:'good',minQuality:0.99}},
 {code:'steady',title:'Cadence régulière',description:'Produisez au moins 125 bouteilles conformes sur chacune des trois périodes de 5 minutes.',duration:15,target:3,badge:'RÉGULARITÉ',color:'#38bdf8',rules:{metric:'buckets',bucketMinutes:5,bucketTarget:125}},
 {code:'vigilance',title:'Œil vigilant',description:'Signalez une anomalie utile pendant ces 20 minutes et obtenez sa validation par le manager avant la fin.',duration:20,target:1,badge:'VIGILANCE',color:'#a78bfa',rules:{metric:'validated_anomaly'}},
 {code:'kaizen',title:'Idée utile',description:'Proposez une idée d’amélioration pendant ces 30 minutes et faites-la valider par le manager avant la fin.',duration:30,target:1,badge:'KAIZEN',color:'#facc15',rules:{metric:'validated_kaizen'}}
] as const;

/** Keep historical instance rules intact; calibrate only newly assigned challenges. */
export function calibratedPreset<T extends {code:string;target_value:number;description:string;rules_json:string}>(p:T):T {
 const targets:Record<string,number>={sprint:9000,quality:4500};
 const descriptions:Record<string,string>={sprint:'Atteignez 9 000 bouteilles en 20 minutes sans arrêt de ligne.',quality:'Produisez 4 500 bouteilles conformes en 10 minutes, avec au moins 99 % de conformité.',steady:'Produisez au moins 2 000 bouteilles conformes sur chacune des trois périodes de 5 minutes.'};
 return {...p,target_value:targets[p.code]??p.target_value,description:descriptions[p.code]??p.description,rules_json:p.code==='steady'?JSON.stringify({...JSON.parse(p.rules_json),bucketTarget:2000}):p.rules_json};
}

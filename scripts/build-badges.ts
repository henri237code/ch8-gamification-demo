// Native SVG assets: no downloaded artwork or external image dependency.
import {mkdirSync,writeFileSync} from 'node:fs';
import {openDatabase,seedReference} from '../server/src/db.js';
const db=openDatabase(':memory:');seedReference(db);
const badges=db.prepare('SELECT * FROM badge_definitions ORDER BY month').all() as {code:string;month:number;title:string;description:string;icon_code:string;color:string}[];
const months=['JANVIER','FÉVRIER','MARS','AVRIL','MAI','JUIN','JUILLET','AOÛT','SEPTEMBRE','OCTOBRE','NOVEMBRE','DÉCEMBRE'];
const icons:Record<string,string>={
 shield:'<path d="M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
 hands:'<path d="m3 12 5-5 4 2 4-2 5 5-7 7h-4Z"/><path d="m8 7 4 5 4-3M8 14l5 5M5 11l-2 3 3 3M19 11l2 3-3 3"/>',
 eye:'<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
 check:'<circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/>',
 heart:'<path d="M12 20 4 12C-1 5 8 1 12 7c4-6 13-2 8 5Z"/>',
 users:'<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-4-6"/>',
 spark:'<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
 'arrow-up':'<path d="M12 21V4m-7 7 7-7 7 7M4 21h16"/>',
 flag:'<path d="M5 22V3h14l-3 4 3 4H5"/>',
 target:'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
 star:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1Z"/>',
 award:'<circle cx="12" cy="9" r="6"/><path d="m7 13-2 9 7-4 7 4-2-9"/>'
};
const escape=(s:string)=>s.replaceAll('&','&amp;').replaceAll('<','&lt;');
function emblem(b:typeof badges[number]) {return `<defs><linearGradient id="g-${b.code}" x2="1" y2="1"><stop stop-color="${b.color}"/><stop offset="1" stop-color="#e9d5a2"/></linearGradient></defs>
<path d="m96 135-22 44 25-6 12 20 17-47 17 47 12-20 25 6-22-44" fill="${b.color}" opacity=".35"/>
<path d="M128 22 194 49v55c0 49-66 76-66 76S62 153 62 104V49Z" fill="#13251f" stroke="url(#g-${b.code})" stroke-width="3"/>
<path d="M128 32 185 55v49c0 39-57 65-57 65s-57-26-57-65V55Z" fill="none" stroke="${b.color}" stroke-opacity=".24"/>
<circle cx="128" cy="91" r="33" fill="${b.color}" fill-opacity=".1"/>
<g transform="translate(105 68) scale(1.92)" fill="none" stroke="${b.color}" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round">${icons[b.icon_code]}</g>
<text x="128" y="144" text-anchor="middle" fill="#e9d5a2" font-size="11" font-family="Arial" letter-spacing="2">SÉCURITÉ</text>`;}
mkdirSync('public/badges',{recursive:true});mkdirSync('docs/previews',{recursive:true});
for(const b of badges) writeFileSync(`public/badges/${b.code}.svg`,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 210" role="img"><title>${escape(b.title)}</title>${emblem(b)}</svg>`);
const cards=badges.map((b,i)=>{
 const x=34+(i%4)*282,y=126+Math.floor(i/4)*282;
 return `<g transform="translate(${x} ${y})"><rect width="264" height="264" rx="18" fill="#11251f" stroke="#254135"/>
<text x="18" y="28" fill="${b.color}" font-family="Arial" font-size="10" letter-spacing="2">${months[i]}</text>
<g transform="translate(38 26) scale(.73)">${emblem(b)}</g>
<text x="132" y="212" text-anchor="middle" fill="#f1f5e9" font-size="15" font-family="Arial">${escape(b.title)}</text>
<text x="132" y="239" text-anchor="middle" fill="#88a995" font-size="11" font-family="Arial">Reconnaissance attribuée par le manager</text></g>`;
}).join('');
writeFileSync('docs/previews/badges-securite.svg',`<svg xmlns="http://www.w3.org/2000/svg" width="1180" height="1010" viewBox="0 0 1180 1010"><rect width="1180" height="1010" fill="#091a14"/><text x="34" y="46" fill="#d1b877" font-size="12" letter-spacing="3" font-family="Arial">CH8 · CATALOGUE DE DÉMONSTRATION</text><text x="34" y="83" fill="#f1f5e9" font-size="27" font-family="Arial">Douze badges de reconnaissance sécurité</text><text x="34" y="108" fill="#88a995" font-size="13" font-family="Arial">Première proposition visuelle · nom, icône et couleur reliés au catalogue SQLite</text>${cards}<text x="34" y="999" fill="#88a995" font-size="11" font-family="Arial">L’attribution est manuelle et ne constitue pas une certification de sécurité.</text></svg>`);
db.close();console.log('Douze assets SVG et une planche de présentation créés.');

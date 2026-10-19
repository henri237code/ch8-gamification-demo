import Database from 'better-sqlite3';
import {EXPRESS_PRESETS} from './express-presets.js';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
export type DB = Database.Database;
export function openDatabase(filename = resolve('data/ch8.sqlite')): DB {
  if (filename !== ':memory:') mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma('foreign_keys = ON');
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const dir = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const name of readdirSync(dir).filter(n => n.endsWith('.sql')).sort()) {
    if (db.prepare('SELECT 1 FROM schema_migrations WHERE name=?').get(name)) continue;
    try {
      // Migration SQL owns its transaction; record it before COMMIT atomically.
      const sql = readFileSync(resolve(dir, name), 'utf8');
      db.exec(sql.replace(/COMMIT;\s*$/, ''));
      db.prepare('INSERT INTO schema_migrations VALUES (?,?)').run(name, new Date().toISOString());
      db.exec('COMMIT');
    } catch (error) { if (db.inTransaction) db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}
export function seedReference(db: DB) {
  db.transaction(() => {
    EXPRESS_PRESETS.forEach((p,i)=>db.prepare(`INSERT OR IGNORE INTO express_challenge_presets(code,title,description,duration_minutes,target_value,bonus_points,badge_title,badge_asset_path,card_asset_path,color,rules_json,display_order) VALUES (?,?,?,?,?,50,?,?,?,?,?,?)`).run(p.code,p.title,p.description,p.duration,p.target,p.badge,`/challenges/${p.code}.svg`,`/challenges/${p.code}-card.svg`,p.color,JSON.stringify(p.rules),i+1));
    db.prepare("INSERT OR IGNORE INTO lines VALUES (1,'CH8','Chaîne 8 — site de demonstration','Africa/Douala',45000)").run();
    ['Equipe A', 'Equipe B', 'Equipe C'].forEach((name, i) => {
      db.prepare('INSERT OR IGNORE INTO teams VALUES (?,1,?,?)').run(i + 1, `T${i + 1}`, name);
      db.prepare('INSERT OR IGNORE INTO people(id,display_name,birthday_month,birthday_day) VALUES (?,?,?,?)').run(i + 1, name, 10, 10 + i * 5);
      db.prepare("INSERT OR IGNORE INTO team_memberships VALUES (?,?,?,'opérateur','2026-01-01T00:00:00.000Z',NULL)").run(i + 1, i + 1, i + 1);
    });
    db.prepare("INSERT OR IGNORE INTO team_weather(team_id,mood,fatigue,note,source,updated_at) SELECT id,3,3,'','demo_default','1970-01-01T00:00:00.000Z' FROM teams").run();
    db.prepare("INSERT OR IGNORE INTO manager_accounts(id,login,password_hash,role,enabled) VALUES (1,'demo','NO_PASSWORD_LOGIN','admin',0)").run();
    db.prepare("INSERT OR IGNORE INTO products VALUES (1,'EXP65C','Bière — démonstration',650,NULL)").run();
    ['DPAL','DECAIS','LAV','SOUT','PASTO','ETIQ','ENCAIS','PAL'].forEach((code, i) => {
      db.prepare('INSERT OR IGNORE INTO machines VALUES (?,1,?,?,?,45000)').run(i + 1, code, code === 'SOUT' ? 'Soutireuse' : code, i);
    });
    [['Matin','06:00','14:00',0],['Après-midi','14:00','22:00',0],['Nuit','22:00','06:00',1]].forEach((s, i) => {
      db.prepare('INSERT OR IGNORE INTO shift_templates VALUES (?,1,?,?,?,?)').run(i + 1, ...s);
    });
    db.prepare("INSERT OR IGNORE INTO scoring_rule_versions VALUES (1,'Bouteilles et bonus',1,?,1,'2026-01-01T00:00:00.000Z')").run(JSON.stringify({ bottlePoints: 1, qualityBonus: 50, overTargetPer100: 10, demo: true }));
    ['Objectif et record','Interruption et anomalie','Progression collective','Dépasser le quart précédent','Passage de quart'].forEach((title,i) => {
      db.prepare('INSERT OR IGNORE INTO scenarios VALUES (?,?,?,?,?)').run(i + 1, `scenario-${i + 1}`, title, 'Scénario fictif CH8', JSON.stringify({ seed: 101 + i }));
    });
    db.prepare("INSERT OR IGNORE INTO stop_reasons VALUES (1,'SIMPLE','Interruption simple simulée','operator_action')").run();
    db.prepare("INSERT OR IGNORE INTO stop_reasons VALUES (2,'PILOT','Interruption déclenchée par le présentateur','operator_action')").run();
    const quotes = [
      'Chaque geste précis contribue à une réussite collective.', 'Une anomalie signalée est une amélioration qui commence.',
      'La qualité se construit ensemble, bouteille après bouteille.', 'Un objectif partagé donne du sens à chaque effort.',
      'Nos progrès se mesurent aussi aux idées que nous partageons.', 'Une équipe attentive est une équipe qui avance.',
      'La sécurité accompagne chacune de nos réussites.', 'Reconnaître un effort, c’est encourager le suivant.',
      'Les petites améliorations préparent les grandes réussites.', 'Notre meilleur résultat commence par notre entraide.'
    ];
    quotes.forEach((body, i) => db.prepare("INSERT OR IGNORE INTO editorial_contents(id,line_id,kind,body,attribution,created_by,status,created_at,updated_at) VALUES (?,1,'quote',?,'Citation originale de démonstration',1,'published','2026-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z')").run(i + 1, body));
    const badges=[
      ['Vigilance collective','Observer et partager les situations à améliorer','shield','#38bdf8'],
      ['Entraide sécurité','Veiller ensemble aux bonnes pratiques','hands','#a78bfa'],
      ['Attention aux détails','Reconnaître les gestes attentifs','eye','#34d399'],
      ['Prévention en action','Valoriser les initiatives de prévention','check','#fbbf24'],
      ['Esprit sécurité','Partager une culture de prévention','heart','#fb7185'],
      ['Équipe attentive','Écouter et accompagner ses collègues','users','#22d3ee'],
      ['Réflexes partagés','Diffuser les bonnes pratiques','spark','#c084fc'],
      ['Amélioration continue','Faire progresser la prévention','arrow-up','#4ade80'],
      ['Anomalies signalées','Reconnaître les remontées utiles','flag','#fb923c'],
      ['Gestes maîtrisés','Valoriser le respect des pratiques validées','target','#60a5fa'],
      ['Engagement collectif','Reconnaître la participation de l’équipe','star','#facc15'],
      ['Sécurité au quotidien','Célébrer l’attention tout au long de l’année','award','#2dd4bf']
    ];
    badges.forEach(([title,description,icon,color],i)=>db.prepare('INSERT OR IGNORE INTO badge_definitions VALUES (?,?,?,?,?,?)').run(`safety-${String(i+1).padStart(2,'0')}`,i+1,title,description,icon,color));
    [
      ['congratulations','Félicitations à une équipe','Félicitations à l’équipe {team} pour votre engagement collectif !'],
      ['objective','Objectif atteint','Bravo à l’équipe {team} : l’objectif du quart a été atteint !'],
      ['improvement','Progrès collectif','Merci à l’équipe {team} pour les progrès réalisés ensemble.'],
      ['reporting','Remontée utile','Merci à l’équipe {team} pour cette remontée utile à toute la chaîne.'],
      ['safety','Reconnaissance sécurité','Félicitations à l’équipe {team} pour votre engagement en faveur de la sécurité.']
    ].forEach(([code,title,body])=>db.prepare('INSERT OR IGNORE INTO message_templates VALUES (?,?,?)').run(code,title,body));
    [
      ['Atteindre l’objectif du quart','shift_target'],
      ['Dépasser un quart comparable','beat_reference'],
      ['Sprint de bouteilles conformes','timed_good_production']
    ].forEach(([title,type],i)=>db.prepare('INSERT OR IGNORE INTO challenge_definitions(id,line_id,title,type,conditions_json,bonus_points) VALUES (?,1,?,?,?,50)').run(i+1,title,type,JSON.stringify({demo:true,bonusCapPerShift:100})));
  })();
}

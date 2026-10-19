-- Prototype CH8 : schéma initial, application et jeu de données non encore créés.
-- Les dates sont stockées en UTC (ISO 8601), affichage et quarts en Africa/Douala.
-- Activer foreign_keys sur CHAQUE connexion. Les quantités sont des bouteilles,
-- les durées des secondes et l'énergie des Wh. Pas de dates personnelles réelles.
PRAGMA foreign_keys = ON;
BEGIN;

CREATE TABLE lines (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 timezone TEXT NOT NULL DEFAULT 'Africa/Douala', nominal_bph INTEGER CHECK(nominal_bph > 0)
);
CREATE TABLE teams (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 code TEXT NOT NULL, name TEXT NOT NULL, UNIQUE(line_id, code)
);
CREATE TABLE people (
 id INTEGER PRIMARY KEY, display_name TEXT NOT NULL, avatar_path TEXT,
 birthday_month INTEGER CHECK(birthday_month BETWEEN 1 AND 12),
 birthday_day INTEGER CHECK(birthday_day BETWEEN 1 AND 31),
 is_fictional INTEGER NOT NULL DEFAULT 1 CHECK(is_fictional IN (0,1)),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 created_at TEXT, updated_at TEXT
);
CREATE TABLE team_memberships (
 id INTEGER PRIMARY KEY, person_id INTEGER NOT NULL REFERENCES people(id),
 team_id INTEGER NOT NULL REFERENCES teams(id), role TEXT NOT NULL,
 starts_at TEXT NOT NULL, ends_at TEXT, CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE manager_accounts (
 id INTEGER PRIMARY KEY, person_id INTEGER REFERENCES people(id),
 login TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
 role TEXT NOT NULL CHECK(role IN ('manager','presenter','admin')),
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE products (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
 bottle_ml INTEGER NOT NULL CHECK(bottle_ml > 0), image_path TEXT
);
CREATE TABLE machines (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 code TEXT NOT NULL, name TEXT NOT NULL, display_order INTEGER NOT NULL,
 nominal_bph INTEGER CHECK(nominal_bph > 0), UNIQUE(line_id, code)
);
CREATE TABLE shift_templates (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 name TEXT NOT NULL, start_local TEXT NOT NULL, end_local TEXT NOT NULL,
 end_day_offset INTEGER NOT NULL CHECK(end_day_offset IN (0,1)), UNIQUE(line_id,name)
);
CREATE TABLE scoring_rule_versions (
 id INTEGER PRIMARY KEY, name TEXT NOT NULL, version INTEGER NOT NULL,
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 provisional INTEGER NOT NULL DEFAULT 1 CHECK(provisional IN (0,1)),
 created_at TEXT NOT NULL, UNIQUE(name,version)
);
CREATE TABLE scenarios (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL,
 description TEXT NOT NULL, seed_json TEXT NOT NULL CHECK(json_valid(seed_json))
);
CREATE TABLE scenario_steps (
 id INTEGER PRIMARY KEY, scenario_id INTEGER NOT NULL REFERENCES scenarios(id),
 position INTEGER NOT NULL, offset_seconds INTEGER NOT NULL CHECK(offset_seconds >= 0),
 event_type TEXT NOT NULL, payload_json TEXT NOT NULL CHECK(json_valid(payload_json)),
 UNIQUE(scenario_id,position)
);

-- Chaque exécution reçoit un nouvel identifiant. L'historique fictif de sept
-- jours / mois est rattaché à cette même exécution, pas partagé entre scénarios.
CREATE TABLE simulation_runs (
 id INTEGER PRIMARY KEY, scenario_id INTEGER NOT NULL REFERENCES scenarios(id),
 line_id INTEGER NOT NULL REFERENCES lines(id),
 scoring_rule_id INTEGER NOT NULL REFERENCES scoring_rule_versions(id),
 status TEXT NOT NULL CHECK(status IN ('ready','running','paused','archived')),
 clock_mode TEXT NOT NULL DEFAULT 'scenario' CHECK(clock_mode IN ('real','scenario')),
 simulated_at TEXT NOT NULL, speed REAL NOT NULL DEFAULT 1 CHECK(speed > 0),
 seed INTEGER NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE active_simulation (
 singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
 run_id INTEGER NOT NULL UNIQUE REFERENCES simulation_runs(id)
);
-- La simulation normale reste référencée même quand le public voit un scénario.
CREATE TABLE normal_simulation (
 singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
 run_id INTEGER NOT NULL UNIQUE REFERENCES simulation_runs(id)
);
CREATE TABLE shifts (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 template_id INTEGER NOT NULL REFERENCES shift_templates(id),
 team_id INTEGER NOT NULL REFERENCES teams(id), supervisor_id INTEGER REFERENCES people(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('planned','active','completed')),
 historical_seed INTEGER NOT NULL DEFAULT 0 CHECK(historical_seed IN (0,1)),
 CHECK(ends_at > starts_at), UNIQUE(run_id,template_id,starts_at)
);
CREATE TABLE planned_breaks (
 id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, reason TEXT NOT NULL,
 CHECK(ends_at > starts_at)
);
CREATE TABLE work_orders (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 reference TEXT NOT NULL, product_id INTEGER NOT NULL REFERENCES products(id),
 target_bottles INTEGER NOT NULL CHECK(target_bottles > 0),
 starts_at TEXT NOT NULL, ends_at TEXT, UNIQUE(run_id,reference)
);
CREATE TABLE shift_order_segments (
 id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id),
 work_order_id INTEGER NOT NULL REFERENCES work_orders(id),
 starts_at TEXT NOT NULL, ends_at TEXT, target_good_bottles INTEGER NOT NULL CHECK(target_good_bottles > 0),
 planned_bph INTEGER NOT NULL CHECK(planned_bph > 0),
 CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE simulation_events (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 event_key TEXT NOT NULL, simulated_at TEXT NOT NULL, event_type TEXT NOT NULL,
 payload_json TEXT NOT NULL CHECK(json_valid(payload_json)), UNIQUE(run_id,event_key)
);
-- Incréments de production de ligne au point de référence (soutireuse).
-- Ne jamais additionner les compteurs des différentes machines pour les volumes.
CREATE TABLE production_intervals (
 id INTEGER PRIMARY KEY, segment_id INTEGER NOT NULL REFERENCES shift_order_segments(id),
 event_id INTEGER NOT NULL UNIQUE REFERENCES simulation_events(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 total_bottles INTEGER NOT NULL CHECK(total_bottles >= 0),
 rejected_bottles INTEGER CHECK(rejected_bottles >= 0 AND rejected_bottles <= total_bottles),
 -- NULL = qualité inconnue, pas zéro rejet.
 CHECK(ends_at > starts_at)
);
CREATE TABLE machine_samples (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 machine_id INTEGER NOT NULL REFERENCES machines(id), simulated_at TEXT NOT NULL,
 state TEXT NOT NULL CHECK(state IN ('running','stopped','unknown')),
 speed_bph REAL CHECK(speed_bph >= 0), counter_bottles INTEGER CHECK(counter_bottles >= 0),
 UNIQUE(run_id,machine_id,simulated_at)
);
CREATE TABLE stop_reasons (
 id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
 category TEXT NOT NULL CHECK(category IN ('planned','operator_action','technical','external','safety','quality','unclassified'))
);
CREATE TABLE stoppages (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 shift_id INTEGER NOT NULL REFERENCES shifts(id), machine_id INTEGER REFERENCES machines(id),
 reason_id INTEGER NOT NULL REFERENCES stop_reasons(id),
 starts_at TEXT NOT NULL, ends_at TEXT, affects_line INTEGER NOT NULL CHECK(affects_line IN (0,1)),
 CHECK(ends_at IS NULL OR ends_at > starts_at)
);
CREATE TABLE metric_samples (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 shift_id INTEGER REFERENCES shifts(id), metric_code TEXT NOT NULL,
 period_start TEXT NOT NULL, period_end TEXT NOT NULL,
 value REAL, unit TEXT NOT NULL, calculation_note TEXT NOT NULL,
 CHECK(period_end > period_start)
);
CREATE TABLE tank_samples (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 tank_code TEXT NOT NULL, product_id INTEGER REFERENCES products(id),
 simulated_at TEXT NOT NULL, volume_litres REAL CHECK(volume_litres >= 0),
 UNIQUE(run_id,tank_code,simulated_at)
);
CREATE TABLE energy_intervals (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, consumption_wh INTEGER NOT NULL CHECK(consumption_wh >= 0),
 CHECK(ends_at > starts_at), UNIQUE(run_id,starts_at,ends_at)
);

-- Configuration manager persistante : ne dépend JAMAIS d'une suppression de run.
-- Le ciblage utilise des identités stables et des dates, pas un identifiant de quart simulé.
CREATE TABLE manager_targets (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 team_id INTEGER REFERENCES teams(id), shift_template_id INTEGER REFERENCES shift_templates(id),
 product_id INTEGER REFERENCES products(id),
 kind TEXT NOT NULL CHECK(kind IN ('shift_production','monthly_production','energy')),
 target_value REAL NOT NULL CHECK(target_value > 0), unit TEXT NOT NULL,
 valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES manager_accounts(id), created_at TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)), CHECK(valid_until > valid_from)
);
CREATE TABLE target_applications (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 segment_id INTEGER REFERENCES shift_order_segments(id),
 manager_target_id INTEGER REFERENCES manager_targets(id), kind TEXT NOT NULL,
 effective_value REAL NOT NULL CHECK(effective_value > 0), unit TEXT NOT NULL,
 applied_at TEXT NOT NULL, source TEXT NOT NULL CHECK(source IN ('scenario','manager'))
);
CREATE TABLE challenge_definitions (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 title TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('shift_target','beat_reference','timed_good_production')),
 conditions_json TEXT NOT NULL CHECK(json_valid(conditions_json)),
 bonus_points INTEGER NOT NULL CHECK(bonus_points >= 0),
 created_by INTEGER REFERENCES manager_accounts(id), enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
CREATE TABLE manager_challenge_assignments (
 id INTEGER PRIMARY KEY, challenge_id INTEGER NOT NULL REFERENCES challenge_definitions(id),
 team_id INTEGER REFERENCES teams(id), shift_template_id INTEGER REFERENCES shift_templates(id),
 valid_from TEXT NOT NULL, valid_until TEXT NOT NULL,
 created_by INTEGER NOT NULL REFERENCES manager_accounts(id), CHECK(valid_until > valid_from)
);
CREATE TABLE challenge_instances (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 shift_id INTEGER NOT NULL REFERENCES shifts(id), definition_id INTEGER NOT NULL REFERENCES challenge_definitions(id),
 assignment_id INTEGER REFERENCES manager_challenge_assignments(id),
 reference_shift_id INTEGER REFERENCES shifts(id),
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 target_good_bottles INTEGER NOT NULL CHECK(target_good_bottles > 0),
 rules_snapshot_json TEXT NOT NULL CHECK(json_valid(rules_snapshot_json)),
 status TEXT NOT NULL CHECK(status IN ('ready','active','awaiting_validation','won','missed','cancelled')),
 CHECK(ends_at > starts_at)
);
CREATE TABLE score_events (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 shift_id INTEGER NOT NULL REFERENCES shifts(id), challenge_id INTEGER REFERENCES challenge_instances(id),
 rule_version_id INTEGER NOT NULL REFERENCES scoring_rule_versions(id),
 event_key TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('production_final','challenge_bonus','quality_bonus','over_target_bonus','adjustment')),
 points INTEGER NOT NULL, simulated_at TEXT NOT NULL, explanation TEXT NOT NULL,
 UNIQUE(run_id,event_key)
);

-- Les textes manager ne sont jamais importés dans les fichiers seed des scénarios.
CREATE TABLE editorial_contents (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 kind TEXT NOT NULL CHECK(kind IN ('message','quote','event','sports')),
 title TEXT, body TEXT NOT NULL, attribution TEXT, image_path TEXT,
 icon_code TEXT,
 created_by INTEGER NOT NULL REFERENCES manager_accounts(id),
 status TEXT NOT NULL CHECK(status IN ('draft','published','archived')),
 created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE content_publications (
 id INTEGER PRIMARY KEY, content_id INTEGER NOT NULL REFERENCES editorial_contents(id),
 screen_number INTEGER NOT NULL CHECK(screen_number BETWEEN 1 AND 4),
 team_id INTEGER REFERENCES teams(id), shift_template_id INTEGER REFERENCES shift_templates(id),
 selected_by_team_id INTEGER REFERENCES teams(id),
 clock_domain TEXT NOT NULL CHECK(clock_domain IN ('real','simulation')),
 starts_at TEXT, ends_at TEXT, priority INTEGER NOT NULL DEFAULT 0,
 CHECK(ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
-- Bibliothèque de citations : editorial_contents.kind='quote'.
-- L'équipe ayant choisi une citation est distincte de son audience cible.
CREATE TABLE quote_rotation_settings (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL UNIQUE REFERENCES lines(id),
 mode TEXT NOT NULL CHECK(mode IN ('manual','each_shift')),
 selection_policy TEXT NOT NULL CHECK(selection_policy IN ('ordered','seeded_random')),
 enabled INTEGER NOT NULL CHECK(enabled IN (0,1)),
 updated_by INTEGER NOT NULL REFERENCES manager_accounts(id)
);
CREATE TABLE quote_rotation_items (
 id INTEGER PRIMARY KEY, settings_id INTEGER NOT NULL REFERENCES quote_rotation_settings(id),
 content_id INTEGER NOT NULL REFERENCES editorial_contents(id), position INTEGER NOT NULL,
 UNIQUE(settings_id,content_id), UNIQUE(settings_id,position)
);
CREATE TABLE shift_quote_selections (
 id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL UNIQUE REFERENCES shifts(id),
 content_id INTEGER NOT NULL REFERENCES editorial_contents(id),
 selected_by_team_id INTEGER REFERENCES teams(id),
 source TEXT NOT NULL CHECK(source IN ('automatic','manager')),
 selected_at TEXT NOT NULL
);
CREATE TABLE contributions (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 kind TEXT NOT NULL CHECK(kind IN ('anomaly','kaizen')),
 person_id INTEGER REFERENCES people(id), team_id INTEGER REFERENCES teams(id),
 machine_id INTEGER REFERENCES machines(id), title TEXT NOT NULL, description TEXT NOT NULL,
 status TEXT NOT NULL CHECK(status IN ('submitted','acknowledged','in_progress','validated','rejected','resolved')),
 origin TEXT NOT NULL CHECK(origin IN ('manager','simulation')),
 run_id INTEGER REFERENCES simulation_runs(id), occurred_at TEXT NOT NULL, created_at TEXT NOT NULL,
 CHECK((origin = 'simulation' AND run_id IS NOT NULL) OR (origin = 'manager' AND run_id IS NULL))
);
CREATE TABLE contribution_reviews (
 id INTEGER PRIMARY KEY, contribution_id INTEGER NOT NULL REFERENCES contributions(id),
 manager_id INTEGER NOT NULL REFERENCES manager_accounts(id), reviewed_at TEXT NOT NULL,
 status TEXT NOT NULL, note TEXT NOT NULL
);
CREATE TABLE recognitions (
 id INTEGER PRIMARY KEY, line_id INTEGER NOT NULL REFERENCES lines(id),
 kind TEXT NOT NULL CHECK(kind IN ('operator_month','safety_badge','contribution')),
 person_id INTEGER REFERENCES people(id), team_id INTEGER REFERENCES teams(id),
 contribution_id INTEGER REFERENCES contributions(id), badge_code TEXT, reason TEXT NOT NULL,
 starts_at TEXT NOT NULL, ends_at TEXT NOT NULL,
 origin TEXT NOT NULL CHECK(origin IN ('manager','simulation')), run_id INTEGER REFERENCES simulation_runs(id),
 approved_by INTEGER REFERENCES manager_accounts(id),
 CHECK(person_id IS NOT NULL OR team_id IS NOT NULL), CHECK(ends_at > starts_at),
 CHECK((origin = 'simulation' AND run_id IS NOT NULL) OR (origin = 'manager' AND run_id IS NULL))
);
CREATE TABLE safety_events (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 occurred_at TEXT NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('baseline','accident','near_miss')),
 note TEXT NOT NULL
);
CREATE TABLE wellbeing_responses (
 id INTEGER PRIMARY KEY, shift_id INTEGER NOT NULL REFERENCES shifts(id),
 response_key TEXT NOT NULL, mood INTEGER NOT NULL CHECK(mood BETWEEN 1 AND 5),
 fatigue INTEGER CHECK(fatigue BETWEEN 1 AND 5), submitted_at TEXT NOT NULL,
 UNIQUE(shift_id,response_key)
);
CREATE TABLE records (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 kind TEXT NOT NULL CHECK(kind IN ('team_score','line_speed','continuous_run','monthly_trs')),
 team_id INTEGER REFERENCES teams(id), value REAL NOT NULL CHECK(value >= 0), unit TEXT NOT NULL,
 period_start TEXT NOT NULL, period_end TEXT NOT NULL,
 comparability_key TEXT NOT NULL, source_event_id INTEGER REFERENCES simulation_events(id),
 historical_seed INTEGER NOT NULL CHECK(historical_seed IN (0,1)), CHECK(period_end > period_start)
);
CREATE TABLE celebration_receipts (
 id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES simulation_runs(id),
 celebration_key TEXT NOT NULL, simulated_at TEXT NOT NULL, UNIQUE(run_id,celebration_key)
);
CREATE TABLE audit_log (
 id INTEGER PRIMARY KEY, actor_id INTEGER REFERENCES manager_accounts(id),
 action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id INTEGER,
 details_json TEXT NOT NULL CHECK(json_valid(details_json)), created_at TEXT NOT NULL
);

CREATE INDEX shifts_run_time ON shifts(run_id,starts_at);
CREATE INDEX production_segment_time ON production_intervals(segment_id,starts_at);
CREATE INDEX machine_run_time ON machine_samples(run_id,machine_id,simulated_at);
CREATE INDEX events_run_time ON simulation_events(run_id,simulated_at);
CREATE INDEX scores_run_shift ON score_events(run_id,shift_id);
CREATE INDEX contributions_origin_time ON contributions(origin,run_id,occurred_at);
CREATE INDEX publications_content ON content_publications(content_id);

CREATE VIEW segment_production AS
 SELECT segment_id, SUM(total_bottles) AS total_bottles,
 CASE WHEN COUNT(rejected_bottles) = COUNT(*) THEN SUM(rejected_bottles) END AS rejected_bottles,
 CASE WHEN COUNT(rejected_bottles) = COUNT(*) THEN SUM(total_bottles-rejected_bottles) END AS good_bottles
 FROM production_intervals GROUP BY segment_id;

COMMIT;

BEGIN;
CREATE TABLE express_challenge_presets (
 code TEXT PRIMARY KEY,
 title TEXT NOT NULL,
 description TEXT NOT NULL,
 duration_minutes INTEGER NOT NULL CHECK(duration_minutes BETWEEN 1 AND 120),
 target_value INTEGER NOT NULL CHECK(target_value>0),
 bonus_points INTEGER NOT NULL CHECK(bonus_points BETWEEN 0 AND 100),
 badge_title TEXT NOT NULL,
 badge_asset_path TEXT NOT NULL,
 card_asset_path TEXT NOT NULL,
 color TEXT NOT NULL,
 rules_json TEXT NOT NULL CHECK(json_valid(rules_json)),
 display_order INTEGER NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1))
);
COMMIT;

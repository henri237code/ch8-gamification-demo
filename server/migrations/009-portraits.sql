BEGIN;
CREATE TABLE portrait_assets (
 id TEXT PRIMARY KEY,
 person_id INTEGER NOT NULL UNIQUE REFERENCES people(id),
 content_type TEXT NOT NULL CHECK(content_type='image/webp'),
 image_data BLOB NOT NULL,
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 512),
 height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 512),
 created_at TEXT NOT NULL
);
COMMIT;

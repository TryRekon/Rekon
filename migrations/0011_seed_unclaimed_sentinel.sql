-- Sentinel owner for unclaimed draft systems. Drafts are created anonymously so
-- someone can wire up a client and see traffic before signing up, but they must
-- be real `systems` rows (traffic records against them, sessions/tools FK to
-- systems) — and D1 refuses to rebuild an FK-referenced parent table, so
-- `systems.user_id` stays NOT NULL and points at this row instead of NULL until
-- a real user claims the draft. The id is mirrored in code as
-- UNCLAIMED_USER_ID (src/db/schema.ts) — keep the two in sync.
--
-- authSubject '__unclaimed__' can't collide with a real OAuth subject (Google
-- and GitHub both issue numeric subjects), so completeSignIn's upsert against
-- the (auth_provider, auth_subject) unique index never resolves to this row.
-- INSERT OR IGNORE keeps the migration idempotent.
INSERT OR IGNORE INTO `users` ("id", "auth_provider", "auth_subject", "email", "name", "picture", "created_at")
VALUES ('__unclaimed__', 'github', '__unclaimed__', 'unclaimed@token-profiler.invalid', 'Unclaimed drafts', NULL, unixepoch() * 1000);

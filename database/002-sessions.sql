BEGIN;

-- =========================================================
-- SESSIONS
-- =========================================================

CREATE TABLE sessions (
  token_hash  BYTEA PRIMARY KEY,
  user_id     INTEGER NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL,

  CONSTRAINT sessions_expires_after_created
    CHECK (expires_at > created_at),

  CONSTRAINT sessions_user_fkey
    FOREIGN KEY (user_id)
    REFERENCES users (user_id)
    ON DELETE CASCADE
);

-- Unicidad de usuarios sin distinguir mayúsculas (evita "Ana" y "ana").
CREATE UNIQUE INDEX users_username_lower_unique ON users (lower(username));
CREATE UNIQUE INDEX users_email_lower_unique ON users (lower(email));

COMMIT;

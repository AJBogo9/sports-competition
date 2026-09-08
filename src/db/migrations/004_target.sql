-- FR-29 (phase 5 design 11.3). NULL means "the configured target": the WHO
-- figure lives in config.ts only (FR-25), so a changed config moves everyone
-- who never chose, and only a choice is ever stored, never a derived number
-- (SPEC.md section 4.4).
ALTER TABLE users
  ADD COLUMN target_minutes INTEGER CHECK (target_minutes > 0);

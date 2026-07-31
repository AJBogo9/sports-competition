-- Phase 3 (FR-21 to FR-24). ignored_streak and blocked already exist, declared
-- in 001 from SPEC.md section 6 and written by nothing until now, so this adds
-- two columns rather than four.
ALTER TABLE users
  ADD COLUMN reminder_asked   BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN last_reminded_at TIMESTAMPTZ;

-- Phase 3 design 2.1. Anyone holding an hour demonstrably answered the
-- question. A NULL hour is still ambiguous, meaning both "declined" and "never
-- got that far", so those users are left unasked and see the question once
-- more, which is exactly what Phase 1 does today rather than a regression.
-- Marking everyone asked would silently convert "never asked" into "declined"
-- for the very users the ambiguity applies to, which is what FR-4 forbids.
UPDATE users SET reminder_asked = TRUE WHERE reminder_hour IS NOT NULL;

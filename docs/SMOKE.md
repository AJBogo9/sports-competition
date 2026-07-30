# Phase 1 smoke checklist

Automated tests cover scoring, queries, callback encoding and rendering.
This is the part they cannot: two people, two phones, one real bot.

Run through it against a bot whose `COMPETITION_START` and `COMPETITION_END`
contain today. Nothing here is done until every box is ticked.

## Registration

- [ ] `t.me/<bot>?start=prodeko` on a fresh account registers to Prodeko in one
      tap and immediately asks the reminder question (FR-1, FR-4)
- [ ] The reminder question offers hours and a decline, and declining is
      accepted without nagging (FR-4)
- [ ] The message after choosing states the 150 minute target and says that
      your first name and activity are visible to others in your guild
- [ ] A bare `/start` on a second fresh account shows all nine guilds (FR-2)
- [ ] Tapping a guild in that list registers you (FR-2)
- [ ] Opening a *different* guild's link as an existing user offers Move and
      Stay, and Stay leaves the guild unchanged (FR-3)
- [ ] Move actually moves you, and your logged days come with you (FR-3)
- [ ] Double-tap a guild button quickly on a fresh account, and confirm you
      still end up able to answer the reminder question (registration is
      idempotent under a fast double-tap, not just under a slow retry)

## Check-in

- [ ] `/log` produces the check-in message at any time of day (FR-6)
- [ ] One tap logs, with no confirmation step, and the message edits in place
      into the confirmation (FR-5)
- [ ] The confirmation shows minutes this week against 150 with a bar (FR-12)
- [ ] Logging a second time the same day replaces rather than adds: log
      `15 to 30`, then `60+`, and confirm the week shows 75 more than before,
      not 97 (FR-7)
- [ ] Undo after that overwrite puts the week back exactly where it was before
      the second log (FR-9, design 4.5)
- [ ] Undo on a fresh log removes the day entirely (FR-9)
- [ ] `Not today` records a rest day, shows zero minutes added, and reads as
      permitted rather than as a failure (FR-8)
- [ ] `Log yesterday instead` writes to yesterday, and logging yesterday twice
      replaces rather than adds (FR-10, FR-7)
- [ ] Log yesterday via "Log yesterday instead", tap Undo, then tap
      "Log again", and confirm the prompt says "And yesterday?" rather than
      "Moved today?" before tapping a tier. Confirm the resulting entry lands
      on yesterday, not today
- [ ] Log a day, re-log the same day at a different tier, then tap Undo, and
      confirm the message says the entry was put back (not removed) and that
      the weekly total matches what it was before the second log

## Reading

- [ ] `/me` shows weekly progress, the streak in weeks, and your guild's rank
      among guilds (FR-14)
- [ ] `/me` shows you as "you" with at most one person either side, and no
      global list of individuals appears anywhere in the bot (FR-15)
- [ ] `/standings` shows the weekly table first, then the season, both as
      minutes per member (FR-16)
- [ ] The command menu in a private chat offers `/log`, `/me` and `/standings`
- [ ] Send `/me` in a group chat that has the bot in it, and confirm the bot
      does not reply. This one protects other people's data, not just yours

## The numbers

- [ ] Hand-calculate one guild's weekly minutes from what the two test accounts
      logged, divide by that guild's member count in `src/config.ts`, and
      confirm `/standings` matches. This is SPEC.md §10's "done when" for
      Phase 1
- [ ] A guild with nobody registered still appears in the table, at zero

## Survival

- [ ] `docker compose restart bot` mid-session, then tap a button on a message
      sent *before* the restart. It must still work (NFR-5)
- [ ] `scripts/dump.sh` writes a dump, `docker compose down -v` destroys the
      volume, `docker compose up -d` plus `scripts/restore.sh` brings the same
      standings back

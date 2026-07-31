# Phase 4 Implementation Design: It Survives Contact

**Date:** 2026-07-31
**Status:** Approved, not implemented.
**Covers:** [SPEC.md](../../../SPEC.md) §10 Phase 4, which after section 1 below reduces to NFR-3
and its acceptance test, plus two carry-forwards parked by the Phase 3 review.
**Does not cover:** the `Tietokilta/infra` changes that deploy this. Section 6 specifies them
precisely; section 9 records them as deferred to that repository.

SPEC.md is the source of truth for *what* and *why*. This document is *how*, and it records the
decisions SPEC.md leaves open. Where the two disagree, SPEC.md wins and this document is wrong.

It continues [the Phase 1 design](2026-07-30-telegram-bot-phase-1-design.md),
[the Phase 2 design](2026-07-31-telegram-bot-phase-2-design.md) and
[the Phase 3 design](2026-07-31-telegram-bot-phase-3-design.md), whose architecture, stack and
conventions carry over unchanged and are not restated. Code comments cite this document as
"phase 4 design N.N".

---

## 1. Scope

SPEC.md §10 lists five items for this phase. Three are already built, and one is cut. Establishing
that is the first job of this design, because the Phase 3 handover carried forward a budget
conflict that rests entirely on the assumption that all five are outstanding.

| §10 item | State | Evidence |
|---|---|---|
| Weekly streak (FR-13) | **Built, Phase 1** | `weeklyStreak()` in `domain/scoring.ts`, called from `bot/reports.ts`, rendered by `bot/render.ts`. Design 4.3 pulled it forward: FR-14 makes `/me` show the streak, `/me` is Phase 1, and shipping a `/me` that fails its own acceptance test was the alternative |
| Undo edge cases (FR-9) | **Built, Phase 1** | `undoDay()` with the displaced-tier restore, plus the stale-payload guards in `bot/checkin.ts`. Design 4.5 pulled it forward, at "about six lines and no stored state", because FR-9 contradicts its own acceptance test whenever a log displaced an earlier tier |
| Deployment | **Built, Phase 2** | `Dockerfile`, `docker-compose.yml`, healthcheck, `restart: unless-stopped`. Section 3 changes its role but not its existence |
| Optional tag (FR-11) | **Cut** | SPEC.md §9 Q5, decided 2026-07-31. Section 2 records the reasoning |
| Nightly backup (NFR-3) | **Outstanding** | This phase |

So Phase 4 is NFR-3, which is also exactly what §10's own acceptance test asks for: *"Done when: the
backup restores into an empty database and reproduces the standings exactly."*

### 1.1 The size conflict dissolves rather than being resolved

The Phase 3 handover recorded the single most likely thing to go wrong next: `src/` stands at 1,916
effective lines against NFR-6's ceiling of 2,000, leaving 84, while SPEC.md §7 budgets Phase 4 at
about 120. That conflict was real given its premise, and the premise does not hold.

The 120 was never a costed figure. §7's table has no row for tags and no row for backups, its rows
sum to 1,305, and its phase split (900 + 150 + 180 + 120) sums to 1,350. The 120 is a rounded
residual, written when the streak was still unbuilt, and Phases 1 and 2 have already spent it.

What actually remains costs 5 lines, all of them section 5's `decode()` assertion:

- The backup is not application logic. TiK's staging script runs `pg_dump` against the database
  server, which cannot be reached from inside the bot process, so the schedule is systemd and Nix,
  not TypeScript. NFR-6 budgets deployment configuration separately from application logic in its
  own sentence.
- The restore test is a test. NFR-6 budgets tests separately too, and the counting command in
  CLAUDE.md globs `src -name '*.ts'`.

Neither trimming working code nor amending the ceiling is therefore necessary, and both were
rejected on 2026-07-31. Trimming was rejected as the worse of the two: NFR-6 is a proxy for
"something from §8 has crept back in", and compressing reviewed, tested code to sit under a proxy
destroys the signal the proxy exists to give while spending real defect risk. Raising the ceiling
was rejected as premature rather than wrong: the estimate was low rather than the build bloated,
nothing from §8 has crept in, and if the one tripwire in this project is ever spent it should be
spent on something binding.

**Ceiling after this phase: about 1,921 of 2,000.**

---

## 2. Ruling: FR-11 is cut, not deferred

FR-11 is the only `MAY` in SPEC.md §5. Every other requirement is `MUST` or `SHOULD`, and §5 states
the hierarchy in its own preamble. Cutting it exercises an option the specification granted rather
than deviating from it, which is why this is recorded as a decided question (§9 Q5) rather than as a
deviation.

Four reasons, in the order they carry weight:

1. **It was never designed.** [prototype/bot-flows.html](../../../prototype/bot-flows.html) has no
   tag screen. CLAUDE.md makes that mockup the authority for keyboard order and copy, so building
   tags means inventing a screen at the exact moment the budget runs out.
2. **It serves no success criterion.** SPEC.md §1 names four: registration rate, week-1 and
   final-week logging, median days logged, and whether bottom guilds' participation rose. A private
   label nobody else can see moves none of them.
3. **It adds friction to the one path that must not have any.** SPEC.md §2 defect 6 names the
   seven-step wizard as the cause of mid-competition dropoff, and §4.1 fixes reporting at one tap.
4. **It costs 70 to 90 effective lines against 84.** NFR-5 forbids session state, so free text is
   out and the tag list must be preset buttons carried in the callback payload: a callback kind, a
   keyboard, a `setTag` query, a `checkin.ts` branch, strings and a render change.

Recorded honestly: a tag is the defanged form of something SPEC.md §8 rejects outright. "Sport
taxonomy with MET values per activity" was rejected as "the only mechanism that can produce a 'why
is my sport worth less than yours' dispute". FR-11 removes the dispute by removing the scoring, and
it is one configuration change away from restoring it. That is not why it is cut, but it is why
re-adding it later should go through §8 first.

`days.tag` stays in the schema. Dropping it costs a migration to buy nothing, and the column is the
cheap half of a decision that can be revisited.

---

## 3. The deployment target changes what NFR-3 means

This bot deploys into [`Tietokilta/infra`](https://github.com/Tietokilta/infra), which already
solves NFR-3 better than this repository can.

- **Bot on tikpannu**, as a NixOS service beside `tikbot`, `wappupokemonbot` and
  `summer-body-bot`, with `BOT_TOKEN` supplied through sops-nix in the pattern
  `modules/tikbots/tikbot.nix` establishes. Long polling with no inbound port (NFR-1) is exactly
  what that host expects: its firewall opens 80 and 443 only, and nothing needs to reach the bot.
- **Database on the shared Azure PostgreSQL flexible server**, created through
  `modules/service_database`, which is what the predecessor `modules/running-challenge` does.

The second point is the one that matters. `modules/backup/azure/stage-postgresql.sh` is implemented,
not merely planned, and its discovery is dynamic: it enumerates every non-system database on that
server, `pg_dump --format=directory --compress=none`s each one into a staging directory, and
`modules/backup/restic.nix` ships the result to a Hetzner Storage Box with `--keep-daily 7
--keep-weekly 4` on a systemd timer. `gatus.nix` posts a success or failure heartbeat per staging
service to `status.tietokilta.fi`, and `restic.nix`'s cleanup deliberately preserves the staging
directory when the backup fails rather than discarding the evidence.

**So the database is backed up nightly, off the machine, from the moment it exists, with no code in
this repository.** That is the whole point of the dynamic-discovery design, and NFR-3's binding
words, "a nightly `pg_dump` MUST be shipped off the machine", are satisfied by it.

Azure App Service, the other precedent in that repository, was rejected. `running-challenge` uses it
because it has a web UI, which is why it sets `WEBSITES_PORT=3000`. This bot deliberately has no
HTTP listener (NFR-1, and §8 rejects the Mini App), and App Service expects a port to health-check.

### 3.1 Three portability facts, verified rather than assumed

Moving from a Postgres container this project controls to a managed server it does not is where a
silent defect would live. Each was checked:

1. **TLS needs no code change.** Azure PG requires it, and postgres.js 3.4.9 maps `sslmode` from the
   connection URL into its `ssl` option (`node_modules/postgres/src/index.js:443`). A
   `DATABASE_URL` ending `?sslmode=require` is enough.
2. **No query reads the session timezone.** Every conversion in `src/db` is an explicit
   `AT TIME ZONE ${TIMEZONE}`, `now()` returns `timestamptz` and is therefore absolute, and every
   remaining `::date` cast applies to a date literal or to an already-converted local timestamp.
   `date_trunc('week', d.date)` operates on a `DATE` and is timezone-free. A server defaulting to
   UTC cannot shift a week boundary, which is the defect this would otherwise hide until the
   October clock change.
3. **Startup migrations work under the scoped role.** `modules/service_database` grants the
   generated `<db>_user` role `ALL` on `object_type = "schema"` for `public`, and `ALL` includes
   `CREATE`. This matters because PostgreSQL 15 removed the implicit `PUBLIC` write grant on the
   public schema, so a narrower grant would fail `migrate()` at boot with a permission error.

### 3.2 Compose becomes the development path

`docker-compose.yml` keeps both services and changes role: it is how the bot runs locally and how
`bun test` gets its database, not how it runs in production. Nothing about the file changes. The
`db` service simply stops being the production database, and README says so plainly, because a
compose file that looks like production but is not is how someone ends up backing up the wrong
thing.

---

## 4. The restore-fidelity test

This is the phase's one real deliverable, and it is the whole of §10's acceptance test. It is also
the only gate in this project that can be automated: unlike [docs/SMOKE.md](../../SMOKE.md) it needs
no second Telegram account and no overnight wait.

An untested restore is the classic way a backup fails, and this project has an unusually clean
version of the test available. Because no total is ever stored (SPEC.md §4.4), every published
number is a pure function of `guilds`, `users` and `days` plus configuration. So "reproduces the
standings exactly" is a deep equality assertion on recomputed output, not a row-by-row diff.

### 4.1 Shape

A new `tests/db/restore.test.ts`:

1. Create two genuine **databases** in the `db-test` container, not schemas. §10 says "an empty
   database", and TiK's backup dumps per database, so a schema-scoped test would exercise a path
   nobody runs in production. This is the one place the project departs from the
   `freshDatabase("<name>")` convention, and the reason belongs in a comment. Both are dropped in
   `afterAll`, as every other test file ends its connection there.
2. Seed a fixture spanning what the standings actually read: several guilds, users with different
   tiers, explicit rest days, and dates on both edges of the competition window.
3. Compute the full derived surface, not only the standings: weekly standings, season standings,
   neighbours, week minutes and the streak. It is a few extra lines and strictly stronger than §10
   asks for.
4. Dump, restore into the empty database, recompute the same surface, assert deep equality.

### 4.2 Ruling: the fixture is asserted non-trivial before anything is compared

If the seed silently failed, both sides would be empty, deep equality would hold, and the test would
pass while proving nothing. So the test asserts the fixture is non-empty and that at least one guild
has non-zero minutes **before** it compares anything.

This is the same defect shape the Phase 3 reviews caught twice, where a test bracketed a boundary
without pinning it. A vacuously passing backup test is worse than no backup test, because it
converts an unknown into a false assurance.

### 4.3 Ruling: it tests the format TiK actually runs

The test exercises `pg_dump --format=directory` and `pg_restore`, because that is what
`stage-postgresql.sh` runs and therefore the path whose failure loses a competition. It also runs
the plain-SQL form, `pg_dump --clean --if-exists` restored through `psql`, which is the format
`scripts/dump.sh` and `scripts/restore.sh` use for a host move. Seeding and comparison are shared,
so only the two commands differ and both formats are covered for a handful of extra lines.

The limit is worth stating: this tests the **formats**, not the scripts. It replicates their
`pg_dump` flags rather than invoking `scripts/dump.sh`, because those scripts target the compose
`db` service and their own argument handling and empty-file guards are not what a competition
depends on. What a competition depends on is that a dump of this database round-trips without
altering a published number.

### 4.4 Ruling: it fails loudly and never skips

The host has no `pg_dump`, `pg_restore` or `psql`; they exist only inside the container, at 17.10.
The test therefore drives them through `docker compose exec -T db-test`, which is consistent with
`bun run test:db` already bringing that container up, and with `bun test` already failing on
`tests/db/*` without it.

When Docker is unavailable the test **fails**, it does not skip. A backup test that quietly skips
itself in CI is precisely the failure mode NFR-3 exists to prevent, and a skip is indistinguishable
from a pass in a summary line.

### 4.5 NFR-4 boundary

The fixture writes activity data, which is exactly what NFR-4 forbids outside a real user action.
The rule is about shipped code paths, and the existing `tests/db/standings.test.ts` already inserts
days on the same basis. The constraint this phase adds is that the seed **stays in `tests/`**: it
does not become a script, a CLI command, an export from `src/`, or anything reachable from a build.
SPEC.md §2 defect 3 is what that rule is protecting against.

---

## 5. Carry-forwards and documents

### 5.1 The two carry-forwards

Both were parked by the Phase 3 final review as one-liners.

**`decode()` accepts trailing junk.** `decode("remind:20:30")` returns a valid callback rather than
null. Projectwide and pre-existing on `main`: `guild`, `move`, `bind`, `yesterday`, `checkin` and
`hour` all behave the same way. Not dangerous, since a forged payload can only set the forger's own
hour to a range-checked value, but a single `data === encode(result)` round-trip assertion at the
end of `decode()` closes all seven kinds at once. **This is the only change to `src/` in this
phase, about 5 lines.** It needs a test per kind proving a trailing-junk payload is now rejected.

**The Phase 3 design §3.5 narrative.** It still states the premise that a blocked user cannot
produce an update. `my_chat_member` is the counterexample, the code comment in `index.ts` was
corrected during the Phase 3 fix round, and the ruling narrative was not. Documentation only.

### 5.2 Documents

More of this phase is documentation than code, which is what happens when a requirement is satisfied
by choosing where to stand rather than by building something.

| Document | Change |
|---|---|
| SPEC.md §9 | New **Q5**: FR-11 cut, decided 2026-07-31, with section 2's reasoning. Follows Q4's form |
| SPEC.md NFR-2 | Restated. "Two containers on one machine" describes the development path now, not the deployment. Section 3 is what replaces it |
| SPEC.md NFR-3 | Restated: satisfied by inherited infrastructure, with this repository owning the restore test instead. The requirement does not change, only how it is met and by whom |
| SPEC.md §10 Phase 4 | Restated to what is actually left, so the next reader does not re-derive section 1 |
| SPEC.md §7 | A note that the 120 was a residual, so the conflict is not rediscovered |
| README | Deploy rewritten for pannu plus Azure PG. Must state which database is the real one (3.2), and carry section 6 so the infra work is findable |
| CLAUDE.md | Last, as in every previous phase: the phase status line, the ceiling figure, and the compose-is-not-production point |

The one thing not to write: a claim that NFR-3 is done. Section 9 records why it is not, until the
infra PR merges.

---

## 6. What the `Tietokilta/infra` change must contain

Out of scope for this phase and specified here so the handover is not folklore. Raised separately,
against a repository where merging to `main` runs `terraform apply`.

| Piece | Where | Note |
|---|---|---|
| Database | new Terraform module calling `modules/service_database` | `db_name` decides the dump filename and is what makes the backup discovery pick it up. Nothing else is needed for NFR-3 |
| Bot package | `Tietokilta/tikbots` | The other three bots reach pannu through that flake, which is the input `modules/tikbots/default.nix` imports |
| NixOS service | `tikpannu-nixos-config/modules/tikbots/` | Follow `tikbot.nix`: a sops secret for the token, a `sops.templates` env file owned by the service user |
| Secret | `tikpannu-nixos-config/modules/secrets/` | `BOT_TOKEN`, plus the `DATABASE_URL` for the Azure database. The generated password comes from `service_database` |
| `DATABASE_URL` | that env file | Must end `?sslmode=require`. See 3.1 |

The verification that matters afterwards is not that the timer exists but that a dump of this
database restores and reproduces the standings, which is what section 4 automates against the same
dump format.

---

## 7. Verification

| Check | Covers |
|---|---|
| `tests/db/restore.test.ts` | §10's acceptance test, both dump formats, with the non-triviality guard of 4.2 |
| New `decode()` tests, one per callback kind | Section 5's round-trip assertion, including that valid payloads still decode |
| `bun test` | 242 existing tests must stay green. This phase changes one `src/` function, so a regression here means the assertion is too strict |
| `bunx tsc --noEmit` | Unchanged expectation |
| The counting command in CLAUDE.md | Must read about 1,921, not 2,000 |

No smoke additions. This phase touches nothing a user can see: `decode()` becomes stricter about
payloads no client produces, and everything else is tests and documents.

### 7.1 The precondition this phase still does not satisfy

No phase's smoke run has been done. Phases 1, 2 and 3 are built and none has been manually verified
against [docs/SMOKE.md](../../SMOKE.md). This is now stated in four design documents. It cannot be
automated: the checklist needs two real Telegram accounts tapping inline buttons and two steps need
an overnight wait. It remains the gate on real users, not on writing code, and Phase 4 does not
change that in either direction.

---

## 8. Size

`src/` is 1,916 effective lines before this phase and about 1,921 after, against NFR-6's ceiling of
2,000. Count it with the command in CLAUDE.md; earlier figures in the build ledgers were taken by
hand and run 10 to 30 lines low.

Worth recording because it will look wrong later: the ceiling counts `src/**/*.ts` only, so the
three files in `src/db/migrations/` are outside it while NFR-6's own table budgets "Schema,
connection, migrations" together at 105. The count therefore understates against NFR-6's basis. This
is left alone deliberately. Consistency across phases is what makes the trend readable, and changing
the measure to buy headroom would be the same mistake as trimming code to fit under it.

---

## 9. Deferred

| Deferred | Phase | Note |
|---|---|---|
| Optional tag UI (FR-11) | none | **Cut**, not deferred. SPEC.md §9 Q5, decided 2026-07-31. Section 2. `days.tag` stays in the schema |
| The `Tietokilta/infra` PR | that repository | Section 6 specifies it. NFR-3 is not observably satisfied in production until it merges |
| `COMPETITION_START` / `COMPETITION_END` | launch task | SPEC.md §9 Q1, still open. The placeholder window ends 2026-09-20, after which `tests/domain/scoring.test.ts:45` fails by design. Not guessed here |
| Guild `memberCount` verification | launch task | The denominator of every ranking. SPEC.md §1 requires re-verification with each guild |
| Every SMOKE.md run | launch task | 7.1 |
| FR-24's restore-on-resume clause | none | Unchanged from Phase 3. SPEC.md §9 Q4 |
| A dedicated group-chat off switch | none | README documents the two blunt levers. Not a Phase 4 concern and not budgeted |

---

## 10. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| The backup is believed to work because a timer exists, and has never been restored | Section 4 is exactly this test, and 4.3 makes it run the same dump format production runs |
| The restore test passes vacuously on an empty fixture | 4.2's non-triviality assertion, checked before any comparison |
| The restore test silently skips in an environment without Docker, and the summary line reads green | 4.4: it fails instead |
| NFR-3 is treated as done when this repository's work is done, while the database has no backup because the infra PR has not merged | Section 6 states the dependency, and section 9 records it as deferred rather than complete |
| The managed database shifts a date bucket and the competition miscounts a week | 3.1's audit: every conversion is explicit, nothing reads the session timezone |
| Someone backs up the compose `pgdata` volume, believing it is production | 3.2: README states which database is real |
| FR-11 is re-added later without reading SPEC.md §8 | Section 2 records the taxonomy relationship, so the next reader meets it before the keyboard |

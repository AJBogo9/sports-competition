# Phase 5 Implementation Design: It Feels Like a Game

**Date:** 2026-09-07
**Status:** Built against the owner's admission rule (section 3). Not smoke tested.
**Covers:** the fun pass the owner asked for on 2026-09-07: what the research says makes a
text-only competition fun and habit-forming, an admission scale for features, the score of every
existing and candidate feature against it, and the five changes that pass and fit.
**Does not cover:** anything below the admission threshold (section 6), the smoke runs, deployment.

SPEC.md is the source of truth for *what* and *why*. This document is *how*, and it records the
decisions SPEC.md leaves open. Where the two disagree, SPEC.md wins and this document is wrong.

It continues the four earlier designs, whose architecture, stack and conventions carry over
unchanged and are not restated. Code comments cite this document as "phase 5 design N.N".

---

## 1. Scope

The brief: make the competition as fun and engaging as it can be while keeping opinionated
minimalism; evaluate every new **and existing** feature on a utility scale; build what crosses a
threshold; defer the rest until the MVP is stable. The stated goal is that students move, and that
some keep moving after the competition ends. The competition is the nudge, not the point.

Three briefings were compiled for this design, one each on game design, behaviour change and
Telegram's capabilities, from primary sources where they could be reached; they are kept in
[docs/research/](../../research/). Section 2 is the distillation, and the sources that changed a
decision are entered in [docs/evidence.md](../../evidence.md) §5 after a second check of each
citation.

Requirements touched: FR-12, FR-13, FR-20, FR-27, and a new FR-28.

### 1.1 The precondition this phase still does not satisfy

No phase's smoke run has been done. Phase 5 adds one thing that makes the gap sharper: its
celebration (5.1) relies on a Telegram behaviour documented nowhere, a bot reacting to a message it
sent itself in a private chat. The method text restricts only service messages, paid and custom
emoji and a chat's `available_reactions`, never the author, and the tracker has no word either way.
One runtime test settles it, and the Phase 5 section of [docs/SMOKE.md](../../SMOKE.md) is that
test. The fallback is recorded in 5.1 so the smoke run has a next step if it fails.

### 1.2 What "compete with commercial games" honestly means here

A logging bot has no continuous input, so it cannot host flow, spectacle, narrative or game feel in
Swink's sense. What the research says commercial games actually run on transfers, though: need
satisfaction (competence, autonomy, relatedness), a short loop with immediate proportional feedback,
a visible arc, and a social frame in which one's contribution counts. The exercise itself is the
game; the bot is the scoreboard and the moment of feedback. This phase makes the moment of feedback
land, gives the loop its missing celebration, and fixes the one line that the evidence says works
against the design. It deliberately does not add the levers commercial games use to manufacture
compulsion (variable rewards, daily streaks, individual leaderboards), because every one of them
trades the habit for the session. Fun that cannot be verified from code, which is all of it, waits
on the smoke run with real people.

---

## 2. What the research says

Grades: A a meta-analysis or a replicated randomised trial; B a single randomised trial or field
experiment, or large observational data; C a secondary analysis, a published case with numbers, or
practitioner consensus; D folklore or company self-report. Each principle names what it changes
here. Regraded on 2026-09-07 (10.3): the scale as first written counted any single trial as A,
which put a four-study laboratory comparison beside a 138-trial meta-analysis. The Impact axis in
section 3 was written against "a trial or a meta-analysis", so no candidate's score moved; two
existing features fell from Impact 5 to 4 (4.1).

1. **Self-monitoring is the strongest single technique** (A: Michie et al. 2009 across 122
   evaluations, 0.42 with it against 0.26 without; Harkin et al. 2016, 138 RCTs, d = 0.40, larger
   when the record is written and reported). The one-tap log is the most evidence-backed thing in
   the product. Nothing in this phase adds a tap to it.
2. **Competition among a few, with visible standings, moves exercise and is the only social arm
   whose effect outlived the programme** (B: STEP UP 2019, +920 steps during and +569 twelve weeks
   after; Zhang et al. 2016, +90% attendance, with a support-only arm below control; two single
   trials whose social-arm ordering agrees). The pinned
   standings carry the effect. Unchanged, and SPEC.md §8's rejection of encouragement features holds.
3. **Praise that informs raises intrinsic motivation, praise that pressures lowers it, and
   expected tangible rewards undermine it** (A for the tangible-reward figures: Deci, Koestner and
   Ryan 1999 across 128 experiments, d = -0.28 to -0.40; B for the praise split, which is that
   paper's supplemental analysis of the four studies that manipulated both, informational praise
   d = +0.66 and controlling praise d = -0.44 against no feedback). Every new line of copy states a
   fact. Rewards stay symbolic and collective. No prizes.
4. **Losers stay motivated when given an attainable standard and positive feedback for meeting
   it** (B: Vansteenkiste and Deci 2003; Reeve and Deci 1996; laboratory experiments). The
   personal weekly target is that
   standard. This phase gives meeting it a real moment (5.1, 5.2) so a member of the ninth-placed
   guild still gets a competence signal every week.
5. **A highlighted intact streak helps; a highlighted broken one hurts, unless it is repairable**
   (B: Silverman and Barasch 2023, seven studies in one paper; Aulagnon, Cristia, Cueto and Malamud
   2025, a 60,000-pupil RCT in Peru where streak messages raised use of a maths platform over
   generic reminders and raised maths scores over the control, though not significantly over the
   other message arms; an earlier draft of this line overstated it). Streaks here are weekly
   (SPEC.md §8), are shown only while intact, and never shown resetting. 5.2 keeps to that.
6. **Rank feedback is U-shaped: first and last try hardest, the middle is flattest** (B: Gill et
   al. 2019, one laboratory experiment), and **competitive motivation falls as rivals multiply**
   (B: Garcia and Tor 2009).
   Nine guilds is the right scale. A local race for every guild, the gap to the adjacent one, passes
   the scale but does not fit under NFR-6 (6.1).
7. **Descriptive norms boomerang for people above the norm; never publish a low participation
   figure** (A: Schultz et al. 2007, replicated; the towel study failed a German replication).
   SPEC.md §1 expects a signup-to-participation base rate near 12%, so the Monday post's "31% of the
   guild logging" would in practice broadcast a low norm to a whole guild chat weekly. 5.4 fixes it.
8. **Fresh starts and the goal gradient** (B: Dai, Milkman and Riis 2014, +33% gym visits at a
   new week among students, archival; Kivetz et al. 2006, field experiments). The Monday reset and
   the bar already exist. A
   competition clock ("week 5 of 8") is the missing piece and is deferred by size (6.1).
9. **Exercise-as-gameplay novelty decays in about six weeks** (C: Pokémon Go, baseline again by
   week six, a difference-in-differences on survey data), **only 8% of gym nudges persist after
   the programme** (A: Milkman et al. 2021, 61,293 members, 54 arms), and **the people whose habit
   survives are the previous non-exercisers** (B: Charness and Gneezy 2009, two field experiments).
   The closing post is therefore written for newcomers (5.5).
10. **Reminders help a little, once a day at a chosen hour, and irrelevant messages reduce
    activity** (B: Bidargaddi et al. 2018, +3.9%; C: the Random AIM secondary analysis, each
    inspirational message cost 82 to 104 steps). No motivational filler goes anywhere, including
    this phase's copy.
11. **Juice is craft, not science** (C: Swink; the "juice it or lose it" school). About a third of
    it survives the loss of graphics: reply within a second, edit in place, a bar that fills, copy
    that varies so the tenth confirmation is not the first, and a rare effect reserved for the
    biggest event. The first three exist. 5.3 and 5.1 are the other two.

What the research explicitly fails to support, kept out and recorded in SPEC.md §8: loss-framed
points without stakes, daily streaks, variable rewards, badges, an individual leaderboard,
encouragement features, comparison against top performers, narrative, and any published share.

---

## 3. The admission scale

```
score = 2 x Impact + Reach + Cost + Safety        (each axis 0 to 5, so 0 to 25)
```

| Axis | 5 | 4 | 3 | 2 | 1 | 0 |
|---|---|---|---|---|---|---|
| **Impact** on fun during and the habit after, weighted by evidence | A-grade, large, on this behaviour | A or B, moderate; or strong theory plus industry data | theory with indirect evidence | plausible polish | novelty | none, or negative |
| **Reach** | every participant, every log or week | most participants weekly | many, occasionally | a minority | rare | nobody |
| **Cost** (5 is cheapest) | copy only | up to 8 effective lines, no schema, no callback kind | up to 15 lines | up to 30 lines, or a new callback kind | schema or more | a subsystem |
| **Safety** | no invariant, no §8 item, no noise | one soft concern | needs a smoke check to prove it does not annoy | conflicts with a design ruling | §8-adjacent | violates an FR, NFR or §8 |

Thresholds:

- **18 or more:** build now.
- **14 to 17:** later, once the MVP is stable, meaning after the smoke runs.
- **13 or less, or Safety 0:** no. Recorded in SPEC.md §8 so it is not re-proposed.
- **Existing features stay at 14 or more.** Removal has its own cost (a spec change, dead tests,
  churn in front of users), so the bar to stay is lower than the bar to be built.

NFR-6 was applied on top, not instead, while it had a ceiling: candidates that passed were built in
order of score per line, and building stopped before the headroom under 2,000 fell below 20
effective lines. What passed but did not fit was listed in 6.1. On 2026-09-08 the owner removed the
ceiling (section 11), so lines now count only through the Cost axis above, and SPEC.md §8 is the
alarm the number used to stand in for.

Impact is the axis most open to argument, which is why it is doubled and graded: a 4 needs a trial
or a meta-analysis behind it, and a 3 needs a named theory plus something measured.

---

## 4. Scores

### 4.1 Existing features

Cost here is the cost to keep, so it is 5 throughout. Nothing scores below 14 and nothing is
proposed for removal.

| Feature | Impact | Reach | Cost | Safety | Score |
|---|---|---|---|---|---|
| One-tap log, edited in place (FR-5 to FR-7) | 5 | 5 | 5 | 5 | 25 |
| Guild standings, week and season (FR-16) | 4 | 5 | 5 | 5 | 23 |
| Pinned standings, silent edits (FR-19) | 4 | 5 | 5 | 5 | 23 |
| Progress bar on every confirmation (FR-12) | 4 | 5 | 5 | 5 | 23 |
| Rest day as a record (FR-8) | 4 | 4 | 5 | 5 | 22 |
| Monday post as a fresh start (FR-20), before 5.4 | 4 | 5 | 5 | 3 | 22 |
| Monday post after 5.4 | 4 | 5 | 5 | 4 | 23 |
| Monday post's closing variant after 10.1 | 4 | 5 | 5 | 4 | 23 |
| Backdate to yesterday (FR-10) | 4 | 3 | 5 | 5 | 20 |
| Undo with the displaced tier restored (FR-9) | 3 | 3 | 5 | 5 | 19 |
| Daily reminder at a chosen hour (FR-21) | 3 | 4 | 5 | 4 | 19 |
| `/remind` (FR-24) | 3 | 3 | 5 | 5 | 19 |
| Command scopes (FR-17) | 2 | 5 | 5 | 5 | 19 |
| Weekly streak in `/me` (FR-13) | 3 | 3 | 5 | 4 | 18 |
| `/me` with three neighbours (FR-14, FR-15) | 3 | 3 | 5 | 4 | 18 |
| Five-ignore auto-stop and follow-up (FR-22) | 3 | 2 | 5 | 5 | 18 |
| 403 handling (FR-23) | 3 | 2 | 5 | 5 | 18 |
| Guild move confirmation (FR-3) | 2 | 1 | 5 | 5 | 14 |

Two notes. The neighbours block scores lower than it deserves on Reach only: the social-loafing
literature (Karau and Williams 1993, d = -0.44 across 78 studies) makes identifiability inside a
650-member guild the lever that stops a per-member average dissolving into anonymity, and the
Köhler effect says the right neighbour is a moderately better one, which one row up is. It is
load-bearing; do not cut it to save lines. The Monday post's Safety of 3 before 5.4 is the
descriptive-norm problem in 2.7, and its 4 after it is the residue section 9 records: a small count
in a large chat still reads low, which is the one soft concern Safety 4 describes (10.3). The two
standings rows sit at Impact 4 since the regrade in section 2: their evidence is two single trials
that agree, not a meta-analysis.

### 4.2 Candidates

Lines are effective lines under the CLAUDE.md count, estimated before building and corrected in
section 8 afterwards.

| # | Candidate | Impact | Reach | Cost | Safety | Score | Lines | Decision |
|---|---|---|---|---|---|---|---|---|
| A | Celebration on the confirmation that crosses the target | 4 | 4 | 3 | 4 | **19** | 14 | build (5.1) |
| B | Streak named on the confirmation when the target is met | 3 | 4 | 4 | 5 | **19** | 3 | build (5.2) |
| C | Confirmation heads proportional to the tier | 3 | 5 | 4 | 5 | **20** | 6 | build (5.3) |
| E | Monday post counts people who logged, not a share | 3 | 5 | 5 | 5 | **21** | 0 | build (5.4) |
| F | Closing post written for newcomers | 3 | 5 | 5 | 5 | **21** | 0 | build (5.5) |
| D | Competition clock: "Week 5 of 8" on the standings and the Monday post | 3 | 5 | 3 | 5 | **19** | 15 | built 2026-09-08 (11.1) |
| G | Local race in the Monday post: sessions behind the guild above | 3 | 5 | 4 | 3 | **18** | 9 | built 2026-09-08 (11.2) |
| R | Self-chosen weekly target from two or three options | 4 | 5 | 1 | 3 | 17 | 50 plus schema | built 2026-09-08 on the owner's brief (11.3) |
| S | Week grid in `/me`, one glyph per day, copyable into the chat | 3 | 4 | 3 | 4 | 17 | 14 | later |
| U | One implementation-intention question ("when this week?"), nothing stored | 3 | 4 | 4 | 3 | 17 | 3 | later |
| AA | "New week." on the Monday check-in prompt | 2 | 4 | 4 | 5 | 17 | 3 | later |
| T | This week's bar inside the reminder prompt | 3 | 4 | 3 | 3 | 16 | 10 | later |
| X | Coloured tier buttons (Bot API 9.4 button style) | 2 | 5 | 3 | 4 | 16 | 4 plus a grammY upgrade | later |
| I | Local race in `/me` | 2 | 3 | 4 | 5 | 16 | 5 | later, redundant with G |
| Y | Ephemeral per-user card in the group chat (Bot API 10.2) | 3 | 4 | 2 | 3 | 15 | 25 plus a grammY upgrade | later |
| AC | Sub-squads of three to six inside a guild | 4 | 5 | 0 | 2 | 15 | a subsystem | later |
| P | Winner hidden behind a spoiler in the Monday post | 1 | 5 | 5 | 2 | 14 | 0 | later, at the bottom |
| Q | Personal best week | 2 | 4 | 4 | 2 | 14 | 3 | later; rewards volume, which §4.1 does not pay for |
| AF | Season result on the closing post (critic pass) | 3 | 5 | 3 | 4 | **19** | 14 | build (10.1) |
| AG | Scoring rule stated in the reminder answers (critic pass) | 3 | 5 | 5 | 5 | **21** | 2 | build (10.2) |
| AH | Guild rank line on every confirmation (critic pass) | 3 | 5 | 3 | 2 | 16 | 10 | later (10.3, claim 9) |
| AI | Season summary in `/me` after the close (critic pass) | 3 | 3 | 3 | 5 | 17 | 12 | later (10.3, claim 13) |
| AJ | Return head after a missed week ("Back. Counts.") (critic pass) | 3 | 4 | 4 | 2 | 16 | 3 | later (10.3, claim 12) |
| AK | Rescale the published unit to per 100 members (critic pass) | 2 | 5 | 5 | 2 | 14 | 4 | later, at the bottom (10.3, claim 10) |
| Z | Inline-mode card the user can post anywhere | 3 | 2 | 2 | 4 | 14 | 20 | later |
| H | "N of your guild logged today" | 2 | 5 | 2 | 1 | 12 | 20 | no (2.7) |
| M | Badges and achievements | 2 | 3 | 2 | 3 | 12 | 40 | no |
| V | A named sponsor who receives your weekly result | 3 | 2 | 1 | 3 | 12 | 60 | no |
| AB | Loss-framed weekly points | 2 | 5 | 2 | 1 | 12 | 30 | no; tested only with money |
| N | Dice, rolls, any randomness | 1 | 3 | 4 | 0 | 0 | | no |
| J | Kudos or encouragement between members | | | | 0 | 0 | | no (SPEC.md §8) |
| K | Individual top-N of any kind | | | | 0 | 0 | | no (FR-15) |
| L | Daily streak | | | | 0 | 0 | | no (SPEC.md §8) |
| AD | Motivational lines in reminders | | | | 0 | 0 | | no (2.10) |
| AE | Prizes or tangible rewards | | | | 0 | 0 | | no (2.3) |
| W | Confetti effect as a separate message at the crossing | 4 | 4 | 4 | 3 | 19 | 3 | the fallback for A, not built alongside it |

Order of building by score per line: F and E (free), then B, then C, then A. That is the five,
estimated before building at a net of about 14 lines and measured afterwards at 23 (section 8; the
Lines column shows the measured figures and A's Cost was lowered from 4 to 3 to match). G at 9 more
would leave 10 of headroom and D at 15 would not fit at all; both wait for 6.1.

---

## 5. The five changes

### 5.1 Celebration on the confirmation that crosses the target (FR-28)

**What.** The log that takes a week from below the target to at or above it gets a big emoji
reaction on its own confirmation message: 🎉 the first time, 🔥 when the streak that week is already
two or more. Nothing else is ever celebrated: not a tier, not a day, not a rank. Undoing that log
removes the reaction.

**Why.** Principle 4: the target is the attainable standard, and meeting it needs a moment that
reads as a moment. Principle 3: a reaction is symbolic and informational, not a prize. Principle 11:
one rare effect for the biggest event, and the crossing is the biggest event a person has in the
product. The moment is a *change* (below to above), which is what a text bot can announce.

**How.** `crossedTarget(after, stored, displaced)` in `domain/scoring.ts` decides it purely: the
total before the log is the total after it minus the stored tier's minutes plus the displaced
tier's, and the crossing is `before < target && after >= target`. It is derived from the same three
values `logDay` already returns, so no state is stored and an undo, a re-log or a backdate all fall
out correctly. `checkin.ts` calls `ctx.react(emoji, { is_big: true })` **after** the confirmation
edit, fire-and-forget with a logged failure, so a refused reaction can never cost the user their
confirmation. The undo handler clears reactions the same way.

**Why a reaction and not an effect.** Telegram's message effects (Bot API 7.4) are the closer match
to a celebration screen, but they ride only on a *sent* message, never on an edit, and the
confirmation is an edit (FR-5). A reaction marks the confirmation itself, adds no message to the
chat, needs no unofficial effect id, and its `is_big` flag travels to the recipient's client. What
is unverified is whether a bot may react to its own message in a private chat (1.1). **Fallback if
the smoke run finds it refused:** send one short message at the crossing with
`message_effect_id` for 🎉 (`5046509860389126442`, a community-verified id), which is candidate W
at three lines, and record the swap here. Adopting it means removing the undo clear as well,
because that clear runs on every applied undo and would otherwise log a refused call on each one
forever.

**Invariants.** The reaction call comes after the edit, never before. It is `void`ed with a
`.catch` so a rejected reaction cannot reach `bot.catch` as a failed update (grammY's `react`
throws synchronously only when the callback carries no chat or message id, which no non-inline
callback lacks, and this bot has no inline mode). No other call site may react to anything.

**Known and accepted.** Two paths leave a reaction standing that the week no longer earns. A
downward re-log from a fresh `/log` (medium at 112 earns 🎉 on message A; a later short on the
same day from message B puts the week at 134) leaves A's 🎉 in place, because B is a different
message and reacting to A would mean storing its id. And the `UNDO_SUPERSEDED` branch clears
nothing, because it changed nothing. Both are consistent with FR-28 as written, both cost lines
the ceiling does not have, and both are recorded here so they are not rediscovered as bugs.

**Tests.** `crossedTarget` in `tests/domain/scoring.test.ts`: a crossing; already at target before
(no); a rest day (no); a re-log that displaces a tier and crosses only because of the difference;
a re-log that displaces a tier and does not cross; the exact boundary.

### 5.2 The streak on the confirmation when the target is met (FR-12, FR-13)

**What.** The tail line under the bar reads `Target hit. 3 weeks in a row.` when the target is met
and the weekly streak is two or more; `Target hit.` when it is one. Below the target the streak is
never mentioned.

**Why.** Principle 5: highlight the intact streak, never the broken one. The prototype had this
line ("Target hit. Fourth week running.") and the implementation dropped it; this restores it.
Principle 11's peak-end rule puts the best line last, which the tail already is.

**How.** `confirmation()` and `tail()` in `render.ts` take a `streak` argument, default 0.
`checkin.ts` computes it from `weeklyTotals()` and the existing `weeklyStreak()` reducer, against
the week the logged day falls in (the same `weekStart` the FR-12 label uses, so a Monday backdate
into last week reports last week's streak). One query per log, which is the same cost `/me` pays.

**Tests.** `tests/bot/render.test.ts`: two or more weeks names the count; one week does not; below
target says nothing about weeks; the previous-week variant still works; the streak tail carries no
dash.

### 5.3 Confirmation heads proportional to the tier (FR-27)

**What.** `22 min. Counts.`, `45 min. Good.`, `75 min. Big one.` The rest-day head is unchanged.

**Why.** Principle 3: feedback that informs, scaled to what was done. Principle 11: copy that
varies, deterministically, so the tenth confirmation is not the first. The tiny-habits literature
(C) holds that the small session is exactly the one that needs to be told it counted.

**How.** `TIER_HEADS` in `strings.ts`, one entry per tier including rest, read by `confirmation()`.
Copy stays in `strings.ts` per FR-27.

**Tests.** `tests/bot/render.test.ts`: each tier's head; the rest head unchanged.

### 5.4 The Monday post counts people, not a share (FR-20)

**What.** `with 52 of you logging at least once` replaces `with 31% of the guild logging at least
once`. `participation()` returns the count of distinct members with a record in the range.

**Why.** Principle 7. At SPEC.md §1's expected base rate the share is a low descriptive norm sent
to several hundred people every Monday, and Schultz et al. 2007 shows what a broadcast low norm
does to the people above it: they regress toward it. A count names the people who did it without
stating that most did not, and it is still the number the reader can change this week (phase 2
design 3.3's reason for the line). This corrects phase 2 design 4.3's share, and that section now
says so.

**How.** The `::numeric / g.member_count` division leaves `participation()`; `COUNT(DISTINCT
d.telegram_id)::int` is returned as `loggers`. `mondayPost` takes `loggers: number` instead of
`participation`. The restore-fidelity test calls `participation()` before and after a restore and
compares the two, so it now compares counts without being edited (10.3 corrected an earlier claim
here that it was).

**Tests.** `tests/db/standings.test.ts`: the same cases against counts. `tests/bot/render.test.ts`:
the count appears, no percent sign appears, both skeleton-equality tests still hold.

### 5.5 The closing post is written for newcomers (FR-20)

**What.** The closing post's last line becomes `Thanks for moving. The standings stop here. 150
minutes a week is yours to keep.` (the figure from config, FR-25).

**Why.** Principle 9: the habit that survives belongs to the previous non-exerciser, and principle
3's motivation-quality finding (Teixeira et al. 2012: identified regulation, "I value this",
predicts adoption) says the last thing the competition tells them should hand the target back as
theirs, not as the guild's. It states a fact and asks for nothing.

**How.** One string in `mondayPost`. Rank-independent, so the closing skeleton test is untouched.

**Tests.** `tests/bot/render.test.ts`: the closing post carries the line and the configured target.

---

## 6. Deferred and rejected

### 6.1 Passed the scale, blocked by NFR-6 (until 2026-09-08; built in section 11)

| Candidate | Score | Lines | What it needs |
|---|---|---|---|
| D, the competition clock | 19 | about 15 | `week_number` and `week_count` from `calendar()` (SQL, never JavaScript date arithmetic), two fields on `StandingsInput` and `MondayPostInput`, the header `Week 5 of 8 · minutes per member`, the opening `Week 5 of 8. Everyone back to zero.` |
| G, the local race | 18 | about 9 | The adjacent guild's per-member figure from the table the ticker already has, converted to medium sessions over the reader's roster: `4 sessions behind FK`, or `ahead of` for the winner. The Monday post's skeleton test must learn to normalise the direction word |

**Recommendation.** Raise NFR-6's ceiling to 2,100 for exactly these two, and build them in the
next iteration. Both are the two highest-graded principles (6 and 8) with nothing built for them,
and together they cost less than the fix reserve. The ceiling was a proxy for "something from §8
crept back in"; neither of these is from §8, and the design recorded on 2026-07-31 that the
ceiling should be spent on something binding, which an owner's explicit feature brief is.

### 6.2 Later, once the MVP is stable

The rows scored 14 to 17 in 4.2. Three deserve a note. R, a self-chosen weekly target, is the
single most evidence-backed missing element (the only ENGAGE arm that worked, +1,384 steps and
durable) and was blocked by a column, a callback kind and a decision about whether a target below
the WHO line is acceptable; the owner's brief of 2026-09-08 built it without the below-WHO option
(11.3). S, the week grid, is the closest thing a text bot has to Wordle's
shareable artefact, and the sharing must stay in the user's hands: the bot never posts in the group
on anyone's behalf. T, the bar inside the reminder, was scored down because an empty bar on
Thursday is a failure signal sent to exactly the people the reminder most needs to reach.

### 6.3 Rejected

Added to SPEC.md §8: loss-framed points without stakes; dice, rolls or any randomness; badges and
achievements; a broadcast participation share or a "logged today" count; a spoiler-hidden result;
motivational filler in reminders; prizes. Each with its reason, so it is not re-proposed.

---

## 7. Verification

Tests first, then code, as in every phase.

| Check | Covers |
|---|---|
| `tests/domain/scoring.test.ts` | `crossedTarget` (5.1) |
| `tests/bot/render.test.ts` | the streak tail (5.2), the heads (5.3), the count and the closing line (5.4, 5.5), both skeleton tests |
| `tests/db/standings.test.ts` (edited); `tests/db/restore.test.ts` (unchanged, compares whatever `participation()` returns) | `participation()` as a count (5.4) |
| `bun test`, `bunx tsc --noEmit` | everything else stays green |
| The counting command in CLAUDE.md | section 8 |
| [docs/SMOKE.md](../../SMOKE.md), Phase 5 section | the reaction rendering and animating, and being refused (1.1); every copy change on a real phone |

`checkin.ts` and the ticker's Telegram calls stay untested by design, as before; the smoke section
is their acceptance basis.

---

## 8. Size

`src/` was 1,958 effective lines before this phase and is **1,981** after it, counted with the
CLAUDE.md command, so **19 remain**. The five changes were estimated at a net of about 14 and cost
23: `crossedTarget` alone is 9, because its signature follows the file's multi-line style, and the
check-in wiring is 8 (the streak, the celebration with its guard and logged failure, and the clear on
undo). Nothing was removed net: the Monday post's count replaced a division rather than deleting
lines.

That is one line under the 20-line reserve section 3 asked for. Recorded rather than trimmed:
compressing a reviewed function to sit under a proxy is the trimming the Phase 4 design rejected, and
the honest reading is that the estimate was low, not that the build is bloated. The two admitted
features in 6.1 now cost more than the headroom, which makes the ceiling conversation there the only
route to them.

The critic pass (section 10) then took `src/` from 1,981 to **1,997**, so **3 remain**: the season
result on the closing post is 14 (12 in `ticker.ts` for the `placing()` helper shared by the two
tables, the conditional season query and the richer `final` input, 2 in `render.ts` for the
opening), the scoring sentence is 1 on each reminder answer, and the welcome rewording and the
neighbours guard are net zero. Estimated at 10 before building; the measured 14 moved AF's Cost
from 4 to 3 in 4.2, which leaves it at 19. That is the fix reserve spent on a defect in an existing
feature, which is what it was for. The next change of any size is the ceiling conversation in 6.1.

---

## 9. Risks specific to this phase

| Risk | Mitigation |
|---|---|
| A bot cannot react to its own message in a private chat, and the celebration silently never shows | 1.1: the smoke section checks for the reaction and for the `reaction for <id> failed` log line; 5.1 records the effect-message fallback |
| The big reaction animates only for the setter, not the recipient | Same smoke check; the static 🎉 on the message still carries the meaning |
| "Big one." or "Counts." reads as mockery to someone | Copy lives in `strings.ts` and is one edit; the smoke run asks two people whether it reads warm |
| The count in the Monday post is small early on and reads as a low norm anyway | It is a count, not a share, and the sentence names the people who did it; the alternative of hiding it below a threshold was rejected as a manipulation the evidence file warns against |
| Phase 5 spends the fix reserve | Section 3's 20-line rule; 6.1 keeps D and G out until the ceiling is raised on purpose |

## 10. The critic pass (2026-09-07)

After the build, an independent critic subagent verified the claims above, walked the product as a
user would with the real copy, rated it, compared it with commercial products, and listed the gap.
Its ratings: 4 of 10 as something a student would call fun, 7 of 10 as a behaviour-change
instrument, 1 of 10 at competing for phone time (which it said the bot should not try), 5 of 10 at
the job of getting a student to move and keep moving, and 7 of 10 for that job with the clock, the
local race, the season result and a guild line on the confirmation. Every claim was then tested
against the code and the sources. What survived changed the product; what did not is recorded here
with its reason, so it is not re-argued.

### 10.1 The closing post names the season result (FR-20)

**What.** The closing post opens `<b>That's the competition.</b> TiK wins the season, 18.4 minutes
per member, with Prodeko 4th of 9.` and continues with the last week's sentence and the 5.5 closing
line unchanged.

**Why.** The one notifying message the competition ends on named last week's winner and never the
season's. The season result lived only in the pinned message, which is silent by design (FR-19)
and frozen at the end. A competition whose result is never announced is a defect in an existing
feature, not polish. Phase 2 design 4.8 rejected this deliberately and on cost ("a second
`standings()` call and three more renderer inputs, all on a path that executes once per
competition"); the critic's history was wrong about that and its product point was right. On the
scale: Impact 3 (the peak-end rule is a named theory with measurement, and the closing post is the
end), Reach 5, Cost 3 (14 lines measured, 10 estimated), Safety 4 (it names the reader's season
rank, which the post already did for the week, and the copy is not rank-conditional), 19. Rarity of
execution is not a reason to leave the result unsaid.

**How.** `sendMondayPost` fetches the season table over `COMPETITION_START` to `lastWeekEnd` only
when `isFinalMondayPost` holds, the range the pin froze on (phase 2 design 4.7), so the two agree.
A `placing()` helper extracts a table's winner and one guild's rank for both tables, replacing the
inline version. `MondayPostInput.final` becomes the season result instead of a boolean, so a closing
post without one cannot be built.

**Tests.** `tests/bot/render.test.ts`: the season winner and the season rank appear beside the
last week's sentence; the season winner is escaped; the closing skeleton test now renders the two
sides with different season ranks as well as different weekly ranks.

### 10.2 Three small corrections

- **The rules are stated once (FR-4).** Nothing in the bot said how guilds are scored: the welcome
  named the guild, the reminder answer named the target, and the pin said "minutes per member"
  with no denominator in sight. Both reminder answers now carry `Prodeko is ranked on minutes per
  member, and everyone on the roster counts, so every tap moves the number.` Copy only (3, 5, 5, 5:
  21). On both branches because every newcomer reads exactly one of them.
- **The welcome no longer says most people lapse (FR-4).** "Most people forget by week three" sold
  the reminder with a descriptive norm about lapsing, and a message that says most people do the
  undesirable thing also says most people do it (Cialdini 2003, evidence 5.2). It now reads "It's
  easy to forget by week three unless something asks, so: should I?", which keeps the
  recommendation FR-4 requires.
- **The neighbours block hides while all three are at zero (FR-14).** `neighbours()` orders ties
  by first name, so before anyone near the reader had logged, the block was two alphabetical
  strangers at zero beside the reader's own zero: nothing identifiable, which is the block's whole
  reason (evidence 5.8), and a failure signal shown twice. It returns the moment one of the three
  has minutes, including when that one is not the reader. One condition in `meMessage`, no schema.

### 10.3 The critic's claims and their rulings

| # | Claim | Ruling | Change |
|---|---|---|---|
| 1 | The closing post never announces the season winner | **Held.** The critic's history was wrong (phase 2 design 4.8 rejected it on purpose), the product point right | 10.1 |
| 2 | The design claimed `restore.test.ts` was edited | **Held.** It calls `participation()` and so tests the count without an edit | 5.4 and 7 corrected |
| 3 | "Most people forget by week three" is a low norm in the welcome | **Held** (Cialdini 2003) | 10.2 |
| 4 | Monday post Safety 5 contradicts the risk table's own row | **Held.** That row is the "one soft concern" Safety 4 describes | 4.1: 23 |
| 5 | Evidence grades run one notch generous | **Held in part.** The scale as written defined A as any trial; tightened in section 2. No candidate score moved; two existing features fell to Impact 4 | section 2, 4.1 |
| 6 | Deci's praise split (+0.66, -0.44) is unverified | **Dismantled.** Table 9 of the paper, but from four studies; the grade for that split is now B and the k is recorded | evidence 5.1 |
| 7 | The Peru streak RCT is unverified | **Dismantled** (Aulagnon et al. 2025), but the design overstated it: streaks beat generic reminders on platform use, and on achievement only against control | principle 5 |
| 8 | Onboarding never explains the game | **Held** | 10.2 |
| 9 | Put the guild's rank on every confirmation | **Dismantled.** Rank feedback to the flat middle of the U (principle 6) at Reach 5 is the demotivation the Monday post was built to avoid; on a Monday every guild is jointly 1st at 0.0; the confirmation is the attainable personal standard (principle 4); the rank is one tap away in `/me`, by pull. 3, 5, 3, 2: 16 | AH, later |
| 10 | "1.8 minutes per member" is opaque; rescale it | **Dismantled.** The unit is the design's message (SPEC.md §4.3: everyone on the roster counts) and a per-100 figure hides the roster; the number grows through the week and the season. 2, 5, 5, 2: 14 | AK, at the bottom |
| 11 | The neighbours block at zero names alphabetical strangers | **Held** | 10.2 |
| 12 | Nothing acknowledges a return after a missed week | **Dismantled for now.** The critic's own score is 16, and naming the absence is the display 5.3 warns about; wants a smoke test with two people first | AJ, later |
| 13 | A season summary in `/me` after the close scores 18 | **Deferred.** Reach is 3, not 4: nothing prompts a `/me` after the end. 3, 3, 3, 5: 17 | AI, later |
| 14 | §8's "elaborate team mechanics" mislabels an evidence-backed idea (small groups) as rejected | **Held in part.** §8 rejects team-spirit features, not group size, and sub-squads (AC) were already a cost rejection at 15. The transfer gap was unrecorded: every positive competition trial used groups of three to six and the guild is 350 to 700 | evidence §4 |
| 15 | NFR-6 now blocks the alarm's own purpose | **Held by the owner** on 2026-09-08: the ceiling is removed, the count is a trend, §8 is the alarm | section 11 |
| 16 | The fixed 150 target should be self-chosen (ENGAGE) | **Held in part by the owner** on 2026-09-08: `/target` raises it; nothing below the WHO line until SPEC.md §9 Q7 | 11.3 |
| 17 | 4 of 10 for fun, 7 of 10 as an instrument | **Accepted** as the honest state before a smoke run; nothing here claims otherwise | none |

### 10.4 What the critic could not verify, and neither can this document

Whether a bot may react to its own message in a private chat, whether the big reaction animates for
the recipient, whether "Big one." reads warm or mocking, and what participation actually looks like
at Aalto. All of it waits on the smoke run (1.1).

---

## 11. After the ceiling (2026-09-08)

The owner removed NFR-6's ceiling ("I set that when I wanted to heavily trim the bot"), which
unblocked the two admitted candidates, and raised a concern about members who train ten hours a
week, which brought R forward. All three built the same day, tests first. `src/` went from 1,997 to
2,145 effective lines; the tests from 286 to 314.

### 11.1 The competition clock (FR-16, FR-19, FR-20)

*Superseded in part by 12.2: the unit is now active days, and by 13.2: the header branches on the
competition phase, not the number.*

**What.** The weekly header on `/standings` and the pin reads `Week 5 of 8 · minutes per member`,
and the ordinary Monday post opens `Week 5 of 8. Everyone back to zero.`

**Why.** Principle 8: the goal gradient needs an end in sight, and the fresh start lands harder when
it says how many are left. Candidate D, 19.

**How.** `calendar()` returns `weekNumber` and `weekCount`, computed in SQL from the configured
window (Monday of the start to Monday of the end, divided by seven), never in JavaScript. The
number is deliberately not clamped: `/standings` is unguarded and answers outside the window, so
`render.ts`'s `clock()` falls back to "This week" when the number is outside 1 to `weekCount`, and
the calendar tests pin the unclamped values so a later clamp fails visibly. The closing post has no
clock; its opening is the season result (10.1). `refreshPin` and `sendMondayPost` take the clock
from the tick's single `calendar()` read.

**Cost.** About 30 lines, the SQL type block being most of it; estimated 15.

### 11.2 The local race in the Monday post (FR-20)

*Superseded by 12.2: the gap is in active days and no per-member figure is shown.*

**What.** `Prodeko finished 4th of 9, 1.8, with 52 of you logging at least once. FK, one place up,
was 3 sessions away.` The winner reads `AS, one place down, was 19 sessions away.` A tie reads
`FK finished level with you.`

**Why.** Principle 6: rank feedback is U-shaped and the middle of a nine-guild table is where the
standings alone go quiet, so the post gives every guild one neighbour and one actionable number.
Sessions rather than minutes per member because "three more of us doing 45 minutes" is something a
member can do and "0.2 minutes per member" is not. Candidate G, 18.

**How.** `standings()` now returns `memberCount` per row. `localRace()` in `domain/scoring.ts`
takes the sorted table and the reader's index, picks the guild above (below, for the winner), and
converts the per-member gap into medium sessions over the reader's roster, rounding the gap to whole
minutes first so float noise cannot turn one session into two. The renderer has one sentence shape
at every rank; both skeleton tests strip its name, direction word and count, so a rank-conditional
rewording fails them. The bottom guild reading "40 sessions away" is the risk recorded in SPEC.md
§11; the smoke run asks two people.

**Cost.** About 25 lines; estimated 9.

### 11.3 The self-chosen weekly target (FR-29)

**What.** `/target` shows the current target and four buttons: 150 (the WHO line, where everyone
starts), 225, 300, 450. The choice moves the bar, "Target hit", the streak and the celebration;
`/standings` does not change by a minute. The reply states why the guild's number does not move
(since 12: a day counts once whatever its length; before 12 it named the daily cap). Both
registration replies now end their target sentence with "Train more than that? /target raises it."

**Why.** Principle 4 and evidence 5.7: ENGAGE's only working arm let people choose. And the owner's
concern of 2026-09-08: someone training daily hits 150 on Tuesday and then reads "Target hit" for
five days, which is the one place the product had nothing to offer the most active members.
Candidate R, 17, brought forward on the owner's brief.

**Not asked at registration.** Newcomers start at the WHO line, the attainable standard the
evidence wants, and an extra tap there would fall on the people least likely to want it.

**Nothing below 150.** SPEC.md §4.2 keeps the guideline as the floor until §9 Q7 is decided.
Adding an option is one entry in `TARGET_OPTIONS`.

**How.** Migration 004 adds `users.target_minutes INTEGER CHECK (> 0)`, NULL meaning "the config
figure", so the WHO line lives in `config.ts` only (FR-25) and the column stores a choice, not a
derived number (SPEC.md §4.4). `UserRow.targetMinutes` resolves the NULL. A new callback kind
`target:<minutes>` decodes only to a value in `TARGET_OPTIONS`, so a stale button for an option
later removed is refused. `target.ts` is the handler, installed after reminders and before the
catch-all. `checkin.ts` and `reports.ts` pass `user.targetMinutes` to the bar, the streak and
`crossedTarget`. Raising the target rereads the streak against the new bar: a week at 165 is no
longer "at target" for someone who chose 300, which is the honest reading and is written into the
smoke section.

**What it does not do.** It does not change what a heavy trainer contributes. That is the daily
cap (SPEC.md §4.1), which is a scoring-model decision recorded as §9 Q8 for the owner, with the
arithmetic: seven long days are 525 minutes a week, whatever the member actually did.

**Cost.** About 95 lines (`target.ts` 47, copy 25, codec, column, wiring); estimated 50 plus
schema.

### 11.4 What changed in the rulings

Claims 15 and 16 in 10.3 were the owner's to make and are now made: the ceiling is gone, and the
target is self-chosen upward. Q7 (a target below the WHO line) and Q8 (the daily cap for members
who train ten hours a week) are the two open questions this build leaves, both in SPEC.md §9.

---

## 12. The scoring change: active days per member (2026-09-08)

The owner asked how the point system should work if the goal is to get as many people as possible
active. The answer proposed was active days per member; the owner asked for research on activating
a community before adopting it. Two briefings were commissioned (docs/research/2026-09-08-*.md),
their load-bearing figures re-read from the primary records (docs/evidence.md §6), and the proposal
was adopted with the tweaks both briefings converged on. Built the same day, tests first; 324 pass.

### 12.1 The rule (SPEC.md §4.3)

A guild's score is its count of active days (any tier but rest, at most one per member per day)
divided by its full roster. Minutes per member breaks ties, then name, then slug. `standings()`
counts with `COUNT(d.date) FILTER (WHERE d.tier <> 'rest')`; nothing new is stored (§4.4 holds).
The personal layer is untouched: the bar, the target, the streak and the celebration still run on
minutes, because a team-only consequence does nothing on its own (evidence 6.2) and the tiers are
still the honest resolution of a one-tap report.

**Claim withdrawn.** The proposal said days make the marginal newcomer "worth as much as" the
marginal athlete. The Köhler literature (6.1) says motivation gains for weaker members need
conditions a 500-member guild cannot provide under any rule. What days do is bound each
contribution, remove the single carrier, cap the payoff of inflation (6.5), and match the currency
of the randomised trials that made team competition work (6.3). The rationale in SPEC.md §4.3 says
exactly that and no more.

### 12.2 What is displayed, and what never is

Both briefings flagged the same exposure: a per-member average is a share in disguise, and the
people above it cut their contribution when shown it (6.4). So the per-member figure exists only
inside the ORDER BY.

- The tables show `rank  guild  active days` as whole numbers under `Week 5 of 8 · active days`
  and `Season · active days`, with the footer "Ranked per member of the whole roster, so a small
  guild can beat a big one. Everyone in the guild counts, logging or not."
- The Monday post: `Last week TiK took it.` (no figure), `Prodeko finished 4th of 9 with 70 active
  days and 52 of you logging at least once. FK, one place up, was 26 active days away.`
- The closing post: `TiK wins the season, with Prodeko 3rd of 9.` (no figure).
- Tests assert the absence of any decimal in both messages, so a `toFixed` cannot creep back.

The local race (11.2) is now in active days, which reads as "two of us logging every day closes
it". `localRace` rounds the product to a thousandth of a day before the ceiling.

### 12.3 The mark to beat, and the day as the guild's

Two lines from Kleingeld et al. 2011 (6.6). The Monday post ends `Nothing carries over. This week
is open. The mark to beat: 70 active days.`, the guild's own last count: a specific goal it set
itself, omitted at zero (where "beat 0" is not a goal) and on the closing post, and never reported
as missed. The branch is on the count, not the rank, so both skeleton tests hold. The confirmation
head becomes `45 min. Good. A day for Prodeko.` for any tier but rest, stated as a fact, which
turns the personal target into a groupcentric one and is literally true under day scoring. FR-30.

### 12.4 The nomination ask

Kim et al. 2015 (6.7): friendship-nominated seeds beat the best-connected ones. The registration
reply's rules paragraph now ends `Know someone in Prodeko who'd do this? Send them the link:
https://t.me/<bot>?start=prodeko`, built in `registration.ts` from `ctx.me.username`. No referral
count, no bonus, and the bot never posts it anywhere itself. Outside the bot, the organiser-side
step (ask each guild board for two or three well-liked, ordinary-fitness members to log visibly in
weeks one and two) is recorded in SPEC.md §9 Q8 and README's launch notes.

### 12.5 Declined from the briefings

A dynamic-norm line (tiny effect, a branch on direction; 17, later). Per-100 display (12.2).
Sub-squads or a pair rule (SPEC.md §9 Q9; the one thing the scoring change does not supply).
Tier weighting, new-logger bonuses, referral counts, a critical-mass target in copy (SPEC.md §8).

### 12.6 Size

2,145 to **2,156** effective lines. The query grew by four lines, the renderer by a handful for
the mark and the guild line, `strings.ts` by the shared `rules()` paragraph, and the race lost its
session parameter.

---

## 13. The finish pass (2026-09-08)

The owner's brief: "iterate and polish it until you think that it is ready. Have a critique critique
parts of the bot and if anything surfaces, fix it. And think about genuine polish things." Two
critics ran in parallel on the tree after section 12: one on correctness (the diff, the query, the
ticker, the calendar, the target, the docs), one walking every interaction a member and a guild
admin will have, looking for what stops it feeling finished. Every finding was checked against the
code before it was acted on. 355 tests pass afterwards; `src/` is 2,305 effective lines.

### 13.1 Correctness findings, all fixed

- **Ranks ignored the minutes tiebreak.** `competitionRanks` ran over `perMember` alone while the
  query ordered by days per member then minutes per member, so two guilds level on days were
  joint 1st in every table and the Monday post to the second one said the first "took it" and
  then "finished level with you". Reachable in week one for any equal-roster pair. `standingRanks`
  ranks on the composite key at all three sites, and the post carries a list of winners: one is
  "took it", several "shared it", none with a day "nobody logged a day". The tie sentence says
  "level with you on days" so a 2nd place next to it is not a contradiction.
- **"1 active days."** A plural helper serves the guild sentence and the mark; the race already
  had one.
- **The clock assumed a Monday start.** With a mid-week start `weekNumber` is 1 on the Monday
  before the window, and the renderer's numeric fallback did not catch it. `competitionPhase`
  decides the header now; the calendar test pins the unclamped number a full week outside the
  window instead of one day.
- **The restore surface omitted `target_minutes`**, so a dump that lost migration 004's column
  round-tripped clean. The fixture sets a target and the surface reads it back.
- **Stale statements**: FR-16's lead sentence still said minutes per member; NFR-6 had an orphan
  line; README pointed at a ceiling that no longer exists; SMOKE's "The numbers" step divided
  minutes; five comments and two design sections (11.1, 11.2, 11.3) described the pre-12 unit.
  All corrected or marked superseded.

### 13.2 Window edges

`/log` before the start replied with a prompt whose every tap was refused, and links are posted
before the start. It now says `The competition starts on 27 July 2026. Nothing to log until then;
I'll be here.` and, after the end, `The competition ended on 20 September 2026. Thanks for moving.`
Dates are the config labels rendered by `longDate`, no Date object. After the end `/standings`
and `/me` show the final week under "Final week", so they agree with the frozen pin instead of
ranking nine zeros jointly 1st. `main.ts` prints the window at boot and warns when today is
outside it.

### 13.3 Finish items

Each of these is a first- or second-contact moment; each cost a few lines.

- The bot sets its own short description and "What can this bot do?" panel at boot.
- A typed message or unknown command in a private chat gets the three commands back. Groups
  stay silent.
- `bot.catch` answers the person (a toast on a failed tap, a reply on a failed command), not only
  the log.
- `/log` when today is logged says what is logged and that a tap replaces it (`dayTier` was
  already written and unused).
- The yesterday prompt has a "Today instead" button.
- Every message that carries the hour keyboard asks the question the buttons answer, and the
  already-counted reply carries the rules paragraph and the recruit link, so a returning member
  can find them again.
- `/remind` while off has no "Turn them off"; the follow-up says "Want them back?"; a superseded
  undo points at `/me`; the binding reply says standings arrive within 15 minutes and asks for
  pin permission up front; the target keyboard marks the current choice, its text names the way
  back to 150 and no longer mentions a celebration the reader has never seen; the toasts share
  one shape; "Fine. Still Prodeko." became "Staying in Prodeko."; the rules say what a tap counts.
- A first name longer than the column is cut so the minutes stay aligned.
- The log says the one thing a maintainer needs each day: the window at boot, the first pin per
  chat, each Monday post, and the stop signal.

### 13.4 Declined

Two of the polish critic's judgment calls stay as they were, as owner decisions rather than
defects: every guild reads "1st of 9" before anyone has logged on a Monday (ties share the best
rank), and `REMINDER_HOURS` has no 19:00. Both are one edit if the owner wants them.

### 13.5 Readiness

The polish critic's verdict before the pass was 7 of 10, with the frame around the loop, not the
loop, as what was unfinished, and 8.5 pending the smoke run once the top items were fixed. All of
its items were fixed. What remains is the smoke run itself (docs/SMOKE.md, now with a Finish
section), which no amount of code can substitute for: the celebration reaction, the group binding
order and the copy on a real phone.

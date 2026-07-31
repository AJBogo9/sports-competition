# Maintainer's Guide: a Taliesin book, published behind a passcode

Date: 2026-07-31
Status: approved, not yet built

## What this is

A Taliesin book at `docs/book/`, published to Cloudflare Pages behind a shared
passcode, that hands this bot to a future maintainer.

It is a *complement* to the documents already in the repository, not a replacement for
any of them. SPEC.md stays the source of truth. The book explains shape, reasons and
operations, and cites FR-x / NFR-x rather than restating the requirements list.

## Why a separate book at all

The repository's documents each answer a different question and none of them answers
"I have just inherited this, where do I start":

- SPEC.md answers "what must it do", in a numbered list built for tracing.
- The four phase designs answer "what did we decide, and when".
- CLAUDE.md answers "what will bite an agent editing this file today". It is written
  for a reader who is already inside the code.
- README answers "how do I run it".

A maintainer arriving cold needs a narrative that orders those: the model, then the
shape, then the code, then the rules, then the runbook.

## Reader

Three tasks, in the order they are likely to arrive:

1. Run next year's competition (config, redeploy, what recomputes).
2. Change or extend the code (architecture, invariants, the size ceiling).
3. Debug it in production (the ticker, symptom-to-cause).

A fourth reader, the person who finishes the unfinished work (NFR-3, the smoke run), is
served by a single chapter rather than a part, because that work is small and mostly
lives outside this repository.

## Structure

Book, in four parts.

```
index                    who this is for; what is deliberately not here

Orientation
  the-competition        tiers, weekly target, per-member ranking, streak
  shape                  the dependency arrow, the file map, the size ceiling

The code, layer by layer
  config                 the only knob; what recomputes; the rebuild trap
  domain                 the pure decisions and why each was extracted
  database               schema, migrations, the four SQL rules, the tier CTE
  handlers               grammY wiring, install order, the callback codec
  ticker                 the 60-second loop and its three date gates

Invariants
  invariants             each rule, with the defect it caused or nearly caused

Operations
  running                dev, tests, compose, deploy
  next-season            the runbook for a new competition
  troubleshooting        symptom -> cause -> the command that confirms it
  status                 what is not done, and why
```

The parts follow the reader, but the middle part follows the code's own organising
idea, the one-way dependency arrow, so no single subsystem is split across chapters.

## Content rules

These exist so the book does not rot.

- **Requirements are cited, never restated.** A chapter says "FR-20" and links to
  SPEC.md §5. If the book ever contains a second copy of the requirements list, that
  copy is a defect by SPEC.md's own precedence rule.
- **Every claim comes from the code**, read at the time of writing, not from CLAUDE.md
  paraphrased. Where the two disagree, the code wins and the disagreement is reported.
- **Code excerpts are static and cited** as `path.ts:line`. No executable cells, so the
  build needs no kernel and cannot fail on cell execution.
- **A rule is stated with its defect.** The invariants chapter is only useful if the
  reader believes each rule, and the evidence is the bug it already caused.

## Diagrams

Three `{mermaid}` blocks, rendered client-side:

- the one-way dependency arrow (orientation),
- the schema as an ER diagram (database),
- the ticker's per-minute decision tree (ticker).

## Publishing

- Cloudflare Pages project `sports-competition-docs`.
- `taliesin publish docs/book`, which is passcode-gated by default. The passcode lives
  only as a Cloudflare secret; it is never written into the repository by the tool.
- `--dry-run` first, then `--init`, then the real deploy.
- Build output `_book/` is gitignored. The book's source is committed.

**Accepted risk, recorded here because it is not obvious:** the passcode will be pasted
into the repository README by hand, so it enters git history permanently and travels
with the repository if it is ever made public. This is deliberate. The gate's purpose is
to keep the docs off the open web, not to protect a secret.

## Out of scope

- No changes to `src/`, SPEC.md, or the phase design documents.
- No new requirements, and nothing from SPEC.md §8 reintroduced as a "future idea".
- The book costs nothing against NFR-6's 2,000-line ceiling, which counts `src/` only.

## Verification

- `taliesin check docs/book --strict` passes (no broken cross-references, no located
  warnings).
- `taliesin publish docs/book --dry-run` builds clean before any deploy.
- Each chapter re-read against the files it describes.

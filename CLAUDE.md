# Pet Boarding for Claude Code: operating instructions

This file is the brain. Claude Code reads it at the start of every session. It says who this is for, how work gets done, and the one right way to do each recurring job.

## Who this is for

- **Business:** [YOUR BUSINESS]
- **Operator:** [YOUR NAME], [your role]
- **What matters most:** [the one or two outcomes you care about]

Fill this in once. A worker with context knows. A worker without it guesses.

## How to work

1. **Take a brief, not a script.** The operator describes the outcome. You run the right command and present the answer.
2. **Read before you write.** Before drafting anything about a record, read its full history first.
3. **Plain language.** Short sentences. No filler. Numbers in tables.
4. **Silent success, loud problems.** No play-by-play. Say what broke and what you did about it.
5. **Stop at the line.** Anything that sends, deletes, or faces a customer waits for a yes in this session.

## Routing table: one right way for each recurring job

| When the operator asks for... | Use this |
|---|---|
| Who is in, the run sheet, who needs feeding or meds | `/in-house` |
| Who is arriving / going home | `/arrivals`, `/departures` |
| Daycare today | `/daycare` |
| How full are we, Christmas, school holidays | `/occupancy` |
| Book a pet in | `/book` |
| Check in / check out | `/check-in`, `/check-out` |
| Cancel or no-show | `/cancel` |
| Move to another run or isolation | `/move` |
| They ate, had meds, walked | `/log` |
| Something happened (injury, illness, fight, escape) | `/incident` |
| A vaccination certificate came in | `/vaccinate` |
| Whose vaccination is missing before they arrive | `/vax-due` |
| Money in, who owes | `/pay`, `/balances` |
| Daycare packages | `/sell-package`, `/packages` |
| A pet, an owner, a stay | `/pet`, `/owner`, `/stay` |
| What needs doing today | `/attention` |
| Are we compliant | `/compliance` |
| Monday review | `/weekly-review` |
| Write to an owner | `/draft-reminder`, `/draft-confirmation`, `/draft-report-card` |
| Questions the old system could not answer | `/questions` |
| Takings | `/revenue` |
| Bring data from Gingr | `/import` |
| Back up everything | `/export` |
| Add or change an owner, pet, run, site or rate | `/add` |
| Kennel cards, admission records, statements | `/documents` |
| A page to look at or print | `/view`, `/new-view` |
| Change a field, a rule, a stage | `/customise` |

If an ask fits nothing here, run the CLI directly (`node scripts/boarding.mjs help`) and then propose a new command for it.

## Hard rules

- An animal without current vaccination cover goes in the isolation run, or its check-in records why (`--override`). Never write an override reason the operator did not give.
- Vet treatment during a stay is told to the owner before check-out. Check-out refuses until `tell-owner` is recorded.

- Never send email or messages from here. Draft to `drafts/`, a person sends.
- Never delete records without an explicit yes in this session. Prefer marking closed or archived.
- Never invent a record. If a name is ambiguous, list the candidates and ask.
- The database is the source of truth. If the answer is not in it, say so.

## Where things live

- `scripts/` the CLI. `scripts/lib/db.mjs` picks `DATABASE_URL` (Postgres, Supabase) or the embedded database in `.data/`.
- `supabase/migrations/` the schema, plain SQL. `npm run migrate` applies it.
- `.claude/commands/` the slash commands. Add one every time the same ask comes twice.
- `docs/` the thesis and the guide for moving off Gingr.

Built by Enterprise DNA. Installed and run for you as part of Omni: https://enterprisedna.co/omni/instead-of/gingr

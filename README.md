<h1 align="center">Pet Boarding for Claude Code</h1>

<p align="center">
  <strong>The open-source kennel, cattery and doggy daycare system that is just a database and Claude Code.</strong>
</p>

<p align="center">
  Created by <a href="https://www.enterprisedna.co"><strong>Enterprise DNA</strong></a>. Free and open source. Works with Claude Code, Codex, OpenCode or Cursor.
</p>

<!-- three-doors -->
<table align="center">
  <tr>
    <td align="center"><strong>Do it yourself</strong><br/>Clone it, run it, own it. Free, MIT.<br/><a href="#quick-start">Quick start</a></td>
    <td align="center"><strong>We customise it</strong><br/>Your fields, your rules, your Gingr data brought across.<br/><a href="https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gingr">Book a call</a></td>
    <td align="center"><strong>We run it for you</strong><br/>Installed, connected and operated inside Omni. Setup fee, then a retainer.<br/><a href="https://enterprisedna.co/omni/instead-of/gingr?utm_source=github&utm_medium=readme&utm_campaign=gingr">How it works</a></td>
  </tr>
</table>

<p align="center">
  <a href="#what-is-this">What is this</a> &bull;
  <a href="#why-no-front-end">Why no front end</a> &bull;
  <a href="#quick-start">Quick start</a> &bull;
  <a href="#the-commands">Commands</a> &bull;
  <a href="#instead-of-gingr">Instead of Gingr</a> &bull;
  <a href="#want-it-installed-and-run-for-you">Installed for you</a> &bull;
  <a href="#license">License</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node-20+-339933?style=flat-square" alt="Node 20+" />
  <img src="https://img.shields.io/badge/PostgreSQL-any-336791?style=flat-square" alt="PostgreSQL" />
  <img src="https://img.shields.io/badge/PGlite-embedded-3ecf8e?style=flat-square" alt="PGlite" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" />
</p>

---

## What is this

Pet Boarding for Claude Code does the job you pay Gingr for, as a Postgres database and a set of agent commands. There is no web front end. You open the folder in [Claude Code](https://claude.com/claude-code) (or Codex, OpenCode, Cursor: see `AGENTS.md`) and ask for what you want in plain language. It runs the right query, and it can answer questions the Gingr dashboard cannot.

Gingr's Stay plan for boarding facilities lists US$179 a month with its integrated payments, or US$154 a month billed annually (US$1,848 a year), and US$209 a month without its payments ([gingrapp.com/pricing](https://www.gingrapp.com/pricing), checked 5 October 2026). Groups with several sites get a quote. This is free, and a second site is a row in a table.

Want the same thing with a web front end, or built on a different stack? That is a customisation, and it is exactly what Enterprise DNA does: [book a call](https://enterprisedna.co/omni/book/?utm_source=github&utm_medium=readme&utm_campaign=gingr).

It covers what a boarding kennel, cattery or doggy daycare does every day: bookings and the lodging plan, arrivals and departures, the run sheet (feeding, medication, behaviour), care logs, incidents, vaccination certificates, daycare packages, what owners owe, and occupancy for the busy season. It checks the records against the NZ Code of Welfare for temporary housing and the NSW, ACT and Victorian boarding codes, and renders kennel cards, admission records, go-home reports and statements in your brand. Built for owner-run facilities in New Zealand and Australia with one to a few sites.

### Your first hour: ten things to ask for

1. "Who is in today, and who hasn't been fed or had their meds?"
2. "Who arrives tomorrow without a current vaccination?"
3. "Check Max in to K3, bright and eating, 34 kilos."
4. "Max has a honking cough. Log it as infectious and move him to isolation."
5. "Which nights over Christmas are full?"
6. "Book Luna for daycare Thursday off her package."
7. "Who owes us money and has already booked again?"
8. "Run the record checks and tell me what to fix first."
9. "Draft the go-home note for Bella."
10. "Add a field for the owner's pick-up person, and show it on the kennel card." (`/customise`)

## Why no front end

- The front end was only ever there because the database was hard to talk to. That is no longer true.
- Your data sits in plain Postgres tables you own. Any tool can read them. No export, no lock-in.
- No seats, no tiers, no add-ons. Read [docs/why-no-front-end.md](docs/why-no-front-end.md) for the honest trade-offs too.

## Quick start

Sixty seconds, no database install (an embedded Postgres runs inside Node):

```bash
git clone https://github.com/Enterprise-DNA-OS/pet-boarding-for-claude-code.git
cd pet-boarding-for-claude-code
npm install
npm run demo
```

Then open the folder in Claude Code and type `/attention`: it lists what needs a person today, record checks first. Then try `/in-house` for the run sheet and `/occupancy` for the busy nights ahead.

### Use it with your own Postgres or Supabase

Copy `.env.example` to `.env`, set `DATABASE_URL`, then `npm run migrate`. Same commands, shared data, no per-seat fee.

## The commands

| Command | What it does |
|---|---|
| `/in-house` | The run sheet: who is in, which run, feeding, medication, last checked |
| `/arrivals` | Today's arrivals with vaccination status and care notes |
| `/departures` | Who goes home today, the bill, treatment to hand over |
| `/daycare` | Today's daycare roster |
| `/occupancy` | Nights at 80% or more for the next 90, over capacity first |
| `/book` | Book boarding or a daycare day, with vaccination and full-night warnings |
| `/check-in` | Check in with condition on arrival; refuses an unvaccinated animal outside isolation |
| `/check-out` | Check out and settle the nights; refuses until treatment is told to the owner |
| `/cancel` | Cancel a booking or mark a no-show |
| `/move` | Move to another run, for example isolation |
| `/log` | Log feed, meds, walk, welfare, play |
| `/incident` | Record an incident, tell the owner, resolve it |
| `/vaccinate` | Record a vaccination certificate |
| `/vax-due` | Booked stays with cover missing at arrival or lapsing during the stay |
| `/pay` | Record a payment |
| `/sell-package` | Sell a daycare package |
| `/balances` | Who owes what |
| `/packages` | Daycare packages: used, booked, left, expiry |
| `/pet` | One pet's full record |
| `/owner` | One owner's pets, stays and balance |
| `/stay` | One stay with its care log |
| `/attention` | Everything that needs a person today |
| `/compliance` | Record checks against the boarding codes, each with its source |
| `/weekly-review` | The Monday review, saved to drafts/ |
| `/draft-reminder` | Vaccination reminders to owners (drafts) |
| `/draft-confirmation` | Booking confirmation (draft) |
| `/draft-report-card` | The go-home note from the care log (draft) |
| `/questions` | Ten questions the Gingr dashboard does not answer |
| `/revenue` | Takings by site |
| `/import` | Bring owners, animals and reservations across from Gingr |
| `/export` | Everything to one JSON file |
| `/add` | Add or change a site, run, owner, pet or rate |
| `/documents` | Kennel cards, admission records, go-home reports, statements |
| `/view` | Today, occupancy and record-check pages |
| `/new-view` | Add a page in plain language |
| `/customise` | Make it yours: a field, a rule, a renamed stage |

Every command drives one CLI, `node scripts/boarding.mjs` (`help` lists everything, `--json` on any command). Names match case-insensitively and by fragment; when two match, it lists both and stops.

### Ten questions Gingr's dashboard does not answer

`/questions` runs these against your records:

1. Which nights in the next 90 days are 90% full or more, by site and service?
2. Which booked pets will arrive without current vaccination cover, and how many days do their owners have to send it?
3. Whose vaccination runs out part way through a stay already booked?
4. Which daycare dogs came in the last 60 days but have nothing booked for the next 14?
5. Which owners still owe money and already have another stay booked?
6. Which daycare packages will expire with days unused?
7. What does each site earn per occupied boarding night, by species, over the last 90 days?
8. Which pets on medication have fewer doses logged than nights in house?
9. Which kennels, suites and cattery runs sat empty most over the last 60 nights?
10. Which owners spent the most across all their pets this year, stays and packages together?

### Paperwork and pages

- `npm run docs` renders kennel cards, admission records (the NSW record, kept everywhere), go-home reports and owner statements to `docs-out/`, using `brand.json` for your name, logo and colours.
- `npm run view` renders today, occupancy and record-check pages to `views/`.
- Record checks: [docs/compliance.md](docs/compliance.md).

## Instead of Gingr

Export owners, animals and reservations from Gingr as CSV, then:

```bash
node scripts/boarding.mjs import gingr --kind=owners --file=owners.csv --dry-run
node scripts/boarding.mjs import gingr --kind=owners --file=owners.csv
node scripts/boarding.mjs import gingr --kind=animals --file=animals.csv
node scripts/boarding.mjs import gingr --kind=reservations --file=reservations.csv
```

Vaccine expiry columns become vaccination records. What maps, what does not carry over (cards, photos, the owner app), and how to rename columns: [docs/replace-gingr.md](docs/replace-gingr.md).

## Architecture

```
pet-boarding-for-claude-code/
  CLAUDE.md                 how the operator wants this run (routing table + house rules)
  AGENTS.md                 the same, for Codex / OpenCode / Cursor / Gemini CLI
  .claude/commands/         the slash commands
  scripts/                  the CLI the commands drive
  scripts/lib/db.mjs        one adapter: DATABASE_URL (pg) or embedded PGlite
  supabase/migrations/      plain SQL schema
  supabase/seed.sql         demo data
  docs/                     the thesis and the migration guide
```

## Built for coding agents

The database, CLI and command recipes work with Claude Code, Codex, OpenCode or Cursor. Ask your coding agent for a new command and have it implement and test the change against the same records.

## Contributing

Issues and pull requests are welcome. Keep the shape: plain SQL, a small CLI, a slash command per recurring job, no front end.

## Want it installed and run for you?

Enterprise DNA installs Pet Boarding for Claude Code for your business, migrates your Gingr data, connects it to the rest of your tools, and runs it for you as part of **Omni**, our managed Command Center. One setup fee, then a monthly retainer.

- Book a call: [enterprisedna.co/omni/book](https://enterprisedna.co/omni/book/?offer=replace-software&utm_source=github&utm_medium=readme&utm_campaign=gingr)
- Read more: [enterprisedna.co/omni/instead-of/gingr](https://enterprisedna.co/omni/instead-of/gingr?utm_source=github&utm_medium=readme&utm_campaign=gingr)

## License

MIT. Copyright (c) 2026 Enterprise DNA.

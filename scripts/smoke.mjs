// npm test: a temporary embedded database (or an isolated schema on TEST_DATABASE_URL),
// migrate, seed twice, then every command, import, document and view. Never touches your data.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { migrate } from './migrate.mjs';
import { execute, human, QUESTIONS } from './boarding.mjs';
import { parseCsv } from './lib/csv.mjs';
import { page, table } from './lib/render.mjs';

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'boarding-smoke-'));
const postgresUrl = process.env.TEST_DATABASE_URL || '';
let control, schema;
if (postgresUrl) {
  const { default: pg } = await import('pg');
  control = new pg.Client({ connectionString: postgresUrl }); await control.connect();
  schema = 'boarding_test_' + Date.now() + '_' + Math.random().toString(16).slice(2, 8);
  await control.query(`create schema ${schema}`);
  process.env.PGOPTIONS = `-c search_path=${schema},public`;
}
process.env.DATABASE_URL = postgresUrl; process.env.DATA_DIR = path.join(temp, 'db'); process.env.OUTPUT_DIR = temp;
const db = await getDb();
let checks = 0;
const run = (...args) => execute(db, args);
const ok = (condition, message) => { assert.ok(condition, message); console.log(`ok ${++checks}: ${message}`); };
const fail = async (args, pattern) => { await assert.rejects(() => run(...args), pattern); ok(true, `Rejects: ${args.slice(0, 3).join(' ')} (${pattern})`); };
const count = async (t, where = 'true') => Number((await db.query(`select count(*) as n from ${t} where ${where}`))[0].n);
const rules = async () => (await run('compliance')).map((r) => `${r.rule}|${r.subject}`);
const day = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ex = (f) => path.join(REPO_ROOT, 'examples', f);

try {
  ok((await migrate(db)).ran.length === 1, 'Migration applies');
  ok((await migrate(db)).ran.length === 0, 'Migration is idempotent');
  const seed = fs.readFileSync(path.join(REPO_ROOT, 'supabase/seed.sql'), 'utf8');
  await db.exec(seed); await db.exec(seed);
  ok((await count('pets')) === 16 && (await count('stays')) === 28, 'Seed is idempotent');

  // Every read
  for (const c of ['help', 'sites', 'runs', 'owners', 'pets', 'rates', 'rules', 'vaccinations', 'stays', 'in-house', 'packages', 'incidents', 'balances', 'compliance', 'attention', 'arrivals', 'departures', 'daycare', 'occupancy', 'vax-due', 'revenue'])
    ok(Boolean(await run(c)), `Read ${c}`);
  ok((await run('in-house')).length === 7, 'Run sheet lists the seven in house');
  ok((await run('departures', `--on=${day(-1)}`)).some((r) => r.pet === 'Teddy'), 'Departures by date');
  ok((await run('daycare')).some((r) => r.pet === 'Luna'), 'Daycare roster for today');
  ok((await run('occupancy')).some((r) => r.booked > r.capacity && r.site.startsWith('Harbour')), 'Occupancy shows the overbooked peak night');
  ok((await run('occupancy', '--all', '--days=7')).length === 7 * 8, 'Occupancy --all gives every night for every service');
  ok((await run('vax-due')).map((r) => r.pet).join() === 'Rocky,Archie,Biscuit', 'Vaccination due before booked stays');
  const qs = await run('questions');
  ok(qs.length === 10 && qs.every((q) => q.rows.length > 0), 'All ten questions answer from the demo data');
  ok(QUESTIONS.length === 10 && (await run('questions', '--question=2'))[0].rows.some((r) => r.pet === 'Archie'), 'One question by number');
  await fail(['questions', '--question=11'], /1 to 10/);

  // Detail and name matching
  ok((await run('pet', 'bella')).medication.includes('Apoquel'), 'Pet detail, case-insensitive');
  ok((await run('owner', 'CHLOE')).pets.length === 2, 'Owner detail with pets');
  ok((await run('stay', 'max')).care_log.length === 1, 'Stay by pet name');
  ok((await run('show', 'sites', 'northside')).jurisdiction === 'NSW', 'Show by name fragment');
  await fail(['pet', 'o'], /Ambiguous pets/);
  await fail(['pet', 'nobody'], /No pets match/);
  const kahuStays = await run('stay', 'kahu').catch((e) => e);
  ok(/Ambiguous stay/.test(kahuStays.message) && kahuStays.matches.length === 2, 'A pet with two bookings lists both');

  // Record checks: every rule has seeded evidence and a source
  const found = await run('compliance');
  for (const r of ['VACC-ADMIT', 'VACC-LAPSE', 'ISOLATE', 'ADMISSION-RECORD', 'MIN-AGE', 'VIC-DAB', 'TREATMENT-HANDOVER', 'MEDS-LOGGED', 'DAILY-CHECK'])
    ok(found.some((x) => x.rule === r), `Compliance rule ${r} has seeded evidence`);
  ok(found.every((x) => x.source), 'Every finding carries its source');
  ok(found.find((x) => x.rule === 'VACC-ADMIT' && x.subject === 'Archie').source.includes('dpird.nsw.gov.au'), 'NSW vaccination finding cites NSW Code No 5');
  ok(found.find((x) => x.rule === 'ISOLATE').source.includes('mpi.govt.nz'), 'NZ isolation finding cites the MPI code');
  ok((await run('attention'))[0].area === 'Record check', 'Attention leads with record checks');
  ok((await run('attention')).some((r) => r.area === 'Unpaid' && r.subject === 'Emma Wilson'), 'Attention finds the unpaid stay');

  // Vaccination boundary: given exactly 365 days before arrival is lapsed; 364 is current.
  await db.exec('BEGIN');
  const archie = (await db.query(`select id from pets where name='Archie'`))[0].id;
  await db.query(`update vaccinations set given_on=current_date+1-364,due_on=current_date+30 where pet_id=$1`, [archie]);
  ok(!(await rules()).includes('VACC-ADMIT|Archie'), 'C5 given 364 days before arrival is current');
  await db.query(`update vaccinations set given_on=current_date+1-365 where pet_id=$1`, [archie]);
  ok((await rules()).includes('VACC-ADMIT|Archie'), 'C5 given 365 days before arrival is not');
  await db.exec('ROLLBACK');
  // Cats need F3; a dog's C5 does not cover a cat.
  await db.exec('BEGIN');
  await db.query(`update vaccinations set vaccine='C5' where pet_id=(select id from pets where name='Ziggy')`);
  ok((await rules()).includes('VACC-ADMIT|Ziggy'), 'A cat without F3 is flagged');
  await db.exec('ROLLBACK');

  // Booking
  const b = await run('book', '--pet=Kahu', '--site=Harbour', `--start=${day(30)}`, `--end=${day(33)}`, '--run=K2', '--deposit=50');
  ok(b.nights === 3 && b.charge_cents === 16500 && b.run === 'K2' && !b.warnings.length, 'Book three nights at the site rate');
  await fail(['book', '--pet=Tama', '--site=Harbour', `--start=${day(31)}`, `--end=${day(32)}`, '--run=K2'], /full on/);
  await fail(['book', '--pet=Miro', '--site=Harbour', `--start=${day(40)}`, `--end=${day(41)}`, '--run=K3'], /for dogs/);
  await fail(['book', '--pet=Bella', '--site=Harbour', `--start=${day(40)}`, '--daycare'], /daycare assessment/);
  await fail(['book', '--pet=Bella', `--start=${day(40)}`, `--end=${day(41)}`], /Specify --site/);
  await fail(['book', '--pet=Bella', '--site=Harbour', `--start=${day(40)}`, `--end=${day(40)}`], /after --start/);
  await fail(['book', '--pet=Bella', '--site=Harbour', '--start=2026-02-30', `--end=${day(41)}`], /real date/);
  const lunaPkg = await run('book', '--pet=Luna', '--site=Harbour', `--start=${day(5)}`, '--daycare', '--run=Big Yard', '--package=auto');
  ok(lunaPkg.package === 'Daycare 5 pack' && lunaPkg.charge_cents === 0, 'Daycare day comes off the package');
  await fail(['book', '--pet=Luna', '--site=Harbour', `--start=${day(6)}`, '--daycare', '--package=auto'], /no daycare package/);
  const archieWarn = await run('book', '--pet=Archie', '--site=Northside', `--start=${day(20)}`, `--end=${day(22)}`);
  ok(archieWarn.warnings.some((w) => /Vaccination not current/.test(w)) && archieWarn.warnings.some((w) => /No run/.test(w)), 'Booking warns about vaccination and run');
  const tamaPeak = await run('book', '--pet=Tama', '--site=Harbour', `--start=${day(83)}`, `--end=${day(84)}`);
  ok(tamaPeak.warnings.some((w) => /Over capacity/.test(w)), 'Booking warns when the night is over capacity');

  // Check-in rules
  await db.query(`update stays set starts_on=current_date where id=(select id from stays where pet_id=$1 and status='booked' order by starts_on limit 1)`, [archie]);
  await fail(['check-in', 'archie', '--condition=Good', '--run=K3'], /no current cover/);
  await fail(['check-in', 'archie', '--run=K3'], /no current cover|condition on arrival/);
  // Commands run their own transaction, so each trial check-in is undone by hand.
  const undo = () => db.query(`update stays set status='booked',checked_in_at=null,arrival_condition='',override_reason='',run_id=(select id from runs r where r.name='K3' and r.site_id=stays.site_id) where pet_id=$1 and status='checked-in'`, [archie]);
  const iso = await run('check-in', 'archie', '--condition=Good', '--run=Isolation');
  ok(iso.vaccination.startsWith('not current') && iso.run === 'Isolation', 'Unvaccinated arrival goes into isolation');
  await undo();
  const over = await run('check-in', 'archie', '--condition=Good', '--run=K3', '--override=Certificate seen on phone, copy to follow');
  ok(over.checked_in && (await db.query(`select override_reason from stays where pet_id=$1 and status='checked-in'`, [archie]))[0].override_reason.includes('copy to follow'), 'Override is recorded with its reason');
  await undo();
  await run('vaccinate', '--pet=Archie', '--vaccine=C5', `--given=${day(-3)}`, `--due=${day(362)}`, '--evidence=Narrabeen Vet Clinic cert 4471');
  ok(!(await rules()).includes('VACC-ADMIT|Archie'), 'A new certificate clears the vaccination finding');
  await fail(['vaccinate', '--pet=Archie', '--vaccine=C9', `--given=${day(-1)}`, '--evidence=x'], /--vaccine must be one of/);
  await fail(['check-in', 'archie', '--run=K3'], /condition on arrival/);
  const ci = await run('check-in', 'archie', '--condition=Bright, a little anxious', '--weight=31.5', '--run=K3');
  ok(ci.vaccination === 'current' && ci.run === 'K3', 'Check-in assigns the run and records the arrival');
  await fail(['check-in', 'archie', '--condition=x'], /checked-in, not booked/);
  await fail(['check-in', 'biscuit', '--condition=x', '--run=K2'], /booked from/);

  // Care logs, incidents, treatment handover
  await run('log', 'bella', '--kind=meds', '--note=Apoquel 16mg', '--by=Jess');
  ok(!(await rules()).includes('MEDS-LOGGED|Bella'), 'Logging the dose clears the medication finding');
  await fail(['log', 'bella', '--kind=bath', '--by=Jess'], /--kind must be one of/);
  await fail(['log', 'bella', '--kind=feed'], /--by/);
  await run('log', 'teddy', '--kind=feed', '--note=Ate all', '--by=Kim');
  ok(!(await rules()).includes('DAILY-CHECK|Teddy'), 'A feed log clears the daily check');
  const inc = await run('incident', '--pet=Rocky', '--kind=illness', '--summary=Coughing after play', '--infectious', '--treatment=Doxycycline 7 days, Silverdale Vets');
  ok(inc.next[0].includes('--run=Isolation'), 'Infectious incident says move to isolation');
  await run('move', 'rocky', '--run=Isolation');
  ok(!(await rules()).includes('ISOLATE|Rocky'), 'Moving to isolation clears the finding');
  await fail(['move', 'max', '--run=Isolation'], /full on/);
  await fail(['check-out', 'rocky'], /Tell the owner/);
  await run('tell-owner', inc.incident, '--how=phoned Priya');
  await run('resolve', inc.incident, '--action=Course of antibiotics started');
  await run('extra', 'rocky', '--name=Bath on departure', '--price=45');
  const out = await run('check-out', 'rocky');
  ok(out.nights === Math.max(1, Math.round((Date.parse(day(0)) - Date.parse(day(-2))) / 86400000)) && out.charge_cents === 2 * 5500 + 4500, 'Check-out charges the nights stayed plus extras');
  await fail(['check-out', 'oscar'], /No open stay/);

  // Money
  const before = (await run('balances')).find((r) => r.owner === 'Emma Wilson').balance_cents;
  const p = await run('pay', '--owner=Emma Wilson', '--amount=116', '--method=Card', '--reference=POS-AU-3001');
  ok(before === 11600 && p.balance_cents === 0 && p.currency === 'AUD', 'Payment clears the balance in the right currency');
  await fail(['pay', '--owner=Emma Wilson', '--amount=10', '--reference=POS-AU-3001'], /duplicate key|unique/i);
  await fail(['pay', '--owner=Emma Wilson', '--amount=abc'], /Not an amount/);
  const pk = await run('sell-package', '--owner=Aroha', '--name=Daycare 10 pack', '--days=10', '--price=430', `--expires=${day(120)}`);
  ok(pk.price_cents === 43000 && pk.days === 10, 'Sell a daycare package');
  const tamaDay = await run('book', '--pet=Tama', '--site=Harbour', `--start=${day(3)}`, '--daycare', '--package=auto');
  ok(tamaDay.package === 'Daycare 10 pack', 'New package is used for the next daycare day');
  const cancelled = await run('cancel', tamaDay.booked, '--reason=Owner home that day');
  ok(cancelled.cancelled === tamaDay.booked, 'Cancel a booking');
  await run('cancel', 'rex', '--no-show');
  ok(!(await run('attention')).some((r) => r.area === 'Not checked in' && r.subject === 'Rex'), 'A no-show leaves the not-arrived list');

  // Records
  const site = await run('add', 'sites', '--name=Southern Cross Kennels', '--jurisdiction=QLD', '--currency=AUD');
  ok(site.jurisdiction === 'QLD', 'Add a site');
  await run('add', 'runs', '--site=Southern Cross', '--name=K1', '--kind=kennel');
  await fail(['add', 'sites', '--name=Bad', '--jurisdiction=US'], /check/i);
  await fail(['add', 'pets', '--name=Ghost', '--colour=grey'], /owner_id|null/i);
  await fail(['add', 'pets', '--owner=Aroha', '--name=Ghost', '--nickname=x'], /no field --nickname/);
  const added = await run('add', 'pets', '--owner=Aroha', '--name=Kiwi', '--species=cat', '--birth-date=2020-01-01');
  ok(added.species === 'cat' && added.birth_date === '2020-01-01', 'Add a pet with its owner by name');
  const upd = await run('update', 'pets', 'Bella', '--daycare-approved=yes', '--weight-kg=29');
  ok(upd.daycare_approved === true && Number(upd.weight_kg) === 29, 'Update fields by name');
  await run('update', 'sites', 'Bayside', '--registration-ref=KINGSTON-DAB-0457');
  ok(!(await rules()).includes('VIC-DAB|Bayside Dog Daycare'), 'Recording the council registration clears the Victorian finding');

  // Import from Gingr: owners, animals with vaccine expiries, reservations
  const dry = await run('import', 'gingr', '--kind=owners', `--file=${ex('gingr-owners.csv')}`, '--dry-run');
  ok(dry.created === 2 && (await count('owners', `name='Grace Lin'`)) === 0, 'Dry run counts and writes nothing');
  ok((await run('import', 'gingr', '--kind=owners', `--file=${ex('gingr-owners.csv')}`)).created === 2, 'Import owners');
  ok((await run('import', 'gingr', '--kind=owners', `--file=${ex('gingr-owners.csv')}`)).updated === 2, 'Re-import updates, no duplicates');
  const an = await run('import', 'gingr', '--kind=animals', `--file=${ex('gingr-animals.csv')}`);
  ok(an.created === 3 && an.vaccinations === 5, 'Import animals with their vaccine expiry columns');
  const pepper = (await db.query(`select * from pets where name='Pepper'`))[0];
  ok(pepper.birth_date === '2021-03-14' && pepper.sex === 'female' && pepper.desexed === true, 'Gingr month/day dates and yes/no fields');
  ok((await db.query(`select vaccine_gap(id,current_date) as g from pets where name='Duke'`))[0].g !== '', 'Expired Gingr vaccine shows as a gap');
  const resv = await run('import', 'gingr', '--kind=reservations', `--file=${ex('gingr-reservations.csv')}`);
  ok(resv.created === 3, 'Import reservations');
  ok((await run('import', 'gingr', '--kind=reservations', `--file=${ex('gingr-reservations.csv')}`)).skipped === 3, 'Re-importing reservations skips what is there');
  const smudge = (await run('stays')).find((r) => r.pet === 'Smudge');
  ok(smudge && smudge.kind === 'boarding' && smudge.charge_cents === 22400, 'Imported booking keeps its total');
  const bad = path.join(temp, 'bad.csv');
  fs.writeFileSync(bad, 'Animal Name,First Name,Last Name,Start Date,End Date\nPepper,Grace,Lin,09/01/2026,09/03/2026\nNobody,Grace,Lin,09/01/2026,09/03/2026\n');
  const n = await count('stays');
  await fail(['import', 'gingr', '--kind=reservations', `--file=${bad}`], /Nobody .* not found/);
  ok((await count('stays')) === n, 'A bad later row rolls back the whole import');
  fs.writeFileSync(bad, 'Animal Name,First Name,Last Name,Start Date,End Date\nPepper,Grace,Lin,25/12/2026,28/12/2026\n');
  await fail(['import', 'gingr', '--kind=reservations', `--file=${bad}`], /date-order=dmy/);
  ok((await run('import', 'gingr', '--kind=reservations', `--file=${bad}`, '--date-order=dmy')).created === 1, 'Day/month exports import with --date-order=dmy');
  await fail(['import', 'gingr', '--kind=owners', '--file=owners.xlsx'], /as CSV/);
  await fail(['import', 'pawfinity', '--kind=owners'], /import gingr/);
  assert.deepEqual(parseCsv('﻿a,b\r\n"line\none","two, three"\r\n'), [{ a: 'line\none', b: 'two, three' }]);
  for (const csv of ['a,A\n1,2', 'a,b\n1', 'a,b\n"bad,2']) assert.throws(() => parseCsv(csv));
  ok(true, 'CSV BOM, multiline, quotes and malformed input');

  // Export, drafts, review
  const file = path.join(temp, 'backup.json'); await run('export', `--out=${file}`);
  const snap = JSON.parse(fs.readFileSync(file, 'utf8'));
  ok(Object.keys(snap.records).length === 13 && snap.records.stays.length === await count('stays'), 'Export holds every record kind');
  await fail(['export', `--out=${file}`], /EEXIST/);
  const rem = await run('draft-reminder');
  ok(!rem.sent && fs.readFileSync(rem.file, 'utf8').includes('Biscuit'), 'Vaccination reminders drafted, not sent');
  await fail(['draft-reminder', 'Emma Wilson'], /no upcoming stay/);
  const conf = await run('draft-confirmation', 'biscuit');
  ok(fs.readFileSync(conf.file, 'utf8').includes('canine cough'), 'Booking confirmation asks for the missing certificate');
  const card = await run('draft-report-card', out.checked_out);
  const cardText = fs.readFileSync(card.file, 'utf8');
  ok(cardText.includes('Doxycycline') && cardText.includes('Paddock run'), 'Go-home note carries the care log and the treatment');
  const review = await run('weekly-review');
  ok(Object.keys(review.data).length === 3 && fs.existsSync(review.file), 'Weekly review joins three live reads');
  ok(!page({ title: '<script>x</script>', sections: [{ title: 't', html: table([{ a: '<img onerror=x>' }]) }] }).includes('<script>x'), 'HTML escapes record content');
  ok(human(await run('in-house')).includes('Apoquel'), 'Human output is a readable table');
  ok(human(await run('pet', 'bella')).includes('vaccinations:'), 'Human output for a record with history');

  // Separate processes: CLI, views, documents
  await db.close();
  const call = (script, args = []) => spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts', script), ...args], { cwd: REPO_ROOT, env: process.env, encoding: 'utf8' });
  for (const [script, args] of [['boarding.mjs', ['attention', '--json']], ['view.mjs', []], ['docs.mjs', []]]) { const r = call(script, args); assert.equal(r.status, 0, r.stderr); ok(true, `Runs ${script}`); }
  const amb = call('boarding.mjs', ['pet', 'o', '--json']);
  ok(amb.status === 1 && JSON.parse(amb.stdout).matches.length > 1, 'CLI exits 1 and lists ambiguous matches as JSON');
  ok(fs.readFileSync(path.join(temp, 'views/today.html'), 'utf8').includes('Bella'), 'View rendered from real records');
  for (const kind of ['kennel-card', 'admission-record', 'go-home-report', 'owner-statement']) ok(fs.readdirSync(path.join(temp, 'docs-out', kind)).length > 0, `Document ${kind} rendered`);
  console.log(`PASS: ${checks} checks; every command, import, document and view.`);
} catch (e) { console.error(e); process.exitCode = 1; }
finally {
  try { await db.close(); } catch {}
  fs.rmSync(temp, { recursive: true, force: true });
  if (control) { await control.query(`drop schema ${schema} cascade`); await control.end(); }
}

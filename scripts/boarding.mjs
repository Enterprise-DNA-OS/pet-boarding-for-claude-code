#!/usr/bin/env node
// One CLI for the boarding database. Human tables by default, --json for machines.
//   node scripts/boarding.mjs help
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDb, REPO_ROOT } from './lib/db.mjs';
import { parseCsv, pick, yesNo } from './lib/csv.mjs';
import { table } from './lib/format.mjs';

// Writable fields per record kind for `add` and `update`. Anything else is rejected.
export const entities = {
  sites: ['name', 'jurisdiction', 'currency', 'address', 'registration_ref'],
  runs: ['site_id', 'name', 'kind', 'species', 'capacity', 'active'],
  owners: ['name', 'email', 'phone', 'address', 'emergency_contact', 'vet_name', 'vet_phone', 'notes', 'status'],
  pets: ['owner_id', 'name', 'species', 'breed', 'sex', 'desexed', 'colour', 'birth_date', 'weight_kg', 'microchip', 'feeding', 'medication', 'behaviour', 'heartworm', 'daycare_approved', 'active'],
  rates: ['name', 'kind', 'species', 'price_cents', 'currency', 'active'],
  rules: ['code', 'jurisdiction', 'title', 'source'],
};
const label = { sites: 'name', runs: 'name', owners: 'name', pets: 'name', rates: 'name', packages: 'name', incidents: 'id::text', vaccinations: 'id::text', payments: 'reference', stays: 'id::text', rules: 'code' };
const refs = { site_id: 'sites', owner_id: 'owners', pet_id: 'pets', run_id: 'runs' };
const dollarFlags = { price: 'price_cents', amount: 'amount_cents', deposit: 'deposit_cents', rate: 'rate_cents' };
const BOOLS = ['active', 'desexed', 'daycare_approved'];
const VACCINES = ['C3', 'C4', 'C5', 'C7', 'KC', 'F3', 'F4', 'F5', 'Other'];
const LOG_KINDS = ['feed', 'meds', 'walk', 'welfare', 'play', 'note'];
const INCIDENT_KINDS = ['injury', 'illness', 'fight', 'escape', 'behaviour', 'other'];
const TABLES = ['rules', 'sites', 'runs', 'owners', 'pets', 'vaccinations', 'rates', 'packages', 'stays', 'extras', 'care_logs', 'incidents', 'payments'];

const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const need = (v, msg) => { if (v === undefined || v === null || v === '' || v === true) throw Error(msg); return v; };
function day(v, name = 'date') {
  const t = Date.parse(v + 'T00:00:00Z');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v)) || Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== v) throw Error(`${name} must be a real date as YYYY-MM-DD: ${v}`);
  return v;
}
function cents(v) {
  if (v === null || v === undefined || v === '' || v === true) return null;
  const n = Number(String(v).replace(/[$,\s]|AUD|NZD|USD/gi, ''));
  if (!Number.isFinite(n) || n < 0) throw Error(`Not an amount: ${v}`);
  return Math.round(n * 100);
}
const choose = (v, values, name) => { if (!values.includes(v)) throw Error(`${name} must be one of ${values.join(', ')}`); return v; };

export function parseArgs(args) {
  const pos = [], flags = {};
  for (const s of args) {
    if (s.startsWith('--')) { const i = s.indexOf('='); flags[s.slice(2, i < 0 ? undefined : i).replaceAll('-', '_')] = i < 0 ? true : s.slice(i + 1); }
    else pos.push(s);
  }
  return { pos, flags };
}

// Exact id or name first (case-insensitive), then id prefix or name fragment. One match or an error listing them.
export async function resolve(db, kind, value, where = '') {
  if (!label[kind]) throw Error(`Unknown kind ${kind}`);
  need(value, `Specify a ${kind.replace(/s$/, '')} by name or id`);
  const key = label[kind];
  const extra = where ? ` and ${where}` : '';
  let rows = await db.query(`select * from ${kind} where (id::text=$1 or lower(${key})=lower($1))${extra}`, [String(value)]);
  if (!rows.length) rows = await db.query(`select * from ${kind} where (starts_with(id::text,lower($1)) or position(lower($1) in lower(${key}))>0)${extra} order by ${key}`, [String(value)]);
  if (rows.length !== 1) {
    const name = (r) => r[key.replace('::text', '')] || r.id;
    const error = Error(rows.length ? `Ambiguous ${kind}: ${value} matches ${rows.slice(0, 12).map((r) => `${String(r.id).slice(0, 8)} ${name(r)}`).join('; ')}` : `No ${kind} match: ${value}`);
    error.matches = rows.map((r) => ({ id: r.id, name: name(r) }));
    throw error;
  }
  return rows[0];
}

// A stay by id prefix, or by pet name when that pet has exactly one open stay (booked or in house).
export async function resolveStay(db, value) {
  need(value, 'Specify a stay by its code or the pet name');
  let rows = await db.query(`select * from v_stays where starts_with(id::text,lower($1))`, [String(value)]);
  if (!rows.length) rows = await db.query(`select * from v_stays where lower(pet)=lower($1) and status in ('booked','checked-in') order by starts_on`, [String(value)]);
  if (!rows.length) rows = await db.query(`select * from v_stays where position(lower($1) in lower(pet))>0 and status in ('booked','checked-in') order by starts_on`, [String(value)]);
  // By pet name, the stay in house wins, then the one due to arrive by today.
  if (rows.length > 1 && !rows.some((r) => r.id.startsWith(String(value)))) {
    for (const now of [rows.filter((r) => r.status === 'checked-in'), rows.filter((r) => r.status === 'booked' && r.starts_on <= today())])
      if (now.length === 1) return now[0];
  }
  if (rows.length !== 1) {
    const error = Error(rows.length ? `Ambiguous stay: ${value} matches ${rows.map((r) => `${r.code} ${r.pet} ${r.starts_on} ${r.status}`).join('; ')}` : `No open stay for: ${value}`);
    error.matches = rows.map((r) => ({ id: r.id, name: `${r.pet} ${r.starts_on} ${r.status}` }));
    throw error;
  }
  return rows[0];
}

const READS = {
  sites: `select left(id::text,8) as code,name,jurisdiction,currency,registration_ref,address from sites order by name`,
  runs: `select left(r.id::text,8) as code,s.name as site,r.name,r.kind,r.species,r.capacity,r.active from runs r join sites s on s.id=r.site_id order by s.name,r.kind,r.name`,
  owners: `select left(o.id::text,8) as code,o.name,o.phone,o.email,o.vet_name as vet,o.status,(select string_agg(p.name,', ' order by p.name) from pets p where p.owner_id=o.id and p.active) as pets from owners o order by o.name`,
  pets: `select left(p.id::text,8) as code,p.name,p.species,p.breed,o.name as owner,coalesce(nullif(vaccine_gap(p.id,current_date),''),'current') as vaccination,p.daycare_approved as daycare,p.active from pets p join owners o on o.id=p.owner_id order by p.name`,
  rates: `select left(id::text,8) as code,name,kind,species,price_cents,currency,active from rates order by currency,kind,name`,
  rules: `select code,jurisdiction,title,source from rules order by code,jurisdiction`,
  vaccinations: `select left(v.id::text,8) as code,p.name as pet,o.name as owner,v.vaccine,v.given_on,v.due_on,v.evidence_ref from vaccinations v join pets p on p.id=v.pet_id join owners o on o.id=p.owner_id order by p.name,v.given_on desc`,
  stays: `select code,pet,owner,site,kind,run,starts_on,ends_on,status,charge_cents,currency from v_stays where status in ('booked','checked-in') order by starts_on,site,pet`,
  'in-house': `select code,site,run,pet,owner,ends_on as out_on,feeding,medication,behaviour,to_char(last_check,'YYYY-MM-DD HH24:MI') as last_check,to_char(last_meds,'YYYY-MM-DD HH24:MI') as last_meds from v_in_house order by site,run nulls last,pet`,
  packages: `select left(id::text,8) as code,owner,name,days,used,booked,left_after_bookings as days_left,expires_on,price_cents,currency from v_packages order by expires_on nulls last`,
  incidents: `select left(i.id::text,8) as code,p.name as pet,i.kind,i.summary,i.infectious,i.vet_treatment,to_char(i.occurred_at,'YYYY-MM-DD') as occurred,i.owner_told_at is not null as owner_told,coalesce(i.action,'') as action,i.resolved_at is not null as resolved from incidents i join pets p on p.id=i.pet_id order by i.resolved_at is not null,i.occurred_at desc`,
  balances: `select owner,phone,currency,charged_cents,paid_cents,balance_cents,last_charge,last_paid from v_balances where balance_cents<>0 order by balance_cents desc`,
  compliance: `select rule,jurisdiction,subject,site,finding,due_on,source from v_compliance order by case when rule in ('ISOLATE','VACC-ADMIT') then 0 else 1 end,due_on nulls last,rule`,
  attention: `select area,subject,item,due_on from v_attention order by rank,due_on nulls last,subject`,
};

export const QUESTIONS = [
  ['Which nights in the next 90 days are 90% full or more, by site and service?',
    `select night,site,service,booked,capacity,free from v_occupancy where pct>=90 order by night,site,service`],
  ['Which booked pets will arrive without current vaccination cover, and how many days do their owners have to send it?',
    `select v.pet,v.owner,v.phone,v.site,v.starts_on,v.starts_on-current_date as days_to_arrival,vaccine_gap(v.pet_id,v.starts_on) as missing from v_stays v where v.status='booked' and v.starts_on>=current_date and vaccine_gap(v.pet_id,v.starts_on)<>'' order by v.starts_on`],
  ['Whose vaccination runs out part way through a stay already booked?',
    `select v.pet,v.owner,v.starts_on,v.ends_on,vaccine_gap(v.pet_id,v.ends_on) as lapses from v_stays v where v.status in ('booked','checked-in') and vaccine_gap(v.pet_id,v.starts_on)='' and vaccine_gap(v.pet_id,v.ends_on)<>'' order by v.starts_on`],
  ['Which daycare dogs came in the last 60 days but have nothing booked for the next 14?',
    `select p.name as pet,o.name as owner,o.phone,max(s.starts_on) as last_day,count(*)::int as days_in_60 from stays s join pets p on p.id=s.pet_id join owners o on o.id=p.owner_id where s.kind='daycare' and s.status in ('checked-in','checked-out') and s.starts_on>=current_date-60 and not exists (select 1 from stays b where b.pet_id=s.pet_id and b.status='booked' and b.starts_on between current_date and current_date+14) group by p.name,o.name,o.phone order by last_day`],
  ['Which owners still owe money and already have another stay booked?',
    `select b.owner,b.currency,b.balance_cents,min(v.starts_on) as next_stay,string_agg(distinct v.pet,', ') as pets from v_balances b join v_stays v on v.owner_id=b.id and v.status='booked' and v.currency=b.currency where b.balance_cents>0 group by b.owner,b.currency,b.balance_cents order by b.balance_cents desc`],
  ['Which daycare packages will expire with days unused?',
    `select owner,name,days,used,booked,left_after_bookings as unused,expires_on,expires_on-current_date as days_to_expiry from v_packages where left_after_bookings>0 and expires_on is not null and expires_on<=current_date+30 order by expires_on`],
  ['What does each site earn per occupied boarding night, by species, over the last 90 days?',
    `select site,species,currency,sum(nights)::int as nights,sum(charge_cents)::int as charged_cents,(sum(charge_cents)/nullif(sum(nights),0))::int as per_night_cents from v_stays where kind='boarding' and status in ('checked-in','checked-out') and starts_on>=current_date-90 group by site,species,currency order by site,species`],
  ['Which pets on medication have fewer doses logged than nights in house?',
    `select h.pet,h.site,h.medication,greatest(current_date-h.starts_on,1) as nights_in,(select count(*) from care_logs c where c.stay_id=h.id and c.kind='meds')::int as doses_logged from v_in_house h where h.medication<>'' and (select count(*) from care_logs c where c.stay_id=h.id and c.kind='meds')<greatest(current_date-h.starts_on,1)`],
  ['Which kennels, suites and cattery runs sat empty most over the last 60 nights?',
    `select si.name as site,r.name as run,r.kind,count(distinct case when s.id is not null then d end)::int as nights_used,60 as of_nights,round(100.0*count(distinct case when s.id is not null then d end)/60) as pct_used from runs r join sites si on si.id=r.site_id cross join generate_series(current_date-60,current_date-1,interval '1 day') d left join stays s on s.run_id=r.id and s.kind='boarding' and s.status in ('checked-in','checked-out') and s.starts_on<=d::date and s.ends_on>d::date where r.active and r.kind in ('kennel','suite','cattery') group by si.name,r.name,r.kind order by pct_used,site,run`],
  ['Which owners spent the most across all their pets this year, stays and packages together?',
    `with spend as (select owner,currency,charge_cents as cents,1 as stays from v_stays where status in ('checked-in','checked-out') and starts_on>=current_date-365 union all select owner,currency,price_cents,0 from v_packages where purchased_on>=current_date-365) select owner,currency,sum(stays)::int as stays,sum(cents)::int as spent_cents from spend group by owner,currency order by spent_cents desc limit 10`],
];

const HELP = `Pet Boarding for Claude Code. Reads:
  ${Object.keys(READS).join(', ')}
  arrivals|departures|daycare [--on=YYYY-MM-DD] · occupancy [--days=90] [--site=] [--all] · vax-due [--days=60] · revenue [--days=30] · questions [--question=1..10]
Detail: pet <name> · owner <name> · stay <code-or-pet> · show <kind> <name>
Bookings: book --pet= --start=YYYY-MM-DD [--end=YYYY-MM-DD | --daycare] [--site=] [--run=] [--rate=] [--package=auto|<name>] [--deposit=100] [--notes=]
  check-in <stay> --condition="..." [--weight=21.5] [--run=] [--override="reason"] · check-out <stay> [--on=YYYY-MM-DD]
  cancel <stay> [--no-show] [--reason=] · move <stay> --run= · extra <stay> --name= --price=
Care: log <stay> --kind=${LOG_KINDS.join('|')} --note= --by= · incident --pet= --kind=${INCIDENT_KINDS.join('|')} --summary= [--infectious] [--treatment=]
  tell-owner <incident> [--how=] · resolve <incident> --action= · vaccinate --pet= --vaccine=${VACCINES.join('|')} --given= [--due=] --evidence=
Money: pay --owner= --amount= [--currency=] [--method=] [--reference=] · sell-package --owner= --name= --days= --price= [--currency=] [--expires=]
Records: add <kind> --field=value · update <kind> <name> --field=value   (kinds: ${Object.keys(entities).join(', ')})
Drafts (never sent): draft-reminder [owner] · draft-confirmation <stay> · draft-report-card <stay> · weekly-review
Move in and out: import gingr --kind=owners|animals|reservations --file=<export.csv> [--map=columns.json] [--currency=NZD] [--dry-run] · export --out=<new-file.json>
Every command takes --json.`;

async function insertRow(db, kind, values) {
  const keys = Object.keys(values);
  return (await db.query(`insert into ${kind} (${keys.join(',')}) values (${keys.map((_, i) => '$' + (i + 1)).join(',')}) returning *`, Object.values(values)))[0];
}

async function fieldsFrom(db, kind, flags) {
  const allowed = entities[kind]; const out = {};
  for (const [flag, raw] of Object.entries(flags)) {
    if (flag === 'json') continue;
    let col = flag, v = raw;
    if (dollarFlags[flag]) { col = dollarFlags[flag]; v = cents(raw); }
    if (refs[flag + '_id'] && allowed.includes(flag + '_id')) { col = flag + '_id'; v = (await resolve(db, refs[col], raw)).id; }
    if (!allowed.includes(col)) throw Error(`${kind} has no field --${flag}. Fields: ${allowed.join(', ')}`);
    if (BOOLS.includes(col)) v = raw === true ? true : yesNo(raw);
    else if (v === true) throw Error(`--${flag} needs a value`);
    if (col.endsWith('_date')) v = day(v, col);
    out[col] = v;
  }
  return out;
}

async function tx(db, fn) {
  await db.exec('BEGIN');
  try { const v = await fn(); await db.exec('COMMIT'); return v; } catch (e) { await db.exec('ROLLBACK'); throw e; }
}

async function siteFor(db, flags) {
  if (flags.site) return resolve(db, 'sites', flags.site);
  const all = await db.query('select * from sites order by name');
  if (all.length === 1) return all[0];
  throw Error(`Specify --site=. Sites: ${all.map((s) => s.name).join('; ')}`);
}

const runIn = (db, site, name) => resolve(db, 'runs', name, `site_id='${site.id}'`);

// Runs a stay can use: the right species, and room on every night of the stay.
async function checkRun(db, run, pet, stay, excludeId = null) {
  if (!run.active) throw Error(`Run ${run.name} is not active`);
  if (run.kind !== 'isolation' && run.species !== 'any' && run.species !== pet.species) throw Error(`Run ${run.name} is for ${run.species}s, ${pet.name} is a ${pet.species}`);
  if (stay.kind === 'daycare' && !['daycare', 'isolation'].includes(run.kind)) throw Error(`Daycare goes in a daycare yard, not ${run.name}`);
  if (stay.kind === 'boarding' && run.kind === 'daycare') throw Error(`${run.name} is a daycare yard; boarders need a kennel, suite or cattery`);
  const clash = await db.query(`select d::date as night,count(s.id)::int as n from generate_series($1::date,$2::date,interval '1 day') d
    join stays s on s.run_id=$3 and s.status in ('booked','checked-in') and s.id is distinct from $4
      and ((s.kind='boarding' and s.starts_on<=d::date and s.ends_on>d::date) or (s.kind='daycare' and s.starts_on=d::date))
    group by d having count(s.id)>=$5 order by d limit 1`,
  [stay.starts_on, stay.kind === 'boarding' ? addDays(stay.ends_on, -1) : stay.starts_on, run.id, excludeId, run.capacity]);
  if (clash.length) throw Error(`Run ${run.name} is full on ${clash[0].night}. See: occupancy --site="${stay.site || ''}"`);
}

async function draftFile(name, body) {
  const dir = path.resolve(process.env.OUTPUT_DIR || REPO_ROOT, 'drafts');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${name}-${today()}.md`);
  fs.writeFileSync(file, body);
  return file;
}
const dollars = (c, cur) => `${cur} ${(Number(c || 0) / 100).toFixed(2)}`;

export async function execute(db, args) {
  const { pos, flags } = parseArgs(args);
  const [cmd, a1, a2] = pos;
  if (!cmd || cmd === 'help' || flags.help) return HELP;
  if (READS[cmd]) return db.query(READS[cmd]);

  switch (cmd) {
    case 'arrivals': case 'departures': case 'daycare': {
      const on = day(flags.on || today(), 'on');
      const col = cmd === 'departures' ? 'ends_on' : 'starts_on';
      const kind = cmd === 'daycare' ? `kind='daycare'` : `kind='boarding'`;
      const status = cmd === 'departures' ? `status='checked-in'` : `status in ('booked','checked-in')`;
      const extra = cmd === 'departures'
        ? `,charge_cents,currency,(select count(*) from incidents i where i.stay_id=v.id)::int as incidents,(select string_agg(i.vet_treatment,'; ') from incidents i where i.stay_id=v.id and i.vet_treatment<>'' and i.owner_told_at is null) as treatment_to_hand_over`
        : `,coalesce(nullif(vaccine_gap(v.pet_id,v.starts_on),''),'current') as vaccination,feeding,medication,behaviour`;
      return db.query(`select code,site,run,pet,species,owner,phone,status${extra} from v_stays v where ${kind} and ${status} and ${col}=$1 order by site,pet`, [on]);
    }
    case 'occupancy': {
      const days = Math.min(Number(flags.days || 90), 90);
      const site = flags.site ? (await resolve(db, 'sites', flags.site)).name : null;
      return db.query(`select night,to_char(night,'Dy') as dow,site,service,booked,capacity,free,pct from v_occupancy where night<current_date+$1::int and ($2::text is null or site=$2) and ($3::boolean or pct>=80) order by night,site,service`, [days, site, Boolean(flags.all)]);
    }
    case 'vax-due': {
      const days = Number(flags.days || 60);
      return db.query(`select v.code,v.pet,v.owner,v.phone,v.site,v.starts_on,v.ends_on,case when vaccine_gap(v.pet_id,v.starts_on)<>'' then 'at arrival: '||vaccine_gap(v.pet_id,v.starts_on) else 'lapses during stay: '||vaccine_gap(v.pet_id,v.ends_on) end as missing
        from v_stays v where v.status in ('booked','checked-in') and v.starts_on<=current_date+$1::int and (vaccine_gap(v.pet_id,v.starts_on)<>'' or vaccine_gap(v.pet_id,v.ends_on)<>'') order by v.starts_on`, [days]);
    }
    case 'revenue': {
      const days = Number(flags.days || 30);
      return db.query(`select site,currency,count(*) filter (where kind='boarding')::int as boarding_stays,coalesce(sum(nights) filter (where kind='boarding'),0)::int as nights,count(*) filter (where kind='daycare')::int as daycare_days,sum(charge_cents)::int as charged_cents
        from v_stays where status in ('checked-in','checked-out') and starts_on>=current_date-$1::int group by site,currency order by site`, [days]);
    }
    case 'questions': case 'insights': {
      const pickN = flags.question ? Number(flags.question) : null;
      if (pickN !== null && !(pickN >= 1 && pickN <= QUESTIONS.length)) throw Error(`--question must be 1 to ${QUESTIONS.length}`);
      const out = [];
      for (let i = 0; i < QUESTIONS.length; i++) if (!pickN || pickN === i + 1) out.push({ number: i + 1, question: QUESTIONS[i][0], rows: await db.query(QUESTIONS[i][1]) });
      return out;
    }
    case 'show': {
      if (!label[a1]) throw Error(`show <kind> <name>. Kinds: ${Object.keys(label).join(', ')}`);
      return resolve(db, a1, a2);
    }
    case 'pet': {
      const p = await resolve(db, 'pets', a1);
      const [o] = await db.query('select * from owners where id=$1', [p.owner_id]);
      return { pet: p.name, species: p.species, breed: p.breed, owner: o.name, phone: o.phone, vet: `${o.vet_name} ${o.vet_phone}`.trim(), feeding: p.feeding, medication: p.medication, behaviour: p.behaviour,
        vaccination_today: (await db.query('select vaccine_gap($1,current_date) as g', [p.id]))[0].g || 'current',
        vaccinations: await db.query('select vaccine,given_on,due_on,evidence_ref from vaccinations where pet_id=$1 order by given_on desc', [p.id]),
        stays: await db.query('select code,kind,site,run,starts_on,ends_on,status,charge_cents,currency from v_stays where pet_id=$1 order by starts_on desc', [p.id]),
        incidents: await db.query(`select left(id::text,8) as code,kind,summary,vet_treatment,to_char(occurred_at,'YYYY-MM-DD') as occurred,resolved_at is not null as resolved from incidents where pet_id=$1 order by occurred_at desc`, [p.id]) };
    }
    case 'owner': {
      const o = await resolve(db, 'owners', a1);
      return { owner: o.name, phone: o.phone, email: o.email, emergency_contact: o.emergency_contact, vet: `${o.vet_name} ${o.vet_phone}`.trim(), status: o.status,
        pets: await db.query(`select name,species,breed,coalesce(nullif(vaccine_gap(id,current_date),''),'current') as vaccination from pets where owner_id=$1 order by name`, [o.id]),
        stays: await db.query('select code,pet,kind,site,starts_on,ends_on,status,charge_cents,currency from v_stays where owner_id=$1 order by starts_on desc', [o.id]),
        balance: await db.query('select currency,charged_cents,paid_cents,balance_cents from v_balances where id=$1', [o.id]),
        packages: await db.query('select name,days,used,booked,left_after_bookings as days_left,expires_on from v_packages where owner=$1', [o.name]) };
    }
    case 'stay': {
      const s = await resolveStay(db, a1);
      return { ...s, care_log: await db.query(`select to_char(logged_at,'YYYY-MM-DD HH24:MI') as at,kind,note,logged_by from care_logs where stay_id=$1 order by logged_at`, [s.id]),
        extras: await db.query('select name,price_cents from extras where stay_id=$1', [s.id]),
        incidents: await db.query('select kind,summary,vet_treatment,owner_told_at is not null as owner_told from incidents where stay_id=$1', [s.id]) };
    }

    case 'add': {
      if (!entities[a1]) throw Error(`add <kind>. Kinds: ${Object.keys(entities).join(', ')}`);
      return insertRow(db, a1, await fieldsFrom(db, a1, flags));
    }
    case 'update': {
      if (!entities[a1]) throw Error(`update <kind> <name>. Kinds: ${Object.keys(entities).join(', ')}`);
      const row = await resolve(db, a1, a2);
      const values = await fieldsFrom(db, a1, flags);
      if (!Object.keys(values).length) throw Error('Nothing to update');
      const keys = Object.keys(values);
      return (await db.query(`update ${a1} set ${keys.map((k, i) => `${k}=$${i + 1}`).join(',')} where id=$${keys.length + 1} returning *`, [...Object.values(values), row.id]))[0];
    }

    case 'book': return tx(db, async () => {
      const pet = await resolve(db, 'pets', flags.pet);
      const [owner] = await db.query('select * from owners where id=$1', [pet.owner_id]);
      if (!pet.active) throw Error(`${pet.name} is marked inactive`);
      if (owner.status === 'banned') throw Error(`${owner.name} is not taking bookings (status banned)`);
      const site = await siteFor(db, flags);
      const kind = flags.daycare ? 'daycare' : 'boarding';
      const starts = day(need(flags.start, 'Required --start=YYYY-MM-DD'), 'start');
      const ends = kind === 'daycare' ? starts : day(need(flags.end, 'Boarding needs --end=YYYY-MM-DD (the collection date), or add --daycare'), 'end');
      if (kind === 'boarding' && ends <= starts) throw Error('--end must be after --start');
      if (kind === 'daycare' && !pet.daycare_approved) throw Error(`${pet.name} has not passed the daycare assessment. Record it with: update pets "${pet.name}" --daycare-approved=yes`);
      const stay = { kind, starts_on: starts, ends_on: ends, site: site.name };
      let run = null;
      if (flags.run) { run = await runIn(db, site, flags.run); await checkRun(db, run, pet, stay); }
      let rate;
      if (flags.rate) rate = await resolve(db, 'rates', flags.rate);
      else [rate] = await db.query(`select * from rates where active and kind=$1 and currency=$2 and species in ($3,'any') order by species=$3 desc,name limit 1`, [kind === 'daycare' ? 'day' : 'night', site.currency, pet.species]);
      if (!rate) throw Error(`No ${kind === 'daycare' ? 'day' : 'night'} rate in ${site.currency} for ${pet.species}s. Add one: add rates --name= --kind= --species= --price= --currency=`);
      let pkg = null;
      if (flags.package) {
        if (kind !== 'daycare') throw Error('Packages cover daycare days');
        const list = await db.query(`select k.* from v_packages k join packages p on p.id=k.id where p.owner_id=$1 and k.left_after_bookings>0 and (k.expires_on is null or k.expires_on>=$2) ${flags.package === 'auto' ? '' : 'and lower(k.name)=lower($3)'} order by k.expires_on nulls last`, flags.package === 'auto' ? [owner.id, starts] : [owner.id, starts, flags.package]);
        if (!list.length) throw Error(`${owner.name} has no daycare package with days left for ${starts}`);
        pkg = list[0];
      }
      const row = await insertRow(db, 'stays', { pet_id: pet.id, site_id: site.id, run_id: run?.id ?? null, kind, starts_on: starts, ends_on: ends, rate_cents: rate.price_cents, currency: site.currency, package_id: pkg?.id ?? null, deposit_cents: cents(flags.deposit) ?? 0, notes: flags.notes || '' });
      const [v] = await db.query('select * from v_stays where id=$1', [row.id]);
      const warnings = [];
      const gap = (await db.query('select vaccine_gap($1,$2::date) as a,vaccine_gap($1,$3::date) as b', [pet.id, starts, ends]))[0];
      if (gap.a) warnings.push(`Vaccination not current for arrival: ${gap.a}. Ask for the certificate before ${starts}.`);
      else if (gap.b) warnings.push(`Vaccination lapses during the stay: ${gap.b}.`);
      const full = await db.query(`select night from v_occupancy where site=$1 and service=$2 and booked>capacity and night>=$3 and night<=$4 order by night`, [site.name, kind === 'daycare' ? 'daycare' : pet.species === 'cat' ? 'cat boarding' : 'dog boarding', starts, ends]);
      if (full.length) warnings.push(`Over capacity on ${full.map((r) => r.night).join(', ')}.`);
      if (!run && kind === 'boarding') warnings.push('No run assigned yet. Assign one with move, or at check-in.');
      return { booked: v.code, pet: v.pet, site: v.site, run: v.run, kind, starts_on: starts, ends_on: ends, nights: v.nights, charge_cents: v.charge_cents, currency: v.currency, package: pkg?.name ?? null, warnings };
    });

    case 'check-in': return tx(db, async () => {
      const s = await resolveStay(db, a1);
      if (s.status !== 'booked') throw Error(`${s.pet} is ${s.status}, not booked`);
      if (s.starts_on > today()) throw Error(`${s.pet} is booked from ${s.starts_on}. Move the booking first if they are arriving early.`);
      const [pet] = await db.query('select * from pets where id=$1', [s.pet_id]);
      const site = { id: s.site_id, name: s.site };
      let runId = null, runKind = s.run_kind;
      if (flags.run) { const run = await runIn(db, site, flags.run); await checkRun(db, run, pet, { ...s, starts_on: today() > s.starts_on ? today() : s.starts_on }, s.id); runId = run.id; runKind = run.kind; }
      if (!runId && !s.run) throw Error(`Assign a run: check-in ${s.code} --run=<run>`);
      if (s.kind === 'boarding' && !flags.condition) throw Error('Record the condition on arrival: --condition="bright, eating, no wounds"');
      const gap = (await db.query('select vaccine_gap($1,current_date) as g', [s.pet_id]))[0].g;
      if (gap && runKind !== 'isolation' && !flags.override) throw Error(`${s.pet} has no current cover for ${gap}. Get the certificate (vaccinate ...), put them in the isolation run (--run=Isolation), or record why with --override="reason".`);
      const weight = flags.weight ? Number(flags.weight) : null;
      if (flags.weight && !(weight > 0 && weight < 200)) throw Error('--weight is kilograms, for example 21.5');
      await db.query(`update stays set status='checked-in',checked_in_at=now(),arrival_condition=$2,arrival_weight_kg=$3,run_id=coalesce($4,run_id),override_reason=$5 where id=$1`,
        [s.id, flags.condition && flags.condition !== true ? flags.condition : '', weight, runId, gap && flags.override ? `Vaccination ${gap}: ${flags.override}` : '']);
      const [v] = await db.query('select code,pet,site,run,starts_on,ends_on,feeding,medication,behaviour from v_stays where id=$1', [s.id]);
      return { checked_in: v.code, ...v, vaccination: gap ? `not current (${gap})` : 'current' };
    });

    case 'check-out': return tx(db, async () => {
      const s = await resolveStay(db, a1);
      if (s.status !== 'checked-in') throw Error(`${s.pet} is ${s.status}, not in house`);
      const untold = await db.query(`select id,vet_treatment from incidents where stay_id=$1 and vet_treatment<>'' and owner_told_at is null`, [s.id]);
      if (untold.length) throw Error(`Tell the owner about the vet treatment first (${untold.map((i) => i.vet_treatment).join('; ')}): tell-owner ${untold[0].id.slice(0, 8)}`);
      const on = day(flags.on || today(), 'on');
      if (on < s.starts_on) throw Error(`Check-out date ${on} is before arrival ${s.starts_on}`);
      const ends = s.kind === 'daycare' ? s.starts_on : (on > s.starts_on ? on : addDays(s.starts_on, 1));
      await db.query(`update stays set status='checked-out',checked_out_at=now(),ends_on=$2 where id=$1`, [s.id, ends]);
      const [v] = await db.query('select code,pet,owner,nights,charge_cents,deposit_cents,currency from v_stays where id=$1', [s.id]);
      const [b] = await db.query('select balance_cents from v_balances where id=$1 and currency=$2', [s.owner_id, s.currency]);
      return { checked_out: v.code, pet: v.pet, owner: v.owner, nights: v.nights, charge_cents: v.charge_cents, currency: v.currency, owner_balance_cents: b?.balance_cents ?? 0, next: `draft-report-card ${v.code}` };
    });

    case 'cancel': {
      const s = await resolveStay(db, a1);
      if (s.status !== 'booked') throw Error(`Only a booked stay can be cancelled; ${s.pet} is ${s.status}`);
      const status = flags.no_show ? 'no-show' : 'cancelled';
      await db.query(`update stays set status=$2,notes=trim(notes||' '||$3) where id=$1`, [s.id, status, flags.reason && flags.reason !== true ? `${status}: ${flags.reason}` : '']);
      return { [status]: s.code, pet: s.pet, starts_on: s.starts_on };
    }
    case 'move': return tx(db, async () => {
      const s = await resolveStay(db, a1);
      if (!['booked', 'checked-in'].includes(s.status)) throw Error(`${s.pet} is ${s.status}`);
      const [pet] = await db.query('select * from pets where id=$1', [s.pet_id]);
      const run = await runIn(db, { id: s.site_id }, need(flags.run, 'Required --run='));
      await checkRun(db, run, pet, { ...s, starts_on: s.status === 'checked-in' && today() > s.starts_on ? today() : s.starts_on }, s.id);
      await db.query('update stays set run_id=$2 where id=$1', [s.id, run.id]);
      return { moved: s.code, pet: s.pet, from: s.run, to: run.name };
    });
    case 'extra': {
      const s = await resolveStay(db, a1);
      const price = need(cents(flags.price), 'Required --price= (dollars)');
      const row = await insertRow(db, 'extras', { stay_id: s.id, name: need(flags.name, 'Required --name='), price_cents: price });
      return { stay: s.code, pet: s.pet, extra: row.name, price_cents: row.price_cents, currency: s.currency };
    }

    case 'log': {
      const s = await resolveStay(db, a1);
      if (s.status !== 'checked-in') throw Error(`${s.pet} is not in house (${s.status})`);
      const kind = choose(need(flags.kind, `Required --kind=${LOG_KINDS.join('|')}`), LOG_KINDS, '--kind');
      const row = await insertRow(db, 'care_logs', { stay_id: s.id, kind, note: flags.note && flags.note !== true ? flags.note : '', logged_by: need(flags.by, 'Required --by=<staff name>') });
      return { logged: kind, pet: s.pet, note: row.note, by: row.logged_by };
    }
    case 'incident': return tx(db, async () => {
      const pet = await resolve(db, 'pets', flags.pet);
      const kind = choose(need(flags.kind, `Required --kind=${INCIDENT_KINDS.join('|')}`), INCIDENT_KINDS, '--kind');
      const [stay] = await db.query(`select * from v_stays where pet_id=$1 and status='checked-in'`, [pet.id]);
      const row = await insertRow(db, 'incidents', { pet_id: pet.id, stay_id: stay?.id ?? null, kind, summary: need(flags.summary, 'Required --summary='), infectious: Boolean(flags.infectious), vet_treatment: flags.treatment && flags.treatment !== true ? flags.treatment : '' });
      const next = [];
      if (row.infectious && stay && stay.run_kind !== 'isolation') next.push(`Move ${pet.name} to isolation now: move ${stay.code} --run=Isolation`);
      next.push(`Phone the owner, then: tell-owner ${row.id.slice(0, 8)}`);
      return { incident: row.id.slice(0, 8), pet: pet.name, kind, stay: stay?.code ?? null, next };
    });
    case 'tell-owner': {
      const i = await resolve(db, 'incidents', a1);
      await db.query(`update incidents set owner_told_at=now(),action=trim(action||' '||$2) where id=$1`, [i.id, flags.how && flags.how !== true ? `Owner told: ${flags.how}.` : 'Owner told.']);
      return { incident: i.id.slice(0, 8), owner_told: true };
    }
    case 'resolve': {
      const i = await resolve(db, 'incidents', a1);
      await db.query('update incidents set resolved_at=now(),action=trim(action||$2) where id=$1', [i.id, ' ' + need(flags.action, 'Required --action= (what was done)')]);
      return { incident: i.id.slice(0, 8), resolved: true };
    }
    case 'vaccinate': {
      const pet = await resolve(db, 'pets', flags.pet);
      const vaccine = choose(need(flags.vaccine, 'Required --vaccine='), VACCINES, '--vaccine');
      const given = day(need(flags.given, 'Required --given=YYYY-MM-DD'), 'given');
      if (given > today()) throw Error('--given cannot be in the future');
      const due = flags.due ? day(flags.due, 'due') : null;
      await insertRow(db, 'vaccinations', { pet_id: pet.id, vaccine, given_on: given, due_on: due, evidence_ref: need(flags.evidence, 'Required --evidence= (certificate number, or "phoned <clinic> <date>")') });
      return { pet: pet.name, vaccine, given_on: given, due_on: due, vaccination_today: (await db.query('select vaccine_gap($1,current_date) as g', [pet.id]))[0].g || 'current' };
    }

    case 'pay': {
      const o = await resolve(db, 'owners', flags.owner);
      const amount = need(cents(flags.amount), 'Required --amount= (dollars)');
      if (!amount) throw Error('--amount must be more than zero');
      let currency = flags.currency;
      if (!currency) currency = (await db.query('select currency from v_stays where owner_id=$1 order by starts_on desc limit 1', [o.id]))[0]?.currency || 'NZD';
      choose(currency, ['NZD', 'AUD'], '--currency');
      await insertRow(db, 'payments', { owner_id: o.id, amount_cents: amount, currency, method: flags.method && flags.method !== true ? flags.method : '', reference: flags.reference && flags.reference !== true ? flags.reference : null, paid_on: flags.on ? day(flags.on) : today() });
      const [b] = await db.query('select balance_cents from v_balances where id=$1 and currency=$2', [o.id, currency]);
      return { owner: o.name, paid_cents: amount, currency, balance_cents: b?.balance_cents ?? -amount };
    }
    case 'sell-package': {
      const o = await resolve(db, 'owners', flags.owner);
      const days = Number(need(flags.days, 'Required --days='));
      if (!Number.isInteger(days) || days < 1) throw Error('--days must be a whole number');
      const row = await insertRow(db, 'packages', { owner_id: o.id, name: need(flags.name, 'Required --name='), days, price_cents: need(cents(flags.price), 'Required --price='), currency: choose(flags.currency || 'NZD', ['NZD', 'AUD'], '--currency'), expires_on: flags.expires ? day(flags.expires) : null });
      return { owner: o.name, package: row.name, days, price_cents: row.price_cents, currency: row.currency, expires_on: row.expires_on };
    }

    case 'draft-reminder': {
      const owner = a1 ? await resolve(db, 'owners', a1) : null;
      const rows = await db.query(`select v.owner,v.owner_id,v.pet,v.starts_on,v.site,o.email,case when vaccine_gap(v.pet_id,v.starts_on)<>'' then vaccine_gap(v.pet_id,v.starts_on) else vaccine_gap(v.pet_id,v.ends_on) end as missing
        from v_stays v join owners o on o.id=v.owner_id where v.status='booked' and v.starts_on<=current_date+60 and (vaccine_gap(v.pet_id,v.starts_on)<>'' or vaccine_gap(v.pet_id,v.ends_on)<>'') and ($1::uuid is null or v.owner_id=$1) order by v.owner,v.starts_on`, [owner?.id ?? null]);
      if (!rows.length) throw Error(owner ? `${owner.name} has no upcoming stay with a vaccination gap` : 'No upcoming stays with a vaccination gap');
      const by = new Map(); for (const r of rows) by.set(r.owner, [...(by.get(r.owner) || []), r]);
      const body = ['# Vaccination reminders (drafts, not sent)', '', 'Check each one, then send from your own email or text.', ''];
      for (const [name, list] of by) {
        body.push(`## To: ${name} <${list[0].email || 'no email on file'}>`, '', `Subject: Vaccination certificate needed before ${list[0].starts_on}`, '', `Hi ${name.split(' ')[0]},`, '');
        for (const r of list) body.push(`${r.pet} is booked in at ${r.site} from ${r.starts_on}. Our records do not show current cover for: ${r.missing}.`);
        body.push('', 'Could you send a photo of the certificate, or ask your vet to email it to us, before drop-off? Without it we cannot board them in the main kennels.', '', 'Thanks,', '');
      }
      return { file: await draftFile(owner ? `vaccination-reminder-${owner.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'vaccination-reminders', body.join('\n')), owners: by.size, sent: false };
    }
    case 'draft-confirmation': {
      const s = await resolveStay(db, a1);
      const [o] = await db.query('select * from owners where id=$1', [s.owner_id]);
      const gap = (await db.query('select vaccine_gap($1,$2::date) as g', [s.pet_id, s.starts_on]))[0].g;
      const body = [`# Booking confirmation (draft, not sent)`, '', `To: ${o.name} <${o.email || 'no email on file'}>`, `Subject: ${s.pet} is booked in, ${s.starts_on}${s.kind === 'boarding' ? ` to ${s.ends_on}` : ''}`, '',
        `Hi ${o.name.split(' ')[0]},`, '', s.kind === 'boarding' ? `${s.pet} is booked to stay with us at ${s.site} from ${s.starts_on}, collection ${s.ends_on} (${s.nights} nights).` : `${s.pet} is booked for daycare at ${s.site} on ${s.starts_on}.`,
        s.package_id ? 'This day comes off your daycare package.' : `The cost is ${dollars(s.charge_cents, s.currency)}${s.deposit_cents ? `, with ${dollars(s.deposit_cents, s.currency)} deposit received` : ''}.`, '',
        gap ? `We still need a current vaccination certificate covering ${gap}. Please send it before drop-off.` : 'Their vaccination is current for this stay. Thank you.', '',
        'Please bring their food if they are on a special diet, any medication in its labelled container, and let us know of any changes to their health or behaviour.', '', 'See you soon,', ''];
      return { file: await draftFile(`confirmation-${s.code}`, body.join('\n')), sent: false };
    }
    case 'draft-report-card': {
      const s = await resolveStay(db, a1);
      const logs = await db.query(`select to_char(logged_at,'Dy DD Mon HH24:MI') as at,kind,note from care_logs where stay_id=$1 order by logged_at`, [s.id]);
      const inc = await db.query('select kind,summary,vet_treatment,action from incidents where stay_id=$1', [s.id]);
      const body = [`# ${s.pet}'s stay at ${s.site} (draft go-home note, not sent)`, '', `For: ${s.owner}. ${s.starts_on} to ${s.ends_on}.`, '', '## How the stay went', '', ...(logs.length ? logs.map((l) => `- ${l.at}, ${l.kind}: ${l.note}`) : ['- No care notes logged.']), '',
        '## Anything to know', '', ...(inc.length ? inc.map((i) => `- ${i.kind}: ${i.summary}.${i.vet_treatment ? ` Vet treatment: ${i.vet_treatment}.` : ''}${i.action ? ` ${i.action}` : ''}`) : ['- Nothing to report.']), '',
        `Total for this stay: ${dollars(s.charge_cents, s.currency)}.`, ''];
      return { file: await draftFile(`report-card-${s.code}`, body.join('\n')), sent: false };
    }
    case 'weekly-review': {
      const data = {
        attention: await db.query(READS.attention),
        next_14_nights: await db.query(`select night,site,service,booked,capacity from v_occupancy where night<current_date+14 and pct>=80 order by night`),
        last_7_days: await execute(db, ['revenue', '--days=7']),
      };
      const body = [`# Weekly review, ${today()}`, '', '## Needs attention', '', table(data.attention, ['area', 'subject', 'item'].map((key) => ({ key, label: key, width: 90 }))), '',
        '## Busy nights in the next 14 days', '', table(data.next_14_nights, ['night', 'site', 'service', 'booked', 'capacity'].map((key) => ({ key, label: key }))), '',
        '## Last 7 days', '', table(data.last_7_days, ['site', 'currency', 'nights', 'daycare_days', 'charged_cents'].map((key) => ({ key, label: key }))), ''];
      return { file: await draftFile('weekly-review', body.join('\n')), data };
    }

    case 'import': {
      if (a1 !== 'gingr') throw Error('Use: import gingr --kind=owners|animals|reservations --file=<export.csv>');
      return importGingr(db, flags);
    }
    case 'export': {
      const out = path.resolve(need(flags.out, 'Required --out=<new-file.json>'));
      const records = {};
      await tx(db, async () => { for (const t of TABLES) records[t] = await db.query(`select * from ${t} order by ${t === 'rules' ? 'code,jurisdiction' : 'created_at,id'}`); });
      fs.writeFileSync(out, JSON.stringify({ format: 'pet-boarding-v1', exported_at: new Date().toISOString(), records }, null, 2), { flag: 'wx', mode: 0o600 });
      return { file: out, record_kinds: TABLES.length, rows: Object.values(records).reduce((n, r) => n + r.length, 0) };
    }
  }
  throw Error(`Unknown command ${cmd}. Run: node scripts/boarding.mjs help`);
}

// Gingr exports open in Excel; save each as CSV. Headings vary with the forms a facility has set up,
// so common labels are accepted and --map=columns.json renames the rest. docs/replace-gingr.md has the detail.
const COLUMNS = {
  owner_id: ['Owner ID', 'Owner Id', 'Customer ID'],
  first: ['First Name', 'Owner First Name'],
  last: ['Last Name', 'Owner Last Name'],
  owner: ['Owner', 'Owner Name', 'Customer', 'Name'],
  email: ['Email', 'Email Address', 'Owner Email'],
  phone: ['Cell Phone', 'Mobile', 'Mobile Phone', 'Phone', 'Home Phone'],
  address: ['Address', 'Address 1', 'Street'],
  city: ['City', 'Suburb'],
  emergency: ['Emergency Contact', 'Emergency Contact Name'],
  emergency_phone: ['Emergency Contact Phone'],
  vet: ['Veterinarian', 'Vet', 'Vet Name'],
  vet_phone: ['Vet Phone', 'Veterinarian Phone'],
  animal_id: ['Animal ID', 'Animal Id', 'Pet ID'],
  animal: ['Animal', 'Animal Name', 'Pet', 'Pet Name'],
  species: ['Species', 'Animal Type', 'Type'],
  breed: ['Breed'],
  sex: ['Gender', 'Sex'],
  colour: ['Color', 'Colour'],
  birthday: ['Birthday', 'Birth Date', 'Date of Birth', 'DOB'],
  weight: ['Weight'],
  fixed: ['Fixed', 'Spayed/Neutered', 'Desexed'],
  feeding: ['Feeding Instructions', 'Feeding', 'Food'],
  medication: ['Medications', 'Medication'],
  notes: ['Notes', 'Animal Notes'],
  reservation_id: ['Reservation ID', 'Reservation Id', 'ID'],
  type: ['Reservation Type', 'Type', 'Service'],
  start: ['Start Date', 'Check In', 'Check-In Date', 'Start'],
  end: ['End Date', 'Check Out', 'Check-Out Date', 'End'],
  status: ['Status'],
  location: ['Location', 'Home Location'],
  lodging: ['Lodging', 'Run', 'Kennel'],
  price: ['Total', 'Price', 'Amount'],
};
// Vaccine expiry columns as Gingr facilities commonly name them, mapped to the vaccines this system checks.
const VACCINE_COLUMNS = [[/^(c3|c5|c7|dhpp|dhlpp|da2pp|distemper)\b.*(exp|due)/i, 'C5'], [/^(kc|kennel cough|bordetella)\b.*(exp|due)/i, 'KC'], [/^(f3|f4|fvrcp)\b.*(exp|due)/i, 'F3']];

export function toDate(v, where) {
  const s = String(v || '').trim(); if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return day(`${m[1]}-${m[2]}-${m[3]}`, where);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // Gingr writes US month/day; NZ and AU exports may be day/month. --date-order=dmy flips it.
  if (m) return { m };
  throw Error(`${where}: not a date: ${s}`);
}

async function importGingr(db, f) {
  const kind = choose(need(f.kind, 'Required --kind=owners|animals|reservations'), ['owners', 'animals', 'reservations'], '--kind');
  const file = need(f.file, 'Required --file=<export.csv>');
  if (!/\.csv$/i.test(file)) throw Error('Save the Gingr export as CSV first (File, Save As, CSV)');
  const rows = parseCsv(fs.readFileSync(file, 'utf8'));
  if (!rows.length) throw Error('The file has no rows');
  const map = f.map ? JSON.parse(fs.readFileSync(f.map, 'utf8')) : {};
  const get = (row, key) => String(pick(row, ...(map[key] ? [map[key]] : []), ...(COLUMNS[key] || [])) || '').trim();
  const dmy = f.date_order === 'dmy';
  const date = (v, where) => { const r = toDate(v, where); if (!r || typeof r === 'string') return r; const [, a, b, y] = r.m; return day(`${y}-${(dmy ? b : a).padStart(2, '0')}-${(dmy ? a : b).padStart(2, '0')}`, `${where} (try --date-order=${dmy ? 'mdy' : 'dmy'})`); };
  const currency = choose((f.currency || 'NZD').toUpperCase(), ['NZD', 'AUD'], '--currency');
  const counts = { created: 0, updated: 0, vaccinations: 0, skipped: 0 };
  const ownerName = (row, where) => { const n = get(row, 'owner') || [get(row, 'first'), get(row, 'last')].filter(Boolean).join(' '); return need(n, `${where}: no owner name (First Name and Last Name, or Owner)`); };
  async function findOwner(row, where) {
    const ext = get(row, 'owner_id') || null, name = ownerName(row, where);
    let o = ext ? (await db.query('select * from owners where external_id=$1', [ext]))[0] : null;
    if (!o) { const byName = await db.query('select * from owners where lower(name)=lower($1)', [name]); if (byName.length > 1) throw Error(`${where}: two owners called ${name}; add an Owner ID column`); o = byName[0]; }
    return { o, ext, name };
  }
  await db.exec('BEGIN');
  try {
    for (const [i, row] of rows.entries()) {
      const where = `row ${i + 2}`;
      if (kind === 'owners') {
        const { o, ext, name } = await findOwner(row, where);
        const vals = { name, email: get(row, 'email'), phone: get(row, 'phone'), address: [get(row, 'address'), get(row, 'city')].filter(Boolean).join(', '), emergency_contact: [get(row, 'emergency'), get(row, 'emergency_phone')].filter(Boolean).join(' '), vet_name: get(row, 'vet'), vet_phone: get(row, 'vet_phone') };
        if (o) { await db.query(`update owners set email=coalesce(nullif($2,''),email),phone=coalesce(nullif($3,''),phone),address=coalesce(nullif($4,''),address),emergency_contact=coalesce(nullif($5,''),emergency_contact),vet_name=coalesce(nullif($6,''),vet_name),vet_phone=coalesce(nullif($7,''),vet_phone),external_id=coalesce(external_id,$8),raw_import=$9 where id=$1`, [o.id, vals.email, vals.phone, vals.address, vals.emergency_contact, vals.vet_name, vals.vet_phone, ext, JSON.stringify(row)]); counts.updated++; }
        else { await insertRow(db, 'owners', { ...vals, external_id: ext, raw_import: JSON.stringify(row) }); counts.created++; }
      } else if (kind === 'animals') {
        let { o, ext, name } = await findOwner(row, where);
        if (!o) o = await insertRow(db, 'owners', { name, external_id: ext, email: get(row, 'email'), phone: get(row, 'phone') });
        const petName = need(get(row, 'animal'), `${where}: no animal name`);
        const species = /cat|feline/i.test(get(row, 'species')) ? 'cat' : /dog|canine/i.test(get(row, 'species')) || !get(row, 'species') ? 'dog' : 'other';
        const sexRaw = get(row, 'sex').toLowerCase();
        const vals = { owner_id: o.id, name: petName, species, breed: get(row, 'breed'), sex: sexRaw.startsWith('m') ? 'male' : sexRaw.startsWith('f') ? 'female' : '', colour: get(row, 'colour'), birth_date: date(get(row, 'birthday'), `${where} Birthday`),
          weight_kg: get(row, 'weight') ? Number(get(row, 'weight').replace(/[^\d.]/g, '')) || null : null, desexed: get(row, 'fixed') ? yesNo(get(row, 'fixed')) : null, feeding: get(row, 'feeding'), medication: get(row, 'medication'), behaviour: get(row, 'notes'), external_id: get(row, 'animal_id') || null, raw_import: JSON.stringify(row) };
        let p = vals.external_id ? (await db.query('select * from pets where external_id=$1', [vals.external_id]))[0] : null;
        if (!p) p = (await db.query('select * from pets where owner_id=$1 and lower(name)=lower($2)', [o.id, petName]))[0];
        if (p) { const keys = Object.keys(vals).filter((k) => vals[k] !== null && vals[k] !== ''); await db.query(`update pets set ${keys.map((k, j) => `${k}=$${j + 2}`).join(',')} where id=$1`, [p.id, ...keys.map((k) => vals[k])]); counts.updated++; }
        else { p = await insertRow(db, 'pets', vals); counts.created++; }
        for (const [header, value] of Object.entries(row)) {
          const hit = VACCINE_COLUMNS.find(([re]) => re.test(header.trim()));
          if (!hit || !String(value).trim()) continue;
          const due = date(value, `${where} ${header}`);
          const given = addDays(due, -365);
          const dup = await db.query('select 1 from vaccinations where pet_id=$1 and vaccine=$2 and due_on=$3', [p.id, hit[1], due]);
          if (!dup.length) { await insertRow(db, 'vaccinations', { pet_id: p.id, vaccine: hit[1], given_on: given, due_on: due, evidence_ref: `Gingr export: ${header} (given date assumed one year before expiry; check the certificate)` }); counts.vaccinations++; }
        }
      } else {
        const petName = need(get(row, 'animal'), `${where}: no animal name`);
        const { o, name } = await findOwner(row, where);
        if (!o) throw Error(`${where}: owner ${name} not found. Import owners and animals first.`);
        const p = (await db.query('select * from pets where owner_id=$1 and lower(name)=lower($2)', [o.id, petName]))[0];
        if (!p) throw Error(`${where}: ${petName} (${name}) not found. Import animals first.`);
        const ext = get(row, 'reservation_id') || null;
        if (ext && (await db.query('select 1 from stays where external_id=$1', [ext])).length) { counts.skipped++; continue; }
        const starts = need(date(get(row, 'start'), `${where} Start Date`), `${where}: Start Date required`);
        const type = get(row, 'type');
        const daycare = /day ?care|day camp|day play/i.test(type);
        let ends = daycare ? starts : date(get(row, 'end'), `${where} End Date`) || addDays(starts, 1);
        if (!daycare && ends <= starts) ends = addDays(starts, 1);
        const statusRaw = get(row, 'status').toLowerCase();
        const status = /cancel/.test(statusRaw) ? 'cancelled' : /no.?show/.test(statusRaw) ? 'no-show' : /checked.?in/.test(statusRaw) ? 'checked-in' : /checked.?out|complete/.test(statusRaw) || ends < today() ? 'checked-out' : 'booked';
        const siteName = get(row, 'location') || 'Imported site';
        let site = (await db.query('select * from sites where lower(name)=lower($1)', [siteName]))[0];
        if (!site) site = await insertRow(db, 'sites', { name: siteName, jurisdiction: currency === 'AUD' ? (f.state || 'NSW').toUpperCase() : 'NZ', currency });
        const total = get(row, 'price') ? cents(get(row, 'price')) : 0;
        const nights = daycare ? 1 : Math.round((Date.parse(ends) - Date.parse(starts)) / 86400000);
        await insertRow(db, 'stays', { pet_id: p.id, site_id: site.id, kind: daycare ? 'daycare' : 'boarding', starts_on: starts, ends_on: ends, status, rate_cents: Math.round(total / nights), currency: site.currency, external_id: ext, notes: `Imported from Gingr: ${type || 'reservation'}${get(row, 'lodging') ? `, lodging ${get(row, 'lodging')}` : ''}`,
          checked_in_at: ['checked-in', 'checked-out'].includes(status) ? `${starts}T08:00:00Z` : null, checked_out_at: status === 'checked-out' ? `${ends}T17:00:00Z` : null, arrival_condition: status === 'booked' ? '' : 'Imported from Gingr' });
        counts.created++;
      }
    }
    await db.exec(f.dry_run ? 'ROLLBACK' : 'COMMIT');
  } catch (e) { await db.exec('ROLLBACK'); throw e; }
  return { kind, rows: rows.length, ...counts, dry_run: Boolean(f.dry_run) };
}

const hidden = (k) => ['id', 'pet_id', 'owner_id', 'site_id', 'package_id', 'record_id', 'raw_import'].includes(k);
export function human(value) {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    if (!value.length) return '  (none)';
    if (value[0]?.question) return value.map((x) => `${x.number}. ${x.question}\n${human(x.rows)}`).join('\n\n');
    const keys = Object.keys(value[0]).filter((k) => !hidden(k));
    return table(value, keys.map((key) => ({ key: key, label: key.replace(/_cents$/, '').replaceAll('_', ' '), align: key.endsWith('_cents') ? 'right' : 'left', width: ['finding', 'item', 'source'].includes(key) ? 100 : 48,
      format: (v) => (v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : key.endsWith('_cents') && v != null ? (Number(v) / 100).toFixed(2) : v == null ? '' : String(v)) })));
  }
  if (value && typeof value === 'object') {
    const flat = (v) => v === null || typeof v !== 'object' || v instanceof Date;
    const show = (k, v) => k.endsWith('_cents') && v != null ? (Number(v) / 100).toFixed(2) : v instanceof Date ? v.toISOString().slice(0, 16).replace('T', ' ') : v ?? '';
    const scalars = Object.entries(value).filter(([k, v]) => flat(v) && !hidden(k)).map(([k, v]) => `${k.replace(/_cents$/, '').replaceAll('_', ' ')}: ${show(k, v)}`);
    const nested = Object.entries(value).filter(([k, v]) => !flat(v) && !hidden(k)).map(([k, v]) => `${k.replaceAll('_', ' ')}:\n${Array.isArray(v) && typeof v[0] === 'string' ? v.map((s) => `  ${s}`).join('\n') : human(v)}`);
    return [scalars.join('\n'), ...nested].filter(Boolean).join('\n\n');
  }
  return String(value ?? '');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let db;
  const args = process.argv.slice(2), json = args.includes('--json');
  try { db = await getDb(); const out = await execute(db, args); console.log(json ? JSON.stringify(out, null, 2) : human(out)); }
  catch (e) { if (json) console.log(JSON.stringify({ error: e.message, ...(e.matches ? { matches: e.matches } : {}) })); else console.error(e.message); process.exitCode = 1; }
  finally { await db?.close(); }
}

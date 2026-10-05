-- Pet Boarding for Claude Code: kennels, catteries and doggy daycares.
-- Plain Postgres. Runs the same on Supabase, any Postgres, or the embedded PGlite.

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- The rules the record checks enforce, with their source. /compliance reads this table,
-- docs/compliance.md explains each one. Add a row when the operator names a new rule.
create table rules (
  code text not null,
  jurisdiction text not null,          -- NZ, NSW, VIC, ACT, ... or ANY for house rules
  title text not null,
  source text not null,
  primary key (code, jurisdiction)
);

create table sites (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) > 0),
  jurisdiction text not null check (jurisdiction in ('NZ','NSW','VIC','QLD','ACT','SA','WA','TAS','NT')),
  currency text not null default 'NZD' check (currency in ('NZD','AUD')),
  address text not null default '',
  registration_ref text not null default '',   -- council registration (Victoria: Domestic Animal Business)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table runs (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references sites(id),
  name text not null,
  kind text not null check (kind in ('kennel','suite','cattery','isolation','daycare')),
  species text not null default 'dog' check (species in ('dog','cat','any')),
  capacity integer not null default 1 check (capacity between 1 and 200),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, name)
);

create table owners (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  email text not null default '',
  phone text not null default '',
  address text not null default '',
  emergency_contact text not null default '',
  vet_name text not null default '',
  vet_phone text not null default '',
  notes text not null default '',
  status text not null default 'active' check (status in ('active','inactive','banned')),
  external_id text unique,
  raw_import jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id),
  name text not null check (length(trim(name)) > 0),
  species text not null default 'dog' check (species in ('dog','cat','other')),
  breed text not null default '',
  sex text not null default '' check (sex in ('','male','female')),
  desexed boolean,
  colour text not null default '',
  birth_date date,
  weight_kg numeric(5,1),
  microchip text not null default '',
  feeding text not null default '',
  medication text not null default '',
  behaviour text not null default '',
  heartworm text not null default '',            -- dogs: product and date of last dose
  daycare_approved boolean not null default false, -- passed the temperament assessment
  active boolean not null default true,
  external_id text unique,
  raw_import jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table vaccinations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id),
  vaccine text not null check (vaccine in ('C3','C4','C5','C7','KC','F3','F4','F5','Other')),
  given_on date not null,
  due_on date,
  evidence_ref text not null default '',   -- certificate number, clinic letter, or "phoned clinic <date>"
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on is null or due_on > given_on)
);

create table rates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  kind text not null check (kind in ('night','day','extra')),
  species text not null default 'dog' check (species in ('dog','cat','any')),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'NZD' check (currency in ('NZD','AUD')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table packages (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id),
  name text not null,
  days integer not null check (days > 0),
  price_cents integer not null check (price_cents >= 0),
  currency text not null default 'NZD' check (currency in ('NZD','AUD')),
  purchased_on date not null default current_date,
  expires_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A stay is one pet booked in: overnight boarding (nights = ends_on - starts_on) or one daycare day.
create table stays (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id),
  site_id uuid not null references sites(id),
  run_id uuid references runs(id),
  kind text not null default 'boarding' check (kind in ('boarding','daycare')),
  starts_on date not null,
  ends_on date not null,                 -- expected collection date; set to the real date at check-out
  status text not null default 'booked' check (status in ('booked','checked-in','checked-out','cancelled','no-show')),
  rate_cents integer not null default 0 check (rate_cents >= 0),  -- per night or per day
  currency text not null default 'NZD' check (currency in ('NZD','AUD')),
  package_id uuid references packages(id),
  deposit_cents integer not null default 0 check (deposit_cents >= 0),
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  arrival_condition text not null default '',
  arrival_weight_kg numeric(5,1),
  override_reason text not null default '',
  notes text not null default '',
  external_id text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((kind = 'boarding' and ends_on > starts_on) or (kind = 'daycare' and ends_on = starts_on))
);

create table extras (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id),
  name text not null,
  price_cents integer not null check (price_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table care_logs (
  id uuid primary key default gen_random_uuid(),
  stay_id uuid not null references stays(id),
  kind text not null check (kind in ('feed','meds','walk','welfare','play','note')),
  note text not null default '',
  logged_by text not null check (length(trim(logged_by)) > 0),
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table incidents (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id),
  stay_id uuid references stays(id),
  kind text not null check (kind in ('injury','illness','fight','escape','behaviour','other')),
  summary text not null check (length(trim(summary)) > 0),
  infectious boolean not null default false,
  vet_treatment text not null default '',
  occurred_at timestamptz not null default now(),
  owner_told_at timestamptz,
  action text not null default '',
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references owners(id),
  paid_on date not null default current_date,
  amount_cents integer not null check (amount_cents > 0),
  currency text not null default 'NZD' check (currency in ('NZD','AUD')),
  method text not null default '',
  reference text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['sites','runs','owners','pets','vaccinations','rates','packages','stays','extras','care_logs','incidents','payments'] loop
    execute format('create trigger %I before update on %I for each row execute function touch_updated_at()', t || '_touch', t);
  end loop;
end $$;

create index stays_dates on stays (starts_on, ends_on);
create index stays_pet on stays (pet_id);
create index care_logs_stay on care_logs (stay_id, logged_at);
create index vaccinations_pet on vaccinations (pet_id);
create index pets_owner on pets (owner_id);

-- What vaccination cover a pet is missing on a given day. Empty string means covered.
-- Dogs: distemper, hepatitis and parvovirus (C3 or better) plus canine cough (C5, C7 or KC).
-- Cats: feline enteritis and respiratory disease (F3 or better). Each given in the last 12 months.
create or replace function vaccine_gap(p uuid, d date) returns text language sql stable as $$
  with pet as (select species from pets where id = p),
  ok as (select vaccine from vaccinations v where v.pet_id = p and v.given_on <= d and v.given_on > d - 365 and (v.due_on is null or v.due_on >= d))
  select case (select species from pet)
    when 'dog' then concat_ws(', ',
      case when not exists (select 1 from ok where vaccine in ('C3','C4','C5','C7')) then 'C3 core (distemper, hepatitis, parvo)' end,
      case when not exists (select 1 from ok where vaccine in ('C5','C7','KC')) then 'canine cough' end)
    when 'cat' then case when not exists (select 1 from ok where vaccine in ('F3','F4','F5')) then 'F3 (enteritis, cat flu)' else '' end
    else '' end
$$;

-- Every stay with its pet, owner, run and what it costs.
create view v_stays as
select s.id, left(s.id::text, 8) as code, s.kind, s.status, s.starts_on, s.ends_on,
  case when s.kind = 'boarding' then s.ends_on - s.starts_on else 1 end as nights,
  p.id as pet_id, p.name as pet, p.species, p.breed, o.id as owner_id, o.name as owner, o.phone,
  si.id as site_id, si.name as site, si.jurisdiction, r.name as run, r.kind as run_kind,
  s.rate_cents, s.currency, s.package_id,
  case when s.package_id is not null then 0
       else s.rate_cents * (case when s.kind = 'boarding' then s.ends_on - s.starts_on else 1 end) end
    + coalesce((select sum(e.price_cents) from extras e where e.stay_id = s.id), 0)::int as charge_cents,
  s.deposit_cents, s.checked_in_at, s.checked_out_at, s.arrival_condition,
  p.feeding, p.medication, p.behaviour, s.notes
from stays s join pets p on p.id = s.pet_id join owners o on o.id = p.owner_id
join sites si on si.id = s.site_id left join runs r on r.id = s.run_id;

-- Today's run sheet: who is in, where, what they eat, what meds, when they were last checked.
create view v_in_house as
select v.id, v.code, v.site, v.run, v.pet, v.species, v.owner, v.phone, v.kind, v.starts_on, v.ends_on,
  v.feeding, v.medication, v.behaviour,
  (select max(c.logged_at) from care_logs c where c.stay_id = v.id and c.kind in ('feed','welfare','walk','play')) as last_check,
  (select max(c.logged_at) from care_logs c where c.stay_id = v.id and c.kind = 'meds') as last_meds
from v_stays v where v.status = 'checked-in';

-- Occupancy for the next 90 nights: boarding by species against run capacity, daycare against yard capacity.
create view v_occupancy as
with days as (select generate_series(current_date, current_date + 89, interval '1 day')::date as night),
cap as (
  select site_id, case when kind = 'cattery' then 'cat boarding' when kind = 'daycare' then 'daycare' else 'dog boarding' end as service,
    sum(capacity)::int as capacity
  from runs where active and kind <> 'isolation' group by 1, 2),
booked as (
  select d.night, s.site_id,
    case when s.kind = 'daycare' then 'daycare' when p.species = 'cat' then 'cat boarding' else 'dog boarding' end as service,
    count(*)::int as booked
  from days d join stays s on s.status in ('booked','checked-in')
    and ((s.kind = 'boarding' and s.starts_on <= d.night and s.ends_on > d.night) or (s.kind = 'daycare' and s.starts_on = d.night))
  join pets p on p.id = s.pet_id
  group by 1, 2, 3)
select d.night, si.name as site, c.service, c.capacity, coalesce(b.booked, 0) as booked,
  c.capacity - coalesce(b.booked, 0) as free,
  round(100.0 * coalesce(b.booked, 0) / c.capacity) as pct
from days d cross join cap c join sites si on si.id = c.site_id
left join booked b on b.night = d.night and b.site_id = c.site_id and b.service = c.service;

-- Daycare packages: days bought, days used, days left.
create view v_packages as
select k.id, o.name as owner, k.name, k.days, k.price_cents, k.currency, k.purchased_on, k.expires_on,
  (select count(*) from stays s where s.package_id = k.id and s.status in ('checked-in','checked-out','no-show'))::int as used,
  (select count(*) from stays s where s.package_id = k.id and s.status = 'booked')::int as booked,
  k.days - (select count(*) from stays s where s.package_id = k.id and s.status in ('checked-in','checked-out','no-show','booked'))::int as left_after_bookings
from packages k join owners o on o.id = k.owner_id;

-- What each owner owes: finished and current stays plus packages, less payments, per currency.
create view v_balances as
with charges as (
  select owner_id, currency, charge_cents as cents, coalesce(checked_out_at::date, starts_on) as on_date
    from v_stays where status in ('checked-in','checked-out','no-show')
  union all select owner_id, currency, price_cents, purchased_on from packages),
paid as (select owner_id, currency, sum(amount_cents)::int as cents, max(paid_on) as last_paid from payments group by 1, 2),
totals as (select owner_id, currency, sum(cents)::int as charged, max(on_date) as last_charge from charges group by 1, 2)
select o.id, o.name as owner, o.phone, t.currency, t.charged as charged_cents, coalesce(p.cents, 0) as paid_cents,
  t.charged - coalesce(p.cents, 0) as balance_cents, t.last_charge, p.last_paid,
  current_date - t.last_charge as days_since_charge
from totals t join owners o on o.id = t.owner_id left join paid p on p.owner_id = t.owner_id and p.currency = t.currency;

-- The record checks. Each row names the rule, the jurisdiction's source, and what is wrong.
create view v_compliance as
with live as (
  select s.*, p.species, p.name as pet, p.birth_date, p.breed, p.sex, p.colour, p.heartworm, o.name as owner,
    o.phone, o.vet_name, o.vet_phone, si.name as site, si.jurisdiction, r.kind as run_kind
  from stays s join pets p on p.id = s.pet_id join owners o on o.id = p.owner_id join sites si on si.id = s.site_id
  left join runs r on r.id = s.run_id
  where s.status = 'checked-in' or (s.status = 'booked' and s.starts_on <= current_date + 14)),
found as (
  -- Unvaccinated or unknown status: quarantine (NZ), refuse admission without a certificate (AU).
  select 'VACC-ADMIT' as code, l.jurisdiction, l.id as record_id, l.pet as subject, l.site,
    case when l.status = 'checked-in' then 'In house without current cover: ' else 'Arrives ' || l.starts_on || ' without current cover: ' end
      || vaccine_gap(l.pet_id, l.starts_on) as finding, l.starts_on as due_on
  from live l where vaccine_gap(l.pet_id, l.starts_on) <> '' and coalesce(l.run_kind, '') <> 'isolation'
  union all
  -- Cover that runs out part way through a stay.
  select 'VACC-LAPSE', l.jurisdiction, l.id, l.pet, l.site, 'Cover lapses during the stay: ' || vaccine_gap(l.pet_id, l.ends_on), l.ends_on
  from live l where vaccine_gap(l.pet_id, l.starts_on) = '' and vaccine_gap(l.pet_id, l.ends_on) <> ''
  union all
  -- Suspected infectious disease must be isolated.
  select 'ISOLATE', l.jurisdiction, i.id, l.pet, l.site, 'Infectious: ' || i.summary || ' (run ' || coalesce(l.run_kind, 'none') || ')', i.occurred_at::date
  from incidents i join live l on l.id = i.stay_id
  where i.infectious and i.resolved_at is null and l.status = 'checked-in' and coalesce(l.run_kind, '') <> 'isolation'
  union all
  -- The admission record each boarder needs (NSW Code 5 cl 5.1.2 to 5.1.3; house rule elsewhere).
  select 'ADMISSION-RECORD', l.jurisdiction, l.id, l.pet, l.site, 'Missing: ' || concat_ws(', ',
      case when l.phone = '' then 'owner phone' end,
      case when l.vet_name = '' or l.vet_phone = '' then 'usual vet' end,
      case when l.breed = '' or l.sex = '' or l.colour = '' or l.birth_date is null then 'description' end,
      case when l.species = 'dog' and l.heartworm = '' then 'heartworm status' end,
      case when l.status = 'checked-in' and l.arrival_condition = '' then 'condition on arrival' end), l.starts_on
  from live l where l.kind = 'boarding' and (l.phone = '' or l.vet_name = '' or l.vet_phone = '' or l.breed = '' or l.sex = '' or l.colour = '' or l.birth_date is null
      or (l.species = 'dog' and l.heartworm = '') or (l.status = 'checked-in' and l.arrival_condition = ''))
  union all
  -- Too young to board.
  select 'MIN-AGE', l.jurisdiction, l.id, l.pet, l.site, 'Age at arrival ' || (l.starts_on - l.birth_date) || ' days', l.starts_on
  from live l where l.birth_date is not null and (
    (l.jurisdiction = 'NSW' and ((l.species = 'dog' and l.starts_on < l.birth_date + interval '4 months') or (l.species = 'cat' and l.starts_on < l.birth_date + interval '3 months')))
    or (l.jurisdiction <> 'NSW' and l.starts_on < l.birth_date + interval '3 months'))
  union all
  -- Victoria: every boarding establishment registers with its council as a Domestic Animal Business.
  select 'VIC-DAB', si.jurisdiction, si.id, si.name, si.name, 'No council registration number recorded', null::date
  from sites si where si.jurisdiction = 'VIC' and si.registration_ref = ''
  union all
  -- Vet treatment during the stay is told to the owner at collection.
  select 'TREATMENT-HANDOVER', si.jurisdiction, i.id, p.name, si.name, 'Treatment not passed on: ' || i.vet_treatment, coalesce(s.checked_out_at::date, s.ends_on)
  from incidents i join stays s on s.id = i.stay_id join pets p on p.id = i.pet_id join sites si on si.id = s.site_id
  where i.vet_treatment <> '' and i.owner_told_at is null and (s.status = 'checked-out' or s.ends_on <= current_date + 1)
  union all
  -- Medication due today and not logged.
  select 'MEDS-LOGGED', h.jurisdiction, h.id, h.pet, h.site, 'No medication logged today: ' || h.medication, current_date
  from (select v.*, si.jurisdiction from v_in_house v join stays s on s.id = v.id join sites si on si.id = s.site_id) h
  where h.medication <> '' and (h.last_meds is null or h.last_meds < current_date::timestamptz)
  union all
  -- Every boarder seen at least once a day.
  select 'DAILY-CHECK', si.jurisdiction, h.id, h.pet, h.site, 'No feed, walk or welfare check in 24 hours', current_date
  from v_in_house h join stays s on s.id = h.id join sites si on si.id = s.site_id
  where h.kind = 'boarding' and s.checked_in_at < now() - interval '24 hours' and (h.last_check is null or h.last_check < now() - interval '24 hours'))
select f.code as rule, f.jurisdiction, f.subject, f.site, f.finding, f.due_on, f.record_id,
  coalesce(r.title, a.title) as title, coalesce(r.source, a.source) as source
from found f left join rules r on r.code = f.code and r.jurisdiction = f.jurisdiction
left join rules a on a.code = f.code and a.jurisdiction = 'ANY';

-- What needs a person today: compliance first, then the money and the follow-ups.
create view v_attention as
select 1 as rank, 'Record check' as area, rule || ': ' || finding as item, subject, due_on from v_compliance
union all
select 2, 'Not checked in', 'Booked for ' || starts_on || ', not arrived', pet, starts_on from v_stays
  where status = 'booked' and starts_on < current_date
union all
select 2, 'Not collected', 'Due out ' || ends_on || ', still in', pet, ends_on from v_stays
  where status = 'checked-in' and ends_on < current_date
union all
select 3, 'Overbooked', service || ' ' || booked || ' booked for ' || capacity || ' places', site, night from v_occupancy
  where booked > capacity
union all
select 4, 'Unpaid', currency || ' ' || to_char(balance_cents / 100.0, 'FM999990.00') || ' owing, last stay ' || last_charge, owner, last_charge from v_balances
  where balance_cents > 0 and days_since_charge > 7
union all
select 5, 'Open incident', kind || ': ' || summary, (select name from pets where id = pet_id), occurred_at::date from incidents
  where resolved_at is null
union all
select 6, 'Package', name || ': ' || left_after_bookings || ' days left' || coalesce(', expires ' || expires_on, ''), owner, expires_on from v_packages
  where left_after_bookings <= 1 or expires_on <= current_date + 14;

insert into rules (code, jurisdiction, title, source) values
 ('VACC-ADMIT','NZ','Unvaccinated or unknown status must be quarantined on admission (Minimum Standard 4)','https://www.mpi.govt.nz/animals/animal-welfare/codes/all-animal-welfare-codes/code-of-welfare-temporary-housing-of-companion-animals'),
 ('VACC-ADMIT','NSW','Current vaccination certificate (within 12 months) before admission (Code of Practice No 5, cl 6.1)','https://www.dpird.nsw.gov.au/__data/assets/pdf_file/0011/1618607/Code-of-Practice-No-5-Dogs-and-cats-in-animal-boarding-establishments.pdf'),
 ('VACC-ADMIT','ACT','C5 (dogs) or F3 (cats) within the past 12 months before admission','https://www.legislation.act.gov.au/DownloadFile/di/2021-190/current/PDF/2021-190.PDF'),
 ('VACC-ADMIT','VIC','Vaccination as defined in the Code of Practice for the Operation of Boarding Establishments (cl 2.4)','https://agriculture.vic.gov.au/livestock-and-animals/animal-welfare-victoria/domestic-animals-act/codes-of-practice/code-of-practice-for-the-operation-of-boarding-establishments'),
 ('VACC-ADMIT','ANY','House rule: current vaccination cover before admission','docs/compliance.md#house-rules'),
 ('VACC-LAPSE','ANY','House rule: cover stays current for the whole stay','docs/compliance.md#house-rules'),
 ('ISOLATE','NZ','Known or suspected infectious disease must be securely isolated (Minimum Standard 4)','https://www.mpi.govt.nz/animals/animal-welfare/codes/all-animal-welfare-codes/code-of-welfare-temporary-housing-of-companion-animals'),
 ('ISOLATE','NSW','Animals with a known or suspected infectious disease are not admitted (cl 6.1)','https://www.dpird.nsw.gov.au/__data/assets/pdf_file/0011/1618607/Code-of-Practice-No-5-Dogs-and-cats-in-animal-boarding-establishments.pdf'),
 ('ISOLATE','ANY','House rule: suspected infectious disease goes to the isolation run','docs/compliance.md#house-rules'),
 ('ADMISSION-RECORD','NSW','Record owner contact, collection date, description, vaccination, heartworm, usual vet, needs and condition on arrival (cl 5.1.2 to 5.1.3)','https://www.dpird.nsw.gov.au/__data/assets/pdf_file/0011/1618607/Code-of-Practice-No-5-Dogs-and-cats-in-animal-boarding-establishments.pdf'),
 ('ADMISSION-RECORD','ANY','House rule: the NSW admission record, kept everywhere','docs/compliance.md#house-rules'),
 ('MIN-AGE','NSW','Dogs under 4 months and cats under 3 months only in exceptional circumstances (cl 6.1)','https://www.dpird.nsw.gov.au/__data/assets/pdf_file/0011/1618607/Code-of-Practice-No-5-Dogs-and-cats-in-animal-boarding-establishments.pdf'),
 ('MIN-AGE','ANY','House rule: no boarders under 3 months','docs/compliance.md#house-rules'),
 ('VIC-DAB','VIC','Boarding establishments register with their council as a Domestic Animal Business','https://agriculture.vic.gov.au/livestock-and-animals/animal-welfare-victoria/domestic-animal-businesses/boarding-establishments'),
 ('TREATMENT-HANDOVER','ANY','House rule: vet treatment during the stay is told to the owner at collection','docs/compliance.md#house-rules'),
 ('MEDS-LOGGED','ANY','House rule: every dose given is logged the same day','docs/compliance.md#house-rules'),
 ('DAILY-CHECK','ANY','House rule: every boarder fed and checked at least once every 24 hours','docs/compliance.md#house-rules');

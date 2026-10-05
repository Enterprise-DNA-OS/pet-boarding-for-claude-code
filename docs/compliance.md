# Record checks

`/compliance` (or `node scripts/boarding.mjs compliance`) checks the records against the rules below. Each rule lives in the `rules` table with its source, and the check itself is one block in the `v_compliance` view in `supabase/migrations/0001_boarding.sql`. A finding names the rule, the animal, what is wrong and the source for that site's jurisdiction.

This is not legal advice. It records the rules the operator has told the system to enforce, with sources, and checks the data against them. Read the code that applies to you and change a rule here, and in the view, when yours differs. `/customise` does both.

## The codes

| Code | Where | Source |
|---|---|---|
| Code of Welfare: Temporary Housing of Companion Animals (MPI, 2018) | New Zealand | https://www.mpi.govt.nz/animals/animal-welfare/codes/all-animal-welfare-codes/code-of-welfare-temporary-housing-of-companion-animals |
| Animal Welfare Code of Practice No 5: Dogs and cats in animal boarding establishments | New South Wales | https://www.dpird.nsw.gov.au/__data/assets/pdf_file/0011/1618607/Code-of-Practice-No-5-Dogs-and-cats-in-animal-boarding-establishments.pdf |
| Animal Welfare (Overnight Animal Boarding Establishments) Code of Practice 2021 | ACT | https://www.legislation.act.gov.au/DownloadFile/di/2021-190/current/PDF/2021-190.PDF |
| Code of Practice for the Operation of Boarding Establishments | Victoria | https://agriculture.vic.gov.au/livestock-and-animals/animal-welfare-victoria/domestic-animals-act/codes-of-practice/code-of-practice-for-the-operation-of-boarding-establishments |
| Domestic Animal Business registration | Victoria | https://agriculture.vic.gov.au/livestock-and-animals/animal-welfare-victoria/domestic-animal-businesses/boarding-establishments |

## The rules

| Rule | What it checks | Source by jurisdiction |
|---|---|---|
| `VACC-ADMIT` | An animal in house, or arriving in the next 14 days, without current vaccination cover, and not in the isolation run. Dogs need C3 cover (distemper, hepatitis, parvovirus) and canine cough (C5, C7 or a separate KC). Cats need F3. Each given within the last 12 months and not past its due date. | NZ: Minimum Standard 4, unvaccinated or unknown status is quarantined. NSW: cl 6.1, a certificate showing vaccination within 12 months before admission. ACT: C5 or F3 within 12 months. VIC: the code's definition of vaccination (cl 2.4). Elsewhere: house rule. |
| `VACC-LAPSE` | Cover that is current at arrival but runs out before collection. | House rule |
| `ISOLATE` | An open incident marked infectious for an animal in house that is not in the isolation run. | NZ: Minimum Standard 4, secure isolation. NSW: cl 6.1, animals with a known or suspected infectious disease are not admitted. Elsewhere: house rule. |
| `ADMISSION-RECORD` | A boarder missing any of: owner phone, usual vet name and phone, description (breed, sex, colour, birth date), heartworm status for dogs, condition on arrival. | NSW: cl 5.1.2 to 5.1.3. Elsewhere: house rule, because it is the record you want when something goes wrong. |
| `MIN-AGE` | An animal arriving younger than the minimum age. | NSW: dogs under 4 months, cats under 3 months, only in exceptional circumstances (cl 6.1). Elsewhere: house rule, 3 months. |
| `VIC-DAB` | A Victorian site with no council registration number recorded. | Victoria: boarding establishments register as a Domestic Animal Business. |
| `TREATMENT-HANDOVER` | Vet treatment given during a stay that has not been told to the owner, once the animal is due out. Check-out refuses until it is. | House rule |
| `MEDS-LOGGED` | An animal in house with medication on its record and no dose logged today. | House rule |
| `DAILY-CHECK` | A boarder in house more than 24 hours with no feed, walk or welfare check logged in the last 24 hours. | House rule |

## House rules

House rules are the operator's own standards. They cite this page as their source. Change them with `/customise`: for example "medication is logged morning and night", "we take puppies from 12 weeks", or "Queensland sites follow the NSW record rule".

## What it does not check

- Kennel sizes, temperatures, ventilation, cleaning schedules and staffing ratios in the codes. Those are about the building and the day, not the records. Add a check when you start recording them (for example a daily cleaning log).
- Council permit conditions specific to your site.
- Whether a certificate is genuine. `evidence_ref` records what you saw and who confirmed it.

# Moving off Gingr

You can run this beside Gingr for a week, then switch. Nothing here talks to Gingr: you export from it, and import here.

## 1. Export from Gingr

Gingr's reports and View All pages export to CSV or Excel. Its help centre describes an Export to CSV button on the View All Owners page, and an "Export to Excel?" tick box on many reports. You want three files:

1. **Owners**: View All Owners, Export to CSV. Tag extra owner fields (emergency contact, vet) as "View All" columns first so they come out too (Admin, Owner Form, edit the field, Tags).
2. **Animals**: the animals list with breed, gender, colour, birthday, weight, feeding, medication and the vaccine expiry fields, tagged the same way on the Animal Form.
3. **Reservations**: the reservations for the period you want to bring across (past stays for history, future stays so nothing is lost).

Save anything that opens in Excel as CSV.

## 2. Import, in order

```bash
node scripts/boarding.mjs import gingr --kind=owners --file=owners.csv --dry-run
node scripts/boarding.mjs import gingr --kind=owners --file=owners.csv
node scripts/boarding.mjs import gingr --kind=animals --file=animals.csv
node scripts/boarding.mjs import gingr --kind=reservations --file=reservations.csv --currency=NZD
```

Each run is all or nothing: one bad row and nothing is written, with the row number in the error. Running it again updates owners and animals and skips reservations already there, so a second export a week later tops up.

## Column names

Gingr's headings depend on the forms your facility has set up. The import accepts the common ones:

| Field | Headings read |
|---|---|
| Owner | `Owner ID`, `First Name` + `Last Name`, or `Owner` |
| Contact | `Email`, `Cell Phone` / `Mobile` / `Phone`, `Address`, `City` |
| Emergency and vet | `Emergency Contact`, `Emergency Contact Phone`, `Veterinarian` / `Vet`, `Vet Phone` |
| Animal | `Animal ID`, `Animal Name`, `Species` / `Animal Type`, `Breed`, `Gender`, `Color`, `Birthday`, `Weight`, `Fixed`, `Feeding Instructions`, `Medications`, `Notes` |
| Vaccines | any column whose heading starts with C3/C5/C7/DHPP/DHLPP/Distemper, KC/Kennel Cough/Bordetella, or F3/F4/FVRCP and contains "exp" or "due" |
| Reservation | `Reservation ID`, `Reservation Type`, `Start Date`, `End Date`, `Status`, `Location`, `Lodging`, `Total` |

When yours differ, copy `examples/columns.json`, put your heading on the right of each field that differs, and add `--map=columns.json`. The files in `examples/` show the shape the import expects.

## Dates

Gingr writes US dates (month/day/year). If your export has day/month/year, add `--date-order=dmy`. A date that cannot be real in the order you chose stops the import and says which row.

## What maps

| Gingr | Here |
|---|---|
| Owner | `owners`, with the Gingr id kept in `external_id` and every original column in `raw_import` |
| Animal | `pets`, linked to its owner |
| Vaccine expiry fields | `vaccinations`. The given date is set to one year before the expiry and the evidence says so: check the certificate next time the pet comes in. |
| Reservation type containing "day care", "day camp" or "day play" | a daycare `stay` |
| Any other reservation | a boarding `stay`, nightly rate = total / nights |
| Location | `sites` (created if missing; set `--currency`, and for Australia `--state=VIC` etc.) |
| Status | Cancelled, No Show, Checked In, Checked Out; anything else is booked if it is in the future and checked out if it is past |

## What does not carry over

- Card details and stored payment methods. They stay with Gingr's payment processor.
- Payment history and invoices. Bring balances across with `pay` and an opening entry, or start clean from the switch date.
- Report card photos and the customer app login. Owners book by phone, email or a form you choose.
- Lodging assignments on future reservations come across as a note (`Lodging K1`). Assign runs with `move` or at check-in.
- Package balances. Sell each owner their remaining days with `sell-package` at the switch.

Not sure about a column? Run the import with `--dry-run` and ask Claude Code to map it. Want it done for you: https://enterprisedna.co/omni/instead-of/gingr

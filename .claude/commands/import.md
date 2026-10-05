---
description: "Bring records across from Gingr: owners, animals (with vaccine expiry columns) and reservations."
---

# /import

Read docs/replace-gingr.md. Import in order: owners, animals, reservations. Run each with --dry-run first and show the counts before the real run.

```bash
node scripts/boarding.mjs import gingr --kind=owners --file=<owners.csv> --dry-run
node scripts/boarding.mjs import gingr --kind=animals --file=<animals.csv>
node scripts/boarding.mjs import gingr --kind=reservations --file=<reservations.csv> [--currency=AUD] [--date-order=dmy]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

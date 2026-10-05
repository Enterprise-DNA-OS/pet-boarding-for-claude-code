---
description: "Add or change a site, run, owner, pet or rate."
---

# /add

Show what will be written before writing it. Use update for an existing record.

```bash
node scripts/boarding.mjs add owners --name="..." --phone="..." --vet-name="..." --vet-phone="..."
node scripts/boarding.mjs add pets --owner="<owner>" --name="..." --species=dog --breed="..." --sex=female --colour="..." --birth-date=YYYY-MM-DD
node scripts/boarding.mjs update pets <pet> --medication="..." --daycare-approved=yes
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

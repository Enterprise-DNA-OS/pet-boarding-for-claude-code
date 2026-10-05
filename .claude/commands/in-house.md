---
description: "The run sheet: every animal in house, by site and run, with feeding, medication, behaviour notes and when they were last checked."
---

# /in-house

Group by site. Flag anyone on medication with no dose logged today and anyone not checked in the last 24 hours.

```bash
node scripts/boarding.mjs in-house
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

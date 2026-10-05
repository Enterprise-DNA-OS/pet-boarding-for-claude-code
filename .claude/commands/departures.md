---
description: "Who goes home today (or another day): the bill, any incidents, and any vet treatment the owner still has to be told about."
---

# /departures

For each one with treatment to hand over, say so first: check-out refuses until the owner has been told.

```bash
node scripts/boarding.mjs departures [--on=YYYY-MM-DD]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

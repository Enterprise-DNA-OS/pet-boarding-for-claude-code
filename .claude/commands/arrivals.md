---
description: "Today's boarding arrivals (or another day's) with vaccination status, feeding, medication and behaviour notes."
---

# /arrivals

Put anyone whose vaccination is not current first, with what is missing. They cannot go in the main kennels until it is sorted.

```bash
node scripts/boarding.mjs arrivals [--on=YYYY-MM-DD]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

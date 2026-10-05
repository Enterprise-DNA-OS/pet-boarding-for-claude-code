---
description: "The ten questions the Gingr dashboard does not answer: full nights, vaccination gaps before arrival, lapsed daycare regulars, owners who owe and have booked again, empty runs, best spenders."
---

# /questions

Run all ten, or one by number. Answer in a sentence each, then the table.

```bash
node scripts/boarding.mjs questions [--question=1..10]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

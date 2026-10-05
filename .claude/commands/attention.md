---
description: "Everything that needs a person: record checks, pets not arrived or not collected, overbooked nights, unpaid stays, open incidents, packages running out."
---

# /attention

Record checks first. End with the three things to do today.

```bash
node scripts/boarding.mjs attention
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

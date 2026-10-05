---
description: "The daycare roster for today (or another day): who is coming, vaccination status, behaviour notes."
---

# /daycare

Flag any dog whose vaccination is not current.

```bash
node scripts/boarding.mjs daycare [--on=YYYY-MM-DD]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

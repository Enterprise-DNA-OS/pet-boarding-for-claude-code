---
description: "Check a pet out: settles the nights stayed, shows the bill and the owner balance. Refuses until any vet treatment has been told to the owner."
---

# /check-out

After check-out, offer /draft-report-card for the go-home note.

```bash
node scripts/boarding.mjs check-out <pet-or-code> [--on=YYYY-MM-DD]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

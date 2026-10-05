---
description: "Record a vaccination certificate (C3, C5, KC, F3 ...) with the date given, the due date and where the evidence is."
---

# /vaccinate

The evidence is required: a certificate number, or "phoned <clinic> <date>". Report whether the pet is now current.

```bash
node scripts/boarding.mjs vaccinate --pet=<pet> --vaccine=C5 --given=YYYY-MM-DD --due=YYYY-MM-DD --evidence="..."
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

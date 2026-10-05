---
description: "Move a booking or an animal in house to another run (for example into isolation). Checks the species and that the run has room."
---

# /move

```bash
node scripts/boarding.mjs move <pet-or-code> --run=<run>
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

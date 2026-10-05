---
description: "Cancel a booking, or mark it a no-show."
---

# /cancel

Say back which booking (pet, dates) before cancelling.

```bash
node scripts/boarding.mjs cancel <pet-or-code> [--reason="..."]
node scripts/boarding.mjs cancel <pet-or-code> --no-show
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

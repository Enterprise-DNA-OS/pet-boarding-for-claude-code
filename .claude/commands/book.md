---
description: "Book a pet in: boarding with a collection date, or a daycare day (optionally off their package). Warns on vaccination gaps and full nights."
---

# /book

Confirm the pet, site, dates and run in one line before you run it. Report the booking code, the cost, and every warning. Offer /draft-confirmation afterwards.

```bash
node scripts/boarding.mjs book --pet=<pet> --site=<site> --start=YYYY-MM-DD --end=YYYY-MM-DD [--run=<run>] [--deposit=100]
node scripts/boarding.mjs book --pet=<pet> --site=<site> --start=YYYY-MM-DD --daycare [--package=auto]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

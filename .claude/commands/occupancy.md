---
description: "Nights at 80% or more in the next 90 days, by site and service (dog boarding, cat boarding, daycare). Over-capacity nights first."
---

# /occupancy

Lead with nights over capacity, then full nights, then the busiest week. `--all` shows every night.

```bash
node scripts/boarding.mjs occupancy [--site=] [--days=90] [--all]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

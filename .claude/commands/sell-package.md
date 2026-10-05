---
description: "Sell a daycare package (a number of days for a price, with an expiry)."
---

# /sell-package

```bash
node scripts/boarding.mjs sell-package --owner=<owner> --name="Daycare 10 pack" --days=10 --price=430 [--currency=NZD] [--expires=YYYY-MM-DD]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

---
description: "Booked stays whose vaccination is not current at arrival, or lapses during the stay, in the next 60 days."
---

# /vax-due

Group by how soon they arrive. Offer /draft-reminder for the owners.

```bash
node scripts/boarding.mjs vax-due [--days=60]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

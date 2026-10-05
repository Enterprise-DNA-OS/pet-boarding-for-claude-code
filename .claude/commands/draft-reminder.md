---
description: "Draft vaccination reminders to owners whose pet is booked in without current cover. Drafts only."
---

# /draft-reminder

Show the draft file path and the owners in it. Nothing is sent.

```bash
node scripts/boarding.mjs draft-reminder [owner]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

---
description: "Write the Monday review from what needs attention, the busy nights ahead and last week's takings."
---

# /weekly-review

The CLI runs the three reads and saves a review in drafts/. Read it and give the operator their three priorities for the week.

```bash
node scripts/boarding.mjs weekly-review
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

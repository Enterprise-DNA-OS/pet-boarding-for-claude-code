---
description: "Log care for an animal in house: feed, meds, walk, welfare check, play, or a note, with who did it."
---

# /log

One line per log. If the operator lists several animals, log each.

```bash
node scripts/boarding.mjs log <pet-or-code> --kind=feed|meds|walk|welfare|play|note --note="..." --by=<staff>
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

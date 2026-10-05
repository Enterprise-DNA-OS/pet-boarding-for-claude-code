---
description: "Export every record to one JSON file, for a backup or to move."
---

# /export

The file must not already exist.

```bash
node scripts/boarding.mjs export --out=exports/boarding-YYYY-MM-DD.json
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

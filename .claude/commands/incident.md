---
description: "Record an incident: injury, illness, fight, escape, behaviour. Mark infectious ones and any vet treatment; then tell the owner and resolve it."
---

# /incident

If it is infectious, move the animal to isolation straight away (the command prints the line). Ask whether the owner has been told before running tell-owner.

```bash
node scripts/boarding.mjs incident --pet=<pet> --kind=illness --summary="..." [--infectious] [--treatment="..."]
node scripts/boarding.mjs tell-owner <incident> --how="phoned Sarah 3pm"
node scripts/boarding.mjs resolve <incident> --action="what was done"
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

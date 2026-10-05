---
description: "Check the records against the boarding codes (NZ Code of Welfare, NSW Code No 5, ACT and Victorian codes) and the house rules, each finding with its source."
---

# /compliance

Read docs/compliance.md first. Report as a table: rule, animal, finding, source. Isolation and vaccination findings first. For each, give the command that fixes it. Do not guess at law: if a rule looks out of date, say so and stop.

```bash
node scripts/boarding.mjs compliance
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

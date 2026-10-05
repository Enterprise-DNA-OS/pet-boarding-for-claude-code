---
description: "Check a pet in: record their condition on arrival (and weight), assign the run. Refuses if vaccination is not current unless they go to isolation or the reason is recorded."
---

# /check-in

Ask for the condition on arrival if the operator has not given it. Never invent an override reason: ask.

```bash
node scripts/boarding.mjs check-in <pet-or-code> --condition="bright, eating, no wounds" [--weight=21.5] [--run=<run>]
node scripts/boarding.mjs check-in <pet-or-code> --condition="..." --run=Isolation
node scripts/boarding.mjs check-in <pet-or-code> --condition="..." --override="certificate seen, copy to follow"
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

---
description: "Record a payment from an owner. Shows the balance left."
---

# /pay

This records money already received. It never charges a card.

```bash
node scripts/boarding.mjs pay --owner=<owner> --amount=150 [--currency=AUD] [--method=Card] [--reference=POS-123]
```

Use the configured database. Add `--json` when structured output helps. If a name is ambiguous, list the candidates and ask. Never guess a record and never send a message.

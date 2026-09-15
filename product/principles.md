# GymOS — Product Principles

Decision rules. When a feature request arrives and you're tempted, run it
through these.

---

### 1. The desk is sacred

Anything that makes check-in slower is rejected, regardless of its other merits.
The receptionist performs ~100 interactions a day; the owner performs one. A
feature that adds 300ms to check-in costs the gym more attention per month than
most features return in a year.

*Test: does p95 check-in latency stay under 2 seconds?*

### 2. If it needs training, it needs redesigning

Your user learned the previous system by watching someone else use it. There is
no onboarding course, no documentation they will read, and no IT department.

*Test: can a new receptionist do it on day one without being shown?*

### 3. Every feature must produce a number in Toman

The product is sold on recovered revenue. A feature that can't be connected to
money the owner recognises is a feature you can't sell, can't price, and can't
defend at renewal.

*Test: what sentence does this let you say at the renewal conversation?*

### 4. It must survive the internet being down

Not degrade gracefully — **work**. Iranian connectivity is throttled and
periodically disrupted, and a front desk that stops is a product that gets
returned. This constraint outranks feature richness every time.

*Test: unplug the cable. Does the gym keep operating?*

### 5. Not every member has a smartphone

The member app is an accelerant, never a dependency. Every flow must complete at
the desk, with staff, for a member holding a feature phone or no phone at all.
The moment a member's participation becomes required, you've excluded a
meaningful share of the market.

*Test: does this work for a 58-year-old member with a Nokia?*

### 6. Build it when a customer asks twice

Once is an anecdote. Twice from two unrelated gyms is a signal. This is the only
mechanism that adds to a frozen scope, and it deliberately runs slower than your
enthusiasm.

*Test: who else asked for this, and when?*

### 7. Money is append-only

No mutable balances, no edited history, no deleted transactions. Corrections are
reversing entries. This is not accounting pedantry — it's what lets you answer
"why does this member owe 420,000?" two years later, which is the question that
decides whether they trust the arrears feature at all.

### 8. Be the cheapest thing to leave

Visible one-click export, the old system left installed during migration, no
contractual lock-in. Confidence that leaving is easy is what makes switching
*to* you possible. The moat is payment mandates and hardware integration —
earned, not imposed.

### 9. Never say "AI"

Your buyer doesn't want it; peer-reviewed survey data puts technology trends low
among Iranian fitness operators. Say «خودکار». Build the intelligence, sell the
outcome. The word costs you credibility and buys nothing.

### 10. Ship gym vocabulary, model generic entities

The schema supports a pilates studio. The product says `عضو`, `شهریه`, `تعرفه`,
`بوفه`. Generic modelling costs nothing; generic *marketing* costs you the
market you're actually in.

### 11. Every road leads to 115 gyms

Break-even in the base case. A feature that doesn't move you toward it is a
feature for a company you aren't yet.

*Test: does this help sign gym number 115, or is it for gym number 500?*

---

## When these conflict

Order of precedence:

1. **The desk works** (1, 4)
2. **The money is correct** (7)
3. **It produces revenue you can point at** (3)
4. **Everything else**

A feature that makes the owner happy and the receptionist slower is a feature
that churns the account. Decide accordingly.

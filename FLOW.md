# StealthAP — Full Flow Specification

This is the single source of truth for how StealthAP must behave. Every code
path in the app is a realization of one of the flows below. If code and this
document disagree, the code is wrong.

## Invariants (always true)

- **Wallet address** is the user's Aleo public key. Stays in sessionStorage so it survives navigation but not tab-close.
- **Vendor payment address**, once saved, is persisted to the DB row of that vendor and surfaces on every future invoice for that vendor. Users NEVER re-enter an already-saved address.
- **Private records** are the only balance form that can be spent by `pay_credits_private`. Public balance must be shielded first.
- **The user clicks Pay once.** Every prerequisite tx (join, shield) runs automatically, confirmation is polled, and the pay fires when ready. No second click. No "wait 2 minutes then retry."
- **Every failure has a clear, specific toast** + a console log. Never a silent no-op, never a stuck progress bar.
- **Canceling the panel at any point resets state.** Re-opening shows fresh state from the DB.

## F1 — Authentication

1. User opens app → Supabase auth cookie checked.
2. Logged in → land on /dashboard. Not logged in → /login.
3. On first login ever: ensureProfile upserts a users row + companies row (race-safe).

## F2 — Wallet Connect

1. Top-right "Connect Wallet" → wallet picker (Shield, Leo, Puzzle, Fox, Paste-Key burner).
2. User picks → `walletAPI.connect("testnet", "ON_CHAIN_HISTORY", [credits.aleo, stealthap_inv_v2.aleo, stealthap_pay_v2.aleo])`.
3. Wallet returns address → stored in Zustand (persisted in sessionStorage).
4. Public balance fetched from `credits.aleo::account` mapping → shown in chip.

## F3 — Vendor Management

1. Vendors are per-company rows. Each has: name, payment_address (Aleo), category, contact_email.
2. Create on Payables page BEFORE creating an invoice.
3. Edit any time from vendor detail view (including payment_address).
4. **payment_address may be blank at creation time.** The invoice can still be created. The address gets filled either (a) on the vendor detail page, or (b) inline during the pay flow. Either way it's saved to the vendor row, and every future invoice for that vendor skips the address prompt.

## F4 — Invoice Creation

1. User picks a vendor (or creates one inline).
2. Enters amount / due date / line items OR uploads PDF for AI extraction.
3. Save → `POST /api/invoices` with `{vendor_id, amount_micro, total_amount_micro, …}`.
4. Server auto-creates an `approvals` row for the user.
5. Invoice shows on /approvals as "pending".

## F5 — Approval

1. /approvals lists pending approval rows for the user's company.
2. Click "Authorize" → `POST /api/approvals {id, action: "approve"}`.
3. Server updates approval + invoice status to "approved".
4. Invoice now eligible on /settlements as ready-to-pay.

## F6 — Pay Flow (the core)

This is the flow the user is struggling with. Every decision point is explicit.

### F6.1 — Entry
1. /settlements → click "+ New Payment".
2. Slide panel shows every invoice with `status = "approved"`.
3. Click one → Payment Flow panel opens with that invoice preloaded.

### F6.2 — Vendor Address Resolution (before any on-chain work)
1. App reads `invoice.vendors.payment_address` from the joined DB row.
2. If present and starts with `aleo1` → display it (greyed + editable) + proceed to F6.3.
3. If absent → show input field with placeholder `aleo1…`:
   - User pastes → click "Save & Continue".
   - `PATCH /api/vendors {id, payment_address}` → updates DB row.
   - In-memory invoice object is also patched so current panel session proceeds.
   - Parent invoice list is refreshed so future invoices for this vendor have the address pre-populated.
   - If the user closes the panel now and re-opens for any other invoice of the same vendor → F6.2 step 2 applies, NO re-prompt.

### F6.3 — Confirm Screen
1. Show: vendor name, invoice number, amount in ALEO, payee address, estimated fee.
2. "Back" → F6.2. "Confirm & Pay" → F6.4.

### F6.4 — Pay Logic (the decision tree)

Inputs: `amount` (microcredits needed), `payee` (aleo1…), `invoiceId` (deterministic field).

```
1. Fetch creditsRecords from wallet (Shield via requestRecords, Leo/Puzzle similar).
   Filter: spent=false AND not in tentatively-spent set.

2. Find the SMALLEST record r with r.microcredits >= amount.

3. IF FOUND:
     Sign pay_credits_private(r, payee, invoiceId, amount, amount, now, nonce).
     Mark r.nonce as tentatively-spent BEFORE the tx submits.
     On failure: unmark r.nonce (so a retry can use it).
     On success: update DB `payments` row, mark invoice `paid`.
     Show success.

4. ELSE IF creditsRecords has >=2 records AND sum of top 2 >= amount:
     Sign credits.aleo::join(r_max1, r_max2).
     Mark both nonces tentatively-spent.
     Poll chain for the join tx to be accepted (up to ~3 min).
     On accept: invalidate record cache, recursive call to step 1.
     On timeout: toast "Join pending, please wait a minute and click Pay again."

5. ELSE:
     Fetch public balance from credits.aleo::account mapping.
     IF publicBalance >= amount + 10k buffer:
       Sign credits.aleo::transfer_public_to_private(self, amount + 10k).
       Poll chain for confirmation (up to ~3 min).
       On accept: invalidate record cache, recursive call to step 1.
       On timeout: toast "Shield pending, please wait a minute and click Pay again."
     ELSE:
       Toast: "Need X ALEO. Have Y private + Z public. Top up wallet first."
```

**Critical invariants of F6.4:**
- Step 2 is the ONLY search for a spendable private record. If it returns non-null, we NEVER fall through to shield. The "converting public to private even though I have private balance" symptom means step 2 is incorrectly returning null.
- `markTentativelySpent` must ONLY fire after a tx is successfully submitted (tx id returned). If it fires before and the tx fails (wallet rejection, network error), the record is locked for 5 minutes uselessly.
- Between retries, `findRecordForAmount` must correctly skip tentatively-spent records (so we don't pick the same record twice) AND must correctly INCLUDE records not in the set (so we don't starve).
- The recursive call in steps 4/5 must fetch FRESH records (cache invalidated) because the chain state has changed.

## F7 — Post-Pay

1. DB row in `payments` created via POST /api/payments with `{invoice_ids, total_micro, tx_hash}`.
2. Invoice status flipped to "paid" + `aleo_tx_id` set.
3. /settlements refetches → invoice gone from the approved list, appears in payment history.
4. Vendor's `total_paid_micro` + `invoice_count` incremented (trigger or explicit).

## F8 — Cancellation / Resume

- User closes panel mid-flow (review, confirm, processing, success): state resets. No stuck UI.
- User closes app with a submitted tx still pending: on next open, the tx is either accepted or still pending on-chain. The polling state is lost, but the tx is not — user can see it on the block explorer via the stored `aleo_tx_id`.
- User refreshes page: sessionStorage keeps wallet connection, DB is source of truth for everything else. All panels re-open to fresh state.

## F9 — Error Boundaries

Every API error returns a sanitized message to the client and logs the raw error server-side with a trace id. No Postgres/RLS error strings reach the browser.

Every wallet error surfaces as a toast with the wallet's message verbatim — those are usually user-facing anyway.

Every chain polling timeout shows an actionable toast ("pending, try again in a minute") rather than failing silently.

## What goes wrong today (symptoms the user reports)

1. **"It shields even when I have private balance"** → Pay logic step 2 returns null when it shouldn't. Root cause: record parser.
2. **"Vendor address asked every time"** → F6.2 step 2 doesn't see the saved address because either the PATCH failed silently, the GET join didn't pick it up, or the parent didn't refetch.
3. **"After shielding, pay doesn't happen"** → F6.4 step 5 auto-resume polling failed — either timeout, or the re-invocation didn't find the new record.
4. **"Wait 2 min then click again"** → Indicates the auto-resume path is being bypassed or the recursion isn't finding the new record post-confirmation.

Every one of these maps to a specific failure in the tree above. Bugs get fixed at the step that failed — not with a symptom-level patch.

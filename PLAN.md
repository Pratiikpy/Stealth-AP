# Tier 1 + Tier 2 Execution Plan

**Goal**: Deepen privacy primitives + product polish using contracts we've already deployed.
**Not goals**: Copying NullPay/Veil/Fairdrop features that don't fit B2B AP.

Order chosen for: low-risk fast wins first (repo impression), then visible primitives, then larger features.

## Status legend
- [ ] not started
- [~] in progress
- [x] done + pushed

---

## Batch A — Repo hygiene + quick wins (fast, low risk)

- [ ] **#10** — Delete v1 contract folders (`stealthap_payment`, `_invoice`, `_workflow`, `_batch`, `_audit`). Add `contracts/README.md` listing v2 deployed addresses + transition counts.
- [ ] **#9** — Per-invoice transaction history: add a detail view showing the three on-chain hashes (create / approve / pay) with explorer links.
- [ ] **#6** — Duplicate invoice check: before `/api/invoices` POST accepts a new invoice, call `check_duplicate(pdfContentHash)` on-chain or against the DB.
- [ ] **#11** — Test `aud_v2::generate_audit_proof` end-to-end. If broken, fix.

## Batch B — Privacy signals in the UI (high visibility)

- [ ] **#1** — Blind approval: on `/approvals`, hide vendor name by default. Show only invoice_id, amount, category, GL code. Admin-only "reveal" toggle.
- [ ] **#7** — Privacy tab: kill mock data. Show real on-chain commitments, pseudonyms, audit proofs, view-key status.

## Batch C — Enterprise configuration (threshold + budget)

- [ ] **#3** — Spending limits UI: in `/settings`, per-category limit panel calling `wf_v2::set_spending_limit`. Payment flow calls `record_spend` before settle.
- [ ] **#4** — Threshold routing UI: in `/settings`, amount-based auto-approve rules calling `wf_v2::set_threshold`. Invoice creation calls `submit_for_approval` for routing.

## Batch D — Deep privacy primitives

- [ ] **#2** — Vendor allowlist with Merkle proof: admin page builds Merkle tree of approved vendors, calls `set_vendor_allowlist`; invoice creation calls `verify_vendor_allowlist` with ZK proof.
- [ ] **#5** — Per-invoice pseudonyms: call `generate_pseudonym` on invoice create, show rotating pseudonym on invoice detail.

## Batch E — Batch settlement

- [ ] **#8** — Multi-select + batch flow: on `/settlements`, multi-select checkboxes, "Settle Batch" button running `open_epoch → commit_payment × N → close_epoch`.

---

## Notes

- Each batch = 1 git commit + push.
- All changes must typecheck clean before push.
- FLOW.md stays source of truth — update if intended flow changes.

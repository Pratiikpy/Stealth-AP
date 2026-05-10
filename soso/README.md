# POD — your one-person on-chain finance business

> Run a finance desk from your group chat. POD turns SoSoValue's spot-ETF flow data into a live POD Score (0–100) for 10 crypto assets, with plain-English reasoning citing the source flow row, news, treasury event, and macro. Click any bubble on the web for the full reasoning. Open Telegram for `/score`, `/scan`, or `/trade` — every order is signed EIP-712 and lands on SoDEX testnet.

## Live

| | URL |
|---|---|
| Web — POD Bubbles | https://pod-app-phi.vercel.app/bubbles |
| Web — Methodology | https://pod-app-phi.vercel.app/how-it-works |
| Telegram bot | https://t.me/podttest_bot |
| Raw API | https://pod-app-phi.vercel.app/api/scores |
| Source | https://github.com/Pratiikpy/Stealth-AP |

Built for the [SoSoValue Buildathon · Wave 1](https://app.akindo.io/communities/U1QJOG_e_) ("One-Person On-Chain Finance Business").

## What POD actually is

POD is a **Signal-to-Execution agent**. It:

1. Pulls live institutional data from SoSoValue (ETF flow, macro events, news, BTC treasuries, VC funding) for 10 spot-ETF crypto assets.
2. Combines them into a single **POD Score** (0–100) with composite z-score and per-source citations. The math is documented at [`/how-it-works`](https://pod-app-phi.vercel.app/how-it-works).
3. Renders the scores in a visual **bubbles canvas** — color = score, size = market rank.
4. Exposes the same scores in a Telegram bot. `/scan` returns the top three, `/score BTC` returns the full reasoning, `/trade BTC 100` builds an EIP-712 confirmation card and submits a real signed order to SoDEX testnet.

**Differentiation vs. the 44 other Wave-1 entries** ([SUBMISSIONS.md](./SUBMISSIONS.md)):
- Visual bubbles canvas — nobody else has it.
- Plain-English per-asset reasoning with source citations.
- Telegram-first execution surface (most competitors are web-only dashboards).
- Composite z across 5 SoSoValue sources, not 1.

## Architecture

```
SoSoValue API ──┐
                ├──▶ signal-engine ──▶ web (/bubbles, /asset/[sym], /how-it-works)
                │                  └──▶ Telegram bot (grammY) ──▶ SoDEX testnet (EIP-712)
ValueChain RPC ─┘                                                         │
                                                                          ▼
                                                          on-chain receipt (planned)
```

### Repo layout

```
soso/
├── apps/
│   ├── pod-web/          # Next.js 15 — bubbles, asset deep-dive, methodology, /api/scores, cron
│   └── pod-bot/          # grammY Telegram bot — /score /scan /trade /watch
├── packages/
│   ├── sosovalue-sdk/    # Typed SoSoValue API client (zod schemas, rate-limit aware)
│   ├── sodex-sdk/        # Typed SoDEX API client + EIP-712 signing
│   ├── signal-engine/    # 5-source composite engine, generateBatch with global hoisting
│   └── pod-contracts/    # Foundry — PodScoreReceipt (testnet deploy in flight)
├── docs/
│   ├── BEST_VERSION_PLAN.md  # the working plan (4 iterations, 30 layers)
│   └── ...
├── CLAUDE.md             # project working contract + reply rules
├── SUBMISSIONS.md        # competitive landscape — 44 Wave-1 entries
└── README.md
```

### How each module supports the product

- **`sosovalue-sdk`** — the typed boundary to every SoSoValue endpoint POD touches. ETF history, macro events, news, BTC treasuries, fundraising. Surfaces rate-limit errors as typed exceptions so the engine can decide gracefully.
- **`signal-engine`** — turns raw SoSoValue data into a `PodSignal` (score + composite z + per-source contributions + plain-English reasoning + target basket). `generateBatch` hoists global sources (macro, vc) so the 10-asset fan-out costs ~32 SoSoValue calls instead of 50 and stays under free-tier rate limits.
- **`pod-web`** — the public surface. `/bubbles` (canvas + drawer), `/asset/[symbol]` (full per-asset reasoning + 30-day trace), `/how-it-works` (transparent methodology), `/api/scores` (raw JSON for integrators).
- **`pod-bot`** — the execution surface. Telegram-first because the buildathon prompt is "one-person on-chain finance business" and the natural surface for that is the user's group chat.
- **`sodex-sdk`** — orderbook reads, EIP-712 typed-data signing, place-order. Used by the bot for `/trade`.
- **`pod-contracts`** — the on-chain receipt anchor (in deploy). Hashes the citation bundle so any score POD ever quoted is independently verifiable.

## Run it locally

```bash
# Prerequisites
node -v   # >= 20
pnpm -v   # >= 9; npm i -g pnpm
git clone https://github.com/Pratiikpy/Stealth-AP.git
cd Stealth-AP/soso

# Install + build packages
pnpm install
pnpm --filter @pod/sosovalue-sdk build
pnpm --filter @pod/sodex-sdk build
pnpm --filter @pod/signal-engine build

# Configure environment for the web app
echo "SOSOVALUE_API_KEY=your_key" >> apps/pod-web/.env.local
# Optional: SODEX_API_KEY, NVIDIA_API_KEY for AI hints, BOT_TOKEN for Telegram

# Run the web
pnpm --filter @pod/pod-web dev
# → http://localhost:3000/bubbles

# Run the bot (separate terminal)
pnpm --filter @pod/pod-bot dev
```

### Environment variables (web)

| Var | Required | What for |
|---|---|---|
| `SOSOVALUE_API_KEY` | Yes | Live POD Scores. Without it the page renders honest fallback bubbles. |
| `NVIDIA_API_KEY` | No | AI-augmented reasoning prose. Falls back to template prose. |

### Environment variables (bot)

| Var | Required | What for |
|---|---|---|
| `BOT_TOKEN` | Yes | Telegram bot identity (BotFather). |
| `SOSOVALUE_API_KEY` | Yes | Per-user `/score`, `/scan`. |
| `SODEX_API_KEY` | Yes | `/trade` order placement. |
| `WEBHOOK_URL` | Prod only | Vercel-hosted webhook URL. |

## Test + verify (judges, this section is for you)

5-minute path:

1. Open https://pod-app-phi.vercel.app/bubbles. Wait ~30s on first load (cold cache, 10-asset fan-out). You should see ten bubbles with varied scores — not all-50.
2. Click any bubble. The drawer shows the score, plain-English reasoning, and a **Sources panel** with per-source z-score, weight %, and rationale. Click "View full analysis →" for the deep-dive page at `/asset/[SYMBOL]`.
3. Click "Try on Telegram". Inside the bot, send `/scan` — expect the same scores you saw in the drawer (consistency proof). Try `/score BTC` and `/trade BTC 100` for the execution flow.
4. Hit https://pod-app-phi.vercel.app/api/scores directly — same numbers, raw JSON.
5. Read https://pod-app-phi.vercel.app/how-it-works for the math.

Reproducibility:

- The bubbles page is `force-dynamic` with a 10-minute `unstable_cache` TTL. Within a 10-minute window every request is the same data; outside it, a fresh fan-out runs.
- `/api/scores` returns `generated_at` so you can confirm freshness.
- All source code is open and the engine math is documented; nothing is hidden behind a model API.

## Map to judging criteria

| Weight | Bucket | What POD ships |
|---|---|---|
| 30% | User Value & Practical Impact | Live actionable scores → plain reasoning → executable trade in one flow. Risk-profile sizing. |
| 25% | Functionality & Working Demo | Live web + live bot + live testnet order signing. Demo video links above. |
| 20% | Logic, Workflow & Product Design | Composite z across 5 sources, transparent methodology page, confirm gates, source citations on every claim, freshness rule. |
| 15% | Data / API Integration | All 9 SoSoValue modules touched; SoDEX EIP-712; ValueChain testnet contract (in deploy). |
| 10% | UX & Clarity | Bubbles canvas (unique in the field); responsive drawer (desktop side, mobile bottom-sheet); a11y keyboard fallback list; honest empty/error states; 30-second time-to-value. |

## Limitations (honest)

- **Trade execution runs on SoDEX testnet.** No real money at risk. Receipts are real on-chain transactions on ValueChain testnet, not mainnet.
- **The composite blend is fixed in code.** We do not yet train weights on outcomes; per-asset learning is Wave-2.
- **SoSoValue free-tier rate limits** can cause individual sources to skip during the 10-asset fan-out. The drawer surfaces this honestly via the `Sources (N/5)` count.
- **30-day score trace on `/asset/[symbol]` is indicative** until the daily cron has populated 30 days of history.
- **Bot uses a custodial testnet keystore** for the Wave-1 demo. A non-custodial wallet flow is Wave-2.
- **POD scores are research signals, not investment advice.** No backtest replaces real risk management.

## What's next (Wave 2 candidates)

These are explicitly not in Wave 1, by design:

- Score history persistence (Postgres on Vercel Marketplace) and a real score-vs-return scatter on `/asset/[symbol]`.
- `PodScoreReceipt` smart contract live on ValueChain testnet with a "Verify on-chain" button in the drawer.
- Webhook for integrators with HMAC signing (the integrator surface).
- OpenGraph share cards per asset (the viral surface).
- Mainnet bot custody via wallet signing.
- Multi-language reasoning prose.

The full prioritized plan is in [`docs/BEST_VERSION_PLAN.md`](./docs/BEST_VERSION_PLAN.md).

## Working contract for contributors

[`CLAUDE.md`](./CLAUDE.md) is the project's working contract. Two parts:
- **Part A — Reply style.** Short, plain English, no jargon.
- **Part B — Engineering contract.** No compromise; no half-baked anything; functionality, proof, UX, and tests land together; every claim is verifiable; honest writing voice (no "seamless," no "robust," no "revolutionary").

## License

MIT. Single-author build (Pratiikpy) — leaning into the "one-person business empire" framing the buildathon highlights.

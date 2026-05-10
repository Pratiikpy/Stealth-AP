import { SoSoValue, type EtfSymbol } from '@pod/sosovalue-sdk';
import {
  SignalEngine,
  type SignalContribution,
  type SignalDirection,
  type SignalRequest,
} from '@pod/signal-engine';

export interface BubbleData {
  asset: EtfSymbol;
  name: string;
  /** POD Score 0–100. */
  score: number;
  direction: SignalDirection;
  /** Composite z-score from the signal engine — drives pulse intensity. */
  z: number;
  /** Plain-language reasoning, 1 sentence. */
  reasoning: string;
  /** Top citation (e.g. "BTC ETF flow mild outflow: -$137.8M on 2026-04-29"). */
  citation: string;
  /** Per-source breakdown — drives the drawer "Why this score" panel. */
  contributions: SignalContribution[];
  /** Approximate ETF AUM rank — drives bubble size. */
  rank: number;
  uncertain: boolean;
  generatedAt: string;
}

const TRACKED: Array<{ asset: EtfSymbol; name: string; rank: number }> = [
  { asset: 'BTC', name: 'Bitcoin', rank: 1 },
  { asset: 'ETH', name: 'Ethereum', rank: 2 },
  { asset: 'SOL', name: 'Solana', rank: 3 },
  { asset: 'XRP', name: 'XRP', rank: 4 },
  { asset: 'DOGE', name: 'Dogecoin', rank: 5 },
  { asset: 'AVAX', name: 'Avalanche', rank: 6 },
  { asset: 'LINK', name: 'Chainlink', rank: 7 },
  { asset: 'LTC', name: 'Litecoin', rank: 8 },
  { asset: 'DOT', name: 'Polkadot', rank: 9 },
  { asset: 'HBAR', name: 'Hedera', rank: 10 },
];

const ALL_SOURCES = [
  'ETF_FLOW',
  'MACRO_EVENT',
  'NEWS_SENTIMENT',
  'BTC_TREASURY',
  'VC_FUNDING',
] as const;

function citationFromReasoning(text: string): string {
  const m = text.match(/[A-Z]{2,5} ETF flow[^.]+\./);
  if (m) return m[0];
  return text.split('.')[0] + '.';
}

function fallbackBubble(t: { asset: EtfSymbol; name: string; rank: number }, reason: string): BubbleData {
  return {
    asset: t.asset,
    name: t.name,
    score: 50,
    direction: 'HOLD' as SignalDirection,
    z: 0,
    reasoning: reason,
    citation: 'No live data',
    contributions: [],
    rank: t.rank,
    uncertain: true,
    generatedAt: new Date().toISOString(),
  };
}

export async function fetchAllBubbleData(): Promise<BubbleData[]> {
  const apiKey = process.env['SOSOVALUE_API_KEY'];
  if (!apiKey) {
    return TRACKED.map((t) => fallbackBubble(t, 'Set SOSOVALUE_API_KEY to see live signals.'));
  }

  const sso = new SoSoValue({ apiKey });
  const engine = new SignalEngine(sso);

  const requests: SignalRequest[] = TRACKED.map((t) => ({
    asset: t.asset,
    riskProfile: 'BALANCED',
    sources: ALL_SOURCES,
  }));

  let signals;
  try {
    signals = await engine.generateBatch(requests, { perAssetGapMs: 120 });
  } catch (err) {
    console.error('[bubble-data] generateBatch failed:', err);
    return TRACKED.map((t) => fallbackBubble(t, 'Signal temporarily unavailable.'));
  }

  return TRACKED.map((t, i) => {
    const signal = signals[i];
    if (!signal) {
      return fallbackBubble(t, 'Signal temporarily unavailable.');
    }
    return {
      asset: t.asset,
      name: t.name,
      score: signal.podScore,
      direction: signal.direction,
      z: signal.compositeZ,
      reasoning: signal.reasoning,
      citation: citationFromReasoning(signal.reasoning),
      contributions: signal.contributions,
      rank: t.rank,
      uncertain: signal.uncertain,
      generatedAt: signal.generated_at,
    };
  });
}

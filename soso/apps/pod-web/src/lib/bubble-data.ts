import { SoSoValue, type EtfSymbol } from '@pod/sosovalue-sdk';
import { SignalEngine, type SignalDirection } from '@pod/signal-engine';

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

function citationFromReasoning(text: string): string {
  // Extract the "X ETF flow ..." sentence if present.
  const m = text.match(/[A-Z]{2,5} ETF flow[^.]+\./);
  if (m) return m[0];
  return text.split('.')[0] + '.';
}

export async function fetchAllBubbleData(): Promise<BubbleData[]> {
  const apiKey = process.env['SOSOVALUE_API_KEY'];
  if (!apiKey) {
    return TRACKED.map((t) => ({
      asset: t.asset,
      name: t.name,
      score: 50,
      direction: 'HOLD' as SignalDirection,
      z: 0,
      reasoning: 'Set SOSOVALUE_API_KEY to see live signals.',
      citation: 'No live data',
      rank: t.rank,
      uncertain: true,
      generatedAt: new Date().toISOString(),
    }));
  }

  const sso = new SoSoValue({ apiKey });
  const engine = new SignalEngine(sso);

  // Serialize: SoSoValue rate-limits a 10-way parallel fan-out and every
  // contribution comes back null, collapsing every bubble to score=50.
  const out: BubbleData[] = [];
  for (const t of TRACKED) {
    try {
      const signal = await engine.generate({
        asset: t.asset,
        riskProfile: 'BALANCED',
        sources: ['ETF_FLOW'],
      });
      out.push({
        asset: t.asset,
        name: t.name,
        score: signal.podScore,
        direction: signal.direction,
        z: signal.compositeZ,
        reasoning: signal.reasoning,
        citation: citationFromReasoning(signal.reasoning),
        rank: t.rank,
        uncertain: signal.uncertain,
        generatedAt: signal.generated_at,
      });
    } catch (err) {
      console.error('[bubble-data]', t.asset, err);
      out.push({
        asset: t.asset,
        name: t.name,
        score: 50,
        direction: 'HOLD' as SignalDirection,
        z: 0,
        reasoning: 'Signal temporarily unavailable.',
        citation: 'No live data',
        rank: t.rank,
        uncertain: true,
        generatedAt: new Date().toISOString(),
      });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  return out;
}

import { createHash, randomBytes } from 'node:crypto';

export const ROUND_CONFIG = Object.freeze({
  bettingWindowMs: 7_000,
  crashPauseMs: 3_500,
  multiplierGrowthMs: 13_000,
  houseEdge: 0.03,
  maxCrashMultiplier: 1_000,
});

export function createRoundSchedule(startAt, seed = randomBytes(32).toString('hex')) {
  const startsAt = Number(startAt);
  if (!Number.isFinite(startsAt)) throw new TypeError('startAt must be a finite timestamp');
  const seedBytes = Buffer.from(seed, 'hex');
  if (seedBytes.length !== 32) throw new TypeError('seed must be 32 bytes encoded as hex');

  const value = Number(BigInt(`0x${seed}`)) / Number(1n << 256n);
  const crashMultiplier = Math.min(
    ROUND_CONFIG.maxCrashMultiplier,
    Math.max(1.01, Math.floor(((1 - ROUND_CONFIG.houseEdge) / (1 - value)) * 100) / 100),
  );
  const bettingClosesAt = startsAt + ROUND_CONFIG.bettingWindowMs;
  const crashAt = bettingClosesAt + Math.ceil(ROUND_CONFIG.multiplierGrowthMs * Math.log(crashMultiplier));
  const endsAt = crashAt + ROUND_CONFIG.crashPauseMs;
  const commitment = createHash('sha256').update(seedBytes).digest('hex');
  return { startsAt, bettingClosesAt, crashAt, endsAt, crashMultiplier, seed, commitment };
}

const timestamp = value => value instanceof Date ? value.getTime() : Number(value);

export function roundPhase(round, now = Date.now()) {
  if (now < timestamp(round.startsAt)) return 'scheduled';
  if (now < timestamp(round.bettingClosesAt)) return 'waiting';
  if (now < timestamp(round.crashAt)) return 'flying';
  if (now < timestamp(round.endsAt)) return 'crashed';
  return 'finished';
}

export function currentMultiplier(round, now = Date.now()) {
  if (roundPhase(round, now) !== 'flying') return 1;
  const elapsed = now - timestamp(round.bettingClosesAt);
  return Math.floor(Math.exp(elapsed / ROUND_CONFIG.multiplierGrowthMs) * 100) / 100;
}

// Reveal the crash point only after the flight has crashed, and its seed only
// after the round is fully closed. Never send the private seed while betting.
export function publicRound(round, now = Date.now()) {
  const phase = roundPhase(round, now);
  const crashed = phase === 'crashed' || phase === 'finished';
  const ended = phase === 'finished';
  const crashMultiplier = Number(round.crashMultiplier);
  return {
    id: String(round.id),
    phase,
    startsAt: timestamp(round.startsAt),
    bettingClosesAt: timestamp(round.bettingClosesAt),
    commitment: round.commitment,
    multiplier: phase === 'flying' ? currentMultiplier(round, now) : crashed ? crashMultiplier : 1,
    ...(crashed ? {
      crashAt: timestamp(round.crashAt),
      endsAt: timestamp(round.endsAt),
      crashMultiplier,
    } : {}),
    ...(ended ? { seed: round.seed } : {}),
  };
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRoundSchedule, currentMultiplier, publicRound, roundPhase } from '../src/rounds.js';

const seed = '0000000000000000000000000000000000000000000000000000000000000001';

test('round schedule is reproducible and publishes a seed commitment', () => {
  const a = createRoundSchedule(1_800_000_000_000, seed);
  const b = createRoundSchedule(1_800_000_000_000, seed);
  assert.deepEqual(a, b);
  assert.equal(a.commitment, createHash('sha256').update(Buffer.from(seed, 'hex')).digest('hex'));
  assert.ok(a.startsAt < a.bettingClosesAt && a.bettingClosesAt < a.crashAt && a.crashAt < a.endsAt);
  assert.ok(a.crashMultiplier >= 1.01 && a.crashMultiplier <= 1_000);
});

test('round phase boundaries use the same timestamps for every client', () => {
  const round = createRoundSchedule(1_000_000, seed);
  assert.equal(roundPhase(round, round.startsAt), 'waiting');
  assert.equal(roundPhase(round, round.bettingClosesAt - 1), 'waiting');
  assert.equal(roundPhase(round, round.bettingClosesAt), 'flying');
  assert.equal(roundPhase(round, round.crashAt), 'crashed');
  assert.equal(roundPhase(round, round.endsAt), 'finished');
});

test('multiplier follows the shared server-time curve and stops at the crash', () => {
  const highSeed = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
  const round = createRoundSchedule(1_000_000, highSeed);
  assert.equal(currentMultiplier(round, round.bettingClosesAt), 1);
  assert.ok(currentMultiplier(round, round.bettingClosesAt + 13_000) >= 2);
  assert.equal(currentMultiplier(round, round.crashAt), 1, 'the live multiplier is only shown during flight');
});

test('API shape withholds crash point during betting and seed until round closure', () => {
  const round = { id: 42, ...createRoundSchedule(1_000_000, seed) };
  const waiting = publicRound(round, round.startsAt + 1);
  assert.equal(waiting.phase, 'waiting');
  assert.equal('crashMultiplier' in waiting, false);
  assert.equal('crashAt' in waiting, false, 'crash timing must not reveal the outcome early');
  assert.equal('endsAt' in waiting, false, 'round end timestamp also leaks the crash point');
  assert.equal('seed' in waiting, false);
  const flying = publicRound(round, round.bettingClosesAt + 1);
  assert.equal(flying.phase, 'flying');
  assert.equal('crashMultiplier' in flying, false);
  assert.equal('crashAt' in flying, false);
  assert.equal('endsAt' in flying, false);
  assert.equal('seed' in flying, false);
  const crashed = publicRound(round, round.crashAt);
  assert.equal(crashed.phase, 'crashed');
  assert.equal(crashed.crashMultiplier, round.crashMultiplier);
  assert.equal('seed' in crashed, false);
  const finished = publicRound(round, round.endsAt);
  assert.equal(finished.phase, 'finished');
  assert.equal(finished.seed, seed);
});

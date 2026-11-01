import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const documents = new Map();
let current = { uid: 'player-a' }, listener;
const auth = { get currentUser() { return current; } };
const context = vm.createContext({
  auth, db: {}, Date, Promise, Number, Array, Error,
  doc: (_, collection, uid) => `${collection}/${uid}`,
  onAuthStateChanged: (_, callback) => { listener = callback; queueMicrotask(() => callback(current)); return () => {}; },
  runTransaction: async (_, work) => work({ get: async ref => ({ exists: () => documents.has(ref) }), set: (ref, data) => documents.set(ref, data) }),
  getDocFromServer: async ref => ({ data: () => documents.get(ref) }),
  setDoc: async (ref, data) => documents.set(ref, data)
});
const source = fs.readFileSync(new URL('../src/player.js', import.meta.url), 'utf8').replace(/^import [^;]+;$/gm, '').replace(/export /g, '');
vm.runInContext(`${source}\nglobalThis.player = { loadGameAccount, saveGameAccount, normalizeBets, watchGameAccount };`, context);
const { player } = context;
let a = await player.loadGameAccount();
assert.equal(a.user.uid, 'player-a'); assert.equal(a.balance, 10000);
await player.saveGameAccount(current, { balance: 9900, bets: [{ stake: 100, multiplier: 2, payout: 200, status: 'won', mode: 'Classic' }] });
a = await player.loadGameAccount(); assert.equal(a.balance, 9900); assert.equal(a.bets.length, 1);
current = { uid: 'player-b' }; const b = await player.loadGameAccount(); assert.equal(b.balance, 10000, 'players get isolated demo balances');
await assert.rejects(player.saveGameAccount({ uid: 'player-a' }, { balance: 1, bets: [] }), /session changed/);
assert.equal(documents.get('demoPlayers/player-a').balance, 9900);
assert.equal(player.normalizeBets([null, { mode: '<img>', stake: 1, multiplier: 2, payout: 2, status: 'won' }, { stake: 'invalid' }]).length, 1);
let changed = 0; player.watchGameAccount(current, () => changed++); await new Promise(resolve => setTimeout(resolve, 0)); current = null; listener(null); assert.equal(changed, 1, 'session changes are detected');
assert.equal((await player.loadGameAccount()).user, null, 'signed-out players are guests');
console.log('Player tests passed: account creation, persistence, isolation and session changes.');

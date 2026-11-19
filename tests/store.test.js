import test from 'node:test';
import assert from 'node:assert/strict';
let stored = new Map(), failSave = false;
globalThis.localStorage = { getItem: key => stored.get(key) || null, setItem: (key, value) => { if (failSave) throw Error('full'); stored.set(key, value); } };
const S = await import('../js/store.js');
const { state } = S;
function reset() { stored.clear(); failSave = false; Object.assign(state, { v: 2, draft: { names: [], buyIn: 100000 }, session: null, history: [] }); }
test('full night: rounds, bust, exact rebuy, partial withdrawal, reload, finish', async () => {
  reset(); S.startSession(['علی', 'رضا', 'سارا'], 100000);
  const [a, b, c] = state.session.players;
  S.addRound([{ id: a.id, win: true }, { id: b.id, amount: 100000 }, { id: c.id, amount: 50000 }]);
  assert.equal(a.stack, 250000); assert.equal(b.stack, 0);
  assert.equal(state.session.dealerId, b.id);
  assert.throws(() => S.rebuy(a.id));
  S.rebuy(b.id); assert.equal(b.stack, 100000);
  assert.deepEqual(b.buyIns, [100000, 100000]);
  assert.throws(() => S.withdraw(a.id, 150001));
  S.withdraw(a.id, 60000); S.withdraw(a.id, 90000);
  assert.equal(a.stack, 100000);
  assert.throws(() => S.withdraw(a.id, 1));
  S.addRound([{ id: a.id, amount: 10000 }, { id: b.id, win: true }, { id: c.id, win: true }]);
  const summary = S.summary(state.session);
  assert.deepEqual(summary.rows.map(p => p.net), [140000, -95000, -45000]);
  const reload = await import('../js/store.js?reload');
  assert.deepEqual(reload.state.session, state.session);
  assert.equal(state.session.movements.length, 3);
  S.finishSession();
  assert.equal(state.session, null); assert.equal(state.history.length, 1);
  assert.equal(state.history[0].rounds.length, 2);
  assert.equal(S.summary(state.history[0]).transfers.length, 2);
});
test('failed storage rolls back accounting and does not show a successful round', () => {
  reset(); S.startSession(['a', 'b'], 100000);
  const before = structuredClone(state), [a, b] = state.session.players;
  failSave = true;
  assert.throws(() => S.addRound([{ id: a.id, win: true }, { id: b.id, amount: 2000 }]));
  assert.deepEqual(state, before);
  failSave = false;
});
test('active game, duplicate names and invalid entries are guarded', () => {
  reset(); assert.throws(() => S.startSession(['a', 'a'], 100000));
  assert.throws(() => S.startSession(['a', 'b'], 0));
  S.startSession(['a', 'b'], 100000);
  assert.throws(() => S.startSession(['c', 'd'], 100000));
});
test('old rounds migrate without deleting the original records', async () => {
  reset(); const old = { defaults: { buyIn: 100000 }, session: { id: 'old', mode: 'rounds', players: [{ id: 'a', name: 'a', buyIns: [0] }, { id: 'b', name: 'b', buyIns: [0] }], rounds: [{ nets: { a: 1000, b: -1000 } }] } };
  stored.set('poker-night:v1', JSON.stringify(old));
  const migrated = await import('../js/store.js?migration');
  assert.deepEqual(migrated.summary(migrated.state.session).rows.map(p => p.net), [1000, -1000]);
  assert.equal(stored.get('poker-night:v1'), JSON.stringify(old));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, resolveRound, settle, netOf, withdrawalLimit, tablePositions } from '../js/logic.js';
const players = () => ['a', 'b', 'c'].map(id => ({ id, name: id, stack: 100000, buyIns: [100000], withdrawals: [] }));
test('Persian/Arabic whole tomans; invalid and unsafe input rejected', () => {
  assert.equal(parseAmount('۱٬۵۰۰,۰۰۰'), 1500000);
  assert.equal(parseAmount('٢٥'), 25);
  for (const value of ['', '-10', '1.5', 'abc12', '9007199254740992']) assert.ok(Number.isNaN(parseAmount(value)));
});
test('one winner receives all losses; no blind is deducted twice', () => {
  const r = resolveRound(players(), [{ id: 'a', win: true }, { id: 'b', amount: 1000 }, { id: 'c', amount: 2000 }], 'a');
  assert.deepEqual(r.nets, { a: 3000, b: -1000, c: -2000 });
});
test('ties share whole tomans; remainder starts after dealer', () => {
  const r = resolveRound(players(), [{ id: 'a', win: true }, { id: 'b', win: true }, { id: 'c', amount: 1001 }], 'a');
  assert.deepEqual(r.nets, { a: 500, b: 501, c: -1001 });
  assert.equal(Object.values(r.nets).reduce((a, b) => a + b), 0);
});
test('no winner, duplicate/unknown rows, negative and over-stack losses rejected', () => {
  const good = [{ id: 'a', win: true }, { id: 'b', amount: 1000 }, { id: 'c', amount: 0 }];
  assert.throws(() => resolveRound(players(), good.map(r => ({ ...r, win: false })), 'a'));
  for (const amount of [-1, 100001, NaN, 1.2, Infinity]) assert.throws(() => resolveRound(players(), good.map(r => r.id === 'b' ? { ...r, amount } : r), 'a'));
  assert.throws(() => resolveRound(players(), [good[0], good[0], good[2]], 'a'));
  assert.throws(() => resolveRound(players(), good.map(r => r.id === 'b' ? { ...r, id: 'x' } : r), 'a'));
  const p = players(); p[0].stack = 0;
  assert.throws(() => resolveRound(p, good, 'a'));
});
test('a completely tied hand can have no transfer', () => {
  const r = resolveRound(players(), players().map(p => ({ id: p.id, win: true })), 'a');
  assert.deepEqual(r.nets, { a: 0, b: 0, c: 0 });
});
test('three-player and heads-up positions, skipping zero stacks', () => {
  const s = { players: players(), dealerId: 'a' };
  let t = tablePositions(s);
  assert.deepEqual([t.dealer.id, t.small.id, t.big.id], ['a', 'b', 'c']);
  s.players[0].stack = 0;
  t = tablePositions(s);
  assert.deepEqual([t.dealer.id, t.small.id, t.big.id], ['b', 'b', 'c']);
  s.players[1].stack = 0;
  assert.equal(tablePositions(s), null);
});
test('withdrawals preserve profit, rebuys are not profit', () => {
  const p = { stack: 160000, buyIns: [100000], withdrawals: [] };
  assert.equal(withdrawalLimit({ buyIn: 100000 }, p), 60000);
  p.stack -= 60000; p.withdrawals.push(60000);
  assert.equal(netOf(p), 60000);
  assert.equal(withdrawalLimit({ buyIn: 100000 }, p), 0);
  p.stack = 0; p.buyIns.push(100000); p.stack = 100000;
  assert.equal(netOf(p), -40000);
});
test('settlement conserves every balance over many combinations', () => {
  for (let i = 1; i <= 300; i++) {
    const amounts = [i * 123, -i * 45, i % 3 * 99];
    amounts.push(-amounts.reduce((a, b) => a + b, 0));
    const balances = amounts.map((amount, id) => ({ id, amount }));
    const transfers = settle(balances), net = [0, 0, 0, 0];
    for (const t of transfers) { assert.ok(t.amount > 0); net[t.from] -= t.amount; net[t.to] += t.amount; }
    assert.deepEqual(net, amounts);
  }
  assert.throws(() => settle([{ id: 'a', amount: 2 }]));
});

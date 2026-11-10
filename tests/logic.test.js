import test from 'node:test';
import assert from 'node:assert/strict';
import { settle, computePots, startHand, applyAction, resolveHand, turnInfo, parseAmount, resolveRound } from '../js/logic.js';

const sumStacks = (h) => h.seats.reduce((a, s) => a + s.stack, 0);
const P = (...stacks) => stacks.map((stack, i) => ({ id: 'p' + i, stack }));

test('parseAmount: ارقام فارسی و جداکننده', () => {
  assert.equal(parseAmount('۱٬۵۰۰,۰۰۰'), 1500000);
  assert.equal(parseAmount(''), 0);
  assert.equal(parseAmount('٢٥'), 25);
});

test('settle: کمترین تعداد انتقال و جمع صفر', () => {
  const bal = [
    { id: 'a', amount: 100 },
    { id: 'b', amount: -100 },
    { id: 'c', amount: 50 },
    { id: 'd', amount: -50 },
  ];
  const tx = settle(bal);
  assert.equal(tx.length, 2); // دو گروه مستقل، نه سه انتقال
  const net = {};
  for (const t of tx) {
    net[t.from] = (net[t.from] || 0) - t.amount;
    net[t.to] = (net[t.to] || 0) + t.amount;
  }
  for (const b of bal) assert.equal(net[b.id], b.amount);
});

test('settle: تصادفی همیشه درست تسویه می‌کند و بیش از n-1 انتقال نمی‌دهد', () => {
  for (let r = 0; r < 200; r++) {
    const n = 2 + Math.floor(Math.random() * 7);
    const a = Array.from({ length: n - 1 }, () => Math.round((Math.random() - 0.5) * 20) * 1000);
    a.push(0 - a.reduce((x, y) => x + y, 0) + 0);
    const bal = a.map((amount, i) => ({ id: 'x' + i, amount }));
    const tx = settle(bal);
    const net = {};
    for (const t of tx) {
      net[t.from] = (net[t.from] || 0) - t.amount;
      net[t.to] = (net[t.to] || 0) + t.amount;
    }
    for (const b of bal) assert.equal((net[b.id] || 0) + 0, b.amount + 0);
    assert.ok(tx.length <= Math.max(0, bal.filter((b) => b.amount).length - 1));
  }
});

test('computePots: پات فرعی با آل‌این‌های متفاوت', () => {
  const pots = computePots([
    { committed: 100, folded: false },
    { committed: 300, folded: false },
    { committed: 500, folded: false },
    { committed: 50, folded: true },
  ]);
  assert.deepEqual(pots, [
    { amount: 350, eligible: [0, 1, 2] }, // 100*3 + 50 (فولدی)
    { amount: 400, eligible: [1, 2] },
    { amount: 200, eligible: [2] },
  ]);
  assert.equal(pots.reduce((a, p) => a + p.amount, 0), 950);
});

test('همه فولد می‌کنند: بیگ‌بلایند برنده می‌شود', () => {
  let h = startHand({ players: P(1000, 1000, 1000), dealer: 0, sb: 50, bb: 100 });
  assert.equal(h.sbIdx, 1);
  assert.equal(h.bbIdx, 2);
  assert.equal(h.toAct, 0); // بعد از بیگ‌بلایند: دیلر
  h = applyAction(h, { type: 'fold' });
  h = applyAction(h, { type: 'fold' });
  assert.equal(h.phase, 'done');
  assert.equal(h.seats[2].stack, 1050);
  assert.equal(h.seats[1].stack, 950);
  assert.equal(sumStacks(h), 3000);
});

test('هدزآپ: دیلر اسمال‌بلایند است و پیش از فلاپ اول عمل می‌کند', () => {
  let h = startHand({ players: P(1000, 1000), dealer: 0, sb: 50, bb: 100 });
  assert.equal(h.sbIdx, 0);
  assert.equal(h.toAct, 0);
  h = applyAction(h, { type: 'call' });
  assert.equal(h.toAct, 1); // BB گزینه‌ی چک دارد
  h = applyAction(h, { type: 'check' });
  assert.equal(h.street, 1);
  assert.equal(h.toAct, 1); // بعد از فلاپ اول BB (غیر دیلر)
});

test('یک دور کامل تا ریور و شوداون', () => {
  let h = startHand({ players: P(1000, 1000, 1000), dealer: 0, sb: 50, bb: 100 });
  h = applyAction(h, { type: 'call' }); // دیلر
  h = applyAction(h, { type: 'call' }); // SB
  h = applyAction(h, { type: 'check' }); // BB
  assert.equal(h.street, 1);
  assert.equal(h.toAct, 1); // اولین نفر بعد از دیلر
  for (let st = 1; st <= 3; st++) {
    for (let k = 0; k < 3; k++) h = applyAction(h, { type: 'check' });
  }
  assert.equal(h.phase, 'showdown');
  assert.equal(h.pots.length, 1);
  assert.equal(h.pots[0].amount, 300);
  h = resolveHand(h, [[0, 2]]);
  assert.equal(h.seats[0].stack, 1050);
  assert.equal(h.seats[2].stack, 1050);
  assert.equal(h.seats[1].stack, 900);
  assert.equal(sumStacks(h), 3000);
});

test('رِیز، ری‌رِیز و حداقل رِیز', () => {
  let h = startHand({ players: P(1000, 1000, 1000), dealer: 0, sb: 50, bb: 100 });
  const t = turnInfo(h);
  assert.equal(t.minTo, 200);
  assert.throws(() => applyAction(h, { type: 'raise', amount: 150 }));
  h = applyAction(h, { type: 'raise', amount: 300 }); // دیلر
  assert.equal(h.minRaise, 200);
  assert.equal(turnInfo(h).minTo, 500);
  h = applyAction(h, { type: 'fold' });
  h = applyAction(h, { type: 'call' }); // BB
  assert.equal(h.street, 1);
  assert.equal(h.seats[2].committed, 300);
});

test('سه آل‌این با استک‌های متفاوت و پات فرعی', () => {
  // p0:100 p1:300 p2:500 ; دیلر p0 → SB=p1, BB=p2 ; اول p0 عمل می‌کند
  let h = startHand({ players: P(100, 300, 500), dealer: 0, sb: 50, bb: 100 });
  h = applyAction(h, { type: 'allin' }); // p0: 100 (کال)
  h = applyAction(h, { type: 'allin' }); // p1: 300
  h = applyAction(h, { type: 'allin' }); // p2: 500 (رِیز)
  // p1 و p0 آل‌این‌اند؛ p2 تنها کسی است که چیپ دارد → بدون عمل بیشتر به شوداون می‌رود
  assert.equal(h.phase, 'showdown');
  assert.equal(h.pots.length, 3);
  assert.deepEqual(h.pots.map((p) => p.amount), [300, 400, 200]);
  h = resolveHand(h, [[0], [1], [2]]);
  assert.equal(h.seats[0].stack, 300);
  assert.equal(h.seats[1].stack, 400);
  assert.equal(h.seats[2].stack, 200);
  assert.equal(sumStacks(h), 900);
});

test('بلایند ناقص: استک کوچک‌تر از بلایند', () => {
  let h = startHand({ players: P(1000, 30, 1000), dealer: 0, sb: 50, bb: 100 });
  // p1 SB فقط 30 دارد → آل‌این
  assert.equal(h.seats[1].allIn, true);
  assert.equal(h.seats[1].committed, 30);
  h = applyAction(h, { type: 'call' });
  h = applyAction(h, { type: 'check' });
  assert.equal(h.street, 1);
  assert.equal(h.toAct, 2); // p1 آل‌این است و رد می‌شود
});

test('تقسیم پات با چیپ اضافه', () => {
  let h = startHand({ players: P(1000, 1000, 1000), dealer: 0, sb: 50, bb: 100 });
  h = applyAction(h, { type: 'call' });
  h = applyAction(h, { type: 'call' });
  h = applyAction(h, { type: 'check' });
  for (let st = 1; st <= 3; st++) for (let k = 0; k < 3; k++) h = applyAction(h, { type: 'check' });
  assert.equal(h.phase, 'showdown');
  const r = resolveHand(h, [[0, 1, 2]]);
  assert.equal(r.seats.reduce((a, s) => a + s.stack, 0), 3000);
  assert.deepEqual(r.seats.map((s) => s.stack), [1000, 1000, 1000]);
});

test('شرط بی‌حریف برمی‌گردد', () => {
  let h = startHand({ players: P(1000, 1000), dealer: 0, sb: 50, bb: 100 });
  h = applyAction(h, { type: 'call' });
  h = applyAction(h, { type: 'check' });
  h = applyAction(h, { type: 'raise', amount: 400 }); // BB بعد از فلاپ شرط می‌بندد
  h = applyAction(h, { type: 'fold' });
  assert.equal(h.phase, 'done');
  assert.equal(h.seats[1].stack, 1100);
  assert.equal(h.seats[0].stack, 900);
});

test('حفظ مجموع چیپ‌ها در بازی تصادفی', () => {
  for (let r = 0; r < 300; r++) {
    const n = 2 + Math.floor(Math.random() * 6);
    const stacks = Array.from({ length: n }, () => 100 + Math.floor(Math.random() * 20) * 100);
    const total = stacks.reduce((a, b) => a + b, 0);
    let h = startHand({ players: P(...stacks), dealer: Math.floor(Math.random() * n), sb: 50, bb: 100 });
    let guard = 0;
    while (h.phase === 'betting' && guard++ < 200) {
      const t = turnInfo(h);
      const roll = Math.random();
      if (roll < 0.15) h = applyAction(h, { type: 'fold' });
      else if (roll < 0.25 && t.canRaise) h = applyAction(h, { type: 'allin' });
      else if (roll < 0.4 && t.canRaise && t.minTo <= t.maxTo) h = applyAction(h, { type: 'raise', amount: t.minTo });
      else if (t.canCheck) h = applyAction(h, { type: 'check' });
      else h = applyAction(h, { type: 'call' });
    }
    assert.ok(guard < 200, 'حلقه بی‌پایان');
    if (h.phase === 'showdown') {
      const w = h.pots.map((p) => [p.eligible[Math.floor(Math.random() * p.eligible.length)]]);
      h = resolveHand(h, w);
    }
    assert.equal(h.phase, 'done');
    assert.equal(sumStacks(h), total);
  }
});

test('resolveRound: سود برندهٔ خالی خودکار از جمع ضررها می‌آید', () => {
  const r = resolveRound([
    { id: 'a', amount: 30, win: false },
    { id: 'b', amount: 15, win: false },
    { id: 'c', amount: null, win: true },
    { id: 'd', amount: null, win: false },
  ]);
  assert.equal(r.error, null);
  assert.deepEqual(r.nets, { a: -30, b: -15, c: 45, d: 0 });
});

test('resolveRound: چند برندهٔ خالی مساوی (در واحد ۵) تقسیم می‌کنند', () => {
  const r = resolveRound([
    { id: 'a', amount: 55, win: false },
    { id: 'b', amount: null, win: true },
    { id: 'c', amount: null, win: true },
  ]);
  assert.equal(r.error, null);
  assert.deepEqual(r.nets, { a: -55, b: 30, c: 25 });
  assert.equal(Object.values(r.nets).reduce((x, y) => x + y, 0), 0);
});

test('resolveRound: سود نوشته‌شده + سود خودکار', () => {
  const r = resolveRound([
    { id: 'a', amount: 100, win: false },
    { id: 'b', amount: 40, win: true },
    { id: 'c', amount: null, win: true },
  ]);
  assert.equal(r.error, null);
  assert.deepEqual(r.nets, { a: -100, b: 40, c: 60 });
});

test('resolveRound: خطاها', () => {
  assert.match(resolveRound([{ id: 'a', amount: 12, win: false }, { id: 'b', amount: null, win: true }]).error, /مضرب/);
  assert.ok(resolveRound([{ id: 'a', amount: 10, win: false }, { id: 'b', amount: 0, win: false }]).error); // برنده نیست
  assert.ok(resolveRound([{ id: 'a', amount: 10, win: false }, { id: 'b', amount: 20, win: true }]).error); // سود بیشتر از ضرر
  assert.ok(resolveRound([{ id: 'a', amount: null, win: false }, { id: 'b', amount: null, win: true }]).error); // خالی
});

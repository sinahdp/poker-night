// منطق خالص بازی: بدون DOM و بدون ذخیره‌سازی، تا بتوان آن را مستقل تست کرد.

export const STREETS = ['پیش از فلاپ', 'فلاپ', 'ترن', 'ریور'];

/* ───────────── اعداد ───────────── */

export function normalizeDigits(s) {
  return String(s ?? '')
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));
}

export function parseAmount(s) {
  const t = normalizeDigits(s).replace(/[^\d]/g, '');
  return t ? parseInt(t, 10) : 0;
}

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

/* ───────────── تسویه حساب ───────────── */

/**
 * balances: [{id, amount}] که جمع amount ها صفر است (مثبت = طلبکار، منفی = بدهکار).
 * خروجی: کمترین تعداد انتقال [{from, to, amount}].
 * روش: بازیکنان را به بیشترین تعداد گروه‌های «جمع صفر» تقسیم می‌کنیم
 * (هر گروه k نفره فقط k-1 انتقال لازم دارد)، سپس داخل هر گروه حریصانه تسویه می‌کنیم.
 */
export function settle(balances) {
  const items = balances.filter((b) => b.amount !== 0);
  if (items.length < 2) return [];
  const groups = items.length <= 16 ? zeroSumGroups(items) : [items];
  return groups.flatMap(greedySettle);
}

function zeroSumGroups(items) {
  const n = items.length;
  const N = 1 << n;
  const sum = new Float64Array(N);
  for (let m = 1; m < N; m++) {
    const low = 31 - Math.clz32(m & -m);
    sum[m] = sum[m & (m - 1)] + items[low].amount;
  }
  const dp = new Int16Array(N);
  const par = new Int8Array(N);
  for (let m = 1; m < N; m++) {
    let best = -1;
    let bi = 0;
    for (let i = 0; i < n; i++) {
      if (!(m & (1 << i))) continue;
      const v = dp[m ^ (1 << i)];
      if (v > best) {
        best = v;
        bi = i;
      }
    }
    dp[m] = best + (sum[m] === 0 ? 1 : 0);
    par[m] = bi;
  }
  const order = [];
  for (let m = N - 1; m; ) {
    const i = par[m];
    order.push(i);
    m ^= 1 << i;
  }
  order.reverse();
  const groups = [];
  let cur = [];
  let run = 0;
  for (const i of order) {
    cur.push(items[i]);
    run += items[i].amount;
    if (run === 0) {
      groups.push(cur);
      cur = [];
    }
  }
  if (cur.length) groups.push(cur);
  return groups;
}

function greedySettle(group) {
  const cr = group.filter((b) => b.amount > 0).map((b) => ({ ...b })).sort((a, b) => b.amount - a.amount);
  const de = group.filter((b) => b.amount < 0).map((b) => ({ id: b.id, amount: -b.amount })).sort((a, b) => b.amount - a.amount);
  const out = [];
  let i = 0;
  let j = 0;
  while (i < cr.length && j < de.length) {
    const x = Math.min(cr[i].amount, de[j].amount);
    if (x > 0) out.push({ from: de[j].id, to: cr[i].id, amount: x });
    cr[i].amount -= x;
    de[j].amount -= x;
    if (cr[i].amount === 0) i++;
    if (de[j].amount === 0) j++;
  }
  return out;
}

/* ───────────── پات اصلی و فرعی ───────────── */

/** seats: [{committed, folded}] → [{amount, eligible:[index]}] */
export function computePots(seats) {
  const levels = [...new Set(seats.filter((s) => !s.folded && s.committed > 0).map((s) => s.committed))].sort((a, b) => a - b);
  let pots = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    const eligible = [];
    seats.forEach((s, i) => {
      amount += Math.min(s.committed, L) - Math.min(s.committed, prev);
      if (!s.folded && s.committed >= L) eligible.push(i);
    });
    if (amount > 0) pots.push({ amount, eligible });
    prev = L;
  }
  const extra = seats.reduce((a, s) => a + Math.max(0, s.committed - prev), 0);
  if (extra > 0) {
    if (pots.length) pots[pots.length - 1].amount += extra;
    else pots.push({ amount: extra, eligible: seats.map((s, i) => (s.folded ? -1 : i)).filter((i) => i >= 0) });
  }
  // ادغام پات‌های هم‌مجوز
  pots = pots.reduce((acc, p) => {
    const last = acc[acc.length - 1];
    if (last && last.eligible.join() === p.eligible.join()) last.amount += p.amount;
    else acc.push(p);
    return acc;
  }, []);
  return pots;
}

/* ───────────── موتور یک دست ───────────── */

const clone = (o) => JSON.parse(JSON.stringify(o));

function put(s, pay) {
  s.stack -= pay;
  s.bet += pay;
  s.committed += pay;
  if (s.stack === 0) s.allIn = true;
}

export function needsAction(h, s) {
  return !s.folded && !s.allIn && (!s.acted || s.bet < h.currentBet);
}

function nextIdx(h, from, pred) {
  const n = h.seats.length;
  for (let k = 1; k <= n; k++) {
    const i = (from + k) % n;
    if (pred(h.seats[i])) return i;
  }
  return null;
}

/**
 * شروع دست. players: [{id, stack}] به ترتیب نشستن (فقط شرکت‌کنندگان)،
 * dealer: اندیس دیلر داخل همین آرایه.
 */
export function startHand({ players, dealer, sb, bb }) {
  const n = players.length;
  if (n < 2) throw new Error('حداقل دو بازیکن لازم است');
  const h = {
    seats: players.map((p) => ({ id: p.id, stack: p.stack, start: p.stack, committed: 0, bet: 0, folded: false, allIn: false, acted: false })),
    dealer,
    sb,
    bb,
    street: 0,
    currentBet: 0,
    minRaise: bb,
    toAct: null,
    phase: 'betting',
    pots: null,
    result: null,
    log: [],
  };
  const headsUp = n === 2;
  h.sbIdx = headsUp ? dealer : (dealer + 1) % n;
  h.bbIdx = headsUp ? (dealer + 1) % n : (dealer + 2) % n;
  put(h.seats[h.sbIdx], Math.min(h.seats[h.sbIdx].stack, sb));
  put(h.seats[h.bbIdx], Math.min(h.seats[h.bbIdx].stack, bb));
  h.currentBet = Math.max(...h.seats.map((s) => s.bet));
  const first = headsUp ? h.sbIdx : (h.bbIdx + 1) % n;
  return progress(h, (first - 1 + n) % n);
}

function progress(h, from) {
  const alive = h.seats.filter((s) => !s.folded);
  if (alive.length === 1) return finishBetting(h);
  if (h.seats.some((s) => needsAction(h, s))) {
    h.toAct = nextIdx(h, from, (s) => needsAction(h, s));
    return h;
  }
  return endStreet(h);
}

function endStreet(h) {
  for (;;) {
    if (h.street === 3) return finishBetting(h);
    h.street++;
    h.currentBet = 0;
    h.minRaise = h.bb;
    h.seats.forEach((s) => {
      s.bet = 0;
      s.acted = false;
    });
    const can = h.seats.filter((s) => !s.folded && !s.allIn);
    if (can.length >= 2) {
      h.toAct = nextIdx(h, h.dealer, (s) => !s.folded && !s.allIn);
      return h;
    }
  }
}

function finishBetting(h) {
  h.toAct = null;
  h.pots = computePots(h.seats);
  if (h.pots.some((p) => p.eligible.length > 1)) {
    h.phase = 'showdown';
    return h;
  }
  return resolveHand(h, h.pots.map((p) => [p.eligible[0]]));
}

/** اطلاعات لازم برای نوبت فعلی (برای نمایش دکمه‌ها) */
export function turnInfo(h) {
  if (h.phase !== 'betting' || h.toAct == null) return null;
  const s = h.seats[h.toAct];
  const toCall = Math.min(s.stack, h.currentBet - s.bet);
  const maxTo = s.bet + s.stack;
  const pot = h.seats.reduce((a, x) => a + x.committed, 0);
  const minTo = Math.min(maxTo, h.currentBet + h.minRaise);
  const canRaise = maxTo > h.currentBet; // یعنی چیپ برای بالاتر رفتن دارد
  return { idx: h.toAct, seat: s, toCall, maxTo, minTo, canRaise, pot, canCheck: h.currentBet === s.bet };
}

export function applyAction(state, action) {
  const h = clone(state);
  if (h.phase !== 'betting' || h.toAct == null) throw new Error('الان نوبت شرط‌بندی نیست');
  const i = h.toAct;
  const s = h.seats[i];
  const toCall = h.currentBet - s.bet;
  let type = action.type;
  let amount = 0;

  if (type === 'allin') {
    const max = s.bet + s.stack;
    type = max > h.currentBet ? 'raise' : 'call';
    action = { type, amount: max };
  }

  switch (type) {
    case 'fold':
      s.folded = true;
      break;
    case 'check':
      if (toCall > 0) throw new Error('نمی‌توانید چک کنید');
      break;
    case 'call': {
      const pay = Math.min(s.stack, toCall);
      put(s, pay);
      amount = pay;
      break;
    }
    case 'raise': {
      const max = s.bet + s.stack;
      const to = Math.min(action.amount, max);
      if (to <= h.currentBet) throw new Error('مبلغ باید از شرط فعلی بیشتر باشد');
      const size = to - h.currentBet;
      const isAllIn = to === max;
      if (size < h.minRaise && !isAllIn) throw new Error('رِیز کمتر از حداقل است');
      put(s, to - s.bet);
      if (size >= h.minRaise) h.minRaise = size;
      h.currentBet = to;
      h.seats.forEach((o, k) => {
        if (k !== i) o.acted = false;
      });
      amount = to;
      break;
    }
    default:
      throw new Error('اقدام نامعتبر');
  }
  s.acted = true;
  h.log.push({ id: s.id, type, amount, street: h.street, allIn: s.allIn });
  return progress(h, i);
}

/** winners[k] = آرایه‌ی اندیس برنده‌های پات k */
export function resolveHand(state, winners) {
  const h = clone(state);
  const n = h.seats.length;
  const payouts = new Array(n).fill(0);
  const potsOut = h.pots.map((pot, k) => {
    const w = [...new Set(winners[k] || [])].filter((i) => pot.eligible.includes(i));
    if (!w.length) throw new Error('برای هر پات باید برنده مشخص شود');
    // ترتیب چیپ اضافه: از اولین نفر بعد از دیلر
    w.sort((a, b) => ((a - h.dealer - 1 + n) % n) - ((b - h.dealer - 1 + n) % n));
    const base = Math.floor(pot.amount / w.length);
    let rem = pot.amount - base * w.length;
    const parts = w.map((idx) => {
      const amt = base + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      payouts[idx] += amt;
      return { idx, amount: amt };
    });
    return { amount: pot.amount, eligible: pot.eligible, winners: parts };
  });
  h.seats.forEach((s, i) => {
    s.stack += payouts[i];
  });
  h.result = {
    pots: potsOut,
    net: h.seats.map((s, i) => ({ id: s.id, won: payouts[i], committed: s.committed, net: payouts[i] - s.committed })),
  };
  h.phase = 'done';
  return h;
}

/** برای تشخیص نام پات‌ها در UI */
export function potLabel(h, k) {
  const pots = h.pots;
  if (pots.length === 1) return 'پات';
  const contested = pots.map((p, i) => ({ p, i })).filter((x) => x.p.eligible.length > 1);
  if (pots[k].eligible.length === 1) return 'شرط بی‌حریف (برگشتی)';
  const pos = contested.findIndex((x) => x.i === k);
  return pos === 0 ? 'پات اصلی' : `پات فرعی ${pos}`;
}

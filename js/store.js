// وضعیت برنامه + ذخیره‌سازی در localStorage + عملیات روی بازی/دست

import { settle, startHand, applyAction, resolveHand } from './logic.js';

const KEY = 'poker-night:v1';

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-3);
export const sum = (a) => a.reduce((x, y) => x + y, 0);

function fresh() {
  return {
    v: 1,
    unit: 'تومان',
    defaults: { buyIn: 500000, sb: 5000, bb: 10000 },
    names: [],
    draft: { mode: 'ledger', players: [] },
    session: null,
    history: [],
  };
}

function load() {
  const base = fresh();
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return { ...base, ...s, defaults: { ...base.defaults, ...s.defaults }, draft: { ...base.draft, ...s.draft } };
    }
  } catch (e) {
    /* خراب بود؛ از نو شروع می‌کنیم */
  }
  return base;
}

export const state = load();

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    /* حافظه پر یا حالت خصوصی */
  }
}

export function replaceState(obj) {
  const base = fresh();
  for (const k of Object.keys(state)) delete state[k];
  Object.assign(state, base, obj, { defaults: { ...base.defaults, ...(obj.defaults || {}) } });
  save();
}

/* ───────────── پیش‌نویس شروع بازی ───────────── */

export function draftAdd(name) {
  name = name.trim();
  if (!name) return 'نام را بنویسید';
  if (state.draft.players.some((p) => p.name === name)) return 'این نام قبلاً اضافه شده';
  state.draft.players.push({ id: uid(), name, buyIn: state.defaults.buyIn });
  save();
  return null;
}

export function draftMove(id, d) {
  const a = state.draft.players;
  const i = a.findIndex((p) => p.id === id);
  const j = i + d;
  if (i < 0 || j < 0 || j >= a.length) return;
  [a[i], a[j]] = [a[j], a[i]];
  save();
}

export function draftRemove(id) {
  state.draft.players = state.draft.players.filter((p) => p.id !== id);
  save();
}

export function startSession() {
  const d = state.draft;
  if (d.players.length < 2) return 'حداقل دو بازیکن لازم است';
  if (d.players.some((p) => p.buyIn <= 0)) return 'مبلغ خرید همه باید بیشتر از صفر باشد';
  if (d.mode === 'chips' && !(state.defaults.bb > 0 && state.defaults.sb > 0 && state.defaults.sb <= state.defaults.bb)) {
    return 'بلایندها را درست وارد کنید (اسمال ≤ بیگ)';
  }
  state.session = {
    id: uid(),
    mode: d.mode,
    startedAt: Date.now(),
    players: d.players.map((p) => ({ id: p.id, name: p.name, buyIns: [p.buyIn], stack: p.buyIn, out: false, cashOut: null })),
    sb: state.defaults.sb,
    bb: state.defaults.bb,
    dealerId: null,
    nextDealerId: null,
    hand: null,
    handUndo: [],
    handsPlayed: 0,
    handLog: [],
    lastResult: null,
  };
  for (const p of d.players) if (!state.names.includes(p.name)) state.names.push(p.name);
  state.draft.players = [];
  save();
  return null;
}

export function discardSession() {
  state.session = null;
  save();
}

/* ───────────── خرید و بازیکن (هر دو حالت) ───────────── */

export function addBuyIn(pid, amount) {
  const s = state.session;
  const p = s.players.find((x) => x.id === pid);
  if (!p || amount <= 0) return 'مبلغ را وارد کنید';
  if (s.hand) return 'وسط دست نمی‌شود خرید ثبت کرد';
  p.buyIns.push(amount);
  p.stack += amount;
  p.out = false;
  save();
  return null;
}

export function removeBuyIn(pid, idx) {
  const s = state.session;
  const p = s.players.find((x) => x.id === pid);
  if (!p || p.buyIns.length <= 1) return 'حداقل یک خرید باید بماند';
  const a = p.buyIns[idx];
  if (s.mode === 'chips') {
    if (s.hand) return 'وسط دست ممکن نیست';
    if (p.stack - a < 0) return 'موجودی این بازیکن از این خرید کمتر است';
    p.stack -= a;
  }
  p.buyIns.splice(idx, 1);
  save();
  return null;
}

export function addPlayerToSession(name, buyIn) {
  const s = state.session;
  name = name.trim();
  if (!name) return 'نام را بنویسید';
  if (s.players.some((p) => p.name === name)) return 'این نام قبلاً هست';
  if (buyIn <= 0) return 'مبلغ خرید را وارد کنید';
  if (s.hand) return 'وسط دست نمی‌شود بازیکن اضافه کرد';
  s.players.push({ id: uid(), name, buyIns: [buyIn], stack: buyIn, out: false, cashOut: null });
  if (!state.names.includes(name)) state.names.push(name);
  save();
  return null;
}

export function toggleOut(pid) {
  const p = state.session.players.find((x) => x.id === pid);
  if (p) p.out = !p.out;
  save();
}

/* ───────────── دست‌ها (حالت چیپ مجازی) ───────────── */

export const participants = (s) => s.players.filter((p) => !p.out && p.stack > 0);

export function nextDealerId(s) {
  const part = participants(s);
  if (part.length < 2) return null;
  if (s.nextDealerId && part.some((p) => p.id === s.nextDealerId)) return s.nextDealerId;
  const order = s.players;
  const start = order.findIndex((p) => p.id === s.dealerId);
  for (let k = 1; k <= order.length; k++) {
    const p = order[(start + k + order.length) % order.length];
    if (part.some((x) => x.id === p.id)) return p.id;
  }
  return part[0].id;
}

export function beginHand() {
  const s = state.session;
  const part = participants(s);
  if (part.length < 2) return 'حداقل دو بازیکن با موجودی لازم است';
  if (!(s.bb > 0 && s.sb > 0 && s.sb <= s.bb)) return 'بلایندها را درست وارد کنید';
  const did = nextDealerId(s);
  const dealer = part.findIndex((p) => p.id === did);
  s.hand = startHand({ players: part.map((p) => ({ id: p.id, stack: p.stack })), dealer, sb: s.sb, bb: s.bb });
  s.handUndo = [];
  s.dealerId = did;
  s.nextDealerId = null;
  s.lastResult = null;
  save();
  return null;
}

export function doAction(action) {
  const s = state.session;
  const next = applyAction(s.hand, action);
  s.handUndo.push(s.hand);
  s.hand = next;
  save();
}

export function confirmWinners(winners) {
  const s = state.session;
  const next = resolveHand(s.hand, winners);
  s.handUndo.push(s.hand);
  s.hand = next;
  save();
}

export function undoHand() {
  const s = state.session;
  if (!s.handUndo.length) return;
  s.hand = s.handUndo.pop();
  save();
}

export function cancelHand() {
  const s = state.session;
  s.hand = null;
  s.handUndo = [];
  save();
}

/** خلاصهٔ قابل ذخیرهٔ یک دست (با نام‌ها، نه شناسه‌ها). برای دست نیمه‌کاره هم کار می‌کند. */
export function buildHandRecord(s, h, n) {
  const nm = (id) => s.players.find((p) => p.id === id)?.name ?? '؟';
  const done = h.phase === 'done';
  return {
    n,
    done,
    sb: h.sb,
    bb: h.bb,
    dealer: nm(h.seats[h.dealer].id),
    sbName: nm(h.seats[h.sbIdx].id),
    bbName: nm(h.seats[h.bbIdx].id),
    sbAmt: Math.min(h.seats[h.sbIdx].start, h.sb),
    bbAmt: Math.min(h.seats[h.bbIdx].start, h.bb),
    street: h.street,
    pot: sum(h.seats.map((x) => x.committed)),
    players: h.seats.map((x) => ({ name: nm(x.id), start: x.start, end: done ? x.stack : null })),
    actions: h.log.map((e) => ({ name: nm(e.id), type: e.type, amount: e.amount, street: e.street, allIn: !!e.allIn })),
    pots: done ? h.result.pots.map((p) => ({ amount: p.amount, winners: p.winners.map((w) => ({ name: nm(h.seats[w.idx].id), amount: w.amount })) })) : null,
  };
}

export function commitHand() {
  const s = state.session;
  const h = s.hand;
  if (!h || h.phase !== 'done') return;
  const lines = [];
  h.seats.forEach((seat, i) => {
    const p = s.players.find((x) => x.id === seat.id);
    p.stack = seat.stack;
    const net = h.result.net[i].net;
    if (net !== 0) lines.push({ name: p.name, net });
  });
  lines.sort((a, b) => b.net - a.net);
  s.handLog = s.handLog || [];
  s.handLog.push(buildHandRecord(s, h, s.handsPlayed + 1));
  s.handsPlayed++;
  s.lastResult = { hand: s.handsPlayed, lines };
  s.hand = null;
  s.handUndo = [];
  save();
}

/* ───────────── تسویه ───────────── */

export const totalIn = (p) => sum(p.buyIns);
export const finalOf = (s, p) => (s.mode === 'chips' ? p.stack : p.cashOut);

export function computeSettlement(s) {
  const rows = s.players.map((p) => {
    const inn = totalIn(p);
    const fin = finalOf(s, p);
    return { p, inn, fin, net: fin == null ? null : fin - inn };
  });
  const missing = rows.filter((r) => r.fin == null);
  const totalInAll = sum(rows.map((r) => r.inn));
  const totalFin = sum(rows.map((r) => r.fin ?? 0));
  const diff = totalFin - totalInAll; // مثبت: پایان بیشتر از ورودی
  const balanced = missing.length === 0 && diff === 0;
  const transfers = balanced ? settle(rows.map((r) => ({ id: r.p.id, amount: r.net }))) : [];
  return { rows, missing, totalIn: totalInAll, totalFin, diff, balanced, transfers };
}

export function finishSession() {
  const s = state.session;
  const c = computeSettlement(s);
  if (!c.balanced) return null;
  const nameOf = (id) => s.players.find((p) => p.id === id).name;
  const entry = {
    id: uid(),
    date: Date.now(),
    startedAt: s.startedAt,
    mode: s.mode,
    unit: state.unit,
    hands: s.handsPlayed,
    handLog: s.handLog || [],
    players: c.rows.map((r) => ({ name: r.p.name, buyIn: r.inn, final: r.fin, net: r.net })),
    transfers: c.transfers.map((t) => ({ from: nameOf(t.from), to: nameOf(t.to), amount: t.amount, paid: false })),
  };
  state.history.unshift(entry);
  state.session = null;
  save();
  return entry;
}

export function deleteHistory(id) {
  state.history = state.history.filter((h) => h.id !== id);
  save();
}

export function togglePaid(hid, idx) {
  const h = state.history.find((x) => x.id === hid);
  if (h && h.transfers[idx]) h.transfers[idx].paid = !h.transfers[idx].paid;
  save();
}

/* ───────────── آمار ───────────── */

export function leaderboard() {
  const m = new Map();
  for (const h of state.history) {
    for (const p of h.players) {
      const r = m.get(p.name) || { name: p.name, nights: 0, net: 0, best: -Infinity, worst: Infinity };
      r.nights++;
      r.net += p.net;
      r.best = Math.max(r.best, p.net);
      r.worst = Math.min(r.worst, p.net);
      m.set(p.name, r);
    }
  }
  return [...m.values()].sort((a, b) => b.net - a.net);
}

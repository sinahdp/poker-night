import { totalIn, totalOut, netOf, withdrawalLimit, tablePositions, resolveRound, settle } from './logic.js';
const KEY = 'poker-night:simple:v2';
const uid = () => globalThis.crypto.randomUUID();
const fresh = () => ({ v: 2, draft: { names: [], buyIn: 100000 }, session: null, history: [] });
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw);
    const old = JSON.parse(localStorage.getItem('poker-night:v1') || 'null');
    const next = fresh();
    if (!old) return next;
    // Original v1 storage remains intact, including unfinished virtual hands.
    next.history = old.history || [];
    next.draft.names = (old.draft?.players || []).map(p => p.name);
    next.draft.buyIn = old.defaults?.buyIn || 100000;
    const s = old.session;
    if (s) {
      const buyIn = s.players[0]?.buyIns?.[0] || next.draft.buyIn;
      const players = s.players.map(p => {
        const profit = (s.rounds || []).reduce((n, r) => n + (r.nets[p.id] || 0), 0);
        return { id: p.id, name: p.name, buyIns: s.mode === 'rounds' ? [buyIn] : p.buyIns, withdrawals: [], stack: s.mode === 'rounds' ? buyIn + profit : s.mode === 'chips' ? p.stack : p.buyIns.reduce((a, b) => a + b, 0) };
      });
      if (players.every(p => p.stack >= 0)) next.session = { id: s.id, startedAt: s.startedAt, buyIn, players, dealerId: s.dealerId || players[0].id, rounds: s.rounds || [], movements: [], endedAt: null };
      else next.migrationWarning = 'بازی قبلی موجودی منفی دارد؛ اطلاعات اصلی محفوظ است. برای ادامهٔ آن از نسخهٔ قبلی استفاده کنید.';
    }
    return next;
  } catch { return fresh(); }
}
export const state = load();
export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); }
  catch { throw new Error('ذخیره روی این دستگاه ممکن نیست؛ فضای مرورگر یا تنظیمات ذخیره‌سازی را بررسی کنید'); }
}
function change(update) {
  const before = structuredClone(state);
  try { update(); persist(); }
  catch (error) { Object.keys(state).forEach(k => delete state[k]); Object.assign(state, before); throw error; }
}
export function saveDraft(names, buyIn) { change(() => { state.draft = { names, buyIn }; }); }
export function startSession(names, buyIn) {
  if (state.session) throw new Error('ابتدا بازی فعلی را تمام کنید');
  names = names.map(n => n.trim()).filter(Boolean);
  if (names.length < 2) throw new Error('حداقل دو بازیکن وارد کنید');
  if (new Set(names).size !== names.length) throw new Error('نام بازیکن‌ها تکراری است');
  if (!Number.isSafeInteger(buyIn) || buyIn < 2000) throw new Error('ورودی باید حداقل ۲٬۰۰۰ تومان باشد');
  change(() => {
    const players = names.map(name => ({ id: uid(), name, buyIns: [buyIn], withdrawals: [], stack: buyIn }));
    state.session = { id: uid(), startedAt: Date.now(), buyIn, players, dealerId: players[0].id, rounds: [], movements: [], endedAt: null };
    state.draft = { names, buyIn };
  });
}
function activeSession() {
  if (!state.session || state.session.endedAt) throw new Error('بازی فعالی وجود ندارد');
  return state.session;
}
export function addRound(rows) {
  const s = activeSession(), positions = tablePositions(s);
  if (!positions) throw new Error('حداقل دو بازیکن با موجودی لازم است');
  const result = resolveRound(s.players, rows, positions.dealer.id);
  change(() => {
    s.rounds.push({ id: uid(), t: Date.now(), ...result, dealerId: positions.dealer.id, smallId: positions.small.id, bigId: positions.big.id });
    delete state.roundDraft;
    s.players.forEach(p => { p.stack += result.nets[p.id]; });
    const index = s.players.findIndex(p => p.id === positions.dealer.id);
    s.dealerId = s.players[(index + 1) % s.players.length].id;
  });
  return result;
}
export function rebuy(id) {
  const s = activeSession(), p = s.players.find(p => p.id === id);
  if (!p || p.stack !== 0) throw new Error('شارژ فقط وقتی موجودی صفر است انجام می‌شود');
  if (!Number.isSafeInteger(totalIn(p) + s.buyIn)) throw new Error('مجموع شارژ بیش از حد بزرگ است');
  change(() => { p.buyIns.push(s.buyIn); p.stack = s.buyIn; s.movements.push({ id, type: 'rebuy', amount: s.buyIn, t: Date.now() }); });
}
export function withdraw(id, amount) {
  const s = activeSession(), p = s.players.find(p => p.id === id);
  if (!p || !Number.isSafeInteger(amount) || amount <= 0 || amount > withdrawalLimit(s, p)) throw new Error('فقط موجودی اضافه بر ورودی اولیه قابل برداشت است');
  change(() => { p.stack -= amount; p.withdrawals.push(amount); s.movements.push({ id, type: 'withdraw', amount, t: Date.now() }); });
}
export function summary(s) {
  const rows = s.players.map(p => ({ ...p, inn: totalIn(p), out: totalOut(p), net: netOf(p) }));
  return { rows, transfers: settle(rows.map(p => ({ id: p.id, amount: p.net }))) };
}
export function finishSession() {
  const s = activeSession();
  summary(s);
  change(() => { s.endedAt = Date.now(); state.history.unshift(structuredClone(s)); state.session = null; });
}

// Money is stored as whole tomans; every round preserves the total.
export function normalizeDigits(value) {
  return String(value ?? '').replace(/[۰-۹]/g, d => d.charCodeAt(0) - 1776).replace(/[٠-٩]/g, d => d.charCodeAt(0) - 1632);
}
export function parseAmount(value) {
  const text = normalizeDigits(value).replace(/[,٬\s]/g, '');
  return /^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : NaN;
}
export const fmt = n => n.toLocaleString('fa-IR');
export const totalIn = p => p.buyIns.reduce((a, b) => a + b, 0);
export const totalOut = p => (p.withdrawals || []).reduce((a, b) => a + b, 0);
export const netOf = p => p.stack + totalOut(p) - totalIn(p);
export const withdrawalLimit = (s, p) => Math.max(0, p.stack - s.buyIn);
export function tablePositions(s) {
  const active = s.players.filter(p => p.stack > 0);
  if (active.length < 2) return null;
  const start = Math.max(0, s.players.findIndex(p => p.id === s.dealerId));
  let dealer;
  for (let i = 0; i < s.players.length; i++) {
    const p = s.players[(start + i) % s.players.length];
    if (p.stack > 0) { dealer = p; break; }
  }
  const index = active.indexOf(dealer);
  return { dealer, small: active[active.length === 2 ? index : (index + 1) % active.length], big: active[(index + (active.length === 2 ? 1 : 2)) % active.length] };
}
export function resolveRound(players, rows, dealerId) {
  if (rows.length !== players.length || new Set(rows.map(r => r.id)).size !== players.length || rows.some(r => !players.some(p => p.id === r.id))) throw new Error('نتیجهٔ همهٔ بازیکن‌ها لازم است');
  const winners = rows.filter(r => r.win);
  if (!winners.length) throw new Error('برندهٔ دست را تیک بزنید');
  const nets = Object.fromEntries(players.map(p => [p.id, 0]));
  let loss = 0;
  for (const row of rows) {
    const p = players.find(p => p.id === row.id);
    if (row.win) {
      if (p.stack === 0) throw new Error('بازیکن با موجودی صفر باید ابتدا شارژ کند');
      continue;
    }
    if (!Number.isSafeInteger(row.amount) || row.amount < 0) throw new Error('مبلغ باخت را به تومان و بدون اعشار وارد کنید');
    if (row.amount > p.stack) throw new Error(`باخت ${p.name} بیشتر از موجودی او است`);
    loss += row.amount;
    nets[p.id] = row.amount ? -row.amount : 0;
  }
  if (!Number.isSafeInteger(loss)) throw new Error('مبلغ بیش از حد بزرگ است');
  if (!loss && winners.length !== players.filter(p => p.stack > 0).length) throw new Error('مبلغ باخت‌ها را وارد کنید؛ برای دست بدون جابه‌جایی همهٔ افراد حاضر را برنده بزنید');
  const dealer = players.findIndex(p => p.id === dealerId);
  const seat = id => players.findIndex(p => p.id === id);
  winners.sort((a, b) => ((seat(a.id) - dealer - 1 + players.length) % players.length) - ((seat(b.id) - dealer - 1 + players.length) % players.length));
  winners.forEach((r, i) => { nets[r.id] = Math.floor(loss / winners.length) + (i < loss % winners.length ? 1 : 0); });
  if (players.some(p => !Number.isSafeInteger(p.stack + nets[p.id]))) throw new Error('موجودی بیش از حد بزرگ است');
  return { nets, loss, winners: winners.map(r => r.id) };
}
export function settle(balances) {
  if (balances.some(p => !Number.isSafeInteger(p.amount)) || balances.reduce((a, p) => a + p.amount, 0) !== 0) throw new Error('حساب‌ها تراز نیستند');
  const creditors = balances.filter(p => p.amount > 0).map(p => ({ ...p }));
  const debtors = balances.filter(p => p.amount < 0).map(p => ({ id: p.id, amount: -p.amount }));
  const transfers = [];
  let i = 0, j = 0;
  while (i < creditors.length && j < debtors.length) {
    const amount = Math.min(creditors[i].amount, debtors[j].amount);
    transfers.push({ from: debtors[j].id, to: creditors[i].id, amount });
    creditors[i].amount -= amount;
    debtors[j].amount -= amount;
    if (!creditors[i].amount) i++;
    if (!debtors[j].amount) j++;
  }
  return transfers;
}

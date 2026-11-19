import { fmt, parseAmount, netOf, tablePositions, resolveRound, withdrawalLimit } from './logic.js';
import * as S from './store.js';
const { state } = S;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => `${fmt(n)} <small>تومان</small>`;
const signed = n => `<span class="${n > 0 ? 'positive' : n < 0 ? 'negative' : 'muted'}">${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}</span>`;
const date = t => new Date(t).toLocaleDateString('fa-IR');
let timer, installPrompt, lastFocus;
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(timer);
  timer = setTimeout(() => el.classList.remove('show'), 4500);
}
function setup() {
  return `<section class="card"><h2>بازی جدید</h2><p class="muted">نام‌ها را به ترتیب نشستن دور میز بنویسید. نفر اول دیلر دست اول است.</p>
    <form id="setup"><label for="names">نام بازیکن‌ها؛ هر نفر در یک خط</label>
    <textarea id="names" rows="5" placeholder="علی&#10;رضا&#10;سارا" required>${esc(state.draft.names.join('\n'))}</textarea>
    <label for="buy-in">ورودی هر نفر (تومان)</label><input id="buy-in" inputmode="numeric" autocomplete="off" value="${esc(fmt(state.draft.buyIn || 100000))}" required>
    <p class="hint">اجبار کوچک ۱٬۰۰۰ و اجبار بزرگ ۲٬۰۰۰ تومان است.</p><button class="primary wide" type="submit">شروع بازی</button></form></section>`;
}
function game() {
  const s = state.session, pos = tablePositions(s);
  return `<section class="card table-info"><div class="section-title"><h2>دست ${fmt(s.rounds.length + 1)}</h2><span class="muted">ورودی ${money(s.buyIn)}</span></div>
    ${pos ? `<div class="positions"><div><small>دیلر</small><b>${esc(pos.dealer.name)}</b></div><div><small>اجبار ۱٬۰۰۰</small><b>${esc(pos.small.name)}</b></div><div><small>اجبار ۲٬۰۰۰</small><b>${esc(pos.big.name)}</b></div></div>` : '<p class="hint">برای دست بعد، حداقل دو نفر باید موجودی داشته باشند. بازیکن صفرشده می‌تواند شارژ کند.</p>'}
    <button class="primary wide" data-action="round" ${pos ? '' : 'disabled'}>پایان دست؛ ثبت باخت‌ها</button><p class="hint">بازی روی میز انجام می‌شود؛ اینجا فقط نتیجه را ثبت کنید.</p></section>
    <section class="card"><div class="section-title"><h2>حساب بازیکن‌ها</h2><span class="muted">همهٔ مبلغ‌ها به تومان</span></div>
    ${s.players.map(p => `<article class="player"><div class="player-top"><b>${esc(p.name)}</b><span>موجودی ${money(p.stack)}</span></div><div class="player-bottom"><span class="muted">${netOf(p) < 0 ? 'بدهی' : netOf(p) > 0 ? 'سود' : 'سود / باخت'} ${signed(netOf(p))}</span>
      ${p.stack === 0 ? `<button data-action="rebuy" data-id="${p.id}">شارژ ${fmt(s.buyIn)}</button>` : withdrawalLimit(s, p) > 0 ? `<button data-action="withdraw" data-id="${p.id}">برداشت اضافه</button>` : ''}</div></article>`).join('')}
    <button class="wide" data-action="settle">حساب نهایی / پایان بازی</button></section>
    ${roundHistory(s)}`;
}
function roundHistory(s) {
  if (!s.rounds?.length) return '';
  return `<details class="card"><summary>دست‌های ثبت‌شده (${fmt(s.rounds.length)})</summary><div class="rounds">${s.rounds.map((r, i) => `<div class="round-record"><b>دست ${fmt(i + 1)}</b><div>${s.players.map(p => `<span>${esc(p.name)} ${signed(r.nets[p.id] || 0)}</span>`).join('')}</div></div>`).reverse().join('')}</div></details>`;
}
function result(s) {
  const c = S.summary(s), name = id => esc(s.players.find(p => p.id === id).name);
  return `<p class="muted">سود و بدهی، جمع همهٔ دست‌هاست. شارژ و برداشت در این حساب لحاظ شده‌اند.</p>
    ${c.rows.map(p => `<div class="result-row"><div><b>${esc(p.name)}</b><small>ورود ${fmt(p.inn)} · برداشت ${fmt(p.out)} · موجودی ${fmt(p.stack)}</small></div><strong>${signed(p.net)}<small>${p.net < 0 ? ' بدهکار' : p.net > 0 ? ' طلبکار' : ' تسویه'}</small></strong></div>`).join('')}
    <h3>چه کسی به چه کسی بدهد؟</h3>${c.transfers.length ? c.transfers.map(t => `<p class="transfer"><b>${name(t.from)}</b> به <b>${name(t.to)}</b><strong>${money(t.amount)}</strong></p>`).join('') : '<p class="hint">کسی بدهی ندارد.</p>'}
    <p class="hint">این انتقال‌ها برای تسویهٔ سود و باخت است؛ پول بازی روی میز را با پرداخت نقدی دوباره حساب نکنید.</p>`;
}
function history() {
  if (!state.history.length) return '';
  return `<section class="history"><h2>بازی‌های تمام‌شده</h2>${state.history.map(s => `<details class="card"><summary>${date(s.endedAt || s.date)} · ${fmt(s.rounds?.length ?? s.hands ?? 0)} دست</summary>${s.v === 1 || !s.buyIn ? legacyResult(s) : result(s) + roundHistory(s)}</details>`).join('')}</section>`;
}
function legacyResult(s) {
  return `<p class="muted">حساب ذخیره‌شده از نسخهٔ قبلی</p>${s.players.map(p => `<div class="result-row"><b>${esc(p.name)}</b>${signed(p.net || 0)}</div>`).join('')}${(s.transfers || []).map(t => `<p class="transfer">${esc(t.from)} به ${esc(t.to)} <b>${money(t.amount)}</b></p>`).join('')}`;
}
function render() {
  app.innerHTML = `<header><div><h1>شب پوکر</h1><p class="muted">فقط حساب‌وکتاب دور میز</p></div><button id="install" data-action="install" ${installPrompt ? '' : 'hidden'}>نصب برنامه</button></header>
    ${state.migrationWarning ? `<p class="notice">${esc(state.migrationWarning)}</p>` : ''}${state.session ? game() : setup()}${history()}<footer>اطلاعات روی همین مرورگر ذخیره می‌شود؛ بعد از اولین بار، آفلاین هم کار می‌کند.</footer>`;
}
function openModal(title, body) {
  lastFocus = document.activeElement;
  dialog.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button type="button" data-action="close" aria-label="بستن پنجره">بستن</button></div>${body}<p id="modal-error" class="negative" role="alert"></p>`;
  dialog.showModal();
}
function closeModal() { dialog.close(); lastFocus?.focus(); }
function roundRows() {
  return [...dialog.querySelectorAll('.round-input')].map(row => ({ id: row.dataset.id, win: row.querySelector('[type=checkbox]').checked, amount: row.querySelector('.loss').value.trim() ? parseAmount(row.querySelector('.loss').value) : 0 }));
}
function previewRound() {
  const rows = roundRows(), s = state.session;
  state.roundDraft = { sessionId: s.id, rows: [...dialog.querySelectorAll('.round-input')].map(row => ({ id: row.dataset.id, value: row.querySelector('.loss').value, win: row.querySelector('[type=checkbox]').checked })) };
  try { S.persist(); } catch (e) { toast(e.message); }
  dialog.querySelectorAll('.round-input').forEach(row => { row.querySelector('.loss').disabled = row.querySelector('[type=checkbox]').checked || s.players.find(p => p.id === row.dataset.id).stack === 0; });
  const output = dialog.querySelector('#round-preview');
  try {
    const r = resolveRound(s.players, rows, tablePositions(s).dealer.id);
    output.innerHTML = `<b>جمع باخت‌ها: ${money(r.loss)}</b>${r.winners.map(id => `<p>${esc(s.players.find(p => p.id === id).name)} <strong class="positive">سهم برد ${money(r.nets[id])}</strong></p>`).join('')}`;
    dialog.querySelector('#save-round').disabled = false;
  } catch (e) { output.textContent = e.message; dialog.querySelector('#save-round').disabled = true; }
}
function openRound() {
  const s = state.session;
  const draft = state.roundDraft?.sessionId === s.id ? state.roundDraft.rows : [];
  openModal(`نتیجهٔ دست ${fmt(s.rounds.length + 1)}`, `<form id="round-form"><p class="muted">باخت هر نفر را وارد کنید و برنده را تیک بزنید. برای مساوی چند برنده انتخاب کنید؛ سهم‌ها خودکار تقسیم می‌شوند.</p><p class="hint">باخت واردشده شامل اجبارهای روی میز هم هست؛ اجبار دوباره کم نمی‌شود. خالی یعنی صفر تومان.</p>
    ${s.players.map(p => {
      const d = draft.find(r => r.id === p.id);
      return `<div class="round-input" data-id="${p.id}"><div class="section-title"><label for="loss-${p.id}">${esc(p.name)} <small class="muted">موجودی ${fmt(p.stack)}</small></label><label class="winner"><input type="checkbox" ${d?.win ? 'checked' : ''} ${p.stack ? '' : 'disabled'}> برنده</label></div><input class="loss" id="loss-${p.id}" inputmode="numeric" autocomplete="off" placeholder="باخت به تومان" value="${esc(d?.value || '')}" ${p.stack ? '' : 'disabled'}></div>`;
    }).join('')}<div id="round-preview" class="preview" aria-live="polite"></div><p class="hint">اگر تقسیم دقیق نباشد، تومان باقی‌مانده به ترتیب بعد از دیلر داده می‌شود.</p><button id="save-round" class="primary wide" type="submit">ثبت دست و ادامه</button></form>`);
  previewRound();
  dialog.querySelector('.loss:not(:disabled)')?.focus();
}
app.addEventListener('input', e => {
  if (e.target.closest('#setup')) {
    try { S.saveDraft(document.querySelector('#names').value.split('\n'), parseAmount(document.querySelector('#buy-in').value) || 0); } catch (err) { toast(err.message); }
  }
});
app.addEventListener('submit', e => {
  if (e.target.id !== 'setup') return;
  e.preventDefault();
  try { S.startSession(document.querySelector('#names').value.split('\n'), parseAmount(document.querySelector('#buy-in').value)); render(); } catch (err) { toast(err.message); }
});
async function action(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'close') closeModal();
    if (action === 'round') openRound();
    if (action === 'rebuy') {
      const p = state.session.players.find(p => p.id === id);
      openModal('شارژ مجدد', `<p>شارژ ${esc(p.name)} به اندازهٔ ورودی: <b>${money(state.session.buyIn)}</b></p><button class="primary wide" data-action="confirm-rebuy" data-id="${id}">ثبت شارژ</button>`);
    }
    if (action === 'confirm-rebuy') { S.rebuy(id); closeModal(); render(); toast('شارژ ثبت شد'); }
    if (action === 'withdraw') {
      const p = state.session.players.find(p => p.id === id), limit = withdrawalLimit(state.session, p);
      openModal(`برداشت ${esc(p.name)}`, `<form id="withdraw-form" data-id="${id}"><p>حداکثر برداشت ${money(limit)} است. ورودی اولیهٔ ${money(state.session.buyIn)} باید در موجودی بماند.</p><label for="withdraw-amount">مبلغ برداشت (تومان)</label><input id="withdraw-amount" inputmode="numeric" autocomplete="off" value="${fmt(limit)}" required><button class="primary wide" type="submit">ثبت برداشت</button></form>`);
    }
    if (action === 'settle') openModal('حساب نهایی', `${result(state.session)}<button class="primary wide" data-action="finish">پایان بازی و ذخیرهٔ حساب</button><button class="wide" data-action="close">ادامهٔ بازی</button>`);
    if (action === 'finish') { S.finishSession(); closeModal(); render(); toast('بازی تمام شد؛ حساب نهایی ذخیره شد'); }
    if (action === 'install' && installPrompt) { await installPrompt.prompt(); installPrompt = null; render(); }
  } catch (err) { if (dialog.open) dialog.querySelector('#modal-error').textContent = err.message; else toast(err.message); }
}
app.addEventListener('click', action);
dialog.addEventListener('click', action);
dialog.addEventListener('input', e => { if (e.target.closest('#round-form')) previewRound(); });
dialog.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('loss')) return;
  const inputs = [...dialog.querySelectorAll('.loss:not(:disabled)')], next = inputs[inputs.indexOf(e.target) + 1];
  e.preventDefault();
  (next || dialog.querySelector('#save-round')).focus();
});
dialog.addEventListener('submit', e => {
  e.preventDefault();
  try {
    if (e.target.id === 'round-form') S.addRound(roundRows());
    if (e.target.id === 'withdraw-form') S.withdraw(e.target.dataset.id, parseAmount(dialog.querySelector('#withdraw-amount').value));
    closeModal(); render(); toast('ثبت شد');
  } catch (err) { dialog.querySelector('#modal-error').textContent = err.message; }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; render(); });
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => toast('راه‌اندازی حالت آفلاین انجام نشد؛ اتصال را بررسی کنید'));

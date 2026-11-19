import { fmt, parseAmount, parseMoney, moneyInput, stepLoss, netOf, tablePositions, resolveRound, withdrawalLimit } from './logic.js';
import * as S from './store.js';
const { state } = S;
const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const money = n => `<span class="amount">${fmt(n)}</span> <small>تومان</small>`;
const signed = n => `<bdi dir="ltr" class="${n > 0 ? 'positive' : n < 0 ? 'negative' : 'muted'}">${n > 0 ? '+' : n < 0 ? '−' : ''}${fmt(Math.abs(n))}</bdi>`;
const date = t => new Date(t).toLocaleDateString('fa-IR');
const shortHint = '<bdi>۱۰</bdi> یا <bdi>۱۰۰۰۰</bdi> = <bdi>۱۰٬۰۰۰</bdi> تومان';
const ui = { tab: 'game', names: [...state.draft.names], buyIn: moneyInput(state.draft.buyIn || 100000), name: '' };
let timer, draftTimer, installPrompt, lastFocus;
function toast(message) {
  const el = document.querySelector('#toast');
  el.textContent = message; el.classList.add('show');
  clearTimeout(timer); timer = setTimeout(() => el.classList.remove('show'), 4000);
}
function saveDraftSoon() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { try { S.persist(); } catch (e) { toast(e.message); } }, 180);
}
function setup() {
  return `<section class="card"><div class="section-title"><h2>بازیکن‌ها</h2><span class="eyebrow">به ترتیب دور میز</span></div>
    <form id="add-name" class="name-entry"><label class="sr-only" for="player-name">نام بازیکن</label><input id="player-name" maxlength="40" autocomplete="off" placeholder="نام بازیکن" value="${esc(ui.name)}"><button type="submit" class="add-button" aria-label="اضافه کردن بازیکن">＋ افزودن</button></form>
    <div class="names-list">${ui.names.length ? ui.names.map((name, i) => `<div class="name-row"><span class="seat-chip chip-${i % 4}">${fmt(i + 1)}</span><b>${esc(name)}</b>${i === 0 ? '<small class="dealer-label">دیلر اول</small>' : ''}<button class="icon-button" data-action="remove-name" data-index="${i}" aria-label="حذف ${esc(name)}">×</button></div>`).join('') : '<p class="empty-inline">حداقل دو نفر را اضافه کنید.</p>'}</div>
    <form id="setup"><label for="buy-in">ورودی هر نفر</label><div class="money-field"><input id="buy-in" inputmode="decimal" autocomplete="off" value="${esc(ui.buyIn)}" aria-describedby="buy-in-hint"><span>هزار تومان</span></div><p id="buy-in-hint" class="hint">${shortHint}<span id="buy-in-resolved" class="field-resolved">${Number.isSafeInteger(parseMoney(ui.buyIn)) ? money(parseMoney(ui.buyIn)) : 'مبلغ معتبر وارد کنید'}</span></p>
    <div class="setup-note"><span class="mini-chip red-chip">۱</span> اجبار کوچک ۱٬۰۰۰ <span class="mini-chip blue-chip">۲</span> اجبار بزرگ ۲٬۰۰۰</div>
    <button class="primary wide" type="submit">شروع بازی <span class="button-meta">${fmt(ui.names.length)} بازیکن</span></button><p id="setup-error" class="error" role="alert"></p></form></section>`;
}
function game() {
  const s = state.session, pos = tablePositions(s);
  return `<section class="card table-info"><div class="section-title"><h2>دست ${fmt(s.rounds.length + 1)}</h2><span class="eyebrow">ورودی ${money(s.buyIn)}</span></div>
    ${pos ? `<div class="positions"><div><span class="mini-chip dealer-chip">D</span><small>دیلر</small><b>${esc(pos.dealer.name)}</b></div><div><span class="mini-chip red-chip">۱</span><small>اجبار ۱٬۰۰۰</small><b>${esc(pos.small.name)}</b></div><div><span class="mini-chip blue-chip">۲</span><small>اجبار ۲٬۰۰۰</small><b>${esc(pos.big.name)}</b></div></div>` : '<p class="hint">برای دست بعد، بازیکن صفرشده باید شارژ کند.</p>'}
    <button class="primary wide" data-action="round" ${pos ? '' : 'disabled'}>ثبت نتیجهٔ دست <span class="button-meta">باخت‌ها و برنده</span></button></section>
    <section class="card"><div class="section-title"><h2>حساب میز</h2><span class="eyebrow">مبلغ‌ها به تومان</span></div>
    <div class="account-head"><span>بازیکن</span><span>موجودی / سود و باخت</span></div>
    ${s.players.map((p, i) => `<article class="player"><div class="player-name"><span class="seat-chip chip-${i % 4}">${fmt(i + 1)}</span><div><b>${esc(p.name)}</b>${p.stack === 0 ? '<small class="negative">نیاز به شارژ</small>' : ''}</div></div><div class="player-amount"><strong>${money(p.stack)}</strong><small>${signed(netOf(p))} <span class="muted">${netOf(p) < 0 ? 'بدهی' : netOf(p) > 0 ? 'سود' : 'سود / باخت'}</span></small></div>
      ${p.stack === 0 ? `<button class="player-action" data-action="rebuy" data-id="${p.id}">شارژ ${fmt(s.buyIn / 1000)} هزار</button>` : withdrawalLimit(s, p) > 0 ? `<button class="player-action" data-action="withdraw" data-id="${p.id}">برداشت</button>` : ''}</article>`).join('')}
    <button class="wide secondary" data-action="settle">حساب نهایی و پایان بازی</button></section>${roundHistory(s)}`;
}
function roundHistory(s) {
  if (!s.rounds?.length) return '';
  return `<details class="card round-history"><summary>دست‌های ثبت‌شده <span class="count">${fmt(s.rounds.length)}</span></summary><div class="rounds">${s.rounds.map((r, i) => `<div class="round-record"><b>دست ${fmt(i + 1)}</b><div>${s.players.map(p => `<span>${esc(p.name)} ${signed(r.nets[p.id] || 0)}</span>`).join('')}</div></div>`).reverse().join('')}</div></details>`;
}
function result(s) {
  const c = S.summary(s), name = id => esc(s.players.find(p => p.id === id).name);
  return `<p class="hint">جمع همهٔ دست‌ها، با احتساب شارژ و برداشت.</p>${c.rows.map(p => `<div class="result-row"><div><b>${esc(p.name)}</b><small>ورود ${fmt(p.inn)} · برداشت ${fmt(p.out)} · مانده ${fmt(p.stack)}</small></div><strong>${signed(p.net)}<small>${p.net < 0 ? 'بدهکار' : p.net > 0 ? 'طلبکار' : 'تسویه'}</small></strong></div>`).join('')}
    <h3>تسویهٔ بین بازیکن‌ها</h3>${c.transfers.length ? c.transfers.map(t => `<p class="transfer"><span><b>${name(t.from)}</b> به <b>${name(t.to)}</b></span><strong>${money(t.amount)}</strong></p>`).join('') : '<p class="hint">کسی بدهی ندارد.</p>'}<p class="hint">این مبلغ‌ها سود و باخت خالص‌اند؛ پول روی میز را دوباره حساب نکنید.</p>`;
}
function history() {
  if (!state.history.length) return '<section class="card empty-state"><span class="empty-suit" aria-hidden="true">♧</span><h2>هنوز بازی‌ای تمام نشده</h2><p class="muted">با پایان بازی، حساب نهایی و دست‌ها اینجا می‌مانند.</p><button data-action="tab" data-tab="game">رفتن به بازی</button></section>';
  return `<section class="history"><div class="section-title history-title"><h2>بازی‌های تمام‌شده</h2><span class="count">${fmt(state.history.length)}</span></div>${state.history.map((s, i) => `<details class="card" ${i === 0 && ui.justFinished ? 'open' : ''}><summary><span>${date(s.endedAt || s.date)}</span><span class="eyebrow">${fmt(s.rounds?.length ?? s.hands ?? 0)} دست</span></summary>${!s.buyIn ? legacyResult(s) : result(s) + roundHistory(s)}</details>`).join('')}</section>`;
}
function legacyResult(s) {
  return `<p class="hint">حساب نسخهٔ قبلی</p>${s.players.map(p => `<div class="result-row"><b>${esc(p.name)}</b>${signed(p.net || 0)}</div>`).join('')}${(s.transfers || []).map(t => `<p class="transfer">${esc(t.from)} به ${esc(t.to)} <b>${money(t.amount)}</b></p>`).join('')}`;
}
function render() {
  app.innerHTML = `<header><div class="brand"><span class="brand-chip" aria-hidden="true">♠</span><div><h1>شب پوکر</h1><p class="eyebrow">حساب دور میز</p></div></div><button id="install" class="secondary" data-action="install" ${installPrompt ? '' : 'hidden'}>نصب برنامه</button></header>
    <nav class="tabs" role="tablist" aria-label="بخش‌های برنامه">${[['game', 'میز بازی'], ['history', 'تاریخچه']].map(([tab, label]) => `<button role="tab" id="tab-${tab}" data-action="tab" data-tab="${tab}" aria-selected="${ui.tab === tab}" aria-controls="main-panel" tabindex="${ui.tab === tab ? '0' : '-1'}">${label}${tab === 'history' && state.history.length ? `<span class="count">${fmt(state.history.length)}</span>` : ''}</button>`).join('')}</nav>
    <div id="main-panel" role="tabpanel" aria-labelledby="tab-${ui.tab}">${state.migrationWarning ? `<p class="notice">${esc(state.migrationWarning)}</p>` : ''}${ui.tab === 'history' ? history() : state.session ? game() : setup()}</div><footer>ذخیره روی همین دستگاه · قابل استفاده آفلاین</footer>`;
}
function openModal(title, body, className = '') {
  lastFocus = document.activeElement;
  dialog.className = className;
  dialog.innerHTML = `<div class="modal-head"><h2 id="modal-title">${title}</h2><button class="icon-button" type="button" data-action="close" aria-label="بستن پنجره">×</button></div>${body}<p id="modal-error" class="error" role="alert"></p>`;
  document.body.classList.add('modal-open'); dialog.showModal();
}
function closeModal() { dialog.close(); }
dialog.addEventListener('close', () => { document.body.classList.remove('modal-open'); lastFocus?.focus(); });
function roundRows() {
  return [...dialog.querySelectorAll('.round-input')].map(row => ({ id: row.dataset.id, win: row.querySelector('[type=checkbox]').checked, amount: row.querySelector('.loss').value.trim() ? parseMoney(row.querySelector('.loss').value) : 0 }));
}
function previewRound() {
  const rows = roundRows(), s = state.session;
  state.roundDraft = { format: 'short', sessionId: s.id, rows: [...dialog.querySelectorAll('.round-input')].map(row => ({ id: row.dataset.id, value: row.querySelector('.loss').value, win: row.querySelector('[type=checkbox]').checked })) };
  saveDraftSoon();
  dialog.querySelectorAll('.round-input').forEach(row => {
    const p = s.players.find(p => p.id === row.dataset.id), r = rows.find(r => r.id === p.id), amount = r.amount;
    const disabled = r.win || p.stack === 0;
    row.classList.toggle('is-winner', r.win);
    row.querySelector('.loss').disabled = disabled;
    row.querySelectorAll('[data-action=step]').forEach(b => { b.disabled = disabled || (Number(b.dataset.direction) < 0 ? amount === 0 : amount >= p.stack); });
    row.querySelector('.resolved-amount').textContent = r.win ? 'سهم برد خودکار' : Number.isSafeInteger(amount) ? `${fmt(amount)} تومان` : 'مبلغ نامعتبر';
    const invalid = !r.win && (!Number.isSafeInteger(amount) || amount > p.stack);
    row.querySelector('.loss').setAttribute('aria-invalid', String(invalid));
    row.querySelector('.row-error').textContent = invalid ? Number.isSafeInteger(amount) ? 'بیشتر از موجودی' : 'عدد معتبر وارد کنید' : '';
  });
  const output = dialog.querySelector('#round-preview');
  try {
    const r = resolveRound(s.players, rows, tablePositions(s).dealer.id);
    output.classList.remove('pending');
    output.innerHTML = `<div class="preview-total"><span>جمع باخت‌ها</span><b>${money(r.loss)}</b></div>${r.winners.map(id => `<p><span>${esc(s.players.find(p => p.id === id).name)}</span><strong class="positive">${money(r.nets[id])}</strong></p>`).join('')}`;
    dialog.querySelector('#save-round').disabled = false;
  } catch (e) { output.textContent = e.message; output.classList.add('pending'); dialog.querySelector('#save-round').disabled = true; }
}
function openRound() {
  const s = state.session;
  const draft = state.roundDraft?.sessionId === s.id ? state.roundDraft.rows : [];
  const oldDraft = state.roundDraft?.format !== 'short';
  openModal(`ثبت دست ${fmt(s.rounds.length + 1)}`, `<form id="round-form"><div class="round-intro"><span>باخت هر نفر را بزنید؛ برنده را تیک بزنید.</span><small class="muted">${shortHint} · چند تیک = مساوی</small></div><div class="round-list">${s.players.map(p => {
    const d = draft.find(r => r.id === p.id);
    const value = d?.value ? oldDraft && Number.isFinite(parseAmount(d.value)) ? moneyInput(parseAmount(d.value)) : d.value : '';
    return `<div class="round-input ${p.stack ? '' : 'no-stack'}" data-id="${p.id}"><div class="round-person"><label for="loss-${p.id}">${esc(p.name)}</label><small class="muted">موجودی ${fmt(p.stack)}</small></div><label class="winner"><input type="checkbox" aria-label="برنده ${esc(p.name)}" ${d?.win && p.stack ? 'checked' : ''} ${p.stack ? '' : 'disabled'}><span>برنده</span></label><div class="loss-controls"><button type="button" data-action="step" data-direction="-1" aria-label="کاهش باخت ${esc(p.name)} به اندازهٔ ۵ هزار تومان">−۵</button><input class="loss" id="loss-${p.id}" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="۰" aria-label="باخت ${esc(p.name)}؛ عدد کوتاه به هزار تومان" aria-describedby="resolved-${p.id}" value="${esc(value)}" ${p.stack ? '' : 'disabled'}><button type="button" data-action="step" data-direction="1" aria-label="افزایش باخت ${esc(p.name)} به اندازهٔ ۵ هزار تومان">+۵</button></div><div class="row-note"><small id="resolved-${p.id}" class="resolved-amount"></small><small class="row-error error"></small></div></div>`;
  }).join('')}</div><p class="hint compact-hint">باخت شامل اجبار است؛ خالی یعنی صفر. در مساوی، تومان اضافه به ترتیب بعد از دیلر می‌رسد.</p><div class="round-bottom"><div id="round-preview" class="preview" aria-live="polite"></div><button id="save-round" class="primary wide" type="submit">ثبت و دست بعد</button></div></form>`, 'round-dialog');
  previewRound();
  // Keep the numeric keyboard closed until the user chooses manual entry.
  dialog.querySelector('.winner input:not(:disabled)')?.focus({ preventScroll: true });
}
function persistSetup() { S.saveDraft(ui.names, parseMoney(ui.buyIn) || 0); }
function addNames() {
  const names = ui.name.split(/[\n،,]+/).map(n => n.trim()).filter(Boolean);
  if (!names.length) throw new Error('نام بازیکن را بنویسید');
  if (names.some(n => n.length > 40)) throw new Error('نام باید حداکثر ۴۰ حرف باشد');
  if (new Set([...ui.names, ...names]).size !== ui.names.length + names.length) throw new Error('این نام قبلاً اضافه شده');
  const before = [...ui.names]; ui.names.push(...names);
  try { persistSetup(); } catch (e) { ui.names = before; throw e; }
  ui.name = ''; render(); document.querySelector('#player-name').focus();
}
app.addEventListener('input', e => {
  if (e.target.closest('#setup') || e.target.closest('#add-name')) document.querySelector('#setup-error').textContent = '';
  if (e.target.id === 'player-name') ui.name = e.target.value;
  if (e.target.id === 'buy-in') {
    ui.buyIn = e.target.value;
    const amount = parseMoney(ui.buyIn);
    document.querySelector('#buy-in-resolved').innerHTML = Number.isSafeInteger(amount) ? money(amount) : 'مبلغ معتبر وارد کنید';
    try { persistSetup(); } catch (err) { toast(err.message); }
  }
});
app.addEventListener('submit', e => {
  e.preventDefault();
  try {
    if (e.target.id === 'add-name') addNames();
    if (e.target.id === 'setup') {
      if (ui.name.trim()) addNames();
      S.startSession(ui.names, parseMoney(ui.buyIn)); render();
    }
  } catch (err) { const el = document.querySelector('#setup-error'); if (el) el.textContent = err.message; else toast(err.message); }
});
async function action(e) {
  const button = e.target.closest('[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  try {
    if (action === 'tab') { ui.tab = button.dataset.tab; ui.justFinished = false; render(); document.querySelector(`#tab-${ui.tab}`).focus(); }
    if (action === 'remove-name') { const before = [...ui.names]; ui.names.splice(Number(button.dataset.index), 1); try { persistSetup(); } catch (err) { ui.names = before; throw err; } render(); document.querySelector('#player-name').focus(); }
    if (action === 'close') closeModal();
    if (action === 'round') openRound();
    if (action === 'step') {
      const row = button.closest('.round-input'), input = row.querySelector('.loss');
      const p = state.session.players.find(p => p.id === row.dataset.id);
      input.value = moneyInput(stepLoss(input.value, Number(button.dataset.direction), p.stack));
      previewRound(); dialog.querySelector('#modal-error').textContent = '';
    }
    if (action === 'rebuy') {
      const p = state.session.players.find(p => p.id === id);
      openModal('شارژ مجدد', `<p>شارژ ${esc(p.name)}: <b>${money(state.session.buyIn)}</b></p><button class="primary wide" data-action="confirm-rebuy" data-id="${id}">ثبت شارژ</button>`);
    }
    if (action === 'confirm-rebuy') { S.rebuy(id); closeModal(); render(); toast('شارژ ثبت شد'); }
    if (action === 'withdraw') {
      const p = state.session.players.find(p => p.id === id), limit = withdrawalLimit(state.session, p);
      openModal(`برداشت ${esc(p.name)}`, `<form id="withdraw-form" data-id="${id}"><p>حداکثر ${money(limit)}؛ ورودی اولیه در موجودی می‌ماند.</p><label for="withdraw-amount">مبلغ برداشت</label><div class="money-field"><input id="withdraw-amount" inputmode="decimal" autocomplete="off" value="${moneyInput(limit)}" required><span>هزار تومان</span></div><p class="hint">${shortHint}</p><button class="primary wide" type="submit">ثبت برداشت</button></form>`);
    }
    if (action === 'settle') openModal('حساب نهایی', `${result(state.session)}<button class="primary wide" data-action="finish">پایان بازی و ذخیره</button><button class="wide secondary" data-action="close">ادامهٔ بازی</button>`);
    if (action === 'finish') { S.finishSession(); closeModal(); ui.tab = 'history'; ui.justFinished = true; render(); toast('حساب نهایی در تاریخچه ذخیره شد'); }
    if (action === 'install' && installPrompt) { await installPrompt.prompt(); installPrompt = null; document.querySelector('#install').hidden = true; }
  } catch (err) { if (dialog.open) dialog.querySelector('#modal-error').textContent = err.message; else toast(err.message); }
}
app.addEventListener('click', action); dialog.addEventListener('click', action);
app.addEventListener('keydown', e => {
  if (!e.target.matches('[role=tab]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
  e.preventDefault();
  ui.tab = e.key === 'Home' ? 'game' : e.key === 'End' ? 'history' : ui.tab === 'game' ? 'history' : 'game';
  render(); document.querySelector(`#tab-${ui.tab}`).focus();
});
dialog.addEventListener('input', e => { if (e.target.closest('#round-form')) { previewRound(); dialog.querySelector('#modal-error').textContent = ''; } });
dialog.addEventListener('focusin', e => { if (e.target.classList.contains('loss')) e.target.select(); });
dialog.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || !e.target.classList.contains('loss')) return;
  const inputs = [...dialog.querySelectorAll('.loss:not(:disabled)')], next = inputs[inputs.indexOf(e.target) + 1];
  e.preventDefault(); (next || dialog.querySelector('#save-round')).focus();
});
dialog.addEventListener('submit', e => {
  e.preventDefault();
  try {
    if (e.target.id === 'round-form') S.addRound(roundRows());
    if (e.target.id === 'withdraw-form') S.withdraw(e.target.dataset.id, parseMoney(dialog.querySelector('#withdraw-amount').value));
    closeModal(); render(); toast('ثبت شد');
  } catch (err) { dialog.querySelector('#modal-error').textContent = err.message; }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; document.querySelector('#install').hidden = false; });
window.addEventListener('appinstalled', () => { installPrompt = null; document.querySelector('#install').hidden = true; });
window.addEventListener('pagehide', () => { clearTimeout(draftTimer); try { S.persist(); } catch {} });
render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => toast('حالت آفلاین آماده نشد؛ اتصال را بررسی کنید'));

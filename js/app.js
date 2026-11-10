import { STREETS, fmt, parseAmount, turnInfo, potLabel, resolveRound } from './logic.js';
import * as S from './store.js';

const { state } = S;

/* ───────────── وضعیت رابط ───────────── */

const ui = {
  tab: 'game', // game | history | stats
  view: 'main', // main | settle (داخل تب بازی)
  sheet: null, // {type:'buy'|'addp', pid?}
  histId: null,
  sel: {}, // انتخاب برنده‌ها در شوداون
  selKey: null,
  focus: null,
  round: {}, // پیش‌نویس ثبت یک دست: {pid: {v, win}}
};

/* ───────────── ابزارها ───────────── */

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const num = (n) => `<span class="num">${fmt(n)}</span>`;
const signed = (n) => (n === 0 ? `<span class="num mut">${fmt(0)}</span>` : `<span class="num ${n > 0 ? 'pos' : 'neg'}">${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}</span>`);
const toFa = (s) => String(s).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
const dateFa = (t) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(t);
const dateShort = (t) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).format(t);
const unit = () => esc(state.unit);

const ICONS = {
  back: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 010 12h-3"/>',
  share: '<path d="M12 4v11M8 8l4-4 4 4"/><path d="M5 13v6h14v-6"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
  game: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
  history: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
};
const icon = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]}</svg>`;

let toastTimer;
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

const inputVal = (id) => document.getElementById(id)?.value ?? '';
const sess = () => state.session;
const pName = (id) => sess().players.find((p) => p.id === id)?.name ?? '؟';

/* ───────────── نمای تنظیم بازی جدید ───────────── */

function setupView() {
  const d = state.draft;
  const df = state.defaults;
  const chips = d.mode === 'chips';
  const rounds = d.mode === 'rounds';
  const free = state.names.filter((n) => !d.players.some((p) => p.name === n));
  const rows = d.players
    .map(
      (p, i) => `
    <div class="prow">
      <span class="seat-n">${toFa(i + 1)}</span>
      <b class="nm">${esc(p.name)}</b>
      ${rounds ? '' : `<input class="money in-sm" inputmode="numeric" autocomplete="off" data-bind="pBuyIn" data-id="${p.id}" value="${fmt(p.buyIn)}" aria-label="مبلغ خرید ${esc(p.name)}">`}
      ${chips ? `<button class="ib" data-act="dMove" data-id="${p.id}" data-d="-1" aria-label="بالاتر">${icon('up')}</button><button class="ib" data-act="dMove" data-id="${p.id}" data-d="1" aria-label="پایین‌تر">${icon('down')}</button>` : ''}
      <button class="ib" data-act="dRemove" data-id="${p.id}" aria-label="حذف ${esc(p.name)}">${icon('x')}</button>
    </div>`,
    )
    .join('');
  const ok = d.players.length >= 2;
  return `
  <header class="top"><h1>شب پوکر</h1><p class="sub">حساب‌وکتاب بازی حضوری با دوستان</p></header>

  <section class="card">
    <h2>نوع بازی</h2>
    <div class="modes" role="radiogroup">
      ${modeCard('ledger', 'دفترچه حساب', 'خرید و تسویهٔ آخر شب. دست‌ها را روی میز بازی می‌کنید و اپ فقط پول‌ها را حساب می‌کند.')}
      ${modeCard('rounds', 'ثبت دست‌به‌دست', 'بعد از هر دست، ضرر هر نفر را فقط با یک عدد (مضرب ۵) وارد می‌کنید؛ سودِ برنده خودکار حساب می‌شود.')}
      ${modeCard('chips', 'چیپ مجازی', 'شرط‌ها، پات و برندهٔ هر دست را اپ نگه می‌دارد؛ پات فرعی و آل‌این هم حساب می‌شود.')}
    </div>
  </section>

  <section class="card">
    <h2>مبلغ‌ها</h2>
    <div class="fields">
      ${rounds ? `<label class="fld">اعداد مضرب <small>هر عدد مضربی از این باشد</small>
        <input class="money" inputmode="numeric" autocomplete="off" data-bind="dStep" value="${fmt(df.step)}"></label>` : `<label class="fld">خرید پیش‌فرض <small>برای بازیکن‌های تازه</small>
        <input class="money" inputmode="numeric" autocomplete="off" data-bind="dBuyIn" value="${fmt(df.buyIn)}"></label>`}
      <label class="fld">واحد پول
        <input data-bind="unit" autocomplete="off" value="${esc(state.unit)}"></label>
      ${chips ? `
      <label class="fld">اسمال‌بلایند
        <input class="money" inputmode="numeric" autocomplete="off" data-bind="dSb" value="${fmt(df.sb)}"></label>
      <label class="fld">بیگ‌بلایند
        <input class="money" inputmode="numeric" autocomplete="off" data-bind="dBb" value="${fmt(df.bb)}"></label>` : ''}
    </div>
  </section>

  <section class="card">
    <h2>بازیکن‌ها <span class="count">${toFa(d.players.length)}</span></h2>
    ${chips ? '<p class="hint">ترتیب لیست همان ترتیب نشستن دور میز است. نفر اول دیلر می‌شود.</p>' : ''}
    <div class="plist">${rows || '<p class="empty">هنوز کسی اضافه نشده.</p>'}</div>
    <form class="addrow" data-form="dAdd">
      <input id="new-name" placeholder="نام بازیکن" autocomplete="off" enterkeyhint="done" maxlength="24">
      <button class="btn pri" type="submit">${icon('plus')}افزودن</button>
    </form>
    ${free.length ? `<div class="sugg">${free.map((n) => `<button class="tag" data-act="dAddName" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
  </section>

  <button class="btn pri block lg" data-act="start" ${ok ? '' : 'disabled'}>شروع بازی</button>
  ${ok ? '' : '<p class="hint center">حداقل دو بازیکن لازم است.</p>'}`;
}

function modeCard(id, title, text) {
  const on = state.draft.mode === id;
  return `<button class="mode ${on ? 'on' : ''}" role="radio" aria-checked="${on}" data-act="setMode" data-mode="${id}"><b>${title}</b><span>${text}</span></button>`;
}

/* ───────────── نمای دفترچه حساب ───────────── */

function ledgerView() {
  const s = sess();
  const total = S.sum(s.players.map(S.totalIn));
  const cards = s.players
    .map((p) => {
      const list = p.buyIns.length > 1 ? p.buyIns.map((a) => num(a)).join(' <span class="mut">+</span> ') : '<span class="mut">یک خرید</span>';
      return `
      <div class="card pcard">
        <div class="between"><b class="pname">${esc(p.name)}</b><div class="amt">${num(S.totalIn(p))} <small>${unit()}</small></div></div>
        <div class="between sub-row"><span class="buys">${list}</span><button class="btn sm" data-act="openBuy" data-id="${p.id}">${icon('plus')}خرید مجدد</button></div>
      </div>`;
    })
    .join('');
  return `
  <header class="top between">
    <div><h1>دفترچه حساب</h1><p class="sub">${dateFa(s.startedAt)}</p></div>
    <div class="pot"><small>مجموع پول بازی</small><b>${num(total)}</b><small>${unit()}</small></div>
  </header>
  ${cards}
  <div class="stack-btns">
    <button class="btn pri block lg" data-act="openSettle">تسویه حساب پایان شب</button>
    <div class="row2">
      <button class="btn" data-act="openAddP">${icon('plus')}بازیکن جدید</button>
      <button class="btn ghost danger" data-act="discard">لغو بازی</button>
    </div>
  </div>`;
}

/* ───────────── نمای ثبت دست‌به‌دست ───────────── */

function roundsView() {
  const s = sess();
  const n = s.rounds.length;
  const cards = s.players
    .map(
      (p) => `
      <div class="card pcard">
        <div class="between"><b class="pname">${esc(p.name)}</b><div class="amt">${signed(S.roundTotal(s, p))} <small>${unit()}</small></div></div>
      </div>`,
    )
    .join('');
  const list = [...s.rounds]
    .map((r, i) => ({ r, i }))
    .reverse()
    .map(({ r, i }) => {
      const nets = Object.entries(r.nets).filter(([, v]) => v !== 0).sort((a, b) => b[1] - a[1]);
      return `<div class="rrec"><div class="between"><b>دست ${toFa(i + 1)}</b><button class="ib" data-act="delRound" data-id="${r.id}" aria-label="حذف دست ${toFa(i + 1)}">${icon('x')}</button></div>
        <div class="nets">${nets.map(([id, v]) => `<span>${esc(pName(id))} ${signed(v)}</span>`).join('')}</div></div>`;
    })
    .join('');
  return `
  <header class="top">
    <h1>ثبت دست‌به‌دست</h1><p class="sub">${toFa(n)} دست · ${dateFa(s.startedAt)}</p>
  </header>
  <button class="btn pri block lg" data-act="openRound">ثبت دست ${toFa(n + 1)}</button>
  ${cards}
  ${n ? `<section class="card"><h2>دست‌های ثبت‌شده <span class="count">${toFa(n)}</span></h2><div class="hlist">${list}</div></section>` : ''}
  <div class="stack-btns">
    <button class="btn block" data-act="openSettle">تسویه حساب پایان شب</button>
    <div class="row2">
      <button class="btn" data-act="openAddP">${icon('plus')}بازیکن جدید</button>
      <button class="btn ghost danger" data-act="discard">لغو بازی</button>
    </div>
  </div>`;
}

/** ردیف‌های پیش‌نویس دست فعلی → ورودی resolveRound */
function roundRows() {
  return sess().players.map((p) => {
    const d = ui.round[p.id] || {};
    return { id: p.id, amount: d.v ? parseAmount(d.v) : null, win: !!d.win };
  });
}

function roundDyn() {
  const s = sess();
  const r = resolveRound(roundRows(), s.step || 5);
  const gain = r.win + Object.values(r.auto).reduce((a, b) => a + b, 0);
  return `
  <section class="card check ${r.error ? 'bad' : 'ok'}">
    <div class="between"><span>جمع ضررها</span>${num(r.loss)}</div>
    <div class="between"><span>جمع سودها</span>${num(gain)}</div>
    <p class="msg">${r.error || 'حساب دست می‌خواند.'}</p>
  </section>
  <button class="btn pri block" data-act="doRound" ${r.error ? 'disabled' : ''}>ثبت دست ${toFa(s.rounds.length + 1)}</button>`;
}

function refreshRound() {
  const s = sess();
  if (!s || ui.sheet?.type !== 'round') return;
  const r = resolveRound(roundRows(), s.step || 5);
  for (const p of s.players) {
    const el = document.querySelector(`[data-bind="rv"][data-id="${p.id}"]`);
    if (el && ui.round[p.id]?.win) el.placeholder = r.auto[p.id] ? fmt(r.auto[p.id]) : 'خودکار';
  }
  const dyn = document.getElementById('round-dyn');
  if (dyn) dyn.innerHTML = roundDyn();
}

/* ───────────── نمای چیپ مجازی: بین دست‌ها ───────────── */

function chipsView() {
  const s = sess();
  const total = S.sum(s.players.map(S.totalIn));
  const part = S.participants(s);
  const did = S.nextDealerId(s);
  const last = s.lastResult
    ? `<div class="banner"><b>نتیجهٔ دست ${toFa(s.lastResult.hand)}</b><div class="res">${s.lastResult.lines.map((l) => `<span>${esc(l.name)} ${signed(l.net)}</span>`).join('')}</div></div>`
    : '';
  const rows = s.players
    .map((p) => {
      const badges = [
        p.id === did ? '<span class="badge d" title="دیلر">D</span>' : '',
        p.out ? '<span class="badge">غایب</span>' : p.stack === 0 ? '<span class="badge bad">بدون چیپ</span>' : '',
      ].join('');
      return `
      <div class="card pcard ${p.out || p.stack === 0 ? 'dim' : ''}">
        <div class="between"><span class="who"><b class="pname">${esc(p.name)}</b>${badges}</span><div class="amt">${num(p.stack)} <small>${unit()}</small></div></div>
        <div class="between sub-row">
          <span class="buys mut">${p.buyIns.length > 1 ? `${toFa(p.buyIns.length)} خرید · جمع ${fmt(S.totalIn(p))}` : `خرید ${fmt(S.totalIn(p))}`}</span>
          <span class="btns">
            ${p.id !== did && !p.out && p.stack > 0 ? `<button class="btn sm ghost" data-act="setDealer" data-id="${p.id}">دیلر شود</button>` : ''}
            <button class="btn sm ghost" data-act="toggleOut" data-id="${p.id}">${p.out ? 'برگشت' : 'غایب'}</button>
            <button class="btn sm" data-act="openBuy" data-id="${p.id}">${icon('plus')}خرید</button>
          </span>
        </div>
      </div>`;
    })
    .join('');
  return `
  <header class="top between">
    <div><h1>چیپ مجازی</h1><p class="sub">دست ${toFa(s.handsPlayed + 1)} · ${dateFa(s.startedAt)}</p></div>
    <div class="pot"><small>مجموع پول بازی</small><b>${num(total)}</b><small>${unit()}</small></div>
  </header>
  ${last}
  <section class="card blinds">
    <label class="fld">اسمال‌بلایند<input class="money" inputmode="numeric" autocomplete="off" data-bind="sSb" value="${fmt(s.sb)}"></label>
    <label class="fld">بیگ‌بلایند<input class="money" inputmode="numeric" autocomplete="off" data-bind="sBb" value="${fmt(s.bb)}"></label>
  </section>
  ${rows}
  <div class="stack-btns">
    <button class="btn pri block lg" data-act="beginHand" ${part.length >= 2 ? '' : 'disabled'}>شروع دست ${toFa(s.handsPlayed + 1)}</button>
    ${part.length >= 2 ? '' : '<p class="hint center">حداقل دو نفر با چیپ لازم است.</p>'}
    ${(s.handLog || []).length ? `<button class="btn block" data-act="openHands">دست‌های امشب (${toFa(s.handLog.length)})</button>` : ''}
    <button class="btn block" data-act="openSettle">تسویه حساب پایان شب</button>
    <div class="row2">
      <button class="btn" data-act="openAddP">${icon('plus')}بازیکن جدید</button>
      <button class="btn ghost danger" data-act="discard">لغو بازی</button>
    </div>
  </div>`;
}

/* ───────────── نمای یک دست ───────────── */

const VERB = { fold: 'فولد کرد', check: 'چک کرد', call: 'کال کرد', raise: 'رِیز کرد به' };

function logLine(e, h) {
  const v = VERB[e.type];
  const amt = e.type === 'call' || e.type === 'raise' ? ` ${fmt(e.amount)}` : '';
  return `${esc(pName(e.id))} ${v}${amt}${e.allIn ? ' (آل‌این)' : ''}`;
}

function handView() {
  const s = sess();
  const h = s.hand;
  const pot = S.sum(h.seats.map((x) => x.committed));
  const t = turnInfo(h);
  const phaseTitle = h.phase === 'showdown' ? 'شوداون' : h.phase === 'done' ? 'پایان دست' : STREETS[h.street];
  const seats = h.seats
    .map((x, i) => {
      const badges = [
        i === h.dealer ? '<span class="badge d" title="دیلر">D</span>' : '',
        i === h.sbIdx ? '<span class="badge">SB</span>' : '',
        i === h.bbIdx ? '<span class="badge">BB</span>' : '',
        x.folded ? '<span class="badge dimb">فولد</span>' : '',
        x.allIn && !x.folded ? '<span class="badge gold">آل‌این</span>' : '',
      ].join('');
      const net = h.result ? h.result.net[i].net : null;
      return `
      <div class="seat ${t && t.idx === i ? 'turn' : ''} ${x.folded ? 'folded' : ''}">
        <span class="who"><b class="pname">${esc(pName(x.id))}</b>${badges}</span>
        <span class="bet">${net != null ? signed(net) : x.bet ? `<small>شرط</small> ${num(x.bet)}` : ''}</span>
        <span class="stk">${num(x.stack)}</span>
      </div>`;
    })
    .join('');
  const recent = h.log.slice(-2).map((e) => `<div>${logLine(e, h)}</div>`).join('');

  let panel = '';
  if (h.phase === 'betting') panel = bettingPanel(h, t);
  else if (h.phase === 'showdown') panel = showdownPanel(h);
  else panel = donePanel(h);

  return `
  <header class="hand-top">
    <div><span class="street">${phaseTitle}</span><span class="sub">دست ${toFa(s.handsPlayed + 1)} · بلایند ${fmt(h.sb)}/${fmt(h.bb)}</span></div>
    <div class="pot"><small>پات</small><b>${num(pot)}</b></div>
  </header>
  <div class="seats">${seats}</div>
  <div class="log" aria-live="polite">${recent}<button class="linkbtn" data-act="openHands">همهٔ اقدام‌ها و دست‌های قبلی</button></div>
  ${panel}`;
}

function bettingPanel(h, t) {
  const s = sess();
  const name = pName(t.seat.id);
  const raiseBtn = t.canRaise
    ? `<div class="raise">
        <div class="stepper">
          <button class="ib sq" data-act="rstep" data-d="-1" aria-label="کم کردن">−</button>
          <input id="raise-amt" class="money" inputmode="numeric" autocomplete="off" value="${fmt(t.minTo)}" aria-label="مبلغ رِیز">
          <button class="ib sq" data-act="rstep" data-d="1" aria-label="زیاد کردن">+</button>
        </div>
        <div class="quick">
          <button class="tag" data-act="quick" data-k="min">حداقل</button>
          <button class="tag" data-act="quick" data-k="half">½ پات</button>
          <button class="tag" data-act="quick" data-k="pot">پات</button>
          <button class="tag gold" data-act="quick" data-k="max">آل‌این</button>
        </div>
        <button class="btn gold block" data-act="raise">${h.currentBet ? 'رِیز' : 'شرط'}</button>
      </div>`
    : '';
  return `
  <div class="panel">
    <div class="turn-line"><span>نوبت <b>${esc(name)}</b></span><span class="mut">موجودی ${num(t.seat.stack)}${t.toCall ? ` · برای کال ${num(t.toCall)}` : ''}</span></div>
    <div class="row2">
      ${t.canCheck ? '<button class="btn block" data-act="check">چک</button>' : `<button class="btn danger" data-act="fold">فولد</button><button class="btn pri" data-act="call">کال ${fmt(t.toCall)}${t.toCall >= t.seat.stack ? ' (آل‌این)' : ''}</button>`}
    </div>
    ${raiseBtn}
    <div class="row2 foot">
      <button class="btn sm ghost" data-act="undo" ${s.handUndo.length ? '' : 'disabled'}>${icon('undo')}برگرد</button>
      <button class="btn sm ghost danger" data-act="cancelHand">لغو دست</button>
    </div>
  </div>`;
}

function showdownPanel(h) {
  const s = sess();
  const key = `${s.handsPlayed}:${h.log.length}`;
  if (ui.selKey !== key) {
    ui.selKey = key;
    ui.sel = {};
  }
  const cards = h.pots
    .map((p, k) => {
      if (p.eligible.length === 1) {
        return `<div class="potcard info"><div class="between"><span>${potLabel(h, k)}</span>${num(p.amount)}</div><div class="mut">${esc(pName(h.seats[p.eligible[0]].id))}</div></div>`;
      }
      const picks = p.eligible
        .map((i) => `<button class="pick ${(ui.sel[k] || []).includes(i) ? 'on' : ''}" data-act="pick" data-k="${k}" data-i="${i}" aria-pressed="${(ui.sel[k] || []).includes(i)}">${esc(pName(h.seats[i].id))}</button>`)
        .join('');
      return `<div class="potcard"><div class="between"><b>${potLabel(h, k)}</b><span class="gold">${num(p.amount)}</span></div><div class="picks">${picks}</div></div>`;
    })
    .join('');
  const ready = h.pots.every((p, k) => p.eligible.length === 1 || (ui.sel[k] || []).length);
  return `
  <div class="panel">
    <h3>برندهٔ هر پات کیست؟</h3>
    <p class="hint">اگر چند نفر مساوی شدند، همه را انتخاب کنید تا پات مساوی تقسیم شود.</p>
    ${cards}
    <button class="btn pri block" data-act="confirmWin" ${ready ? '' : 'disabled'}>ثبت برنده‌ها</button>
    <div class="row2 foot">
      <button class="btn sm ghost" data-act="undo" ${s.handUndo.length ? '' : 'disabled'}>${icon('undo')}برگرد</button>
      <button class="btn sm ghost danger" data-act="cancelHand">لغو دست</button>
    </div>
  </div>`;
}

function donePanel(h) {
  const s = sess();
  const winners = h.result.pots.map((p) => `<div>${p.winners.map((w) => `<b>${esc(pName(h.seats[w.idx].id))}</b> ${num(w.amount)}`).join(' · ')}</div>`).join('');
  return `
  <div class="panel">
    <h3>نتیجهٔ دست</h3>
    <div class="winners">${winners}</div>
    <button class="btn pri block" data-act="nextHand">ثبت نتیجه و دستِ بعد</button>
    <div class="row2 foot">
      <button class="btn sm ghost" data-act="undo" ${s.handUndo.length ? '' : 'disabled'}>${icon('undo')}برگرد و اصلاح</button>
    </div>
  </div>`;
}

/* ───────────── نمای تسویه ───────────── */

function settleView() {
  const s = sess();
  const c = S.computeSettlement(s);
  const rounds = s.mode === 'rounds';
  const chips = s.mode !== 'ledger';
  const rows = c.rows
    .map((r) => {
      const fin = rounds
        ? ''
        : chips
        ? `<b class="num">${fmt(r.fin)}</b>`
        : `<input class="money in-sm" inputmode="numeric" autocomplete="off" placeholder="مبلغ پایان" data-bind="final" data-id="${r.p.id}" value="${r.fin == null ? '' : fmt(r.fin)}" aria-label="مبلغ پایانی ${esc(r.p.name)}">`;
      return `
      <div class="srow">
        <div class="nm"><b>${esc(r.p.name)}</b>${rounds ? '' : `<small class="mut">ورودی ${fmt(r.inn)}</small>`}</div>
        <div class="fin">${fin}</div>
        <div class="net" data-net="${r.p.id}">${r.net == null ? '' : signed(r.net)}</div>
      </div>`;
    })
    .join('');
  return `
  <header class="top">
    <button class="back" data-act="closeSettle">${icon('back')}بازگشت به بازی</button>
    <h1>تسویه حساب</h1>
    <p class="sub">${rounds ? 'سود و زیان هر نفر از جمع دست‌های ثبت‌شده به‌دست آمده.' : chips ? 'موجودی چیپ هر نفر به‌طور خودکار پایان حساب اوست.' : 'مبلغ پایانی هر نفر را وارد کنید (پولی که آخر شب مال اوست).'}</p>
  </header>
  <section class="card">
    <div class="shead"><span>بازیکن</span><span>${rounds ? '' : chips ? 'موجودی' : 'پایان'}</span><span>سود / زیان</span></div>
    ${rows}
  </section>
  <div id="settle-dyn">${settleDyn(c)}</div>`;
}

function settleDyn(c) {
  const s = sess();
  const rounds = s.mode === 'rounds';
  const chips = s.mode !== 'ledger';
  let msg;
  let cls = 'bad';
  let extra = '';
  if (c.missing.length) {
    msg = `مبلغ پایانی ${toFa(c.missing.length)} نفر هنوز وارد نشده.`;
    if (c.missing.length === 1 && !chips) {
      const rest = c.totalIn - c.totalFin;
      if (rest >= 0) extra = `<button class="btn sm" data-act="fillRest" data-id="${c.missing[0].p.id}">باقی‌مانده برای ${esc(c.missing[0].p.name)}: ${fmt(rest)}</button>`;
    }
  } else if (c.diff !== 0) {
    msg = `جمع پایان ${fmt(Math.abs(c.diff))} ${esc(state.unit)} ${c.diff > 0 ? 'بیشتر' : 'کمتر'} از جمع ورودی‌هاست. دوباره بشمارید.`;
  } else {
    msg = 'حساب‌ها می‌خوانند.';
    cls = 'ok';
  }
  const tr = c.balanced
    ? c.transfers.length
      ? c.transfers.map((t) => `<div class="trow"><span class="tx"><b>${esc(pName(t.from))}</b><span class="arr">←</span><b>${esc(pName(t.to))}</b></span>${num(t.amount)}</div>`).join('')
      : '<p class="empty">همه صفر شدند؛ کسی به کسی بدهکار نیست.</p>'
    : '';
  return `
  <section class="card check ${cls}">
    ${rounds ? '' : `<div class="between"><span>جمع ورودی‌ها</span>${num(c.totalIn)}</div>
    <div class="between"><span>جمع پایان</span>${num(c.totalFin)}</div>`}
    <p class="msg">${msg}</p>${extra}
  </section>
  ${c.balanced ? `<section class="card"><h2>چه کسی به چه کسی بدهد <span class="count">${toFa(c.transfers.length)}</span></h2>${tr}</section>` : ''}
  <div class="stack-btns">
    <button class="btn pri block lg" data-act="finish" ${c.balanced ? '' : 'disabled'}>ثبت در تاریخچه و پایان شب</button>
    ${c.balanced ? `<button class="btn block" data-act="shareNow">${icon('share')}اشتراک‌گذاری نتیجه</button>` : ''}
  </div>`;
}

function refreshSettle() {
  const s = sess();
  if (!s || ui.view !== 'settle') return;
  const c = S.computeSettlement(s);
  for (const r of c.rows) {
    const el = document.querySelector(`[data-net="${r.p.id}"]`);
    if (el) el.innerHTML = r.net == null ? '' : signed(r.net);
  }
  const dyn = document.getElementById('settle-dyn');
  if (dyn) dyn.innerHTML = settleDyn(c);
}

/* ───────────── متن اشتراک‌گذاری ───────────── */

function shareText({ date, players, transfers, unitLabel }) {
  const lines = [`شب پوکر · ${dateShort(date)}`, ''];
  for (const p of [...players].sort((a, b) => b.net - a.net)) lines.push(`${p.name}: ${p.net > 0 ? '+' : p.net < 0 ? '−' : ''}${fmt(Math.abs(p.net))}`);
  if (transfers.length) {
    lines.push('', 'تسویه:');
    for (const t of transfers) lines.push(`${t.from} ← ${t.to}: ${fmt(t.amount)}`);
  }
  lines.push('', `(${unitLabel})`);
  return toFa(lines.join('\n'));
}

async function shareOut(text) {
  try {
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
  } catch (e) {
    if (e && e.name === 'AbortError') return;
  }
  try {
    await navigator.clipboard.writeText(text);
    toast('متن کپی شد');
  } catch (e) {
    window.prompt('این متن را کپی کنید:', text);
  }
}

/* ───────────── تاریخچه و آمار ───────────── */

const modeName = (m) => (m === 'chips' ? 'چیپ مجازی' : m === 'rounds' ? 'ثبت دست‌به‌دست' : 'دفترچه حساب');

function historyView() {
  if (ui.histId) return histDetailView();
  const list = state.history
    .map((h) => {
      const top = [...h.players].sort((a, b) => b.net - a.net)[0];
      const open = h.transfers.filter((t) => !t.paid).length;
      return `
      <button class="card hitem" data-act="openHist" data-id="${h.id}">
        <div class="between"><b>${dateFa(h.date)}</b><span class="mut">${toFa(h.players.length)} نفر</span></div>
        <div class="between sub-row"><span class="mut">${modeName(h.mode)}${h.hands ? ` · ${toFa(h.hands)} دست` : ''}</span>
          <span>${top ? `برنده: <b>${esc(top.name)}</b> ${signed(top.net)}` : ''}</span></div>
        ${open ? `<div class="chip-open">${toFa(open)} بدهی تسویه‌نشده</div>` : ''}
      </button>`;
    })
    .join('');
  return `
  <header class="top"><h1>تاریخچه</h1><p class="sub">شب‌های ثبت‌شده</p></header>
  ${list || '<p class="empty big">هنوز شبی ثبت نشده. بعد از «پایان شب» اینجا می‌آید.</p>'}`;
}

function histDetailView() {
  const h = state.history.find((x) => x.id === ui.histId);
  if (!h) {
    ui.histId = null;
    return historyView();
  }
  const rows = [...h.players]
    .sort((a, b) => b.net - a.net)
    .map((p) => `<div class="srow"><div class="nm"><b>${esc(p.name)}</b>${h.mode === 'rounds' ? '' : `<small class="mut">ورودی ${fmt(p.buyIn)}</small>`}</div><div class="fin">${h.mode === 'rounds' ? '' : `<b class="num">${fmt(p.final)}</b>`}</div><div class="net">${signed(p.net)}</div></div>`)
    .join('');
  const tr = h.transfers
    .map(
      (t, i) => `
    <label class="trow ${t.paid ? 'paid' : ''}">
      <input type="checkbox" class="chk" data-act="paid" data-id="${h.id}" data-i="${i}" ${t.paid ? 'checked' : ''}>
      <span class="tx"><b>${esc(t.from)}</b><span class="arr">←</span><b>${esc(t.to)}</b></span>${num(t.amount)}
    </label>`,
    )
    .join('');
  return `
  <header class="top">
    <button class="back" data-act="closeHist">${icon('back')}تاریخچه</button>
    <h1>${dateFa(h.date)}</h1>
    <p class="sub">${modeName(h.mode)}${h.hands ? ` · ${toFa(h.hands)} دست` : ''} · واحد: ${esc(h.unit)}</p>
  </header>
  <section class="card"><div class="shead"><span>بازیکن</span><span>پایان</span><span>سود / زیان</span></div>${rows}</section>
  <section class="card"><h2>تسویه <span class="count">${toFa(h.transfers.length)}</span></h2>
    ${tr || '<p class="empty">بدهی‌ای نیست.</p>'}
    ${h.transfers.length ? '<p class="hint">وقتی پرداخت شد، تیک بزنید.</p>' : ''}
  </section>
  ${(h.rounds || []).length ? `<section class="card"><h2>دست‌ها <span class="count">${toFa(h.rounds.length)}</span></h2><div class="hlist">${[...h.rounds].reverse().map((r) => `<div class="rrec"><b>دست ${toFa(r.n)}</b><div class="nets">${[...r.nets].sort((a, b) => b.net - a.net).map((x) => `<span>${esc(x.name)} ${signed(x.net)}</span>`).join('')}</div></div>`).join('')}</div></section>` : ''}
  ${(h.handLog || []).length ? `<section class="card"><h2>دست‌ها <span class="count">${toFa(h.handLog.length)}</span></h2><div class="hlist">${[...h.handLog].reverse().map((r) => handRecHtml(r)).join('')}</div></section>` : ''}
  <div class="stack-btns">
    <button class="btn block" data-act="shareHist" data-id="${h.id}">${icon('share')}اشتراک‌گذاری</button>
    <button class="btn block ghost danger" data-act="delHist" data-id="${h.id}">${icon('trash')}حذف این شب</button>
  </div>`;
}

function statsView() {
  const lb = S.leaderboard();
  const rows = lb
    .map(
      (r, i) => `
    <div class="srow">
      <div class="nm"><b>${toFa(i + 1)}. ${esc(r.name)}</b><small class="mut">${toFa(r.nights)} شب · بهترین ${r.best > 0 ? '+' : ''}${fmt(r.best)}</small></div>
      <div class="fin"></div>
      <div class="net">${signed(r.net)}</div>
    </div>`,
    )
    .join('');
  const debts = [];
  state.history.forEach((h) => h.transfers.forEach((t, i) => !t.paid && debts.push({ h, t, i })));
  const dl = debts
    .map(
      ({ h, t, i }) => `
    <label class="trow">
      <input type="checkbox" class="chk" data-act="paid" data-id="${h.id}" data-i="${i}">
      <span class="tx"><b>${esc(t.from)}</b><span class="arr">←</span><b>${esc(t.to)}</b><small class="mut">${dateShort(h.date)}</small></span>${num(t.amount)}
    </label>`,
    )
    .join('');
  return `
  <header class="top"><h1>آمار</h1><p class="sub">جمع سود و زیان همهٔ شب‌ها</p></header>
  <section class="card"><h2>جدول کلی</h2>${rows || '<p class="empty">بعد از اولین شب پر می‌شود.</p>'}</section>
  <section class="card"><h2>بدهی‌های تسویه‌نشده <span class="count">${toFa(debts.length)}</span></h2>${dl || '<p class="empty">بدهی بازی نیست.</p>'}</section>
  <section class="card"><h2>پشتیبان‌گیری</h2>
    <p class="hint">اطلاعات فقط روی همین گوشی ذخیره می‌شود. گاهی فایل پشتیبان بگیرید.</p>
    <div class="row2"><button class="btn" data-act="exportData">دریافت پشتیبان</button><button class="btn" data-act="importData">بازیابی از فایل</button></div>
    <input id="import-file" type="file" accept="application/json,.json" hidden>
  </section>`;
}

/* ───────────── تاریخچهٔ دست‌ها ───────────── */

const ACT_FA = { fold: 'فولد', check: 'چک', call: 'کال', raise: 'رِیز به' };

function handRecHtml(r, open = false) {
  const streets = [0, 1, 2, 3]
    .map((st) => {
      const list = r.actions.filter((a) => a.street === st);
      if (!list.length) return '';
      let betMade = false;
      const rows = list
        .map((a) => {
          let label = ACT_FA[a.type];
          if (a.type === 'raise' && st > 0 && !betMade) label = 'شرط';
          if (a.type === 'raise') betMade = true;
          const amt = a.type === 'call' || a.type === 'raise' ? num(a.amount) : '';
          return `<div class="act"><b>${esc(a.name)}</b><span class="${a.type === 'fold' ? 'neg' : ''}">${label}${a.allIn ? ' <span class="badge gold">آل‌این</span>' : ''}</span><span>${amt}</span></div>`;
        })
        .join('');
      return `<div class="hst"><h5>${STREETS[st]}</h5>${rows}</div>`;
    })
    .join('');
  const nets = r.done ? r.players.map((p) => ({ name: p.name, net: p.end - p.start })).filter((x) => x.net !== 0).sort((a, b) => b.net - a.net) : [];
  const potsHtml = r.pots
    ? r.pots
        .map((p, k) => `<div class="act"><span class="mut">${r.pots.length > 1 ? (k === 0 ? 'پات اصلی' : `پات فرعی ${toFa(k)}`) : 'پات'} ${num(p.amount)}</span><b class="pos">${p.winners.map((w) => `${esc(w.name)} ${fmt(w.amount)}`).join('، ')}</b><span></span></div>`)
        .join('')
    : '<p class="hint">این دست هنوز تمام نشده.</p>';
  const winners = r.pots ? [...new Set(r.pots.flatMap((p) => p.winners.map((w) => w.name)))].join('، ') : 'در جریان';
  return `
  <details class="hrec" ${open ? 'open' : ''}>
    <summary><b>دست ${toFa(r.n)}</b><span class="mut">پات ${num(r.pot)}</span><span class="win">${esc(winners)}</span></summary>
    <div class="hbody">
      <div class="hmeta">دیلر <b>${esc(r.dealer)}</b> · SB <b>${esc(r.sbName)}</b> ${num(r.sbAmt)} · BB <b>${esc(r.bbName)}</b> ${num(r.bbAmt)}</div>
      ${streets || '<p class="hint">هنوز اقدامی ثبت نشده.</p>'}
      <div class="hst res"><h5>نتیجه</h5>${potsHtml}
        ${nets.length ? `<div class="nets">${nets.map((x) => `<span>${esc(x.name)} ${signed(x.net)}</span>`).join('')}</div>` : ''}
      </div>
    </div>
  </details>`;
}

/* ───────────── برگه‌ی پایین (خرید / بازیکن جدید) ───────────── */

function sheetHtml() {
  const sh = ui.sheet;
  if (!sh) return '';
  const s = sess();
  if (sh.type === 'buy') {
    const p = s.players.find((x) => x.id === sh.pid);
    if (!p) return '';
    const df = p.buyIns[p.buyIns.length - 1] || state.defaults.buyIn;
    const q = [...new Set([Math.round(df / 2), df, df * 2].filter((v) => v > 0))];
    const hist =
      p.buyIns.length > 1
        ? `<div class="hist"><h4>خریدهای ${esc(p.name)}</h4>${p.buyIns.map((a, i) => `<div class="line"><span>خرید ${toFa(i + 1)}</span>${num(a)}<button class="ib" data-act="delBuy" data-id="${p.id}" data-i="${i}" aria-label="حذف این خرید">${icon('x')}</button></div>`).join('')}</div>`
        : '';
    return `<div class="scrim" data-act="closeSheet"></div>
    <div class="sheet" role="dialog" aria-label="خرید مجدد">
      <div class="grab"></div>
      <h3>خرید مجدد · ${esc(p.name)}</h3>
      <label class="fld">مبلغ (${unit()})<input id="sheet-amt" class="money" inputmode="numeric" autocomplete="off" value="${fmt(df)}"></label>
      <div class="quick">${q.map((v) => `<button class="tag" data-act="fillAmt" data-v="${v}">${fmt(v)}</button>`).join('')}</div>
      <button class="btn pri block" data-act="doBuy" data-id="${p.id}">ثبت خرید</button>
      ${hist}
    </div>`;
  }
  if (sh.type === 'round') {
    const r = resolveRound(roundRows(), s.step || 5);
    const rows = s.players
      .map((p, i) => {
        const d = ui.round[p.id] || {};
        const ph = d.win ? (r.auto[p.id] ? fmt(r.auto[p.id]) : 'خودکار') : '۰';
        return `<div class="rrow ${d.win ? 'win' : ''}">
          <b class="pname">${esc(p.name)}</b>
          <button type="button" class="sgn ${d.win ? 'win' : 'loss'}" data-act="rToggle" data-id="${p.id}" aria-pressed="${!!d.win}">${d.win ? 'برنده' : 'ضرر'}</button>
          <input ${i === 0 ? 'id="sheet-amt"' : ''} class="money in-sm" inputmode="numeric" autocomplete="off" data-bind="rv" data-id="${p.id}" placeholder="${ph}" value="${d.v ? fmt(parseAmount(d.v)) : ''}" aria-label="${d.win ? 'سود' : 'ضرر'} ${esc(p.name)}">
        </div>`;
      })
      .join('');
    return `<div class="scrim" data-act="closeSheet"></div>
    <div class="sheet tall" role="dialog" aria-label="ثبت دست">
      <div class="grab"></div>
      <div class="between"><h3>ثبت دست ${toFa(s.rounds.length + 1)}</h3><button class="ib" data-act="closeSheet" aria-label="بستن">${icon('x')}</button></div>
      <p class="hint">ضرر هر نفر را بنویسید (مضرب ${toFa(s.step || 5)}). روی دکمهٔ نفر برنده بزنید تا «برنده» شود؛ اگر عددش را خالی بگذارید، سودش خودکار حساب می‌شود.</p>
      <div class="rlist">${rows}</div>
      <div id="round-dyn">${roundDyn()}</div>
    </div>`;
  }
  if (sh.type === 'hands') {
    const cur = s.hand ? S.buildHandRecord(s, s.hand, s.handsPlayed + 1) : null;
    const past = [...(s.handLog || [])].reverse();
    return `<div class="scrim" data-act="closeSheet"></div>
    <div class="sheet tall" role="dialog" aria-label="دست‌های امشب">
      <div class="grab"></div>
      <div class="between"><h3>دست‌های امشب</h3><button class="ib" data-act="closeSheet" aria-label="بستن">${icon('x')}</button></div>
      <div class="hlist">${cur ? handRecHtml(cur, true) : ''}${past.map((r) => handRecHtml(r)).join('') || (cur ? '' : '<p class="empty">هنوز دستی تمام نشده.</p>')}</div>
    </div>`;
  }
  if (sh.type === 'addp') {
    const free = state.names.filter((n) => !s.players.some((p) => p.name === n));
    return `<div class="scrim" data-act="closeSheet"></div>
    <div class="sheet" role="dialog" aria-label="بازیکن جدید">
      <div class="grab"></div>
      <h3>بازیکن جدید</h3>
      <form data-form="addP">
        <label class="fld">نام<input id="sheet-name" autocomplete="off" maxlength="24" enterkeyhint="next"></label>
        ${free.length ? `<div class="sugg">${free.map((n) => `<button type="button" class="tag" data-act="fillName" data-name="${esc(n)}">${esc(n)}</button>`).join('')}</div>` : ''}
        ${s.mode === 'rounds' ? '' : `<label class="fld">مبلغ خرید (${unit()})<input id="sheet-amt" class="money" inputmode="numeric" autocomplete="off" value="${fmt(state.defaults.buyIn)}"></label>`}
        <button class="btn pri block" type="submit">اضافه کن</button>
      </form>
    </div>`;
  }
  return '';
}

/* ───────────── رندر اصلی ───────────── */

function render() {
  const app = document.getElementById('app');
  const s = sess();
  let html;
  let inHand = false;
  if (ui.tab === 'game') {
    if (!s) html = setupView();
    else if (ui.view === 'settle') html = settleView();
    else if (s.mode === 'rounds') html = roundsView();
    else if (s.mode === 'chips') {
      if (s.hand) {
        html = handView();
        inHand = true;
      } else html = chipsView();
    } else html = ledgerView();
  } else if (ui.tab === 'history') html = historyView();
  else html = statsView();

  app.innerHTML = html + sheetHtml();
  app.classList.toggle('in-hand', inHand);
  renderNav(inHand);

  if (ui.focus) {
    const el = document.querySelector(ui.focus);
    if (el) el.focus();
    ui.focus = null;
  } else if (ui.sheet) {
    const el = document.getElementById(ui.sheet.type === 'addp' ? 'sheet-name' : 'sheet-amt');
    if (el) {
      el.focus();
      if (el.select) el.select();
    }
  }
  keepAwake();
}

function renderNav(hidden) {
  const nav = document.getElementById('nav');
  nav.hidden = hidden;
  const tabs = [
    ['game', 'بازی', 'game'],
    ['history', 'تاریخچه', 'history'],
    ['stats', 'آمار', 'stats'],
  ];
  nav.innerHTML = tabs.map(([id, label, ic]) => `<button class="${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon(ic)}<span>${label}</span></button>`).join('');
}

/* ───────────── روشن ماندن صفحه حین بازی ───────────── */

let wake = null;
async function keepAwake() {
  try {
    if (sess() && 'wakeLock' in navigator && !wake) {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => (wake = null));
    } else if (!sess() && wake) {
      await wake.release();
      wake = null;
    }
  } catch (e) {
    wake = null;
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

/* ───────────── اقدام‌ها ───────────── */

const top = () => window.scrollTo(0, 0);
const fail = (err) => {
  if (err) toast(err);
  return !!err;
};

const actions = {
  tab(d) {
    ui.tab = d.tab;
    ui.histId = null;
    ui.sheet = null;
    render();
    top();
  },

  /* بازی جدید */
  setMode(d) {
    state.draft.mode = d.mode;
    S.save();
    render();
  },
  dAddName(d) {
    if (fail(S.draftAdd(d.name))) return;
    ui.focus = null;
    render();
  },
  dMove(d) {
    S.draftMove(d.id, +d.d);
    render();
  },
  dRemove(d) {
    S.draftRemove(d.id);
    render();
  },
  start() {
    if (fail(S.startSession())) return;
    ui.view = 'main';
    render();
    top();
  },
  discard() {
    if (!confirm('این بازی لغو شود؟ همهٔ اطلاعات این شب پاک می‌شود.')) return;
    S.discardSession();
    ui.view = 'main';
    render();
    top();
  },

  /* خرید و بازیکن */
  openBuy(d) {
    ui.sheet = { type: 'buy', pid: d.id };
    render();
  },
  openAddP() {
    ui.sheet = { type: 'addp' };
    render();
  },
  openRound() {
    ui.round = {};
    ui.sheet = { type: 'round' };
    render();
  },
  rToggle(d) {
    const cur = ui.round[d.id] || {};
    ui.round[d.id] = { ...cur, win: !cur.win };
    render();
  },
  doRound() {
    if (fail(S.addRound(roundRows()))) return;
    ui.sheet = null;
    ui.round = {};
    render();
    toast('دست ثبت شد');
  },
  delRound(d) {
    if (!confirm('این دست حذف شود؟')) return;
    S.deleteRound(d.id);
    render();
  },
  openHands() {
    ui.sheet = { type: 'hands' };
    render();
  },
  closeSheet() {
    ui.sheet = null;
    render();
  },
  fillAmt(d) {
    const el = document.getElementById('sheet-amt');
    el.value = fmt(+d.v);
    el.focus();
  },
  fillName(d) {
    document.getElementById('sheet-name').value = d.name;
    document.getElementById('sheet-amt')?.focus();
  },
  doBuy(d) {
    if (fail(S.addBuyIn(d.id, parseAmount(inputVal('sheet-amt'))))) return;
    ui.sheet = null;
    render();
    toast('خرید ثبت شد');
  },
  delBuy(d) {
    if (fail(S.removeBuyIn(d.id, +d.i))) return;
    render();
  },
  toggleOut(d) {
    S.toggleOut(d.id);
    render();
  },
  setDealer(d) {
    sess().nextDealerId = d.id;
    S.save();
    render();
  },

  /* دست */
  beginHand() {
    if (fail(S.beginHand())) return;
    render();
    top();
  },
  fold: () => act({ type: 'fold' }),
  check: () => act({ type: 'check' }),
  call: () => act({ type: 'call' }),
  quick(d) {
    const h = sess().hand;
    const t = turnInfo(h);
    const toCall = h.currentBet - t.seat.bet;
    let v;
    if (d.k === 'min') v = t.minTo;
    else if (d.k === 'max') v = t.maxTo;
    else {
      v = h.currentBet + Math.round((t.pot + toCall) * (d.k === 'half' ? 0.5 : 1));
      if (h.sb > 0) v = Math.round(v / h.sb) * h.sb;
    }
    document.getElementById('raise-amt').value = fmt(Math.min(t.maxTo, Math.max(t.minTo, v)));
  },
  rstep(d) {
    const h = sess().hand;
    const t = turnInfo(h);
    const el = document.getElementById('raise-amt');
    const cur = parseAmount(el.value) || t.minTo;
    el.value = fmt(Math.min(t.maxTo, Math.max(t.minTo, cur + +d.d * h.bb)));
  },
  raise() {
    const h = sess().hand;
    const t = turnInfo(h);
    const v = parseAmount(inputVal('raise-amt'));
    if (v >= t.maxTo) return act({ type: 'allin' });
    if (v < t.minTo) return toast(`حداقل ${fmt(t.minTo)} لازم است`);
    act({ type: 'raise', amount: v });
  },
  undo() {
    S.undoHand();
    render();
  },
  cancelHand() {
    if (!confirm('این دست لغو شود؟ چیپ‌ها به حالت قبل از دست برمی‌گردند.')) return;
    S.cancelHand();
    render();
  },
  pick(d) {
    const k = +d.k;
    const i = +d.i;
    const cur = ui.sel[k] || [];
    ui.sel[k] = cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i];
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  },
  confirmWin() {
    const h = sess().hand;
    const winners = h.pots.map((p, k) => (p.eligible.length === 1 ? [p.eligible[0]] : ui.sel[k] || []));
    try {
      S.confirmWinners(winners);
    } catch (e) {
      return toast(e.message);
    }
    render();
  },
  nextHand() {
    S.commitHand();
    render();
    top();
  },

  /* تسویه */
  openSettle() {
    ui.view = 'settle';
    render();
    top();
  },
  closeSettle() {
    ui.view = 'main';
    render();
    top();
  },
  fillRest(d) {
    const c = S.computeSettlement(sess());
    const p = sess().players.find((x) => x.id === d.id);
    p.cashOut = c.totalIn - c.totalFin;
    S.save();
    render();
  },
  shareNow() {
    const c = S.computeSettlement(sess());
    shareOut(
      shareText({
        date: Date.now(),
        players: c.rows.map((r) => ({ name: r.p.name, net: r.net })),
        transfers: c.transfers.map((t) => ({ from: pName(t.from), to: pName(t.to), amount: t.amount })),
        unitLabel: state.unit,
      }),
    );
  },
  finish() {
    const entry = S.finishSession();
    if (!entry) return toast('حساب‌ها هنوز نمی‌خوانند');
    ui.view = 'main';
    ui.tab = 'history';
    ui.histId = entry.id;
    render();
    top();
    toast('شب ثبت شد');
  },

  /* تاریخچه */
  openHist(d) {
    ui.histId = d.id;
    render();
    top();
  },
  closeHist() {
    ui.histId = null;
    render();
  },
  paid(d) {
    S.togglePaid(d.id, +d.i);
    const y = window.scrollY;
    render();
    window.scrollTo(0, y);
  },
  shareHist(d) {
    const h = state.history.find((x) => x.id === d.id);
    shareOut(shareText({ date: h.date, players: h.players, transfers: h.transfers, unitLabel: h.unit }));
  },
  delHist(d) {
    if (!confirm('این شب برای همیشه حذف شود؟')) return;
    S.deleteHistory(d.id);
    ui.histId = null;
    render();
  },

  /* پشتیبان */
  exportData() {
    const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `poker-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  },
  importData() {
    document.getElementById('import-file').click();
  },
};

function act(action) {
  try {
    S.doAction(action);
  } catch (e) {
    return toast(e.message);
  }
  render();
}

/* ───────────── رویدادها ───────────── */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) fn(el.dataset, el, e);
});

document.addEventListener('submit', (e) => {
  e.preventDefault();
  const f = e.target.dataset.form;
  if (f === 'dAdd') {
    const el = document.getElementById('new-name');
    if (fail(S.draftAdd(el.value))) return;
    ui.focus = '#new-name';
    render();
  } else if (f === 'addP') {
    if (fail(S.addPlayerToSession(inputVal('sheet-name'), parseAmount(inputVal('sheet-amt'))))) return;
    ui.sheet = null;
    render();
    toast('بازیکن اضافه شد');
  }
});

document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.classList.contains('money')) {
    const n = parseAmount(el.value);
    el.value = /\d/.test(el.value.replace(/[^\d۰-۹٠-٩]/g, '')) ? fmt(n) : '';
  }
  const b = el.dataset.bind;
  if (!b) return;
  const n = parseAmount(el.value);
  const s = sess();
  switch (b) {
    case 'unit':
      state.unit = el.value.trim() || 'تومان';
      break;
    case 'dStep':
      state.defaults.step = n;
      break;
    case 'rv':
      ui.round[el.dataset.id] = { ...(ui.round[el.dataset.id] || {}), v: el.value };
      refreshRound();
      return;
    case 'dBuyIn':
      state.defaults.buyIn = n;
      break;
    case 'dSb':
      state.defaults.sb = n;
      break;
    case 'dBb':
      state.defaults.bb = n;
      break;
    case 'pBuyIn': {
      const p = state.draft.players.find((x) => x.id === el.dataset.id);
      if (p) p.buyIn = n;
      break;
    }
    case 'sSb':
      s.sb = n;
      break;
    case 'sBb':
      s.bb = n;
      break;
    case 'final': {
      const p = s.players.find((x) => x.id === el.dataset.id);
      if (p) p.cashOut = el.value.trim() === '' ? null : n;
      S.save();
      refreshSettle();
      return;
    }
  }
  S.save();
});

document.addEventListener('change', (e) => {
  if (e.target.id !== 'import-file') return;
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const obj = JSON.parse(r.result);
      if (!obj || obj.v !== 1 || !Array.isArray(obj.history)) throw new Error('bad');
      if (!confirm('اطلاعات فعلی با این فایل جایگزین شود؟')) return;
      S.replaceState(obj);
      ui.view = 'main';
      ui.histId = null;
      render();
      toast('بازیابی شد');
    } catch (err) {
      toast('فایل پشتیبان معتبر نیست');
    }
  };
  r.readAsText(file);
  e.target.value = '';
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && ui.sheet) actions.closeSheet();
});

/* ───────────── شروع ───────────── */

if (sess() && sess().mode === 'chips' && sess().hand) ui.tab = 'game';
render();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

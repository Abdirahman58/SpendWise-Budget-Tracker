/* SpendWise – script.js (vanilla JS + Chart.js + LocalStorage) */
'use strict';

/* ---------- Constants & helpers ---------- */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const KEY = 'spendwise.v1';
const EXP = ['Food','Transport','Rent','Entertainment','Shopping','Utilities','Education','Healthcare','Other'];
const INC = ['Salary','Business','Freelance','Investment','Gift','Other'];
const PAY = ['Cash','M-Pesa','Card','Bank Transfer'];
const COLORS = ['#16a34a','#0ea5e9','#f59e0b','#8b5cf6','#ec4899','#14b8a6','#6366f1','#e5484d','#94a3b8'];
const p2 = n => String(n).padStart(2, '0');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
const monthOf = d => d.slice(0, 7);
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const lastN = (ym, n = 6) => { let [y, m] = ym.split('-').map(Number); const r = []; for (let i = 0; i < n; i++) { r.unshift(`${y}-${p2(m)}`); if (--m === 0) { m = 12; y--; } } return r; };
const mlabel = ym => new Date(ym + '-01T00:00').toLocaleString('en', { month: 'short' });
const fmt = n => new Intl.NumberFormat('en-US', { style: 'currency', currency: S.currency, maximumFractionDigits: 2 }).format(n);

/* ---------- State (saved in LocalStorage) ---------- */
function sampleData() {
  const ym = today().slice(0, 7), pm = lastN(ym, 2)[0], dn = new Date().getDate();
  const t = (type, name, amount, category, day, method, mo = ym) =>
    ({ id: uid(), s: 1, type, name, amount, category, method, desc: '', date: `${mo}-${p2(mo === ym ? Math.min(day, dn) : day)}` });
  return [
    t('income','Monthly salary',30000,'Salary',1,''), t('income','Website project',6000,'Freelance',8,''),
    t('expense','Groceries',3000,'Food',3,'M-Pesa'), t('expense','Matatu & fuel',2000,'Transport',4,'M-Pesa'),
    t('expense','House rent',8000,'Rent',2,'Bank Transfer'), t('expense','Electricity & water',1500,'Utilities',5,'M-Pesa'),
    t('expense','Movie night',1200,'Entertainment',9,'Cash'),
    t('income','Monthly salary',30000,'Salary',1,'',pm), t('expense','House rent',8000,'Rent',2,'Bank Transfer',pm),
    t('expense','Groceries',3500,'Food',10,'M-Pesa',pm), t('expense','Matatu & fuel',1800,'Transport',12,'M-Pesa',pm)
  ];
}
const fresh = withSample => ({
  tx: withSample ? sampleData() : [], monthly: withSample ? 25000 : 0,
  catBudgets: withSample ? { Food: 5000, Transport: 3000, Entertainment: 1500 } : {},
  goals: withSample ? [{ id: uid(), s: 1, name: 'Emergency fund', target: 60000, saved: 15000, date: `${new Date().getFullYear() + 1}-06-30` }] : [],
  currency: 'KES', theme: 'light', name: 'Guest'
});
function load() {
  try { const r = JSON.parse(localStorage.getItem(KEY)); if (r && Array.isArray(r.tx)) return r; } catch (e) {}
  return fresh(true);
}
let S = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { toast('Could not save data (storage blocked or full).', 'error'); }
  render();
}

/* ---------- Calculations ---------- */
const sum = f => S.tx.filter(f).reduce((a, t) => a + t.amount, 0);
const spentIn = (ym, cat) => sum(t => t.type === 'expense' && monthOf(t.date) === ym && (!cat || t.category === cat));
const incIn = ym => sum(t => t.type === 'income' && monthOf(t.date) === ym);
const byDate = (a, b) => b.date.localeCompare(a.date);

/* ---------- UI helpers ---------- */
function toast(msg, type = 'ok') {
  const el = document.createElement('div'); el.className = 'toast ' + type; el.textContent = msg;
  $('#toasts').append(el); setTimeout(() => el.remove(), 3200);
}
// Reusable modal form: fields = [{n,l,t,o,r,min}], onSave returns an error string or nothing
function openForm(title, fields, vals, onSave) {
  const f = $('#form'); $('#modalTitle').textContent = title;
  f.innerHTML = fields.map(x => `<label>${x.l}` + (x.t === 'select'
    ? `<select name="${x.n}">${x.o.map(o => `<option ${vals[x.n] === o ? 'selected' : ''}>${o}</option>`).join('')}</select>`
    : `<input name="${x.n}" type="${x.t || 'text'}" value="${esc(vals[x.n] ?? '')}" ${x.r ? 'required' : ''} ${x.t === 'number' ? `min="${x.min ?? 0.01}" step="0.01"` : ''}>`) + '</label>').join('')
    + '<div class="btns"><button type="button" class="btn ghost" id="cancel">Cancel</button><button class="btn">Save</button></div>';
  f.onsubmit = e => {
    e.preventDefault();
    const err = onSave(Object.fromEntries(new FormData(f)));
    if (err) return toast(err, 'error');
    $('#modal').close();
  };
  $('#cancel').onclick = () => $('#modal').close();
  $('#modal').showModal();
}
const bar = (spent, limit) => {
  const p = limit > 0 ? spent / limit * 100 : 0, c = p >= 100 ? 'over' : p >= 80 ? 'warn' : '';
  return `<div class="bar"><i class="${c}" style="width:${Math.min(p, 100)}%"></i></div><small class="muted">${fmt(spent)} of ${fmt(limit)} (${Math.round(p)}%)</small>`;
};
const empty = (icon, msg) => `<div class="empty"><i class="bi bi-${icon}"></i><p>${msg}</p></div>`;

/* ---------- Transactions: add / edit / delete ---------- */
function txForm(type, t = {}) {
  const inc = type === 'income';
  openForm((t.id ? 'Edit ' : 'Add ') + type, [
    { n: 'name', l: inc ? 'Description' : 'Expense name', r: 1 },
    { n: 'amount', l: 'Amount', t: 'number', r: 1 },
    { n: 'category', l: inc ? 'Income source' : 'Category', t: 'select', o: inc ? INC : EXP },
    { n: 'date', l: 'Date', t: 'date', r: 1 },
    ...(inc ? [] : [{ n: 'method', l: 'Payment method', t: 'select', o: PAY }, { n: 'desc', l: 'Description (optional)' }])
  ], { date: today(), ...t }, d => {
    const a = parseFloat(d.amount);
    if (!d.name.trim()) return 'Please enter a name.';
    if (!(a > 0)) return 'Amount must be greater than zero.';
    if (!d.date) return 'Please choose a date.';
    const rec = { id: t.id || uid(), type, name: d.name.trim(), amount: a, category: d.category, date: d.date, method: d.method || '', desc: (d.desc || '').trim() };
    if (t.id) S.tx = S.tx.map(x => x.id === t.id ? rec : x); else S.tx.push(rec);
    save(); toast(`${inc ? 'Income' : 'Expense'} ${t.id ? 'updated' : 'added'}.`);
    if (!inc && rec.date.slice(0, 7) === today().slice(0, 7) && alerts().length) toast('Budget warning: check your Budgets page.', 'error');
  });
}
const row = t => `<tr><td>${t.date}</td><td>${esc(t.name)}<small>${esc(t.desc)}</small></td><td><span class="tag">${esc(t.category)}</span></td><td>${esc(t.method) || '–'}</td>
  <td class="${t.type}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</td>
  <td class="act"><button data-edit="${t.id}" title="Edit" aria-label="Edit"><i class="bi bi-pencil"></i></button><button data-del="${t.id}" title="Delete" aria-label="Delete"><i class="bi bi-trash3"></i></button></td></tr>`;
const table = (list, msg) => list.length
  ? `<div class="scroll"><table><thead><tr><th>Date</th><th>Details</th><th>Category</th><th>Method</th><th class="r">Amount</th><th></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`
  : empty('inbox', msg);

/* ---------- Budgets ---------- */
function alerts() {
  const ym = today().slice(0, 7), a = [];
  const chk = (n, s, l) => { if (l > 0 && s / l >= 0.8) a.push({ over: s > l, text: s > l ? `${n}: over budget by ${fmt(s - l)}.` : `${n}: ${Math.round(s / l * 100)}% of the budget is used.` }); };
  chk('Monthly budget', spentIn(ym), S.monthly);
  Object.entries(S.catBudgets).forEach(([c, l]) => chk(c, spentIn(ym, c), l));
  return a;
}
function renderBudgets() {
  const ym = today().slice(0, 7), sp = spentIn(ym), left = S.monthly - sp;
  const cats = Object.entries(S.catBudgets);
  $('#budgetView').innerHTML = `<article class="card"><div class="bhead"><b>Monthly budget</b><span class="${left < 0 ? 'exp' : 'inc'}">${S.monthly ? (left < 0 ? 'Over by ' + fmt(-left) : fmt(left) + ' left') : ''}</span></div>
    ${S.monthly ? bar(sp, S.monthly) : empty('wallet2', 'No monthly budget yet. Choose "Set monthly budget" to start.')}</article>
    <h3 style="margin-top:20px">Category budgets</h3>
    ${cats.length ? `<div class="grid2">${cats.map(([c, l]) => `<article class="card"><div class="bhead"><b>${esc(c)}</b><span><button class="icon-btn" data-cedit="${esc(c)}" aria-label="Edit"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-cdel="${esc(c)}" aria-label="Delete"><i class="bi bi-trash3"></i></button></span></div>${bar(spentIn(ym, c), l)}</article>`).join('')}</div>` : `<article class="card">${empty('pie-chart', 'No category budgets yet. Add one to limit spending per category.')}</article>`}`;
}
function monthlyForm() {
  openForm('Monthly budget', [{ n: 'amount', l: 'Amount for each month', t: 'number', min: 0, r: 1 }], { amount: S.monthly || '' }, d => {
    const a = parseFloat(d.amount); if (!(a >= 0)) return 'Enter a valid amount (0 or more).';
    S.monthly = a; save(); toast('Monthly budget saved.');
  });
}
function catForm(c = '') {
  openForm('Category budget', [{ n: 'category', l: 'Category', t: 'select', o: EXP }, { n: 'amount', l: 'Monthly limit (0 removes it)', t: 'number', min: 0, r: 1 }],
    { category: c, amount: S.catBudgets[c] || '' }, d => {
      const a = parseFloat(d.amount); if (!(a >= 0)) return 'Enter a valid amount (0 or more).';
      if (a === 0) delete S.catBudgets[d.category]; else S.catBudgets[d.category] = a;
      save(); toast('Category budget saved.');
    });
}

/* ---------- Savings goals ---------- */
function renderGoals() {
  $('#goalView').innerHTML = S.goals.length ? S.goals.map(g => {
    const days = Math.ceil((new Date(g.date + 'T00:00') - new Date()) / 864e5);
    return `<article class="card"><div class="bhead"><b>${esc(g.name)}</b><span>
      <button class="icon-btn" data-gedit="${g.id}" aria-label="Edit"><i class="bi bi-pencil"></i></button><button class="icon-btn" data-gdel="${g.id}" aria-label="Delete"><i class="bi bi-trash3"></i></button></span></div>
      ${bar(g.saved, g.target)}<p class="muted">Target date ${g.date} (${days >= 0 ? days + ' days left' : 'date passed'})</p>
      <p style="margin:10px 0">${g.saved >= g.target ? '<b class="inc">Goal reached!</b>' : `${fmt(g.target - g.saved)} to go`}</p>
      <button class="btn" data-gadd="${g.id}"><i class="bi bi-plus-lg"></i> Add contribution</button></article>`;
  }).join('') : `<article class="card">${empty('bullseye', 'No savings goals yet. Create one to start tracking.')}</article>`;
}
function goalForm(g = {}) {
  openForm(g.id ? 'Edit goal' : 'New savings goal', [
    { n: 'name', l: 'Goal name', r: 1 }, { n: 'target', l: 'Target amount', t: 'number', r: 1 },
    { n: 'saved', l: 'Amount already saved', t: 'number', min: 0, r: 1 }, { n: 'date', l: 'Target date', t: 'date', r: 1 }
  ], g, d => {
    const target = parseFloat(d.target), saved = parseFloat(d.saved);
    if (!d.name.trim()) return 'Please enter a goal name.';
    if (!(target > 0)) return 'Target must be greater than zero.';
    if (!(saved >= 0)) return 'Saved amount cannot be negative.';
    if (!d.date) return 'Please choose a target date.';
    const rec = { id: g.id || uid(), name: d.name.trim(), target, saved, date: d.date };
    if (g.id) S.goals = S.goals.map(x => x.id === g.id ? rec : x); else S.goals.push(rec);
    save(); toast('Goal saved.');
  });
}
function contribute(g) {
  openForm('Add to ' + g.name, [{ n: 'amount', l: 'Contribution amount', t: 'number', r: 1 }], {}, d => {
    const a = parseFloat(d.amount); if (!(a > 0)) return 'Contribution must be greater than zero.';
    g.saved += a; save(); toast('Contribution added.');
  });
}

/* ---------- Charts ---------- */
const charts = {};
function draw(id, type, labels, sets, opts = {}) {
  if (typeof Chart === 'undefined' || !$('#' + id)) return;
  charts[id]?.destroy();
  charts[id] = new Chart($('#' + id), { type, data: { labels, datasets: sets }, options: { responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: sets.length > 1 || type === 'doughnut', position: 'bottom' } }, ...opts } });
}
function catData(ym) {
  const items = EXP.map(c => [c, spentIn(ym, c)]).filter(x => x[1] > 0);
  return items.length ? [items.map(x => x[0]), items.map(x => x[1])] : [['No spending yet'], [1]];
}
function renderCharts() {
  if (typeof Chart === 'undefined') return;
  const cs = getComputedStyle(document.documentElement);
  Chart.defaults.color = cs.getPropertyValue('--muted').trim(); Chart.defaults.borderColor = cs.getPropertyValue('--line').trim();
  const ym = today().slice(0, 7), [y, m] = ym.split('-').map(Number), days = new Date(y, m, 0).getDate();
  const daily = Array.from({ length: days }, (_, i) => sum(t => t.type === 'expense' && t.date === `${ym}-${p2(i + 1)}`));
  draw('chSpend', 'line', daily.map((_, i) => i + 1), [{ label: 'Spent', data: daily, borderColor: '#e5484d', backgroundColor: 'rgba(229,72,77,.15)', fill: true, tension: .3 }]);
  const months = lastN(ym);
  const ie = [{ label: 'Income', data: months.map(incIn), backgroundColor: '#16a34a' }, { label: 'Expenses', data: months.map(x => spentIn(x)), backgroundColor: '#e5484d' }];
  draw('chIE', 'bar', months.map(mlabel), ie);
  const [cl, cv] = catData(ym); draw('chCat', 'doughnut', cl, [{ data: cv, backgroundColor: cl[0] === 'No spending yet' ? ['#94a3b8'] : COLORS, borderWidth: 0 }]);
  // Reports page
  const rm = $('#repMonth').value || ym, i = incIn(rm), e = spentIn(rm), rms = lastN(rm);
  draw('rIE', 'bar', ['Income', 'Expenses', 'Net savings'], [{ data: [i, e, i - e], backgroundColor: ['#16a34a', '#e5484d', '#0b1f3a'] }]);
  const [rl, rv] = catData(rm); draw('rCat', 'bar', rl, [{ data: rv, backgroundColor: COLORS }], { indexAxis: 'y' });
  draw('rTrend', 'line', rms.map(mlabel), [
    { label: 'Income', data: rms.map(incIn), borderColor: '#16a34a', tension: .3 },
    { label: 'Expenses', data: rms.map(x => spentIn(x)), borderColor: '#e5484d', tension: .3 }]);
}

/* ---------- Rendering ---------- */
function render() {
  document.documentElement.dataset.theme = S.theme;
  $('#themeBtn').innerHTML = `<i class="bi bi-${S.theme === 'dark' ? 'sun' : 'moon-stars'}"></i>`;
  $('#who').textContent = S.name;
  const ym = today().slice(0, 7), inc = sum(t => t.type === 'income'), exp = sum(t => t.type === 'expense');
  const mi = incIn(ym), me = spentIn(ym), rem = S.monthly - me, saved = S.goals.reduce((a, g) => a + g.saved, 0), tgt = S.goals.reduce((a, g) => a + g.target, 0);
  $('#vBal').textContent = fmt(inc - exp); $('#vInc').textContent = fmt(inc); $('#vExp').textContent = fmt(exp);
  $('#sInc').textContent = `${fmt(mi)} this month`; $('#sExp').textContent = `${fmt(me)} this month`;
  $('#vRem').textContent = S.monthly ? fmt(rem) : '–'; $('#vRem').className = rem < 0 && S.monthly ? 'exp' : '';
  $('#sRem').textContent = S.monthly ? `of ${fmt(S.monthly)} budget` : 'Set a budget on the Budgets page';
  $('#vSav').textContent = fmt(saved); $('#sSav').textContent = tgt ? `${Math.round(saved / tgt * 100)}% of ${S.goals.length} goal target(s)` : 'No goals yet';
  $$('.alerts').forEach(el => el.innerHTML = alerts().map(a => `<div class="alert ${a.over ? 'over' : ''}"><i class="bi bi-exclamation-triangle"></i> ${a.text}</div>`).join(''));
  const recent = [...S.tx].sort(byDate).slice(0, 5);
  $('#recent').innerHTML = recent.length ? recent.map(t => `<div class="item"><span>${esc(t.name)}<small>${t.date} – ${esc(t.category)}</small></span><b class="${t.type === 'income' ? 'inc' : 'exp'}">${t.type === 'income' ? '+' : '−'}${fmt(t.amount)}</b></div>`).join('') : empty('inbox', 'No transactions yet.');
  const top = catData(ym); const topCat = top[0][0] === 'No spending yet' ? '–' : top[0][top[1].indexOf(Math.max(...top[1]))];
  $('#summary').innerHTML = [['Income this month', fmt(mi)], ['Expenses this month', fmt(me)], ['Net savings', fmt(mi - me)], ['Savings rate', mi ? Math.round((mi - me) / mi * 100) + '%' : '–'], ['Top spending category', topCat]].map(([l, v]) => `<div><b>${v}</b><span>${l}</span></div>`).join('');
  $('#incTable').innerHTML = table(S.tx.filter(t => t.type === 'income').sort(byDate), 'No income recorded yet. Add your first income.');
  $('#expTable').innerHTML = table(S.tx.filter(t => t.type === 'expense').sort(byDate), 'No expenses recorded yet. Add your first expense.');
  renderBudgets(); renderGoals(); renderTx(); renderCharts();
  const rm = $('#repMonth').value || ym, i = incIn(rm), e = spentIn(rm);
  $('#repStats').innerHTML = [['Monthly income', i, 'inc'], ['Monthly expenses', e, 'exp'], ['Net savings', i - e, i - e < 0 ? 'exp' : 'inc']].map(([l, v, c]) => `<article class="card stat"><p>${l}</p><h2 class="${c}">${fmt(v)}</h2></article>`).join('');
  const f = $('#setForm'); f.elements.name.value = S.name; f.elements.currency.value = S.currency; f.elements.theme.value = S.theme;
}
function renderTx() {
  const q = $('#q').value.trim().toLowerCase(), ty = $('#fType').value, c = $('#fCat').value, d = $('#fDate').value;
  const l = S.tx.filter(t => (!q || `${t.name} ${t.desc} ${t.category}`.toLowerCase().includes(q)) && (!ty || t.type === ty) && (!c || t.category === c) && (!d || t.date === d));
  l.sort((a, b) => $('#fSort').value === 'old' ? a.date.localeCompare(b.date) : byDate(a, b));
  $('#txCount').textContent = `${l.length} of ${S.tx.length} records`;
  $('#txTable').innerHTML = table(l, S.tx.length ? 'No records match your filters.' : 'No transactions yet. Add income or expenses to begin.');
}

/* ---------- Routing (#dashboard, #income, ...) ---------- */
function route() {
  let p = location.hash.slice(1); if (!document.getElementById(p)?.classList.contains('page')) p = 'dashboard';
  $$('.page').forEach(s => s.hidden = s.id !== p);
  $$('nav a').forEach(a => a.classList.toggle('on', a.hash === '#' + p));
  $('#title').textContent = $(`nav a[href="#${p}"]`).textContent.trim();
  $('#sidebar').classList.remove('open'); render();
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-edit],[data-del],[data-gadd],[data-gedit],[data-gdel],[data-cedit],[data-cdel]'); if (!b) return;
  const d = b.dataset, tx = S.tx.find(t => t.id === d.edit || t.id === d.del), g = S.goals.find(x => x.id === (d.gadd || d.gedit || d.gdel));
  const sure = m => confirm(m + ' This cannot be undone.');
  if (d.edit && tx) txForm(tx.type, tx);
  else if (d.del && tx && sure('Delete this record?')) { S.tx = S.tx.filter(t => t.id !== tx.id); save(); toast('Record deleted.'); }
  else if (d.gadd && g) contribute(g);
  else if (d.gedit && g) goalForm(g);
  else if (d.gdel && g && sure('Delete this goal?')) { S.goals = S.goals.filter(x => x.id !== g.id); save(); toast('Goal deleted.'); }
  else if (d.cedit) catForm(d.cedit);
  else if (d.cdel && sure('Remove this category budget?')) { delete S.catBudgets[d.cdel]; save(); toast('Category budget removed.'); }
});
$('#addInc').onclick = () => txForm('income'); $('#addExp').onclick = () => txForm('expense');
$('#setMonthly').onclick = monthlyForm; $('#setCat').onclick = () => catForm(); $('#addGoal').onclick = () => goalForm();
$('#menu').onclick = () => $('#sidebar').classList.toggle('open'); $('#scrim').onclick = () => $('#sidebar').classList.remove('open');
$('#themeBtn').onclick = () => { S.theme = S.theme === 'dark' ? 'light' : 'dark'; save(); };
['q', 'fType', 'fCat', 'fDate', 'fSort'].forEach(id => $('#' + id).addEventListener('input', renderTx));
$('#fClear').onclick = () => { ['q', 'fType', 'fCat', 'fDate'].forEach(id => $('#' + id).value = ''); $('#fSort').value = 'new'; renderTx(); };
$('#repMonth').addEventListener('input', render);
$('#setForm').onsubmit = e => {
  e.preventDefault(); const f = e.target, n = f.elements.name.value.trim(); if (!n) return toast('Please enter your name.', 'error');
  S.name = n; S.currency = f.elements.currency.value; S.theme = f.elements.theme.value; save(); toast('Settings saved.');
};
$('#exportBtn').onclick = () => {
  if (!S.tx.length) return toast('No transactions to export.', 'error');
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = ['Date,Type,Name,Category,Payment Method,Amount,Description', ...[...S.tx].sort(byDate).map(t => [t.date, t.type, t.name, t.category, t.method, t.amount, t.desc].map(q).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: 'spendwise-transactions.csv' });
  a.click(); URL.revokeObjectURL(a.href); toast('CSV exported.');
};
$('#clearSample').onclick = () => {
  if (!S.tx.some(t => t.s) && !S.goals.some(g => g.s)) return toast('There is no sample data to clear.', 'error');
  if (!confirm('Remove the sample transactions and goal? Your own records stay.')) return;
  S.tx = S.tx.filter(t => !t.s); S.goals = S.goals.filter(g => !g.s); save(); toast('Sample data cleared.');
};
$('#resetBtn').onclick = () => {
  if (!confirm('Reset ALL data, budgets and goals? This cannot be undone.')) return;
  S = fresh(false); save(); toast('All data has been reset.');
};

/* ---------- Start ---------- */
$('#fCat').innerHTML = '<option value="">All categories</option>' + [...new Set([...EXP, ...INC])].map(c => `<option>${c}</option>`).join('');
$('#repMonth').value = today().slice(0, 7);
window.addEventListener('hashchange', route);
route();
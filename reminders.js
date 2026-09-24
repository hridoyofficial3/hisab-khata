/* ============================================================
   R1 — ডিউ-ডেট রিমাইন্ডার লজিক (UI ছাড়া; ROADMAP-2 §২ D1–D3)
   ------------------------------------------------------------
   getDueReminders(todayStr, windowDays) → { overdue:[], today:[], soon:[] }
   প্রতিটা আইটেম: { kind:'loan'|'due', type, id, person, amount(বাকি), dueDate, daysDiff }
     • kind  : 'loan' = loans[], 'due' = dues[]
     • type  : মূল টাইপ (loan: given/taken/self, due: receivable/payable) — UI লেবেল/রঙের জন্য
     • person: সংরক্ষিত মান হুবহু (self-লোনে ফাঁকা থাকতে পারে; UI-তে loanSelfPersonLabel ও escapeHtml লাগবে)
     • amount: বাকি টাকা (l.amount / d.amount — আংশিক পরিশোধের পরের মান)
     • daysDiff = dueDate − আজ (দিন): নেগেটিভ = মেয়াদ পেরিয়েছে, ০ = আজ, ১..N = শিগগিরই
   বাদ: settled, dueDate ফাঁকা/অবৈধ (কড়া YYYY-MM-DD + বাস্তব ক্যালেন্ডার তারিখ, যেমন ২০২৬-০২-৩০ অবৈধ),
        বাকি টাকা ০/অসংখ্যা, এবং windowDays-এর বাইরের ভবিষ্যৎ তারিখ।
   ক্রম: প্রতি তালিকায় daysDiff ছোট → বড় (সবচেয়ে পুরনো মেয়াদোত্তীর্ণ আগে); সমান হলে লোন আগে, তারপর বকেয়া (আসল ক্রম বজায়)।
   তারিখের হিসাব UTC দিন-সংখ্যায় — লোকাল টাইমজোন/DST বদলে ফল বদলায় না।
   এই ফাইলে কোনো DOM/localStorage/রেন্ডার নেই; শুধু বিদ্যমান গ্লোবাল loans/dues ও todayStr() পড়ে।
   ============================================================ */
const DUE_REMINDER_DEFAULT_DAYS = 3;   // D3

function reminderDayNumber(s){
  if(typeof s !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if(!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const t = new Date(0);            // ১৯৭০-০১-০১T00:00:00Z — setUTCFullYear সময়ের অংশ ছোঁয় না
  t.setUTCFullYear(y, mo - 1, d);   // ০–৯৯ বছরেও ১৯০০-যোগের ফাঁদ নেই (Date.UTC-এ আছে)
  if(t.getUTCFullYear() !== y || t.getUTCMonth() !== mo - 1 || t.getUTCDate() !== d) return null;   // ৩০ ফেব্রুয়ারি ইত্যাদি
  return Math.round(t.getTime() / 86400000);
}

function reminderWindow(windowDays){
  if(windowDays === undefined || windowDays === null || windowDays === '') return DUE_REMINDER_DEFAULT_DAYS;
  const n = Number(windowDays);
  if(!isFinite(n) || n < 0) return DUE_REMINDER_DEFAULT_DAYS;
  return Math.floor(n);
}

/* খাঁটি ফাংশন: অ্যারে ও আজকের তারিখ আর্গুমেন্টে — টেস্টযোগ্য */
function computeDueReminders(loanList, dueList, today, windowDays){
  const out = { overdue: [], today: [], soon: [] };
  const t = reminderDayNumber(today);
  if(t === null) return out;
  const win = reminderWindow(windowDays);
  const push = (kind, x) => {
    if(!x || x.settled) return;
    const dn = reminderDayNumber(x.dueDate);
    if(dn === null) return;
    const amount = Number(x.amount);
    if(!isFinite(amount) || amount <= 0) return;
    const daysDiff = dn - t;
    const item = { kind, type: x.type, id: x.id, person: x.person, amount, dueDate: x.dueDate, daysDiff };
    if(daysDiff < 0) out.overdue.push(item);
    else if(daysDiff === 0) out.today.push(item);
    else if(daysDiff <= win) out.soon.push(item);
  };
  (Array.isArray(loanList) ? loanList : []).forEach(l => push('loan', l));
  (Array.isArray(dueList) ? dueList : []).forEach(d => push('due', d));
  const byDiff = (a, b) => a.daysDiff - b.daysDiff;   // Array.sort স্থিতিশীল → সমান হলে আসল ক্রম
  out.overdue.sort(byDiff); out.soon.sort(byDiff);
  return out;
}

function getDueReminders(todayStrArg, windowDays){
  return computeDueReminders(loans, dues, todayStrArg === undefined ? todayStr() : todayStrArg, windowDays);
}

/* ============================================================
   R2 — ইন-অ্যাপ ব্যানার + তালিকা মডাল + ট্যাব-ব্যাজ (ROADMAP-2 §২ D1–D4)
   ------------------------------------------------------------
   • "দেনাপাওনা" ট্যাবের ওপরে সারাংশ-কার্ড #dueReminderCard (শূন্য হলে লুকানো; শুধু অশূন্য অংশ দেখায়)
   • কার্ডে ট্যাপ/Enter/Space → #dueReminderModal (মেয়াদ পেরিয়েছে / আজ / শিগগিরই)
   • ট্যাব-আইকনে #loansTabBadge = মেয়াদ পেরিয়েছে + আজ + শিগগিরই মোট (মেয়াদ পেরিয়ে থাকলে লাল)
   • renderAll() থেকে কল হয় → ডেটা বদল, ভাষা বদল, দিন বদল (refreshTodayDefaults) সবকিছুতে নিজে থেকে আপডেট
   • ডিফল্ট চালু (D4); চালু/বন্ধ সুইচ ও N দিন R4-এ আসবে — তখন শুধু dueReminderWindowDays() বদলাবে
   ============================================================ */
const dueReminderCardEl = document.getElementById('dueReminderCard');
const dueReminderModalEl = document.getElementById('dueReminderModal');
const loansTabBadgeEl = document.getElementById('loansTabBadge');

function dueReminderEnabled(){ return !(settings && settings.dueReminderOn === false); }
function dueReminderWindowDays(){
  const n = settings && settings.dueReminderDays;
  return (n === 1 || n === 3 || n === 7) ? n : DUE_REMINDER_DEFAULT_DAYS;
}
const DUE_REMINDER_EMPTY = { overdue:[], today:[], soon:[] };
/* ---- R5: সিস্টেম নোটিফিকেশন (ঐচ্ছিক, ডিফল্ট বন্ধ) ---- */
const DUE_NOTIFY_LOG_KEY = 'hisab_due_notified';   // ডিভাইস-লোকাল (ব্যাকআপে যায় না): { date, keys:{ 'loan:id':1 } }
const DUE_NOTIFY_MAX_PER_CHECK = 5;
let dueNotifyBusy = false;
function dueNotifySupported(){ return typeof Notification !== 'undefined' && 'serviceWorker' in navigator; }
function dueNotifyPermission(){ return dueNotifySupported() ? Notification.permission : 'unsupported'; }
function dueNotifyActive(){ return dueReminderEnabled() && !!(settings && settings.dueNotifyOn) && dueNotifyPermission() === 'granted'; }
function readDueNotifyLog(today){
  try{
    const o = JSON.parse(localStorage.getItem(DUE_NOTIFY_LOG_KEY) || 'null');
    if(o && o.date === today && o.keys && typeof o.keys === 'object') return o;
  }catch(e){}
  return { date: today, keys: {} };
}
function saveDueNotifyLog(log){ try{ localStorage.setItem(DUE_NOTIFY_LOG_KEY, JSON.stringify(log)); }catch(e){} }
async function showDueNotification(title, body, tag){
  const opts = { body: body, tag: tag, icon: './icon-192.png', badge: './icon-192.png', data: { url: './' } };
  try{
    const reg = await navigator.serviceWorker.getRegistration();
    if(reg){ await reg.showNotification(title, opts); return true; }
  }catch(e){}
  try{ new Notification(title, opts); return true; }catch(e){ return false; }
}
function dueNotifyContent(it, state){
  const title = L(state === 'overdue' ? 'dueNotifTitleOverdue' : state === 'today' ? 'dueNotifTitleToday' : 'dueNotifTitleSoon');
  let lockOn = false;
  try{ lockOn = (typeof isLockEnabled === 'function') && isLockEnabled(); }catch(e){}
  if(lockOn) return { title: title, body: L('dueNotifBodyPrivate') };   // পাসওয়ার্ড-লক থাকলে নাম/টাকা লক-স্ক্রিনে নয়
  const name = it.type === 'self' ? L('loanSelfPersonLabel') : (it.person == null ? '' : String(it.person));
  const rel = dueReminderRelText(it.daysDiff);
  return { title: title, body: [name, moneyFmt(it.amount), rel].filter(Boolean).join(' · ') };
}
async function maybeNotifyDueReminders(){
  if(dueNotifyBusy || !dueNotifyActive()) return;
  dueNotifyBusy = true;
  try{
    const today = todayStr();
    const log = readDueNotifyLog(today);
    const r = getDueReminders(today, dueReminderWindowDays());
    const all = [];
    [['overdue', r.overdue], ['today', r.today], ['soon', r.soon]].forEach(p => p[1].forEach(it => all.push({ it: it, state: p[0] })));
    const fresh = all.filter(x => !log.keys[x.it.kind + ':' + x.it.id]).slice(0, DUE_NOTIFY_MAX_PER_CHECK);
    for(const x of fresh){
      const c = dueNotifyContent(x.it, x.state);
      if(await showDueNotification(c.title, c.body, 'due-' + x.it.kind + '-' + x.it.id)) log.keys[x.it.kind + ':' + x.it.id] = 1;
    }
    saveDueNotifyLog(log);
  }finally{ dueNotifyBusy = false; }
}
async function onDueNotifyToggle(checked){
  if(!checked){ settings.dueNotifyOn = false; saveSettings(); renderDueReminderSettings(); return; }
  let perm = dueNotifyPermission();
  if(perm === 'default'){ try{ perm = await Notification.requestPermission(); }catch(e){ perm = 'denied'; } }
  if(perm !== 'granted'){
    settings.dueNotifyOn = false; saveSettings(); renderDueReminderSettings();
    toast(L(perm === 'unsupported' ? 'dueNotifUnsupportedMsg' : 'dueNotifDeniedMsg'));
    return;
  }
  settings.dueNotifyOn = true; saveSettings(); renderDueReminderSettings();
  maybeNotifyDueReminders();
}
function renderDueReminderSettings(){   // সেটিংস-সেকশন: সুইচ + ১/৩/৭ বাটন (ভাষা বদলালেও নতুন লেবেল)
  const sw = document.getElementById('dueReminderToggle');
  if(!sw) return;
  const on = dueReminderEnabled();
  sw.checked = on;
  const seg = document.getElementById('dueReminderDaysSeg');
  seg.classList.toggle('disabled', !on);
  const nsw = document.getElementById('dueNotifyToggle'), nst = document.getElementById('dueNotifyStatus');
  if(nsw){
    const perm = dueNotifyPermission();
    nsw.checked = !!settings.dueNotifyOn && perm === 'granted';
    nsw.disabled = !on || perm === 'unsupported';
    nst.textContent = perm === 'unsupported' ? L('dueNotifUnsupportedMsg') : (perm === 'denied' ? L('dueNotifDeniedMsg') : '');
    nst.className = 'settings-desc' + (nst.textContent ? ' warn' : '');
  }
  seg.querySelectorAll('button').forEach(b => {
    const d = Number(b.dataset.days);
    b.textContent = tfmt('dueRemDaysBtnFmt', { n: numFmt(d) });
    b.disabled = !on;
    b.classList.toggle('on', d === dueReminderWindowDays());
    b.classList.toggle('income', d === dueReminderWindowDays());
    b.setAttribute('aria-pressed', d === dueReminderWindowDays() ? 'true' : 'false');
  });
}

function dueReminderRelText(diff){
  if(diff === 0) return '';
  if(diff === -1) return L('dueRemYesterday');
  if(diff < 0) return tfmt('dueRemDaysAgoFmt', { n: numFmt(-diff) });
  if(diff === 1) return L('dueRemTomorrow');
  return tfmt('dueRemInDaysFmt', { n: numFmt(diff) });
}

function dueReminderRowHtml(it){
  const typeLabel = it.kind === 'loan'
    ? (it.type === 'taken' ? L('loanTakenLabel') : it.type === 'self' ? L('loanSelfLabel') : L('loanGivenLabel'))
    : (it.type === 'receivable' ? L('dueReceivableLabel') : L('duePayableLabel'));
  const positive = (it.type === 'given' || it.type === 'receivable');   // টাকা আসবে = সবুজ, দিতে হবে = লাল
  const name = it.type === 'self' ? L('loanSelfPersonLabel') : (it.person == null ? '' : String(it.person));
  const rel = dueReminderRelText(it.daysDiff);
  return '<div class="entry '+(positive ? 'income-bg' : 'expense-bg')+'"><div class="left"><span class="tag">'+
    '<span class="accbadge">'+typeLabel+'</span>'+
    '<b>'+escapeHtml(name)+'</b> · '+escapeHtml(it.dueDate)+(rel ? ' · '+rel : '')+'</span></div>'+
    '<div class="actions"><span class="amt '+(positive ? 'income' : 'expense')+'">'+moneyFmt(it.amount)+'</span></div></div>';
}

function renderDueReminderModalBody(r, win){
  const group = (cls, label, list) => list.length === 0 ? '' :
    '<div class="due-rem-head '+cls+'"><span>'+label+'</span><span>'+numFmt(list.length)+'</span></div>'+list.map(dueReminderRowHtml).join('');
  return group('overdue', L('dueRemOverdueHead'), r.overdue) +
         group('today', L('dueRemTodayHead'), r.today) +
         group('soon', tfmt('dueRemSoonHeadFmt', { d: numFmt(win) }), r.soon);
}

function isDueReminderModalOpen(){ return !!dueReminderModalEl && dueReminderModalEl.classList.contains('open'); }

function renderDueReminders(){
  const win = dueReminderWindowDays();
  const r = dueReminderEnabled() ? getDueReminders(todayStr(), win) : DUE_REMINDER_EMPTY;
  const o = r.overdue.length, t = r.today.length, s = r.soon.length, total = o + t + s;

  if(dueReminderCardEl){
    if(total === 0){ dueReminderCardEl.classList.remove('show', 'overdue'); }
    else {
      const parts = [];
      if(o) parts.push(tfmt('dueRemOverdueFmt', { n: numFmt(o) }));
      if(t) parts.push(tfmt('dueRemTodayFmt', { n: numFmt(t) }));
      if(s) parts.push(tfmt('dueRemSoonFmt', { d: numFmt(win), n: numFmt(s) }));
      document.getElementById('dueReminderMsg').textContent = parts.join(' · ');
      dueReminderCardEl.classList.add('show');
      dueReminderCardEl.classList.toggle('overdue', o > 0);
    }
  }
  if(loansTabBadgeEl){
    if(total === 0){ loansTabBadgeEl.classList.remove('show', 'overdue'); loansTabBadgeEl.textContent = ''; }
    else {
      loansTabBadgeEl.textContent = total > 99 ? numFmt(99)+'+' : numFmt(total);
      loansTabBadgeEl.classList.add('show');
      loansTabBadgeEl.classList.toggle('overdue', o > 0);
    }
  }
  if(isDueReminderModalOpen()){   // মডাল খোলা অবস্থায় ডেটা/ভাষা/দিন বদলালে তালিকা সঙ্গে সঙ্গে ঠিক থাকে
    if(total === 0) closeDueReminders();
    else document.getElementById('dueReminderBody').innerHTML = renderDueReminderModalBody(r, win);
  }
  renderDueReminderSettings();
}

function openDueReminders(){
  if(!dueReminderModalEl || isDueReminderModalOpen()) return;
  const win = dueReminderWindowDays();
  const r = getDueReminders(todayStr(), win);
  if(r.overdue.length + r.today.length + r.soon.length === 0) return;
  document.getElementById('dueReminderBody').innerHTML = renderDueReminderModalBody(r, win);
  dueReminderModalEl.classList.add('open');
  lockBodyScroll();
}
function closeDueReminders(){
  if(!isDueReminderModalOpen()) return;
  dueReminderModalEl.classList.remove('open');
  unlockBodyScroll();
}
if(dueReminderCardEl){
  /* Enter/Space-এ খোলা document-এর গ্লোবাল role="button" কীবোর্ড হ্যান্ডলার (entries.js) থেকেই
     আসে — এখানে আলাদা keydown লিসনার লাগে না (A1: কমন হেল্পার পুনর্ব্যবহার, ডুপ্লিকেট নয়)। */
  dueReminderCardEl.addEventListener('click', openDueReminders);
}
document.getElementById('dueReminderCloseBtn').addEventListener('click', closeDueReminders);
if(dueReminderModalEl) dueReminderModalEl.addEventListener('click', (e)=>{ if(e.target === dueReminderModalEl) closeDueReminders(); });

/* ============================================================
   R3 — লোন/বকেয়া কার্ডে রঙিন মেয়াদ-ট্যাগ
   ------------------------------------------------------------
   render.js-এর renderLoansTab()/renderDuesTab() একবার getDueReminderTagMap() নেয়, তারপর প্রতি কার্ডে
   dueReminderTagHtml(map, kind, id) — শুধু "ফেরত দেওয়ার কথা" (dueDate) সারিতে বসে।
   অবস্থা: overdue = লাল, today = সোনালি (--amber), soon = হালকা/নিরপেক্ষ। বাকি আইটেমে (দূরের তারিখ/settled/তারিখহীন) ট্যাগ নেই।
   ============================================================ */
function getDueReminderTagMap(){
  const map = Object.create(null);
  if(!dueReminderEnabled()) return map;
  const r = getDueReminders(todayStr(), dueReminderWindowDays());
  [['overdue', r.overdue], ['today', r.today], ['soon', r.soon]].forEach(pair => {
    pair[1].forEach(it => { map[it.kind + ':' + it.id] = { state: pair[0], daysDiff: it.daysDiff }; });
  });
  return map;
}
function dueReminderTagHtml(map, kind, id){
  const m = map && map[kind + ':' + id];
  if(!m) return '';
  const rel = dueReminderRelText(m.daysDiff);
  const label = m.state === 'overdue' ? L('dueRemOverdueHead') + ' · ' + rel
              : m.state === 'today'   ? L('dueRemTodayHead')
              :                         L('dueRemSoonTag') + ' · ' + rel;
  return '<span class="due-tag ' + m.state + '">' + label + '</span>';
}

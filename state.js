/* ============================================================
   Percentage helpers
   ============================================================ */
function clampPct(v){
  v = Math.round(Number(v));
  if(isNaN(v)) v = 0;
  return Math.max(0, Math.min(100, v));
}
function pctErrorVisible(need, want){ return need + want > 100; }
function updatePctHint(){
  const needEl = document.getElementById('needPctInput'), wantEl = document.getElementById('wantPctInput');
  const need = clampPct(needEl.value || 0), want = clampPct(wantEl.value || 0);
  const sum = need + want, rem = 100 - sum;
  const el = document.getElementById('pctHint');
  if(pctErrorVisible(need, want)){ el.className = 'settings-desc warn'; el.textContent = L('pctError'); }
  else { el.className = 'settings-desc'; el.textContent = tfmt('pctHint', { need:numFmt(need), want:numFmt(want), sum:numFmt(sum), rem:numFmt(rem) }); }
  const autoEl = document.getElementById('savingsAutoNote');
  if(autoEl) autoEl.textContent = tfmt('savingsAutoNote', { rem: numFmt(Math.max(0,rem)) });
}
document.getElementById('needPctInput').addEventListener('input', updatePctHint);
document.getElementById('wantPctInput').addEventListener('input', updatePctHint);
document.getElementById('saveBudgetPctBtn').addEventListener('click', ()=>{
  const need = clampPct(document.getElementById('needPctInput').value || 0);
  const want = clampPct(document.getElementById('wantPctInput').value || 0);
  if(pctErrorVisible(need, want)){ toast(L('pctError')); return; }
  settings.needPct = need; settings.wantPct = want;
  const now = new Date();
  settings.pctHistory[monthKey(now.getFullYear(), now.getMonth())] = { needPct: need, wantPct: want };
  saveSettings(); updatePctHint(); updateBudgetLabels(); renderAll();
  toast(L('pctSavedToast'));
});

/* Smart budget suggestion */
document.getElementById('smartSuggestBtn').addEventListener('click', ()=>{
  const now = new Date();
  let totalIncome = 0, needSpent = 0, wantSpent = 0, monthsWithData = 0;
  for(let i=1; i<=3; i++){
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const y = d.getFullYear(), m = d.getMonth();
    const monthEntries = entries.filter(en=>{
      if(!isOperating(en)) return false;
      const p = dateYearMonth(en.date);
      return p.y===y && p.m===m;
    });
    const inc = monthEntries.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0);
    if(inc > 0){
      totalIncome += inc;
      needSpent += monthEntries.filter(en=>en.type==='expense' && en.budgetType==='need').reduce((s,e)=>s+e.amount,0);
      wantSpent += monthEntries.filter(en=>en.type==='expense' && en.budgetType==='want').reduce((s,e)=>s+e.amount,0);
      monthsWithData++;
    }
  }
  if(monthsWithData === 0 || totalIncome === 0){ toast(L('smartBudgetSuggestNoData')); return; }
  let needPct = Math.round((needSpent / totalIncome) * 100);
  let wantPct = Math.round((wantSpent / totalIncome) * 100);
  needPct = Math.max(20, Math.min(80, needPct || 50));
  wantPct = Math.max(10, Math.min(60, wantPct || 30));
  if(needPct + wantPct > 95){
    const r = 95 / (needPct + wantPct);
    needPct = Math.round(needPct * r);
    wantPct = Math.round(wantPct * r);
  }
  document.getElementById('needPctInput').value = needPct;
  document.getElementById('wantPctInput').value = wantPct;
  updatePctHint();
  toast(tfmt('smartBudgetSuggestApplied', { need: numFmt(needPct), want: numFmt(wantPct) }), 3500);
});

/* ============================================================
   State
   ============================================================ */
let entries = [];
let notes = [];
let plans = [];
let loans = [];
let dues = [];
let settings = { savingsTarget: 0, needPct: 50, wantPct: 30, advancedMode: false, pctHistory: {}, accounts: [], darkMode: 'light' };
let recurringTemplates = [];

let __idCounter = 0;
function nextId(){
  const now = Date.now();
  __idCounter = now > __idCounter ? now : __idCounter + 1;
  return __idCounter;
}
let curType = 'expense';
let curBW = 'need';
let viewMonth = new Date();
let periodMode = 'month';
let viewYear = new Date().getFullYear();
let viewDay = new Date();
let viewWeekStart = getWeekStart(new Date());

const monthsBn = ["জানুয়ারি","ফেব্রুয়ারি","মার্চ","এপ্রিল","মে","জুন","জুলাই","আগস্ট","সেপ্টেম্বর","অক্টোবর","নভেম্বর","ডিসেম্বর"];
const monthsEn = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function monthName(i){ return lang==='bn' ? monthsBn[i] : monthsEn[i]; }
const accLabelMap = { cash:'accCash', bank:'accBank', bkash:'accBkash', savings:'accSavings' };

function accLabel(acc){
  const meta = getAccountMeta(acc);
  if(meta){
    const base = escapeHtml(meta.i18n ? L(meta.name) : meta.name);   // T8: i18n নামও escape
    return meta.archived ? base + ' ' + L('accArchivedSuffix') : base;
  }
  return L(accLabelMap[acc] || 'accUnknown');
}
/* getAccountsList() = সব অ্যাকাউন্ট (আর্কাইভ করা সহ) — লুকআপ/লেবেল/ফিল্টারের জন্য।
   নতুন লেনদেনের ড্রপডাউনে getActiveAccountsList(), ড্যাশবোর্ডে getVisibleAccountsList() ব্যবহার করো। */
function getAccountsList(){ return (settings && Array.isArray(settings.accounts)) ? settings.accounts : []; }
function getAccountMeta(id){ return getAccountsList().find(a=>a.id===id) || null; }
function getActiveAccountsList(){ return getAccountsList().filter(a=> !a.archived); }
// ড্যাশবোর্ড/ব্যালেন্স-ব্রেকডাউনে দেখানোর তালিকা: আর্কাইভ করা অ্যাকাউন্টে টাকা থেকে গেলে (ব্যালেন্স ≠ ০) সেটা লুকানো যাবে না
function getVisibleAccountsList(){ return getAccountsList().filter(a=> !a.archived || !eqMoney(accountBalance(a.id), 0)); }
/* T8 — প্লেইন টেক্সট ভার্সন (escape ছাড়া), textContent-এ বসানোর জন্য */
function accLabelText(acc){
  const meta = getAccountMeta(acc);
  if(meta){
    const base = meta.i18n ? L(meta.name) : String(meta.name);
    return meta.archived ? base + ' ' + L('accArchivedSuffix') : base;
  }
  return L(accLabelMap[acc] || 'accUnknown');
}
function accPlainName(a){ return a ? (a.i18n ? L(a.name) : String(a.name)) : ''; }   // প্লেইন টেক্সট (escape ছাড়া)
function accNameText(a){ return accPlainName(a) + ((a && a.archived) ? ' ' + L('accArchivedSuffix') : ''); }
// অ্যাকাউন্টটা কোথায় কোথায় ধরা আছে (D6): এন্ট্রি (লোন/ডিউ-যুক্ত এন্ট্রি সহ — সবই account দিয়ে গোনা হয়), লোন, ডিউ, প্ল্যান
function accountUsage(id){
  return {
    entryCount: entries.filter(en=> en.account === id).length,
    loans: loans.filter(l=> l.account === id).length,
    dues: dues.filter(d=> d.account === id).length,
    plans: plans.filter(p=> p.account === id || p.boughtAccount === id).length
  };
}
// <select>-এ মান বসানো; অপশন না থাকলে (যেমন আর্কাইভ করা অ্যাকাউন্ট) প্রথম বৈধ অপশনে — যেন খালি ('') অ্যাকাউন্টে এন্ট্রি না যায়
function setAccountSelectValue(sel, value){
  if(!sel) return;
  const opts = Array.from(sel.options);
  const hit = opts.find(o=> o.value === String(value) && !o.disabled);
  if(hit){ sel.value = hit.value; return; }
  const first = opts.find(o=> !o.disabled && o.value !== '');
  sel.value = first ? first.value : '';
}

/* ============================================================
   Money precision helpers (T1)
   ============================================================ */
function round2(n){
  n = Number(n);
  if(isNaN(n)) return 0;
  const sign = n < 0 ? -1 : 1;
  return sign * Math.round((Math.abs(n) + Number.EPSILON) * 100) / 100;
}
function gtMoney(a, b){ return round2(a) > round2(b); }
function eqMoney(a, b){ return round2(a) === round2(b); }

/* T6/D7 — "অপারেটিং" এন্ট্রি = সত্যিকারের আয়/ব্যয়। ট্রান্সফার এবং লোন/ডিউ আদায়-পরিশোধ (loanId/dueId) সামারির আয়/ব্যয়, বাজেট, চার্ট, স্মার্ট সাজেশনে ধরা হয় না। */
function isOperating(en){ return !!en && !en.transfer && !en.loanId && !en.dueId; }

function moneyFmt(num){
  if(typeof num !== 'number' || isNaN(num)) num = 0;
  num = round2(num);
  const neg = num < 0;
  const abs = Math.abs(num);
  const fixed = abs.toFixed(2);
  const dotIdx = fixed.indexOf('.');
  const intPart = fixed.slice(0, dotIdx);
  const decPart = fixed.slice(dotIdx+1);
  const hasDecimal = decPart !== '00';
  let formatted;
  if(lang === 'bn'){
    let last3 = intPart.slice(-3);
    let rest = intPart.slice(0,-3);
    if(rest !== ''){ rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ','); last3 = ',' + last3; }
    formatted = (rest + last3) + (hasDecimal ? '.' + decPart : '');
    formatted = formatted.replace(/[0-9]/g, d => banglaDigits[d]);
  } else {
    formatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (hasDecimal ? '.' + decPart : '');
  }
  return (neg?'-':'') + '৳' + formatted;
}
/* T8 — বাংলা ডিজিট (০-৯) → ইংরেজি ডিজিট, কপি-পেস্ট বা হাতে টাইপ করা বাংলা সংখ্যা ধরতে */
function toEnglishDigits(str){
  return String(str == null ? '' : str).replace(/[০-৯]/g, d => String(d.charCodeAt(0) - 0x09E6));
}
function formatAmtInput(raw){
  let cleaned = toEnglishDigits(raw).replace(/[^\d.]/g,'');
  const dotIdx = cleaned.indexOf('.');
  let intPart, decPart;
  if(dotIdx === -1){ intPart = cleaned; decPart = ''; }
  else{ intPart = cleaned.slice(0,dotIdx); decPart = '.' + cleaned.slice(dotIdx+1).replace(/\./g,'').slice(0,2); }
  intPart = intPart.replace(/^0+(?=\d)/,'');
  let grouped = intPart;
  if(intPart.length > 3){
    const last3 = intPart.slice(-3);
    const rest = intPart.slice(0,-3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = rest + ',' + last3;
  }
  return grouped + decPart;
}
function parseAmt(str){
  if(str === null || str === undefined) return NaN;
  const n = parseFloat(toEnglishDigits(str).replace(/,/g,''));
  return isNaN(n) ? NaN : round2(n);
}
function attachAmtFormatting(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.setAttribute('type','text');
  el.setAttribute('inputmode','decimal');
  el.addEventListener('input', ()=>{
    const prevVal = el.value;
    const prevPos = el.selectionStart == null ? prevVal.length : el.selectionStart;
    const digitsBeforeCursor = toEnglishDigits(prevVal.slice(0, prevPos)).replace(/[^\d]/g,'').length;   // T8: বাংলা ডিজিটও গোনা হয়
    const newVal = formatAmtInput(prevVal);
    el.value = newVal;
    if(digitsBeforeCursor === 0){ el.setSelectionRange(0,0); return; }
    let count = 0, pos = newVal.length;
    for(let i=0;i<newVal.length;i++){
      if(/\d/.test(newVal[i])) count++;
      if(count === digitsBeforeCursor){ pos = i+1; break; }
    }
    el.setSelectionRange(pos,pos);
  });
}
['editAmount','settleLoanAmount','settleDueAmount','amountInput','transferAmount','targetInput',
 'depositAmount','withdrawAmount','loanAmount','dueAmount','selfLoanAmount','notePrice','planAmount',
 'selfLoanRepayAmount','selfLoanCardRepayAmount','recurringAmountInput'].forEach(attachAmtFormatting);

function updateSettleAmtState(amtInput, btn){
  if(!amtInput || !btn) return;
  const amt = parseAmt(amtInput.value);
  const max = Number(amtInput.max) || 0;
  if(amt && max && gtMoney(amt, max)){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
function attachSettleAmtGuard(amtInputId, btnId){
  const amtInput = document.getElementById(amtInputId);
  const btn = document.getElementById(btnId);
  if(!amtInput || !btn) return;
  amtInput.addEventListener('input', ()=> updateSettleAmtState(amtInput, btn));
}
attachSettleAmtGuard('settleDueAmount','settleDueContinueBtn');
attachSettleAmtGuard('settleLoanAmount','settleLoanContinueBtn');
attachSettleAmtGuard('selfLoanRepayAmount','selfLoanRepayBtn2');
attachSettleAmtGuard('selfLoanCardRepayAmount','selfLoanCardRepayContinueBtn');

function todayStr(){
  const d = new Date();
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function toISO(d){
  return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
}
function getWeekStart(d){
  const day = d.getDay();
  const diff = (day === 6) ? 0 : (day + 1);
  const start = new Date(d);
  start.setDate(d.getDate() - diff);
  start.setHours(0,0,0,0);
  return start;
}
function fmtDayLabel(d){
  return numFmt(d.getDate()) + ' ' + monthName(d.getMonth()) + ' ' + numFmt(d.getFullYear());
}
function fmtWeekLabel(start, end){
  if(start.getFullYear() === end.getFullYear() && start.getMonth() === end.getMonth()){
    return numFmt(start.getDate()) + ' – ' + numFmt(end.getDate()) + ' ' + monthName(start.getMonth()) + ' ' + numFmt(start.getFullYear());
  }
  return fmtDayLabel(start) + ' – ' + fmtDayLabel(end);
}
function getPeriodRange(){
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  if(periodMode === 'day'){ const ds = toISO(viewDay); return { start: ds, end: ds }; }
  if(periodMode === 'week'){
    const s = new Date(viewWeekStart); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(e.getDate() + 6);
    return { start: toISO(s), end: toISO(e) };
  }
  if(periodMode === 'month'){ return { start: toISO(new Date(y, m, 1)), end: toISO(new Date(y, m+1, 0)) }; }
  if(periodMode === 'year'){ return { start: y+'-01-01', end: y+'-12-31' }; }
  return { start: '0001-01-01', end: '9999-12-31' }; /* 'all' — সব হিসাবের সময়কাল */
}
function setHeaderDate(){
  const d = new Date();
  const el = document.getElementById('todayDate');
  if(el) el.textContent = d.getDate()+' '+monthName(d.getMonth())+', '+d.getFullYear();
}

/* ============================================================
   T7 — অ্যাপ রাতভর খোলা/সাসপেন্ড থাকলে তারিখ পুরনো থেকে যাওয়া ঠিক করা
   ------------------------------------------------------------
   lastKnownToday ট্র্যাক করে দিন বদলে গেলে: হেডার তারিখ, ফর্মের
   তারিখ-ইনপুট (শুধু সেগুলো যেগুলো এখনও পুরনো "আজ" দেখাচ্ছে — ইউজার
   হাতে অন্য তারিখ বসালে ছোঁয়া হয় না), viewDay/viewWeekStart/viewMonth
   (শুধু সেগুলো যেগুলো এখনও পুরনো আজ/চলতি সপ্তাহ/মাস দেখাচ্ছে) আপডেট করে।
   ============================================================ */
let lastKnownToday = new Date();
function isSameDay(a, b){
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function refreshTodayDefaults(){
  const now = new Date();
  if(isSameDay(now, lastKnownToday)) return;
  const prevToday = lastKnownToday;
  lastKnownToday = now;

  setHeaderDate();

  const prevTodayStr = toISO(prevToday);
  const nowStr = toISO(now);
  ['dateInput', 'loanDate', 'dueDate', 'selfLoanDate'].forEach(id=>{
    const el = document.getElementById(id);
    if(el && el.value === prevTodayStr) el.value = nowStr;
  });

  if(isSameDay(viewDay, prevToday)) viewDay = new Date(now);
  if(isSameDay(viewWeekStart, getWeekStart(prevToday))) viewWeekStart = getWeekStart(new Date(now));
  if(viewMonth.getFullYear() === prevToday.getFullYear() && viewMonth.getMonth() === prevToday.getMonth()){
    viewMonth = new Date(now);
    viewYear = viewMonth.getFullYear();
  }

  if(typeof renderAll === 'function') renderAll();
}

/* ============================================================
   Safe storage (T2)
   ------------------------------------------------------------
   সব লেখা safeSet দিয়ে। ফেল করলে লাল ব্যানার (একবার), false রিটার্ন।
   নষ্ট (corrupt) কী-তে ইউজার সিদ্ধান্ত না নেওয়া পর্যন্ত লেখা ব্লক।
   ============================================================ */
const CORRUPT_PREFIX = 'hisab_corrupt_';
const corruptKeys = new Map();   // key -> { copied:boolean } — এই কী-গুলোতে সেভ ব্লক
const STORAGE_KEY_LABELS = {
  hisab_entries:'storageKeyEntries', hisab_notes:'storageKeyNotes', hisab_plans:'storageKeyPlans',
  hisab_loans:'storageKeyLoans', hisab_dues:'storageKeyDues', hisab_settings:'storageKeySettings',
  hisab_recurring:'storageKeyRecurring'
};

function showStorageFailBanner(){
  const b = document.getElementById('storageFailBanner');
  if(b) b.classList.add('show');
}
function safeSet(key, value){
  if(corruptKeys.has(key)) return false;            // নষ্ট ডেটা ওভাররাইট হবে না
  try{ localStorage.setItem(key, value); return true; }
  catch(e){ showStorageFailBanner(); return false; }
}
function safeSetJson(key, obj){
  let str;
  try{ str = JSON.stringify(obj); }catch(e){ showStorageFailBanner(); return false; }
  return safeSet(key, str);
}
/* T11: একাধিক localStorage কী একসাথে বদলানোর দরকার হলে (যেমন এন্ট্রি ডিলিটে
   entries+dues/loans/recurring একসাথে বদলায়) এটা ব্যবহার করো। saveFns গুলো
   ক্রমান্বয়ে চালায়; কোনোটা false/ফেল ফেরালে সব কটা কী আগের (raw) মানে
   ফিরিয়ে দেয় — যাতে "কিছু নতুন + কিছু পুরনো" মিশ্র অবস্থা তৈরি না হয়। */
function atomicSaveKeys(keys, saveFns){
  const prevRaw = {};
  keys.forEach(k=>{ try{ prevRaw[k] = localStorage.getItem(k); }catch(e){ prevRaw[k] = null; } });
  let ok = true;
  saveFns.forEach(fn=>{ if(!fn()) ok = false; });
  if(!ok){
    keys.forEach(k=>{
      try{
        const v = prevRaw[k];
        if(v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }catch(e){}
    });
  }
  return ok;
}

function renderCorruptBanner(){
  const b = document.getElementById('corruptDataBanner');
  if(!b) return;
  if(corruptKeys.size === 0){ b.classList.remove('show'); return; }
  const names = Array.from(corruptKeys.keys()).map(k => L(STORAGE_KEY_LABELS[k] || k)).join(', ');
  document.getElementById('corruptDataMsg').textContent = tfmt('corruptBannerMsg', { names });
  b.classList.add('show');
}
// নষ্ট কাঁচা স্ট্রিং আলাদা কী-তে কপি। একই কপি আগে থেকে থাকলে নতুন বানাই না (প্রতি রিলোডে জায়গা নষ্ট এড়াতে)।
function quarantineCorrupt(key, raw){
  let copied = false;
  try{
    const prefix = CORRUPT_PREFIX + key + '_';
    for(let i=0; i<localStorage.length; i++){
      const k = localStorage.key(i);
      if(k && k.indexOf(prefix) === 0 && localStorage.getItem(k) === raw){ copied = true; break; }
    }
    if(!copied){ localStorage.setItem(prefix + Date.now(), raw); copied = true; }
  }catch(e){ copied = false; }
  corruptKeys.set(key, { copied });
}
// kind: 'array' (প্রতিটা উপাদান অবজেক্ট) | 'object'। ফাঁকা/অনুপস্থিত হলে null; নষ্ট হলে কপি+ব্লক করে null।
function readStoredJson(key, kind){
  let raw;
  try{ raw = localStorage.getItem(key); }
  catch(e){ showStorageFailBanner(); return null; }
  if(raw === null || raw === undefined || raw === '') return null;
  try{
    const v = JSON.parse(raw);
    if(kind === 'array'){
      if(Array.isArray(v) && v.every(x => x && typeof x === 'object')) return v;
    } else if(v && typeof v === 'object' && !Array.isArray(v)){ return v; }
  }catch(e){}
  quarantineCorrupt(key, raw);
  return null;
}
function clearCorruptBlocks(){ corruptKeys.clear(); renderCorruptBanner(); }
// ইউজার "নতুন করে শুরু" বেছেছে: ব্লক তুলে বর্তমান (ফাঁকা/ডিফল্ট) ডেটা আসল কী-তে লেখা হয়
function startFreshAfterCorrupt(){
  const savers = { hisab_entries:saveEntries, hisab_notes:saveNotes, hisab_plans:savePlans,
    hisab_loans:saveLoans, hisab_dues:saveDues, hisab_settings:saveSettings, hisab_recurring:saveRecurring };
  const keys = Array.from(corruptKeys.keys());
  clearCorruptBlocks();
  keys.forEach(k => { if(savers[k]) savers[k](); });
  toast(L('corruptFreshDoneToast'));
}

/* স্টোরেজ স্থায়ী (persistent) কিনা — Safari ইত্যাদি অব্যবহৃত সাইটের ডেটা মুছতে পারে */
let storagePersistState = 'unknown';   // 'yes' | 'no' | 'unknown'
function renderStoragePersistStatus(){
  const el = document.getElementById('storagePersistStatus');
  if(!el) return;
  const vKey = storagePersistState === 'yes' ? 'storagePersistYes' : (storagePersistState === 'no' ? 'storagePersistNo' : 'storagePersistUnknown');
  el.textContent = tfmt('storagePersistStatus', { v: L(vKey) });
  el.className = 'settings-desc' + (storagePersistState === 'yes' ? ' ok' : (storagePersistState === 'no' ? ' warn' : ''));
}
function requestPersistentStorage(){
  try{
    if(!(navigator.storage && typeof navigator.storage.persist === 'function')){ storagePersistState = 'unknown'; renderStoragePersistStatus(); return; }
    const already = (typeof navigator.storage.persisted === 'function') ? navigator.storage.persisted() : Promise.resolve(false);
    already.then(p => p ? true : navigator.storage.persist())
      .then(ok => { storagePersistState = ok ? 'yes' : 'no'; renderStoragePersistStatus(); })
      .catch(() => { storagePersistState = 'unknown'; renderStoragePersistStatus(); });
  }catch(e){ storagePersistState = 'unknown'; renderStoragePersistStatus(); }
}

/* ============================================================
   Load / Save
   ============================================================ */
function loadData(){
  _balanceCache = null;
  entries = readStoredJson('hisab_entries', 'array') || [];
  {
    let migrated = false;
    entries.forEach(en=>{
      if(en.transfer === undefined){ en.transfer = false; migrated = true; }
      if(en.budgetType === undefined){ en.budgetType = null; migrated = true; }
    });
    if(migrated) saveEntries();
  }
  notes = readStoredJson('hisab_notes', 'array') || [];
  {
    let nmig = false;
    notes.forEach(no=>{ if(no.price===undefined){ no.price=0; nmig=true; } });
    if(nmig) saveNotes();
  }
  plans = readStoredJson('hisab_plans', 'array') || [];
  loans = readStoredJson('hisab_loans', 'array') || [];
  try{
    let lmig = false;
    loans.forEach(l=>{
      if(!Array.isArray(l.entryIds)){
        const ids = [];
        if(l.entryId !== undefined && l.entryId !== null) ids.push(l.entryId);
        if(l.entryId2 !== undefined && l.entryId2 !== null) ids.push(l.entryId2);
        l.entryIds = ids;
        delete l.entryId; delete l.entryId2;
        lmig = true;
      }
    });
    if(lmig) saveLoans();
  }catch(err){}
  dues = readStoredJson('hisab_dues', 'array') || [];
  recurringTemplates = readStoredJson('hisab_recurring', 'array') || [];
  {
    let rmig = false;
    recurringTemplates.forEach(t=>{
      if(t.type === 'transfer'){ t.type='expense'; t.budgetType = t.budgetType || 'need'; rmig = true; }
      if(t.account !== undefined || t.toAccount !== undefined){ delete t.account; delete t.toAccount; rmig = true; }
      if(!t.history || typeof t.history !== 'object'){ t.history = {}; rmig = true; }
    });
    if(rmig) saveRecurring();
  }
  {
    const s = readStoredJson('hisab_settings', 'object');
    settings = Object.assign({ savingsTarget:0, needPct:50, wantPct:30, advancedMode:false, pctHistory:{}, darkMode:'light' }, s || {});
  }

  if(!Array.isArray(settings.accounts) || settings.accounts.length === 0){
    settings.accounts = DEFAULT_ACCOUNTS.map(a=>Object.assign({}, a));
    saveSettings();
  }
  if(isNaN(Number(settings.needPct))) settings.needPct = 50;
  if(isNaN(Number(settings.wantPct))) settings.wantPct = 30;
  settings.needPct = clampPct(settings.needPct);
  settings.wantPct = clampPct(settings.wantPct);
  if(settings.needPct + settings.wantPct > 100){ settings.needPct = 50; settings.wantPct = 30; }
  settings.advancedMode = !!settings.advancedMode;
  if(!settings.pctHistory || typeof settings.pctHistory !== 'object') settings.pctHistory = {};
  if(!['system','light','dark','black'].includes(settings.darkMode)) settings.darkMode = 'light';

  applyDarkMode();
  renderAll();
  renderBackupStatus();
  renderStoragePersistStatus();
  renderCorruptBanner();
  checkBackupReminder();
  checkRecurringReminder();
}
function saveEntries(){ _balanceCache = null; return safeSetJson('hisab_entries', entries); }
function saveNotes(){ return safeSetJson('hisab_notes', notes); }
function savePlans(){ return safeSetJson('hisab_plans', plans); }
function saveLoans(){ return safeSetJson('hisab_loans', loans); }
function saveDues(){ return safeSetJson('hisab_dues', dues); }
function saveSettings(){ return safeSetJson('hisab_settings', settings); }
function saveRecurring(){ return safeSetJson('hisab_recurring', recurringTemplates); }

/* ============================================================
   Backup reminder
   ============================================================ */
const BACKUP_REMINDER_DAYS = 7;
function getLastBackupTime(){ try{ const v = localStorage.getItem('hisab_last_backup'); return v ? Number(v) : null; }catch(e){ return null; } }
function markBackupDone(){
  try{ localStorage.setItem('hisab_last_backup', String(Date.now())); }catch(e){}
  renderBackupStatus(); hideBackupReminderBanner();
}
function daysSince(ts){ return Math.max(0, Math.floor((Date.now() - ts) / 86400000)); }
function renderBackupStatus(){
  const el = document.getElementById('lastBackupStatus');
  if(!el) return;
  const last = getLastBackupTime();
  if(!last){ el.textContent = L('lastBackupNeverStatus'); el.className = 'settings-desc warn'; return; }
  const d = daysSince(last);
  if(d === 0){ el.textContent = L('lastBackupTodayStatus'); el.className = 'settings-desc ok'; }
  else{ el.textContent = tfmt('lastBackupDaysStatus', { n: numFmt(d) }); el.className = d >= BACKUP_REMINDER_DAYS ? 'settings-desc warn' : 'settings-desc'; }
}
function hasAnyData(){
  return (entries && entries.length>0) || (notes && notes.length>0) || (plans && plans.length>0) || (loans && loans.length>0) || (dues && dues.length>0);
}
function wasBannerDismissedToday(){
  try{ const v = localStorage.getItem('hisab_backup_banner_dismissed'); if(!v) return false; return daysSince(Number(v)) === 0; }catch(e){ return false; }
}
function hideBackupReminderBanner(){ const b = document.getElementById('backupReminderBanner'); if(b) b.classList.remove('show'); }
function checkBackupReminder(){
  const banner = document.getElementById('backupReminderBanner');
  if(!banner) return;
  if(!hasAnyData() || wasBannerDismissedToday()){ banner.classList.remove('show'); return; }
  const last = getLastBackupTime();
  const msgEl = document.getElementById('backupReminderMsg');
  if(!last){ msgEl.textContent = L('backupReminderNeverMsg'); banner.classList.add('show'); }
  else {
    const d = daysSince(last);
    if(d >= BACKUP_REMINDER_DAYS){ msgEl.textContent = tfmt('backupReminderDaysMsg', { n: numFmt(d) }); banner.classList.add('show'); }
    else { banner.classList.remove('show'); }
  }
}
document.getElementById('backupReminderCloseBtn').addEventListener('click', ()=>{
  try{ localStorage.setItem('hisab_backup_banner_dismissed', String(Date.now())); }catch(e){}
  hideBackupReminderBanner();
});
function openBackupSection(){
  openSettings();
  const header = document.querySelector('.settings-section.acc-backup .sec.collapsible');
  const body = document.getElementById('settingsBackupBody');
  if(header && body && !body.classList.contains('open')){ header.classList.add('open'); body.classList.add('open'); }
  setTimeout(()=>{ if(body) body.scrollIntoView({ behavior:'smooth', block:'center' }); }, 150);
}
document.getElementById('backupReminderGoBtn').addEventListener('click', ()=>{
  hideBackupReminderBanner(); openBackupSection();
});
document.getElementById('storageFailGoBtn').addEventListener('click', openBackupSection);
document.getElementById('corruptRestoreBtn').addEventListener('click', openBackupSection);
document.getElementById('corruptFreshBtn').addEventListener('click', ()=>{
  const noCopy = Array.from(corruptKeys.values()).some(v => !v.copied);
  openSimpleConfirm(L(noCopy ? 'corruptFreshNoCopyConfirm' : 'corruptFreshConfirm'), startFreshAfterCorrupt);
});

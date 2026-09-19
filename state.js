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
      if(en.transfer) return false;
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
let settings = { savingsTarget: 0, needPct: 50, wantPct: 30, advancedMode: false, pctHistory: {}, accounts: [], darkMode: 'system' };
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
  if(meta){ return meta.i18n ? L(meta.name) : escapeHtml(meta.name); }
  return L(accLabelMap[acc] || 'accCash');
}
function getAccountsList(){ return (settings && Array.isArray(settings.accounts)) ? settings.accounts : []; }
function getAccountMeta(id){ return getAccountsList().find(a=>a.id===id) || null; }

function moneyFmt(num){
  if(typeof num !== 'number' || isNaN(num)) num = 0;
  const neg = num < 0;
  let n = Math.round(Math.abs(num)).toString();
  let formatted;
  if(lang === 'bn'){
    let last3 = n.slice(-3);
    let rest = n.slice(0,-3);
    if(rest !== ''){ rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ','); last3 = ',' + last3; }
    formatted = (rest + last3).replace(/[0-9]/g, d => banglaDigits[d]);
  } else {
    formatted = n.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }
  return (neg?'-':'') + '৳' + formatted;
}
function formatAmtInput(raw){
  let cleaned = String(raw||'').replace(/[^\d.]/g,'');
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
  return parseFloat(String(str).replace(/,/g,''));
}
function attachAmtFormatting(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.setAttribute('type','text');
  el.setAttribute('inputmode','decimal');
  el.addEventListener('input', ()=>{
    const prevVal = el.value;
    const prevPos = el.selectionStart == null ? prevVal.length : el.selectionStart;
    const digitsBeforeCursor = prevVal.slice(0, prevPos).replace(/[^\d]/g,'').length;
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
  if(amt && max && amt > max + 0.01){ btn.classList.add('state-insufficient'); }
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
  return { start: y+'-01-01', end: y+'-12-31' };
}
function setHeaderDate(){
  const d = new Date();
  const el = document.getElementById('todayDate');
  if(el) el.textContent = d.getDate()+' '+monthName(d.getMonth())+', '+d.getFullYear();
}

/* ============================================================
   Load / Save
   ============================================================ */
function loadData(){
  _balanceCache = null;
  try{
    const e = localStorage.getItem('hisab_entries');
    entries = e ? JSON.parse(e) : [];
    let migrated = false;
    entries.forEach(en=>{
      if(en.transfer === undefined){ en.transfer = false; migrated = true; }
      if(en.budgetType === undefined){ en.budgetType = null; migrated = true; }
    });
    if(migrated) saveEntries();
  }catch(err){ entries = []; }
  try{
    const n = localStorage.getItem('hisab_notes'); notes = n ? JSON.parse(n) : [];
    let nmig=false;
    notes.forEach(no=>{ if(no.price===undefined){ no.price=0; nmig=true; } });
    if(nmig) saveNotes();
  }catch(err){ notes = []; }
  try{ const p = localStorage.getItem('hisab_plans'); plans = p ? JSON.parse(p) : []; }catch(err){ plans = []; }
  try{ const ln = localStorage.getItem('hisab_loans'); loans = ln ? JSON.parse(ln) : []; }catch(err){ loans = []; }
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
  try{ const du = localStorage.getItem('hisab_dues'); dues = du ? JSON.parse(du) : []; }catch(err){ dues = []; }
  try{
    const rc = localStorage.getItem('hisab_recurring'); recurringTemplates = rc ? JSON.parse(rc) : [];
    if(!Array.isArray(recurringTemplates)) recurringTemplates = [];
    recurringTemplates.forEach(t=>{
      if(t.type === 'transfer'){ t.type='expense'; t.budgetType = t.budgetType || 'need'; }
      delete t.account; delete t.toAccount;
      if(!t.history || typeof t.history !== 'object') t.history = {};
    });
    saveRecurring();
  }catch(err){ recurringTemplates = []; }
  try{
    const s = localStorage.getItem('hisab_settings');
    settings = Object.assign({ savingsTarget:0, needPct:50, wantPct:30, advancedMode:false, pctHistory:{}, darkMode:'system' }, s ? JSON.parse(s) : {});
  }catch(err){ settings = { savingsTarget:0, needPct:50, wantPct:30, advancedMode:false, pctHistory:{}, darkMode:'system' }; }

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
  if(!['system','light','dark'].includes(settings.darkMode)) settings.darkMode = 'system';

  applyDarkMode();
  renderAll();
  renderBackupStatus();
  checkBackupReminder();
  checkRecurringReminder();
}
function saveEntries(){ _balanceCache = null; try{ localStorage.setItem('hisab_entries', JSON.stringify(entries)); }catch(e){} }
function saveNotes(){ try{ localStorage.setItem('hisab_notes', JSON.stringify(notes)); }catch(e){} }
function savePlans(){ try{ localStorage.setItem('hisab_plans', JSON.stringify(plans)); }catch(e){} }
function saveLoans(){ try{ localStorage.setItem('hisab_loans', JSON.stringify(loans)); }catch(e){} }
function saveDues(){ try{ localStorage.setItem('hisab_dues', JSON.stringify(dues)); }catch(e){} }
function saveSettings(){ try{ localStorage.setItem('hisab_settings', JSON.stringify(settings)); }catch(e){} }
function saveRecurring(){ try{ localStorage.setItem('hisab_recurring', JSON.stringify(recurringTemplates)); }catch(e){} }

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
document.getElementById('backupReminderGoBtn').addEventListener('click', ()=>{
  hideBackupReminderBanner(); openSettings();
  const header = document.querySelector('.settings-section.acc-backup .sec.collapsible');
  const body = document.getElementById('settingsBackupBody');
  if(header && body && !body.classList.contains('open')){ header.classList.add('open'); body.classList.add('open'); }
  setTimeout(()=>{ if(body) body.scrollIntoView({ behavior:'smooth', block:'center' }); }, 150);
});


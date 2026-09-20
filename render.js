/* ============================================================
   Month key + percentage history
   ============================================================ */
function monthKey(y,m){ return y+'-'+String(m+1).padStart(2,'0'); }
function dateYearMonth(dateStr){
  if(!dateStr || typeof dateStr !== 'string' || dateStr.length < 7) return { y: NaN, m: NaN };
  return { y: parseInt(dateStr.slice(0,4), 10), m: parseInt(dateStr.slice(5,7), 10) - 1 };
}
function getPctForMonth(y,m){
  if(isNaN(y) || isNaN(m)) return { needPct: settings.needPct, wantPct: settings.wantPct };
  const key = monthKey(y,m);
  const keys = Object.keys(settings.pctHistory||{}).filter(k=>k<=key).sort();
  if(keys.length){ const v = settings.pctHistory[keys[keys.length-1]]; return { needPct: clampPct(v.needPct), wantPct: clampPct(v.wantPct) }; }
  return { needPct: settings.needPct, wantPct: settings.wantPct };
}
function getSavingsPctForMonth(y,m){
  const { needPct, wantPct } = getPctForMonth(y,m);
  return Math.max(0, 100 - needPct - wantPct);
}

const GRACE_PERIOD_MS = 60 * 60 * 1000;
function msSinceCreated(id){ return Date.now() - id; }
function withinGracePeriod(id){ return msSinceCreated(id) <= GRACE_PERIOD_MS; }
function canEditEntry(en){ if(!!settings.advancedMode) return true; return withinGracePeriod(en.id); }
function canManageLoansDues(item){ if(!!settings.advancedMode) return true; return !!item && withinGracePeriod(item.id); }
function isLoanDueEntry(en){ return !!(en && (en.loanId || en.dueId)); }
function findPair(en){
  if(en.pairId != null){ return entries.find(x=> x.id !== en.id && x.pairId === en.pairId) || null; }
  return entries.find(x=> x.id !== en.id && x.transfer === true && x.date === en.date && Math.abs(x.amount - en.amount) < 0.001 && x.account !== en.account) || null;
}
function entryActionsHtml(en){
  if(isLoanDueEntry(en)) return '';
  if(canEditEntry(en)){ return '<button class="edit-icon" title="edit" onclick="event.stopPropagation(); openEditEntry('+Number(en.id)+')" onkeydown="event.stopPropagation()">✎</button>'; }
  return '';
}
function showLockInfo(id){ toast(L('editLockedToast')); openSettings(); }

/* ============================================================
   T5 — অটো-সেভিংস লিংক, "শেষ ৫টা কাজ", ব্যালেন্স সিমুলেশন (D3–D5)
   ============================================================ */
const MAX_DELETABLE_ACTIONS = 5;
function isAutoSavingsEntry(en){ return !!(en && en.autoSavingsOf != null && entries.some(x=> x.id === en.autoSavingsOf)); }
function linkedSavingsEntries(incomeId){ return entries.filter(x=> x.autoSavingsOf === incomeId); }
function actionGroupKey(en, linkedIncomeIds){
  if(en.autoSavingsOf != null) return 'inc:' + en.autoSavingsOf;
  if(linkedIncomeIds.has(en.id)) return 'inc:' + en.id;
  if(en.transfer){ const pair = findPair(en); if(pair) return 'pair:' + Math.min(en.id, pair.id); }
  return 'e:' + en.id;
}
function getRecentActionGroups(limit){
  const linkedIncomeIds = new Set();
  entries.forEach(x=>{ if(x.autoSavingsOf != null) linkedIncomeIds.add(x.autoSavingsOf); });
  const sorted = entries.filter(x=> !isLoanDueEntry(x)).slice().sort((a,b)=> b.id - a.id);
  const groups = [], byKey = new Map();
  for(const en of sorted){
    const key = actionGroupKey(en, linkedIncomeIds);
    let g = byKey.get(key);
    if(!g){
      if(groups.length >= limit) continue;
      g = { key, ids: [] }; byKey.set(key, g); groups.push(g);
    }
    g.ids.push(en.id);
  }
  return groups;
}
function entryDeleteIds(en){
  const ids = [en.id];
  if(en.transfer){ const pair = findPair(en); if(pair) ids.push(pair.id); }
  else if(en.type === 'income'){ linkedSavingsEntries(en.id).forEach(x=> ids.push(x.id)); }
  return ids;
}
function canDeleteEntry(en){
  if(!en || isLoanDueEntry(en) || isAutoSavingsEntry(en)) return false;
  if(!canEditEntry(en)) return false;
  if(!settings.advancedMode) return true;
  return getRecentActionGroups(MAX_DELETABLE_ACTIONS).some(g=> g.ids.indexOf(en.id) !== -1);
}
function simulateBalances(changeFn){
  const tally = (list)=>{
    const out = {};
    list.forEach(en=>{ out[en.account] = round2((out[en.account] || 0) + (en.type === 'income' ? en.amount : -en.amount)); });
    return out;
  };
  const before = tally(entries);
  let copy = entries.map(en=> Object.assign({}, en));
  const res = changeFn(copy);
  if(Array.isArray(res)) copy = res;
  const after = tally(copy);
  const negatives = [];
  Object.keys(after).forEach(acc=>{
    const b = before[acc] || 0;
    if(!(b < 0) && after[acc] < 0) negatives.push({ account: acc, before: b, after: after[acc] });
  });
  return negatives;
}
function simAccountList(negatives){
  return negatives.map(n=>{
    const meta = getAccountMeta(n.account);
    const name = meta ? accNameText(meta) : L(accLabelMap[n.account] || 'accCash');
    return name + ' (' + moneyFmt(n.after) + ')';
  }).join(', ');
}
function updateBudgetLabels(){
  const n = numFmt(settings.needPct), w = numFmt(settings.wantPct);
  const nt = document.getElementById('needTypeBtn'); if(nt) nt.textContent = L('needLabel') + ' (' + n + '%)';
  const wt = document.getElementById('wantTypeBtn'); if(wt) wt.textContent = L('wantLabel') + ' (' + w + '%)';
  const en = document.getElementById('editNeedBtn'); if(en) en.textContent = L('needLabel') + ' (' + n + '%)';
  const ew = document.getElementById('editWantBtn'); if(ew) ew.textContent = L('wantLabel') + ' (' + w + '%)';
}
function updateAdvancedModeStatus(){
  const el = document.getElementById('advancedModeStatus');
  if(!el) return;
  if(settings.advancedMode){ el.className = 'settings-desc warn'; el.textContent = tfmt('advancedModeStatusOn', { n: numFmt(entries.length) }); }
  else { el.className = 'settings-desc'; el.textContent = L('advancedModeStatusOff'); }
}

let _balanceCache = null;
function accountBalance(acc){
  if(_balanceCache === null){
    _balanceCache = {};
    for(const en of entries){
      const delta = en.type === 'income' ? en.amount : -en.amount;
      _balanceCache[en.account] = round2((_balanceCache[en.account] || 0) + delta);
    }
  }
  return _balanceCache[acc] || 0;
}

const balanceBreakdownModalEl = document.getElementById('balanceBreakdownModal');
function openBalanceBreakdown(){
  const accs = getVisibleAccountsList().map(a=>a.id);
  const balances = accs.map(a=>({ acc:a, amt: accountBalance(a) }));
  const total = round2(balances.reduce((s,b)=> s + b.amt, 0));
  const max = Math.max(1, ...balances.map(b=>Math.abs(b.amt)));
  const listEl = document.getElementById('balanceBreakdownList');
  listEl.innerHTML = balances.map(b=>{
    const pct = Math.round((Math.abs(b.amt)/max)*100);
    const meta = getAccountMeta(b.acc);
    const color = safeCssColor(meta && meta.color, 'var(--ink)');
    return '<div class="catrow">'+
      '<span class="k">'+accLabel(b.acc)+'</span>'+
      '<span class="bar"><span style="width:'+pct+'%; background:'+color+';"></span></span>'+
      '<span class="v" style="color:'+(b.amt<0?'var(--ledger-red)':'var(--ink)')+';">'+moneyFmt(b.amt)+'</span>'+
    '</div>';
  }).join('');
  document.getElementById('balanceBreakdownTotal').textContent = moneyFmt(total);
  document.getElementById('balanceBreakdownTotal').style.color = total < 0 ? 'var(--ledger-red)' : 'var(--ledger-green)';
  balanceBreakdownModalEl.classList.add('open');
  lockBodyScroll();
}
function closeBalanceBreakdown(){ balanceBreakdownModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('balanceBreakdownCloseBtn').addEventListener('click', closeBalanceBreakdown);
balanceBreakdownModalEl.addEventListener('click', (e)=>{ if(e.target === balanceBreakdownModalEl) closeBalanceBreakdown(); });

function updateAcctAvailableHint(){
  const hint = document.getElementById('acctAvailableHint');
  if(!hint) return;
  if(curType !== 'expense'){ hint.style.display = 'none'; return; }
  const account = document.getElementById('accountInput').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateSelfLoanRepayAcctHint(){
  const hint = document.getElementById('selfLoanRepayAcctAvailableHint');
  if(!hint) return;
  const account = document.getElementById('selfLoanRepayAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateLoanAcctAvailableHint(){
  const hint = document.getElementById('loanAcctAvailableHint');
  if(!hint) return;
  if(curLoanType !== 'given'){ hint.style.display = 'none'; return; }
  const account = document.getElementById('loanAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateLoanBtnState(){
  const btn = document.getElementById('loanSubmitBtn');
  if(!btn) return;
  if(curLoanType === 'given'){
    btn.setAttribute('data-i18n','loanGivenBtnLabel');
    btn.textContent = L('loanGivenBtnLabel');
    const amount = parseAmt(document.getElementById('loanAmount').value);
    const account = document.getElementById('loanAccount').value;
    if(account && amount && gtMoney(amount, accountBalance(account))){ btn.classList.add('state-insufficient'); }
    else { btn.classList.remove('state-insufficient'); }
  } else {
    btn.setAttribute('data-i18n','addLoanBtn');
    btn.textContent = L('addLoanBtn');
    btn.classList.remove('state-insufficient');
  }
}
function updateEntryBtnState(){
  const btn = document.getElementById('entrySubmitBtn');
  if(!btn) return;
  if(curType !== 'expense'){ btn.classList.remove('state-insufficient'); return; }
  const amount = parseAmt(document.getElementById('amountInput').value);
  const account = document.getElementById('accountInput').value;
  if(!account){ btn.classList.remove('state-insufficient'); return; }
  const avail = accountBalance(account);
  if(amount && gtMoney(amount, avail)){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
function updateWithdrawAvailableHint(){
  const hint = document.getElementById('withdrawAvailableHint');
  if(!hint) return;
  const to = document.getElementById('withdrawTo').value;
  if(!to){ hint.style.display = 'none'; return; }
  const sav = accountBalance('savings');
  hint.textContent = tfmt('withdrawAvailableFmt', { amt: moneyFmt(sav) });
  hint.style.display = 'block';
}
function updateSelfLoanAvailableHint(){
  const hint = document.getElementById('selfLoanAvailableHint');
  if(!hint) return;
  const account = document.getElementById('selfLoanAccount').value;
  const val = document.getElementById('selfLoanAmount').value;
  if(!account && !val){ hint.style.display = 'none'; return; }
  const sav = accountBalance('savings');
  const amount = parseAmt(val) || 0;
  if(amount > 0){ hint.textContent = L('remainingAfterLabel') + ': ' + moneyFmt(sav - amount); }
  else { hint.textContent = tfmt('withdrawAvailableFmt', { amt: moneyFmt(sav) }); }
  hint.style.display = 'block';
}
function updateTransferAvailableHint(){
  const hint = document.getElementById('transferAvailableHint');
  if(!hint) return;
  const account = document.getElementById('transferFromSel').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabelText(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
document.getElementById('transferFromSel').addEventListener('change', updateTransferAvailableHint);

function syncTransferToOptions(){
  const fromSel = document.getElementById('transferFromSel');
  const toSel = document.getElementById('transferToSel');
  if(!fromSel || !toSel) return;
  const fromVal = fromSel.value;
  let needsSwitch = false;
  Array.from(toSel.options).forEach(opt=>{
    if(opt.value === '') return;
    opt.disabled = (fromVal !== '' && opt.value === fromVal);
    if(opt.disabled && toSel.value === opt.value) needsSwitch = true;
  });
  if(needsSwitch){
    const firstEnabled = Array.from(toSel.options).find(opt=> opt.value !== '' && !opt.disabled);
    if(firstEnabled) toSel.value = firstEnabled.value;
  }
}
document.getElementById('transferFromSel').addEventListener('change', syncTransferToOptions);

function updateTransferBtnState(){
  const btn = document.getElementById('transferSubmitBtn');
  if(!btn) return;
  const amount = parseAmt(document.getElementById('transferAmount').value);
  const account = document.getElementById('transferFromSel').value;
  if(!account){ btn.classList.remove('state-insufficient'); return; }
  const avail = accountBalance(account);
  if(amount && gtMoney(amount, avail)){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
document.getElementById('transferAmount').addEventListener('input', updateTransferBtnState);
document.getElementById('transferFromSel').addEventListener('change', updateTransferBtnState);
document.getElementById('transferToSel').addEventListener('change', updateTransferBtnState);

function availableBalance(acc, excludeId){
  return round2(entries.filter(en=>en.account===acc && en.id!==excludeId).reduce((s,en)=> s + (en.type==='income'? en.amount : -en.amount), 0));
}

function renderAccountOptions(){
  const accs = getAccountsList();
  if(!accs.length) return;
  const active = getActiveAccountsList();
  const nonSav = active.filter(a=> a.id !== 'savings');
  const all = active;
  const optHtml = (a, cur) => {
    const label = accNameText(a);
    const icon = accOptionIconText(a.icon);
    return '<option value="'+escapeHtml(a.id)+'"'+(a.id===cur?' selected':'')+'>'+escapeHtml(icon+label)+'</option>';
  };
  const ph = '<option value="" selected disabled>'+L('selectPlaceholder')+'</option>';

  ['accountInput','transferFromSel','transferToSel','depositFrom','withdrawTo',
   'loanAccount','selfLoanAccount','selfLoanRepayAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = ph + nonSav.map(a=> optHtml(a, cur)).join('');
  });
  ['planAccount','buyPlanAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value;
    el.innerHTML = ph + all.map(a=> optHtml(a, cur)).join('');
  });
  ['settleLoanAccount','settleDueAccount','selfLoanCardRepayAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || 'cash';
    el.innerHTML = nonSav.map(a=> optHtml(a, cur)).join('');
  });
  const bps = document.getElementById('buyPlanSavingsDest');
  if(bps){ const cur = bps.value; bps.innerHTML = nonSav.map(a=> optHtml(a, cur)).join(''); }
  const ed = document.getElementById('editAccount');
  if(ed){ const cur = ed.value; ed.innerHTML = accs.filter(a=> !a.archived || a.id === cur).map(a=> optHtml(a, cur)).join(''); }

  ['entryFilterAccount','allEntriesFilterAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || 'all';
    el.innerHTML = '<option value="all">'+L('filterAllOpt')+'</option>' + accs.map(a=> optHtml(a, cur)).join('');
  });
}

const ACC_SVG = {
  '💵':'<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 12h.01M18 12h.01"/>',
  '🏦':'<path d="M3 21h18"/><path d="M5 21V10M9.5 21V10M14.5 21V10M19 21V10"/><path d="M12 3l9 5.5H3L12 3z"/>',
  '📱':'<rect x="7" y="2.5" width="10" height="19" rx="2.2"/><path d="M11 18h2"/>',
  '🏆':'<path d="M8 21h8M12 17v4"/><path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3"/>',
  '💰':'<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  '💳':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h4"/>',
  '🏧':'<rect x="3" y="3" width="18" height="18" rx="2.5"/><rect x="7" y="7" width="10" height="5" rx="1"/><path d="M8 16.5h8"/>',
  '💸':'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  '🪙':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5.2"/>',
  '💎':'<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3L8 9l4 13 4-13-3-6"/><path d="M2 9h20"/>',
  '🏪':'<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 0 0 6 0 3 3 0 0 0 6 0 3 3 0 0 0 6 0"/><path d="M5 12v9h14v-9"/><path d="M10 21v-5h4v5"/>',
  '📮':'<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 7l10 7 10-7"/>',
  '🎯':'<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/>',
  '__loan':'<path d="M7 7h13l-4-4"/><path d="M17 17H4l4 4"/>',
  '__bkash':'<path style="fill:#d12053;stroke:none" d="M9.04 10.94L10.3 16.63L18.58 12.44Z"/><path style="fill:#e2136e;stroke:none" d="M11.39 2.44L9.04 10.95L18.58 12.44Z"/><path style="fill:#d12053;stroke:none" d="M1.28 1.2L11.15 2.38L8.82 10.83Z"/><path style="fill:#9e1638;stroke:none" d="M1.2 2.86L2.3 2.86L5.38 6.81Z"/><path style="fill:#d12053;stroke:none" d="M18.84 12.39L15.98 8.41L20.62 7.58Z"/><path style="fill:#e2136e;stroke:none" d="M18.37 13.55L18.66 12.67L11.42 16.34Z"/><path style="fill:#9e1638;stroke:none" d="M8.83 11.17L10.35 17.96L5.86 21.61Z"/><path style="fill:#e2136e;stroke:none" d="M20.17 9.6L22.8 9.56L20.9 7.62Z"/>'
};
function accIconHtml(ic){
  const path = ACC_SVG[ic];
  if(!path) return escapeHtml(ic || '');
  return '<svg class="acc-svg" viewBox="0 0 24 24" aria-hidden="true">'+path+'</svg>';
}
/* T11 — <option>-এ SVG রেন্ডার হয় না, তাই SVG-only আইকন-কী-র ইমোজি ফলব্যাক */
const OPTION_ICON_FALLBACK = { '__bkash': '📱', '__loan': '💸' };
function accOptionIconText(ic){
  if(!ic) return '';
  if(OPTION_ICON_FALLBACK[ic]) return OPTION_ICON_FALLBACK[ic] + ' ';
  if(ic.indexOf('__') === 0) return '';
  return ic + ' ';
}

const ACCOUNT_ICON_CHOICES = ['💵','🏦','📱','💰','💳','🏧','💸','🪙','💎','🏪','📮','🎯'];
const ACCOUNT_COLOR_CHOICES = [
  'var(--ledger-green)','var(--blue)','var(--purple)','var(--gold)',
  'var(--ledger-red)','#0E7C7B','#E67E22','#3E7CB1','#A15C9E','#4C8C6B'
];
let newAccIcon = '💰';
let newAccColor = 'var(--ledger-green)';

function accountRowState(acc){
  if(acc.isSystem) return 'system';
  const u = accountUsage(acc.id);
  if(u.entryCount + u.loans + u.dues + u.plans === 0) return 'delete';
  return eqMoney(accountBalance(acc.id), 0) ? 'archive' : 'transfer';
}
function accountRowHtml(a, actionsHtml){
  const label = escapeHtml(a.i18n ? L(a.name) : a.name);
  const bal = accountBalance(a.id);
  const badge = a.isSystem ? '<span class="ar-badge">'+escapeHtml(L('accSystemBadge'))+'</span>' : '';
  const iconBg = (a.icon === '__bkash') ? '#FFFFFF' : safeCssColor(a.color, 'var(--line)');
  return '<div class="account-row">'+
    '<div class="ar-icon" style="background:'+iconBg+';">'+accIconHtml(a.icon||'💰')+'</div>'+
    '<div class="ar-info">'+
      '<div class="ar-name">'+label+' '+badge+'</div>'+
      '<div class="ar-bal">'+moneyFmt(bal)+'</div>'+
    '</div>'+
    '<div class="ar-actions">'+actionsHtml+'</div>'+
  '</div>';
}
function accBtnHtml(act, id, cls, title, inner){
  return '<button class="ar-btn '+cls+'" data-id="'+escapeHtml(id)+'" data-act="'+act+'" title="'+escapeHtml(title)+'" aria-label="'+escapeHtml(title)+'">'+inner+'</button>';
}
function renderAccountsList(){
  const wrap = document.getElementById('accountsList');
  if(!wrap) return;
  const accs = getActiveAccountsList();
  wrap.innerHTML = accs.map(a=>{
    const st = accountRowState(a);
    let actions = '';
    if(st === 'delete') actions = accBtnHtml('del', a.id, 'del', L('accDeleteTitle'), '🗑️');
    else if(st === 'archive') actions = accBtnHtml('archive', a.id, 'arch', L('accArchiveTitle'), '📦');
    else if(st === 'transfer') actions = accBtnHtml('transfer', a.id, 'txt', L('accTransferFirstBtn'), escapeHtml(L('accTransferFirstBtn')));
    return accountRowHtml(a, actions);
  }).join('');

  const archived = getAccountsList().filter(a=> a.archived);
  const box = document.getElementById('archivedAccountsBox');
  const listEl = document.getElementById('archivedAccountsList');
  if(box && listEl){
    box.style.display = archived.length ? 'block' : 'none';
    listEl.innerHTML = archived.map(a=> accountRowHtml(a, accBtnHtml('restore', a.id, 'restore txt', L('accRestoreBtn'), escapeHtml(L('accRestoreBtn'))))).join('');
  }
  document.querySelectorAll('#accountsList .ar-btn, #archivedAccountsList .ar-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> accountAction(btn.dataset.act, btn.dataset.id));
  });
}

function accountAction(act, id){
  const acc = getAccountMeta(id);
  if(!acc || acc.isSystem){ renderAccountsList(); return; }
  const name = accPlainName(acc);
  const changed = ()=>{ toast(L('accStateChangedToast')); renderAccountsList(); };
  if(act === 'restore'){
    if(!acc.archived){ changed(); return; }
    delete acc.archived;
    saveSettings(); renderAll();
    toast(L('accRestoredToast'));
    return;
  }
  if(acc.archived){ changed(); return; }
  const st = accountRowState(acc);
  if(act === 'del'){
    if(st !== 'delete'){ changed(); return; }
    openSimpleConfirm(tfmt('accDeleteConfirmFmt', { name }), ()=>{
      const cur = getAccountMeta(id);
      if(!cur || accountRowState(cur) !== 'delete'){ changed(); return; }
      settings.accounts = settings.accounts.filter(a=> a.id !== id);
      saveSettings(); renderAll();
      toast(L('accDeletedToast'));
    });
  } else if(act === 'archive'){
    if(st !== 'archive'){ changed(); return; }
    openSimpleConfirm(tfmt('accArchiveConfirmFmt', { name }), ()=>{
      const cur = getAccountMeta(id);
      if(!cur || accountRowState(cur) !== 'archive'){ changed(); return; }
      cur.archived = true;
      saveSettings(); renderAll();
      toast(L('accArchivedToast'));
    });
  } else if(act === 'transfer'){
    if(st !== 'transfer'){ changed(); return; }
    openAlert(tfmt('accTransferFirstMsgFmt', { name, amt: moneyFmt(accountBalance(id)) }));
  }
}

function renderIconPicker(){
  const wrap = document.getElementById('accountIconPicker');
  if(!wrap) return;
  wrap.innerHTML = ACCOUNT_ICON_CHOICES.map(ic=>
    '<div class="icon-opt'+(ic===newAccIcon?' selected':'')+'" data-ic="'+ic+'">'+accIconHtml(ic)+'</div>'
  ).join('');
  wrap.querySelectorAll('.icon-opt').forEach(el=>{ el.addEventListener('click', ()=>{ newAccIcon = el.dataset.ic; renderIconPicker(); }); });
}
function renderColorPicker(){
  const wrap = document.getElementById('accountColorPicker');
  if(!wrap) return;
  wrap.innerHTML = ACCOUNT_COLOR_CHOICES.map(c=>
    '<div class="color-opt'+(c===newAccColor?' selected':'')+'" data-c="'+c+'" style="background:'+c+';"></div>'
  ).join('');
  wrap.querySelectorAll('.color-opt').forEach(el=>{ el.addEventListener('click', ()=>{ newAccColor = el.dataset.c; renderColorPicker(); }); });
}
function resetAccountForm(){
  document.getElementById('accountNameInput').value = '';
  newAccIcon = '💰';
  newAccColor = ACCOUNT_COLOR_CHOICES[getAccountsList().length % ACCOUNT_COLOR_CHOICES.length];
  renderIconPicker(); renderColorPicker();
}
document.getElementById('accountAddToggleBtn')?.addEventListener('click', ()=>{
  const box = document.getElementById('accountFormBox');
  const showing = box.style.display !== 'none';
  if(showing){ box.style.display = 'none'; } else { resetAccountForm(); box.style.display = 'block'; }
});
document.getElementById('accountFormCancelBtn')?.addEventListener('click', ()=>{ document.getElementById('accountFormBox').style.display = 'none'; });
document.getElementById('accountFormSaveBtn')?.addEventListener('click', ()=>{
  const name = document.getElementById('accountNameInput').value.trim();
  if(!name){ toast(L('accNameRequiredToast')); return; }
  const dup = getAccountsList().find(a=> accPlainName(a).toLowerCase() === name.toLowerCase());
  if(dup){ toast(dup.archived ? L('accNameDupArchivedToast') : L('accNameDupToast')); return; }
  const id = 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  settings.accounts.push({ id, name, icon: newAccIcon, color: newAccColor, isSystem: false, i18n: false });
  saveSettings();
  document.getElementById('accountFormBox').style.display = 'none';
  renderAll();
  toast(L('accAddedToast'));
});

function renderAll(){
  updateBudgetLabels();
  renderAccountOptions();
  renderAccountsList();
  updateAcctAvailableHint();
  updateTransferBtnState();
  renderBalances();
  renderEntryList();
  if(allEntriesModalEl.classList.contains('open')) renderAllEntriesModalList();
  renderSavingsTab();
  renderLoansTab();
  renderDuesTab();
  renderNotes();
  renderPlans();
  renderPlanHistory();
  renderSummary();
  refreshNoteSuggestions();
  refreshPlanItemSuggestions();
}
function renderDashAccCards(){
  const grid = document.getElementById('dashAccGrid');
  if(!grid) return;
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings');
  const isDark = document.documentElement.getAttribute('data-theme')==='dark' || document.documentElement.getAttribute('data-theme')==='black';
  const bgMap = {
    cash:  isDark ? '#1E5A45' : '#D4E8DF',
    bank:  isDark ? '#1F3E63' : '#D6E2F2',
    bkash: '#FFFFFF',
    savings: isDark ? '#5A4418' : '#F5E6C0'
  };
  const iconBox = (bg, color, svgHtml) =>
    '<span style="display:inline-flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:12px;background:'+bg+';color:'+color+';margin-right:10px;flex-shrink:0;">'+svgHtml+'</span>';
  let cardsHtml = accs.map(a=>{
    const label = escapeHtml(a.i18n ? L(a.name) : a.name);
    const color = safeCssColor(a.color);
    const bg = bgMap[a.id] || (isDark ? '#333' : '#EEE');
    const iconPart = a.icon ? iconBox(bg, color, accIconHtml(a.icon)) : '';
    return '<div class="acc-card" style="border-left-color:'+color+';">'+
      '<div><div class="lbl" style="display:flex;align-items:center;white-space:normal;overflow:visible;text-overflow:clip;font-size:12px;">'+iconPart+'<span>'+label+'</span></div>'+
      '<div class="val" id="balAcc_'+escapeHtml(a.id)+'">৳০</div></div>'+
      '<div class="acc-sub" id="balAccSav_'+escapeHtml(a.id)+'"></div>'+
    '</div>';
  }).join('');
  const loanBg = isDark ? '#5A2222' : '#F5D6D6';
  const loanCard = '<div class="acc-card loan"><div><div class="lbl" style="display:flex;align-items:center;white-space:normal;overflow:visible;font-size:12px;">'+iconBox(loanBg,'var(--ledger-red)',accIconHtml('__loan'))+'<span>'+L('accLoan')+'</span></div><div class="val loan-val" id="balLoanNet">৳০</div></div></div>';
  grid.innerHTML = cardsHtml + loanCard;
}

function renderBalances(){
  renderDashAccCards();
  const accs = getVisibleAccountsList().filter(a=> a.id !== 'savings');
  const sav = accountBalance('savings');
  const src = savingsContributionByAccount();
  const savLine = (v)=> v>0 ? tfmt('accSavingsLockedFmt', { amt: moneyFmt(v) }) : '';
  let totalNoSavings = 0;
  accs.forEach(a=>{
    const bal = accountBalance(a.id);
    const contrib = src[a.id] || 0;
    totalNoSavings = round2(totalNoSavings + bal);
    const valEl = document.getElementById('balAcc_'+a.id);
    if(valEl) valEl.textContent = moneyFmt(round2(bal + contrib));
    const subEl = document.getElementById('balAccSav_'+a.id);
    if(subEl) subEl.textContent = savLine(contrib);
  });
  document.getElementById('grandTotal').textContent = moneyFmt(round2(totalNoSavings + sav));
  document.getElementById('grandTotalNoSavings').textContent = moneyFmt(totalNoSavings);
  const bl = document.getElementById('balLoanNet');
  if(bl) bl.textContent = moneyFmt(loanNetOwed());
  renderDailyMoneySummary();
}

function renderDailyMoneySummary(){
  const dueReceivable = round2(dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const duePayable = round2(dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const elR = document.getElementById('dailySumDueReceivable');
  const elP = document.getElementById('dailySumDuePayable');
  if(elR) elR.textContent = moneyFmt(dueReceivable);
  if(elP) elP.textContent = moneyFmt(duePayable);
}

function renderEntryList(){
  const list = document.getElementById('entryList');
  if(!list) return;
  const normal = entries.filter(en=> en.account !== 'savings');
  if(normal.length === 0){ list.innerHTML = '<div class="empty">'+L('noEntriesYet')+'</div>'; return; }
  const searchEl = document.getElementById('entrySearchInput');
  const accEl = document.getElementById('entryFilterAccount');
  const typeEl = document.getElementById('entryFilterType');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const accFilter = accEl ? accEl.value : 'all';
  const typeFilter = typeEl ? typeEl.value : 'all';
  const hasFilter = q !== '' || accFilter !== 'all' || typeFilter !== 'all';
  let filtered = normal;
  if(accFilter !== 'all') filtered = filtered.filter(en=> en.account === accFilter);
  if(typeFilter !== 'all') filtered = filtered.filter(en=> en.type === typeFilter);
  if(q !== '') filtered = filtered.filter(en=> (en.note||'').toLowerCase().includes(q));
  if(filtered.length === 0){ list.innerHTML = '<div class="empty">'+L('noFilteredEntries')+'</div>'; return; }
  const sorted = [...filtered].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
  const shown = hasFilter ? sorted : sorted.slice(0,60);
  list.innerHTML = shown.map(en => `
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left">
        <span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${(en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}${escapeHtml(en.date)}${en.note ? ' · ' + escapeHtml(en.note) : ''}</span>
      </div>
      <div class="actions">
        <span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>
        ${entryActionsHtml(en)}
      </div>
    </div>
  `).join('');
}

const allEntriesModalEl = document.getElementById('allEntriesModal');
let allEntriesShownCount = 50;
const ALL_ENTRIES_PAGE_SIZE = 50;

function getAllEntriesFiltered(){
  const normal = entries.filter(en=> en.account !== 'savings');
  const searchEl = document.getElementById('allEntriesSearchInput');
  const accEl = document.getElementById('allEntriesFilterAccount');
  const typeEl = document.getElementById('allEntriesFilterType');
  const q = searchEl ? searchEl.value.trim().toLowerCase() : '';
  const accFilter = accEl ? accEl.value : 'all';
  const typeFilter = typeEl ? typeEl.value : 'all';
  let filtered = normal;
  if(accFilter !== 'all') filtered = filtered.filter(en=> en.account === accFilter);
  if(typeFilter !== 'all') filtered = filtered.filter(en=> en.type === typeFilter);
  if(q !== '') filtered = filtered.filter(en=> (en.note||'').toLowerCase().includes(q));
  return [...filtered].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
}
function renderAllEntriesModalList(){
  const list = document.getElementById('allEntriesList');
  const loadMoreBtn = document.getElementById('allEntriesLoadMoreBtn');
  const normal = entries.filter(en=> en.account !== 'savings');
  if(normal.length === 0){ list.innerHTML = '<div class="empty">'+L('noEntriesYet')+'</div>'; loadMoreBtn.style.display = 'none'; return; }
  const sorted = getAllEntriesFiltered();
  if(sorted.length === 0){ list.innerHTML = '<div class="empty">'+L('noFilteredEntries')+'</div>'; loadMoreBtn.style.display = 'none'; return; }
  const shown = sorted.slice(0, allEntriesShownCount);
  list.innerHTML = shown.map(en => `
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left"><span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${(en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}${escapeHtml(en.date)}${en.note ? ' · ' + escapeHtml(en.note) : ''}</span></div>
      <div class="actions"><span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>${entryActionsHtml(en)}</div>
    </div>
  `).join('');
  loadMoreBtn.style.display = sorted.length > allEntriesShownCount ? 'block' : 'none';
}
function openAllEntriesModal(){
  allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE;
  document.getElementById('allEntriesSearchInput').value = '';
  document.getElementById('allEntriesFilterAccount').value = 'all';
  document.getElementById('allEntriesFilterType').value = 'all';
  renderAllEntriesModalList();
  allEntriesModalEl.classList.add('open');
  lockBodyScroll();
}
function closeAllEntriesModal(){ allEntriesModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('viewAllEntriesBtn').addEventListener('click', openAllEntriesModal);
document.getElementById('allEntriesCloseBtn').addEventListener('click', closeAllEntriesModal);
allEntriesModalEl.addEventListener('click', (e)=>{ if(e.target === allEntriesModalEl) closeAllEntriesModal(); });
document.getElementById('allEntriesSearchInput').addEventListener('input', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesFilterAccount').addEventListener('change', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesFilterType').addEventListener('change', ()=>{ allEntriesShownCount = ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });
document.getElementById('allEntriesLoadMoreBtn').addEventListener('click', ()=>{ allEntriesShownCount += ALL_ENTRIES_PAGE_SIZE; renderAllEntriesModalList(); });

function savingsContributionByAccount(){
  const result = {};
  getAccountsList().forEach(a=>{ if(a.id !== 'savings') result[a.id] = 0; });
  const savTransfers = entries.filter(en=> en.transfer && en.account==='savings').sort((a,b)=> String(a.date||'').localeCompare(String(b.date||'')) || a.id - b.id);
  savTransfers.forEach(en=>{
    if(en.type==='income'){
      const pair = findPair(en);
      if(pair && result.hasOwnProperty(pair.account)){ result[pair.account] += en.amount; }
    } else {
      let remaining = en.amount;
      const keys = Object.keys(result).filter(k=> result[k] > 0);
      const totalPos = round2(keys.reduce((s,k)=> s + result[k], 0));
      if(totalPos > 0){
        const take = Math.min(remaining, totalPos);
        keys.forEach(k=>{ result[k] = round2(result[k] - (result[k] / totalPos) * take); });
      }
    }
  });
  Object.keys(result).forEach(k=>{ if(result[k] < 0.01) result[k] = 0; });
  return result;
}

function loanNetOwed(){
  const payable = round2(loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const receivable = round2(loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0));
  return round2(payable - receivable);
}

function renderLoansTab(){
  const payable = round2(loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const receivable = round2(loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const payEl = document.getElementById('loanTotalPayable'); if(payEl) payEl.textContent = moneyFmt(payable);
  const recEl = document.getElementById('loanTotalReceivable'); if(recEl) recEl.textContent = moneyFmt(receivable);
  renderSelfLoanRepayOptions();
  const list = document.getElementById('loansList');
  if(!list) return;
  const unsettledLoans = loans.filter(l=>!l.settled);
  if(unsettledLoans.length === 0){ list.innerHTML = '<div class="empty">'+L('loanEmptyMsg')+'</div>'; return; }
  const sorted = [...unsettledLoans].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  list.innerHTML = sorted.map(l=>{
    const typeLabel = l.type==='taken' ? L('loanTakenLabel') : l.type==='self' ? L('loanSelfLabel') : L('loanGivenLabel');
    const badgeClass = l.type==='taken' ? 'need' : l.type==='self' ? 'self' : 'want';
    const dueRow = l.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+escapeHtml(l.dueDate)+'</b></div>' : '';
    const noteRow = l.note ? '<div>'+L('planNoteFmt')+escapeHtml(l.note)+'</div>' : '';
    const isPayable = (l.type==='taken' || l.type==='self');
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtnAction = l.type==='self' ? 'openSelfLoanCardRepayModal('+Number(l.id)+')' : 'settleLoan('+Number(l.id)+')';
    const settleBtn = !l.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="'+settleBtnAction+'">'+settleBtnLabel+'</button>' : '';
    const itemStateClass = l.settled ? 'item-settled' : (isPayable ? 'item-due' : '');
    const partialPaidRow = (!l.settled && l.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(l.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(l.amount)+'</div>' : '';
    const selfPendingRow = (l.type==='self' && !l.settled) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">⚠ '+L('loanSelfPendingNote')+'</div>' : '';
    const loanDelBtn = canManageLoansDues(l) ? '<button class="pdel" onclick="deleteLoan('+Number(l.id)+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+(l.type==='self' ? '' : escapeHtml(l.person))+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(l.amount)+'</span></div>'+
      '<div class="pmeta"><div>'+L('planFromAccPrefix')+'<b>'+accLabel(l.account)+'</b></div><div>'+L('loanDatePrefix')+'<b>'+escapeHtml(l.date)+'</b></div>'+dueRow+noteRow+partialPaidRow+selfPendingRow+'</div>'+
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">'+settleBtn+loanDelBtn+'</div>'+
    '</div>';
  }).join('');
}
function renderDuesTab(){
  const totalReceivable = round2(dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const totalPayable = round2(dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const recEl = document.getElementById('dueTotalReceivable'); if(recEl) recEl.textContent = moneyFmt(totalReceivable);
  const payEl = document.getElementById('dueTotalPayable'); if(payEl) payEl.textContent = moneyFmt(totalPayable);
  const list = document.getElementById('duesList');
  if(!list) return;
  const unsettledDues = dues.filter(d=>!d.settled);
  if(unsettledDues.length === 0){ list.innerHTML = '<div class="empty">'+L('dueEmptyMsg')+'</div>'; return; }
  const sorted = [...unsettledDues].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
  list.innerHTML = sorted.map(d=>{
    const typeLabel = d.type==='receivable' ? L('dueReceivableLabel') : L('duePayableLabel');
    const badgeClass = d.type==='receivable' ? 'want' : 'need';
    const isPayable = d.type==='payable';
    const itemStateClass = d.settled ? 'item-settled' : (isPayable ? 'item-due' : '');
    const reasonRow = d.reason ? '<div>'+L('dueReasonLabel')+': '+escapeHtml(d.reason)+'</div>' : '';
    const dueDateRow = d.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+escapeHtml(d.dueDate)+'</b></div>' : '';
    const partialRow = (!d.settled && d.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(d.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(d.amount)+'</div>' : '';
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtn = !d.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="openSettleDueModal('+Number(d.id)+')">'+settleBtnLabel+'</button>' : '';
    const dueDelBtn = canManageLoansDues(d) ? '<button class="pdel" onclick="deleteDue('+Number(d.id)+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+escapeHtml(d.person)+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(d.amount)+'</span></div>'+
      '<div class="pmeta">'+reasonRow+'<div>'+L('loanDatePrefix')+'<b>'+escapeHtml(d.date)+'</b></div>'+dueDateRow+partialRow+'</div>'+
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">'+settleBtn+dueDelBtn+'</div>'+
    '</div>';
  }).join('');
}
function renderSavingsTab(){
  const sav = accountBalance('savings');
  document.getElementById('totalSavingsVal').textContent = moneyFmt(sav);
  updateWithdrawAvailableHint();
  const target = settings.savingsTarget || 0;
  document.getElementById('targetInput').value = target ? formatAmtInput(String(target)) : '';
  document.getElementById('progressText').textContent = moneyFmt(sav) + ' ' + L('depositedSuffix');
  document.getElementById('progressTarget').textContent = L('targetPrefix') + moneyFmt(target);
  const pct = target > 0 ? Math.min(100, Math.round((sav/target)*100)) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  const list = document.getElementById('savingsList');
  const savTx = entries.filter(en=> en.transfer && (en.account==='savings'));
  if(savTx.length === 0){ list.innerHTML = '<div class="empty">'+L('noTransactions')+'</div>'; return; }
  const sorted = [...savTx].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id - a.id);
  list.innerHTML = sorted.map(en=>`
    <div class="entry ${en.type==='income' ? 'income-bg' : 'expense-bg'}" onclick="openEntryDetail(${Number(en.id)})" role="button" tabindex="0">
      <div class="left"><span class="tag">${escapeHtml(en.date)}${en.note?' · '+escapeHtml(en.note):''}</span></div>
      <div class="actions"><span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>${entryActionsHtml(en)}</div>
    </div>
  `).join('');
}
function renderNotes(){
  const list = document.getElementById('notesList');
  const totalEl = document.getElementById('notesTotalVal');
  if(totalEl){
    const notesLeft = round2(notes.reduce((s,n)=> s + (n.done ? 0 : (Number(n.price)||0)), 0));
    const plansLeft = round2(plans.reduce((s,p)=> s + (p.bought ? 0 : (Number(p.amount)||0)), 0));
    totalEl.textContent = moneyFmt(round2(notesLeft + plansLeft));
  }
  if(notes.length === 0){ list.innerHTML = '<div class="empty">'+L('noItems')+'</div>'; return; }
  const sorted = [...notes].sort((a,b)=> (a.done - b.done) || b.id - a.id);
  list.innerHTML = sorted.map(n => {
    const locked = n.done && !settings.advancedMode;
    return '<div class="note-item">' +
      '<input type="checkbox" '+(n.done?'checked':'')+' '+(locked?'disabled title="'+L('advancedModeLabel')+'"':'')+' onchange="toggleNote('+Number(n.id)+')">' +
      '<div class="txt '+(n.done?'done':'')+'">'+escapeHtml(n.text)+'</div>' +
      (n.price ? '<span class="price">'+moneyFmt(n.price)+'</span>' : '') +
      '<button class="del" onclick="deleteNote('+Number(n.id)+')">×</button></div>';
  }).join('');
}
function budgetBarColor(ratioPct){
  const r = Math.max(0, ratioPct) / 100;
  let h, s, l;
  if(r <= 1){ const t = r; h = 140 - 140 * t; s = 55; l = 38 + 22 * t; }
  else { const t = Math.min(1, (r - 1) / 0.5); h = 0; s = 55 + 30 * t; l = 60 - 30 * t; }
  return 'hsl('+h.toFixed(0)+', '+s.toFixed(0)+'%, '+l.toFixed(0)+'%)';
}
function getChartPeriods(anchorDate){
  const periods = [];
  if(periodMode === 'day'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate); d.setHours(0,0,0,0); d.setDate(d.getDate() - i);
      const start = toISO(d);
      periods.push({ start, end: start, label: numFmt(d.getDate()), sub: monthName(d.getMonth()).slice(0,3) });
    }
  } else if(periodMode === 'week'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate); d.setHours(0,0,0,0); d.setDate(d.getDate() - i*7);
      const s = getWeekStart(d); const e = new Date(s); e.setDate(e.getDate()+6);
      periods.push({ start: toISO(s), end: toISO(e), label: numFmt(s.getDate()), sub: monthName(s.getMonth()).slice(0,3) });
    }
  } else if(periodMode === 'month'){
    for(let i=5; i>=0; i--){
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth()-i, 1);
      const y = d.getFullYear(), m = d.getMonth();
      periods.push({ start: toISO(new Date(y,m,1)), end: toISO(new Date(y,m+1,0)), label: monthName(m), sub: (m===0 ? "'"+String(y).slice(2) : '') });
    }
  } else {
    for(let i=5; i>=0; i--){
      const y = anchorDate.getFullYear() - i;
      periods.push({ start: y+'-01-01', end: y+'-12-31', label: numFmt(y), sub: '' });
    }
  }
  return periods;
}
function computeChartData(anchorDate){
  const periods = getChartPeriods(anchorDate);
  return periods.map(p=>{
    let inc = 0, exp = 0;
    for(let i=0; i<entries.length; i++){
      const en = entries[i];
      if(!isOperating(en)) continue;
      if(en.date >= p.start && en.date <= p.end){
        if(en.type === 'income') inc += en.amount;
        else exp += en.amount;
      }
    }
    return { inc: round2(inc), exp: round2(exp), label: p.label, sub: p.sub };
  });
}
function renderPeriodChart(anchorDate){
  const wrap = document.getElementById('monthlyChartWrap');
  if(!wrap) return;
  const data = computeChartData(anchorDate);
  const maxVal = Math.max(1, ...data.map(d=>d.inc), ...data.map(d=>d.exp));
  const VW = 700, VH = 230;
  const chartTop = 34, chartBottom = 40;
  const chartAreaH = VH - chartTop - chartBottom;
  const groupW = VW / data.length;
  const barW = Math.min(34, groupW * 0.32);
  const gap = 6;
  let bars = '', labels = '';
  data.forEach((d, i)=>{
    const cx = groupW*i + groupW/2;
    const incX = cx - barW - gap/2, expX = cx + gap/2;
    const incH = d.inc>0 ? Math.max(2, (d.inc/maxVal)*chartAreaH) : 0;
    const expH = d.exp>0 ? Math.max(2, (d.exp/maxVal)*chartAreaH) : 0;
    const incY = chartTop + (chartAreaH - incH);
    const expY = chartTop + (chartAreaH - expH);
    if(incH>0){
      bars += '<rect x="'+incX.toFixed(1)+'" y="'+incY.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+incH.toFixed(1)+'" rx="4" fill="var(--ledger-green)"></rect>';
      bars += '<text x="'+(incX+barW/2).toFixed(1)+'" y="'+(incY-6).toFixed(1)+'" text-anchor="middle" font-size="14" font-weight="600" fill="var(--ledger-green)">'+escapeHtml(moneyFmt(d.inc))+'</text>';
    }
    if(expH>0){
      bars += '<rect x="'+expX.toFixed(1)+'" y="'+expY.toFixed(1)+'" width="'+barW.toFixed(1)+'" height="'+expH.toFixed(1)+'" rx="4" fill="var(--ledger-red)"></rect>';
      bars += '<text x="'+(expX+barW/2).toFixed(1)+'" y="'+(expY-6).toFixed(1)+'" text-anchor="middle" font-size="14" font-weight="600" fill="var(--ledger-red)">'+escapeHtml(moneyFmt(d.exp))+'</text>';
    }
    const labelText = d.sub ? (d.label + ' ' + d.sub) : d.label;
    labels += '<text x="'+cx.toFixed(1)+'" y="'+(VH-14)+'" text-anchor="middle" font-size="14" fill="var(--ink)">'+escapeHtml(labelText)+'</text>';
  });
  const baselineY = chartTop + chartAreaH;
  wrap.innerHTML = '<svg viewBox="0 0 '+VW+' '+VH+'" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">' +
    '<line x1="0" y1="'+baselineY+'" x2="'+VW+'" y2="'+baselineY+'" stroke="var(--line)" stroke-width="2"></line>' +
    bars + labels + '</svg>';
}
function renderSummary(){
  const y = viewMonth.getFullYear(), m = viewMonth.getMonth();
  document.getElementById('monthLabel').textContent = monthName(m) + ' ' + numFmt(y);
  document.getElementById('yearLabel').textContent = numFmt(viewYear);
  document.getElementById('dayLabel').textContent = fmtDayLabel(viewDay);
  const wkEnd = new Date(viewWeekStart); wkEnd.setDate(wkEnd.getDate() + 6);
  document.getElementById('weekLabel').textContent = fmtWeekLabel(viewWeekStart, wkEnd);

  let anchorDate;
  if(periodMode === 'day')        anchorDate = viewDay;
  else if(periodMode === 'week')  anchorDate = viewWeekStart;
  else if(periodMode === 'year')  anchorDate = new Date(viewYear, 0, 1);
  else                            anchorDate = viewMonth;

  const chartTitleKey = periodMode === 'day'   ? 'monthlyChartTitleDay'
                      : periodMode === 'week'  ? 'monthlyChartTitleWeek'
                      : periodMode === 'year'  ? 'monthlyChartTitleYear'
                      : 'monthlyChartTitle';
  const chartTitleEl = document.getElementById('monthlyChartTitleText');
  if(chartTitleEl) chartTitleEl.textContent = L(chartTitleKey);

  renderPeriodChart(anchorDate);

  const range = getPeriodRange();
  const inRange = (ds) => !!ds && ds >= range.start && ds <= range.end;
  const monthAll = entries.filter(en => inRange(en.date));
  const monthNormal = monthAll.filter(en=>!en.transfer);
  const monthOperating = monthNormal.filter(isOperating);
  const inc = round2(monthOperating.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0));
  const exp = round2(monthOperating.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0));
  document.getElementById('sumIncome').textContent = moneyFmt(inc);
  document.getElementById('sumExpense').textContent = moneyFmt(exp);
  const sumBalanceEl = document.getElementById('sumBalance');
  const currentTotalBalance = round2(getAccountsList().reduce((s,a)=> s + accountBalance(a.id), 0));
  sumBalanceEl.textContent = moneyFmt(currentTotalBalance);
  sumBalanceEl.style.color = currentTotalBalance < 0 ? 'var(--ledger-red)' : '';

  const periodLoans = loans.filter(l => inRange(l.date));
  const periodPayable = round2(periodLoans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0));
  const periodReceivable = round2(periodLoans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0));
  document.getElementById('sumPayable').textContent = moneyFmt(periodPayable);
  document.getElementById('sumReceivable').textContent = moneyFmt(periodReceivable);
  document.getElementById('sumSavings').textContent = moneyFmt(accountBalance('savings'));

  const periodDues = dues.filter(d => inRange(d.date));
  const periodDueReceivable = round2(periodDues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  const periodDuePayable = round2(periodDues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0));
  document.getElementById('sumDueReceivable').textContent = moneyFmt(periodDueReceivable);
  document.getElementById('sumDuePayable').textContent = moneyFmt(periodDuePayable);

  const { needPct, wantPct } = getPctForMonth(anchorDate.getFullYear(), anchorDate.getMonth());
  const needSpent = round2(monthOperating.filter(en=>en.type==='expense' && en.budgetType==='need').reduce((s,e)=>s+e.amount,0));
  const wantSpent = round2(monthOperating.filter(en=>en.type==='expense' && en.budgetType==='want').reduce((s,e)=>s+e.amount,0));
  const needTarget = round2(inc * needPct/100), wantTarget = round2(inc * wantPct/100);
  document.getElementById('budgetTitle').textContent = tfmt('budgetTitleFmt', { need:numFmt(needPct), want:numFmt(wantPct) });
  document.getElementById('needSpentLabel').textContent = tfmt('needPctLabelFmt', { pct:numFmt(needPct) });
  document.getElementById('wantSpentLabel').textContent = tfmt('wantPctLabelFmt', { pct:numFmt(wantPct) });
  document.getElementById('needAmt').textContent = moneyFmt(needSpent) + (inc>0? ' / '+moneyFmt(needTarget) : '');
  document.getElementById('wantAmt').textContent = moneyFmt(wantSpent) + (inc>0? ' / '+moneyFmt(wantTarget) : '');
  const needRatioPct = needTarget>0 ? (needSpent/needTarget*100) : (needSpent>0 ? 150 : 0);
  const wantRatioPct = wantTarget>0 ? (wantSpent/wantTarget*100) : (wantSpent>0 ? 150 : 0);
  const needFillEl = document.getElementById('needFill'), wantFillEl = document.getElementById('wantFill');
  needFillEl.style.width = (needTarget>0 ? Math.min(100, Math.round(needRatioPct)) : (needSpent>0 ? 100 : 0)) + '%';
  needFillEl.style.background = budgetBarColor(needRatioPct);
  wantFillEl.style.width = (wantTarget>0 ? Math.min(100, Math.round(wantRatioPct)) : (wantSpent>0 ? 100 : 0)) + '%';
  wantFillEl.style.background = budgetBarColor(wantRatioPct);

  const accDiv = document.getElementById('accMonthBreakdown');
  const accs = getAccountsList().filter(a=> !a.archived || monthAll.some(en=> en.account === a.id)).map(a=>a.id);
  accDiv.innerHTML = accs.map(a=>{
    const net = round2(monthAll.filter(en=>en.account===a).reduce((s,en)=> s + (en.type==='income'? en.amount : -en.amount), 0));
    return '<div class="acc-mini-row"><span>'+accLabel(a)+'</span><span style="font-weight:600; color:'+(net>=0?'var(--ledger-green)':'var(--ledger-red)')+'">'+(net>=0?'+':'')+moneyFmt(net)+'</span></div>';
  }).join('');

  const cats = Object.create(null);
  monthOperating.filter(en=>en.type==='expense').forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    cats[key] = round2((cats[key]||0) + en.amount);
  });
  const catDiv = document.getElementById('catBreakdown');
  const catKeys = Object.keys(cats).sort((a,b)=>cats[b]-cats[a]).slice(0,8);
  if(catKeys.length===0){ catDiv.innerHTML = '<div class="empty">'+L('noExpense')+'</div>'; }
  else {
    const max = cats[catKeys[0]];
    catDiv.innerHTML = catKeys.map(k=>'<div class="catrow"><span class="k">'+escapeHtml(k)+'</span><span class="bar"><span style="width:'+Math.round((cats[k]/max)*100)+'%"></span></span><span class="v">'+moneyFmt(cats[k])+'</span></div>').join('');
  }

  const settleEntries = monthNormal.filter(en => en.loanId || en.dueId);
  const periodCollected = round2(settleEntries.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0));
  const periodRepaid = round2(settleEntries.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0));
  const debtTotalsEl = document.getElementById('debtSettleTotals');
  if(debtTotalsEl){
    debtTotalsEl.innerHTML = '<div class="acc-mini-row"><span>'+L('debtCollectedLabel')+'</span><span style="font-weight:600; color:var(--ledger-green);">'+moneyFmt(periodCollected)+'</span></div>' +
      '<div class="acc-mini-row"><span>'+L('debtRepaidLabel')+'</span><span style="font-weight:600; color:var(--ledger-red);">'+moneyFmt(periodRepaid)+'</span></div>';
  }
  const debtCats = Object.create(null);
  settleEntries.forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    debtCats[key] = round2((debtCats[key]||0) + en.amount);
  });
  const debtDiv = document.getElementById('debtSettleBreakdown');
  if(debtDiv){
    const debtKeys = Object.keys(debtCats).sort((a,b)=>debtCats[b]-debtCats[a]).slice(0,8);
    if(debtKeys.length===0){ debtDiv.innerHTML = '<div class="empty">'+L('debtSettleEmptyMsg')+'</div>'; }
    else {
      const maxD = debtCats[debtKeys[0]];
      debtDiv.innerHTML = debtKeys.map(k=>'<div class="catrow"><span class="k">'+escapeHtml(k)+'</span><span class="bar"><span style="width:'+Math.round((debtCats[k]/maxD)*100)+'%"></span></span><span class="v">'+moneyFmt(debtCats[k])+'</span></div>').join('');
    }
  }

  const titleKey = periodMode === 'day'   ? 'entryListTitleDay'
                 : periodMode === 'week'  ? 'entryListTitleWeek'
                 : periodMode === 'month' ? 'entryListTitleMonth'
                 : 'entryListTitleYear';
  document.getElementById('entryListTitleText').textContent = L(titleKey);

  const monthList = document.getElementById('monthEntryList');
  if(monthNormal.length===0){ monthList.innerHTML = '<div class="empty">'+L('noEntries')+'</div>'; }
  else {
    const sorted = [...monthNormal].sort((a,b)=> String(b.date||'').localeCompare(String(a.date||'')) || b.id-a.id);
    monthList.innerHTML = sorted.map(en=>'<div class="entry"><div class="left"><span class="tag"><span class="accbadge">'+accLabel(en.account)+'</span>'+((en.budgetType==='need'||en.budgetType==='want')?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):'')+escapeHtml(en.date)+(en.note?' · '+escapeHtml(en.note):'')+'</span></div><div class="actions"><span class="amt '+en.type+'">'+(en.type==='income'?'+':'-')+moneyFmt(en.amount)+'</span>'+entryActionsHtml(en)+'</div></div>').join('');
  }
}

function refreshNoteSuggestions(){
  const counts = Object.create(null);
  entries.forEach(en=>{
    const n = (en.note||'').trim();
    if(n) counts[n] = (counts[n]||0) + 1;
  });
  const sorted = Object.keys(counts).sort((a,b)=> counts[b]-counts[a]);
  const dl = document.getElementById('noteSuggestions');
  if(dl) dl.innerHTML = sorted.map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');
}
function closeSiblingCollapsibles(headerEl){
  const wrapper = headerEl.closest('.settings-section, .settings-subsection, .card');
  const group = wrapper && wrapper.parentElement;
  if(!group) return;
  Array.prototype.forEach.call(group.children, function(sib){
    if(sib === wrapper) return;
    Array.prototype.forEach.call(sib.children, function(child){
      if(child.classList.contains('collapsible') && child.classList.contains('open')){
        child.classList.remove('open');
        child.setAttribute('aria-expanded', 'false');
      }
      if(child.classList.contains('collapse-body') && child.classList.contains('open')){
        child.classList.remove('open');
      }
    });
  });
}
function toggleCollapse(headerEl, targetId){
  const target = document.getElementById(targetId);
  if(!target) return;
  const opening = !target.classList.contains('open');
  if(opening) closeSiblingCollapsibles(headerEl);
  target.classList.toggle('open');
  headerEl.classList.toggle('open');
  headerEl.setAttribute('aria-expanded', headerEl.classList.contains('open') ? 'true' : 'false');
}
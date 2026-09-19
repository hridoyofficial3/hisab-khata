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
  if(canEditEntry(en)){ return '<button class="edit-icon" title="edit" onclick="event.stopPropagation(); openEditEntry('+en.id+')" onkeydown="event.stopPropagation()">✎</button>'; }
  return '';
}
function showLockInfo(id){ toast(L('editLockedToast')); openSettings(); }
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
      _balanceCache[en.account] = (_balanceCache[en.account] || 0) + delta;
    }
  }
  return _balanceCache[acc] || 0;
}

const balanceBreakdownModalEl = document.getElementById('balanceBreakdownModal');
function openBalanceBreakdown(){
  const accs = getAccountsList().map(a=>a.id);
  const balances = accs.map(a=>({ acc:a, amt: accountBalance(a) }));
  const total = balances.reduce((s,b)=> s + b.amt, 0);
  const max = Math.max(1, ...balances.map(b=>Math.abs(b.amt)));
  const listEl = document.getElementById('balanceBreakdownList');
  listEl.innerHTML = balances.map(b=>{
    const pct = Math.round((Math.abs(b.amt)/max)*100);
    const meta = getAccountMeta(b.acc);
    const color = (meta && meta.color) || 'var(--ink)';
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
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabel(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateSelfLoanRepayAcctHint(){
  const hint = document.getElementById('selfLoanRepayAcctAvailableHint');
  if(!hint) return;
  const account = document.getElementById('selfLoanRepayAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabel(account), amt: moneyFmt(avail) });
  hint.style.display = 'block';
}
function updateLoanAcctAvailableHint(){
  const hint = document.getElementById('loanAcctAvailableHint');
  if(!hint) return;
  if(curLoanType !== 'given'){ hint.style.display = 'none'; return; }
  const account = document.getElementById('loanAccount').value;
  if(!account){ hint.style.display = 'none'; return; }
  const avail = accountBalance(account);
  hint.textContent = tfmt('acctAvailableFmt', { acc: accLabel(account), amt: moneyFmt(avail) });
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
    if(account && amount && amount > accountBalance(account)){ btn.classList.add('state-insufficient'); }
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
  if(amount && amount > avail){ btn.classList.add('state-insufficient'); }
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
  hint.textContent = tfmt('transferAvailableFmt', { acc: accLabel(account), amt: moneyFmt(avail) });
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
  if(amount && amount > avail){ btn.classList.add('state-insufficient'); }
  else { btn.classList.remove('state-insufficient'); }
}
document.getElementById('transferAmount').addEventListener('input', updateTransferBtnState);
document.getElementById('transferFromSel').addEventListener('change', updateTransferBtnState);
document.getElementById('transferToSel').addEventListener('change', updateTransferBtnState);

function availableBalance(acc, excludeId){
  return entries.filter(en=>en.account===acc && en.id!==excludeId).reduce((s,en)=> s + (en.type==='income'? en.amount : -en.amount), 0);
}

function renderAccountOptions(){
  const accs = getAccountsList();
  if(!accs.length) return;
  const nonSav = accs.filter(a=> a.id !== 'savings');
  const all = accs;
  const optHtml = (a, cur) => {
    const label = a.i18n ? L(a.name) : a.name;
    const icon = a.icon ? a.icon + ' ' : '';
    return '<option value="'+a.id+'"'+(a.id===cur?' selected':'')+'>'+escapeHtml(icon+label)+'</option>';
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
  if(ed){ const cur = ed.value; ed.innerHTML = all.map(a=> optHtml(a, cur)).join(''); }

  ['entryFilterAccount','allEntriesFilterAccount'].forEach(id=>{
    const el = document.getElementById(id);
    if(!el) return;
    const cur = el.value || 'all';
    el.innerHTML = '<option value="all">'+L('filterAllOpt')+'</option>' + all.map(a=> optHtml(a, cur)).join('');
  });
}

const ACCOUNT_ICON_CHOICES = ['💵','🏦','📱','💰','💳','🏧','💸','🪙','💎','🏪','📮','🎯'];
const ACCOUNT_COLOR_CHOICES = [
  'var(--ledger-green)','var(--blue)','var(--purple)','var(--gold)',
  'var(--ledger-red)','#0E7C7B','#E67E22','#3E7CB1','#A15C9E','#4C8C6B'
];
let newAccIcon = '💰';
let newAccColor = 'var(--ledger-green)';

function renderAccountsList(){
  const wrap = document.getElementById('accountsList');
  if(!wrap) return;
  const accs = getAccountsList();
  if(!accs.length){ wrap.innerHTML = ''; return; }
  wrap.innerHTML = accs.map(a=>{
    const label = a.i18n ? L(a.name) : escapeHtml(a.name);
    const bal = accountBalance(a.id);
    const isSys = a.isSystem;
    const badge = isSys ? '<span class="ar-badge">সিস্টেম</span>' : '';
    const delBtn = isSys ? '' : '<button class="ar-btn del" data-id="'+a.id+'" data-act="del" title="ডিলিট">🗑️</button>';
    return '<div class="account-row">'+
      '<div class="ar-icon" style="background:'+(a.color||'var(--line)')+';">'+escapeHtml(a.icon||'💰')+'</div>'+
      '<div class="ar-info">'+
        '<div class="ar-name">'+label+' '+badge+'</div>'+
        '<div class="ar-bal">'+moneyFmt(bal)+'</div>'+
      '</div>'+
      '<div class="ar-actions">'+delBtn+'</div>'+
    '</div>';
  }).join('');
  wrap.querySelectorAll('.ar-btn.del').forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const acc = getAccountMeta(btn.dataset.id);
      if(!acc) return;
      deleteAccountConfirm(acc);
    });
  });
}

function deleteAccountConfirm(acc){
  const bal = accountBalance(acc.id);
  const label = acc.i18n ? L(acc.name) : acc.name;
  let msg = '"'+label+'" অ্যাকাউন্টটা ডিলিট করবে?';
  if(Math.abs(bal) > 0.01){ msg += '\n\n⚠️ এই অ্যাকাউন্টে '+moneyFmt(bal)+' আছে। ডিলিট করলে সেই টাকা চলে যাবে এবং সব সংযুক্ত এন্ট্রি মুছে যাবে।'; }
  else { msg += '\n\nএই অ্যাকাউন্টে কোনো টাকা নেই। তবে এতে থাকা সব এন্ট্রি মুছে যাবে।'; }
  openSimpleConfirm(msg, ()=>{
    entries = entries.filter(en=> en.account !== acc.id);
    saveEntries();
    settings.accounts = settings.accounts.filter(a=> a.id !== acc.id);
    saveSettings();
    renderAccountsList();
    renderAll();
    toast('অ্যাকাউন্ট ডিলিট হয়েছে।');
  });
}

function renderIconPicker(){
  const wrap = document.getElementById('accountIconPicker');
  if(!wrap) return;
  wrap.innerHTML = ACCOUNT_ICON_CHOICES.map(ic=>
    '<div class="icon-opt'+(ic===newAccIcon?' selected':'')+'" data-ic="'+ic+'">'+ic+'</div>'
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
  if(!name){ toast('অ্যাকাউন্টের নাম লেখো।'); return; }
  const dup = getAccountsList().find(a=>{
    const l = a.i18n ? L(a.name) : a.name;
    return l.toLowerCase() === name.toLowerCase();
  });
  if(dup){ toast('এই নামে একটা অ্যাকাউন্ট আগেই আছে।'); return; }
  const id = 'acc_' + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  settings.accounts.push({ id, name, icon: newAccIcon, color: newAccColor, isSystem: false, i18n: false });
  saveSettings();
  document.getElementById('accountFormBox').style.display = 'none';
  renderAccountsList();
  renderAll();
  toast('নতুন অ্যাকাউন্ট যোগ হয়েছে।');
});

/* ============================================================
   Main render
   ============================================================ */
function renderAll(){
  updateBudgetLabels();
  renderAccountOptions();
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
  // Regular accounts (excluding savings) first, then loan last
  const accs = getAccountsList().filter(a=> a.id !== 'savings');
  let cardsHtml = accs.map(a=>{
    const label = a.i18n ? L(a.name) : escapeHtml(a.name);
    const iconPart = a.icon ? escapeHtml(a.icon) + ' ' : '';
    const color = a.color || 'var(--line)';
    return '<div class="acc-card" style="border-left-color:'+color+';">'+
      '<div><div class="lbl">'+iconPart+label+'</div>'+
      '<div class="val" id="balAcc_'+a.id+'">৳০</div></div>'+
      '<div class="acc-sub" id="balAccSav_'+a.id+'"></div>'+
    '</div>';
  }).join('');
  // Loan card always last
  const loanCard = '<div class="acc-card loan"><div><div class="lbl">'+L('accLoan')+'</div><div class="val loan-val" id="balLoanNet">৳০</div></div></div>';
  grid.innerHTML = cardsHtml + loanCard;
}

function renderBalances(){
  renderDashAccCards();
  const accs = getAccountsList().filter(a=> a.id !== 'savings');
  const sav = accountBalance('savings');
  const src = savingsContributionByAccount();
  const savLine = (v)=> v>0 ? tfmt('accSavingsLockedFmt', { amt: moneyFmt(v) }) : '';
  let totalNoSavings = 0;
  accs.forEach(a=>{
    const bal = accountBalance(a.id);
    const contrib = src[a.id] || 0;
    totalNoSavings += bal;
    const valEl = document.getElementById('balAcc_'+a.id);
    if(valEl) valEl.textContent = moneyFmt(bal + contrib);
    const subEl = document.getElementById('balAccSav_'+a.id);
    if(subEl) subEl.textContent = savLine(contrib);
  });
  document.getElementById('grandTotal').textContent = moneyFmt(totalNoSavings + sav);
  document.getElementById('grandTotalNoSavings').textContent = moneyFmt(totalNoSavings);
  const bl = document.getElementById('balLoanNet');
  if(bl) bl.textContent = moneyFmt(loanNetOwed());
  renderDailyMoneySummary();
}

function renderDailyMoneySummary(){
  const dueReceivable = dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
  const duePayable = dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
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
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${en.id})" role="button" tabindex="0">
      <div class="left">
        <span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${en.budgetType?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}${en.date}${en.note ? ' · ' + escapeHtml(en.note) : ''}</span>
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
    <div class="entry ${en.transfer ? '' : (en.type==='income' ? 'income-bg' : 'expense-bg')}" onclick="openEntryDetail(${en.id})" role="button" tabindex="0">
      <div class="left"><span class="tag"><span class="accbadge">${accLabel(en.account)}</span>${en.budgetType?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):''}${en.date}${en.note ? ' · ' + escapeHtml(en.note) : ''}</span></div>
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
      const totalPos = keys.reduce((s,k)=> s + result[k], 0);
      if(totalPos > 0){
        const take = Math.min(remaining, totalPos);
        keys.forEach(k=>{ result[k] -= (result[k] / totalPos) * take; });
      }
    }
  });
  Object.keys(result).forEach(k=>{ if(result[k] < 0.01) result[k] = 0; });
  return result;
}

function loanNetOwed(){
  const payable = loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0);
  const receivable = loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0);
  return payable - receivable;
}

/* renderLoansTab, renderDuesTab, renderSavingsTab, renderNotes, renderPlans, renderPlanHistory,
   renderSummary, budgetBarColor, chart functions — সব আগের মতোই, শুধু getChartPeriods / renderPeriodChart
   "মাস শেষে" ট্যাবে ঢুকলে ডিফল্ট "দিন শেষে" দেখানোর জন্য tab.click handler-এ কাজ করবে (নিচে) */
function renderLoansTab(){
  const payable = loans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0);
  const receivable = loans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0);
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
    const dueRow = l.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+l.dueDate+'</b></div>' : '';
    const noteRow = l.note ? '<div>'+L('planNoteFmt')+escapeHtml(l.note)+'</div>' : '';
    const isPayable = (l.type==='taken' || l.type==='self');
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtnAction = l.type==='self' ? 'openSelfLoanCardRepayModal('+l.id+')' : 'settleLoan('+l.id+')';
    const settleBtn = !l.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="'+settleBtnAction+'">'+settleBtnLabel+'</button>' : '';
    const itemStateClass = l.settled ? 'item-settled' : (isPayable ? 'item-due' : '');
    const partialPaidRow = (!l.settled && l.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(l.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(l.amount)+'</div>' : '';
    const selfPendingRow = (l.type==='self' && !l.settled) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">⚠ '+L('loanSelfPendingNote')+'</div>' : '';
    const loanDelBtn = canManageLoansDues(l) ? '<button class="pdel" onclick="deleteLoan('+l.id+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+(l.type==='self' ? '' : escapeHtml(l.person))+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(l.amount)+'</span></div>'+
      '<div class="pmeta"><div>'+L('planFromAccPrefix')+'<b>'+accLabel(l.account)+'</b></div><div>'+L('loanDatePrefix')+'<b>'+l.date+'</b></div>'+dueRow+noteRow+partialPaidRow+selfPendingRow+'</div>'+
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">'+settleBtn+loanDelBtn+'</div>'+
    '</div>';
  }).join('');
}
function renderDuesTab(){
  const totalReceivable = dues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
  const totalPayable = dues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
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
    const dueDateRow = d.dueDate ? '<div>'+L('loanDueDatePrefix')+'<b>'+d.dueDate+'</b></div>' : '';
    const partialRow = (!d.settled && d.paidAmount > 0) ? '<div style="color:var(--gold); font-weight:600; margin-top:4px;">'+L('paidSoFarLabel')+': '+moneyFmt(d.paidAmount)+' · '+L('remainingDueLabel')+': '+moneyFmt(d.amount)+'</div>' : '';
    const settleBtnLabel = isPayable ? L('payBtnLabel') : L('collectBtnLabel');
    const settleBtn = !d.settled ? '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="openSettleDueModal('+d.id+')">'+settleBtnLabel+'</button>' : '';
    const dueDelBtn = canManageLoansDues(d) ? '<button class="pdel" onclick="deleteDue('+d.id+')">×</button>' : '';
    return '<div class="plan-item '+itemStateClass+'">'+
      '<div class="pname"><span>'+escapeHtml(d.person)+' <span class="bwbadge '+badgeClass+'">'+typeLabel+'</span></span><span>'+moneyFmt(d.amount)+'</span></div>'+
      '<div class="pmeta">'+reasonRow+'<div>'+L('loanDatePrefix')+'<b>'+d.date+'</b></div>'+dueDateRow+partialRow+'</div>'+
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
    <div class="entry ${en.type==='income' ? 'income-bg' : 'expense-bg'}" onclick="openEntryDetail(${en.id})" role="button" tabindex="0">
      <div class="left"><span class="tag">${en.date}${en.note?' · '+escapeHtml(en.note):''}</span></div>
      <div class="actions"><span class="amt ${en.type}">${en.type==='income'?'+':'-'}${moneyFmt(en.amount)}</span>${entryActionsHtml(en)}</div>
    </div>
  `).join('');
}
function renderNotes(){
  const list = document.getElementById('notesList');
  const totalEl = document.getElementById('notesTotalVal');
  if(totalEl){
    const notesLeft = notes.reduce((s,n)=> s + (n.done ? 0 : (Number(n.price)||0)), 0);
    const plansLeft = plans.reduce((s,p)=> s + (p.bought ? 0 : (Number(p.amount)||0)), 0);
    totalEl.textContent = moneyFmt(notesLeft + plansLeft);
  }
  if(notes.length === 0){ list.innerHTML = '<div class="empty">'+L('noItems')+'</div>'; return; }
  const sorted = [...notes].sort((a,b)=> (a.done - b.done) || b.id - a.id);
  list.innerHTML = sorted.map(n => {
    const locked = n.done && !settings.advancedMode;
    return '<div class="note-item">' +
      '<input type="checkbox" '+(n.done?'checked':'')+' '+(locked?'disabled title="'+L('advancedModeLabel')+'"':'')+' onchange="toggleNote('+n.id+')">' +
      '<div class="txt '+(n.done?'done':'')+'">'+escapeHtml(n.text)+'</div>' +
      (n.price ? '<span class="price">'+moneyFmt(n.price)+'</span>' : '') +
      '<button class="del" onclick="deleteNote('+n.id+')">×</button></div>';
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
      if(en.transfer) continue;
      if(en.date >= p.start && en.date <= p.end){
        if(en.type === 'income') inc += en.amount;
        else exp += en.amount;
      }
    }
    return { inc, exp, label: p.label, sub: p.sub };
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
  const inc = monthNormal.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0);
  const exp = monthNormal.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0);
  document.getElementById('sumIncome').textContent = moneyFmt(inc);
  document.getElementById('sumExpense').textContent = moneyFmt(exp);
  const sumBalanceEl = document.getElementById('sumBalance');
  const currentTotalBalance = getAccountsList().reduce((s,a)=> s + accountBalance(a.id), 0);
  sumBalanceEl.textContent = moneyFmt(currentTotalBalance);
  sumBalanceEl.style.color = currentTotalBalance < 0 ? 'var(--ledger-red)' : '';

  const periodLoans = loans.filter(l => inRange(l.date));
  const periodPayable = periodLoans.filter(l=> (l.type==='taken' || l.type==='self') && !l.settled).reduce((s,l)=> s+l.amount, 0);
  const periodReceivable = periodLoans.filter(l=> l.type==='given' && !l.settled).reduce((s,l)=> s+l.amount, 0);
  document.getElementById('sumPayable').textContent = moneyFmt(periodPayable);
  document.getElementById('sumReceivable').textContent = moneyFmt(periodReceivable);
  document.getElementById('sumSavings').textContent = moneyFmt(accountBalance('savings'));

  const periodDues = dues.filter(d => inRange(d.date));
  const periodDueReceivable = periodDues.filter(d=> d.type==='receivable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
  const periodDuePayable = periodDues.filter(d=> d.type==='payable' && !d.settled).reduce((s,d)=> s+d.amount, 0);
  document.getElementById('sumDueReceivable').textContent = moneyFmt(periodDueReceivable);
  document.getElementById('sumDuePayable').textContent = moneyFmt(periodDuePayable);

  const { needPct, wantPct } = getPctForMonth(anchorDate.getFullYear(), anchorDate.getMonth());
  const needSpent = monthNormal.filter(en=>en.type==='expense' && en.budgetType==='need').reduce((s,e)=>s+e.amount,0);
  const wantSpent = monthNormal.filter(en=>en.type==='expense' && en.budgetType==='want').reduce((s,e)=>s+e.amount,0);
  const needTarget = inc * needPct/100, wantTarget = inc * wantPct/100;
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
  const accs = getAccountsList().map(a=>a.id);
  accDiv.innerHTML = accs.map(a=>{
    const net = monthAll.filter(en=>en.account===a).reduce((s,en)=> s + (en.type==='income'? en.amount : -en.amount), 0);
    return '<div class="acc-mini-row"><span>'+accLabel(a)+'</span><span style="font-weight:600; color:'+(net>=0?'var(--ledger-green)':'var(--ledger-red)')+'">'+(net>=0?'+':'')+moneyFmt(net)+'</span></div>';
  }).join('');

  const cats = {};
  monthNormal.filter(en=>en.type==='expense' && !en.loanId && !en.dueId).forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    cats[key] = (cats[key]||0) + en.amount;
  });
  const catDiv = document.getElementById('catBreakdown');
  const catKeys = Object.keys(cats).sort((a,b)=>cats[b]-cats[a]).slice(0,8);
  if(catKeys.length===0){ catDiv.innerHTML = '<div class="empty">'+L('noExpense')+'</div>'; }
  else {
    const max = cats[catKeys[0]];
    catDiv.innerHTML = catKeys.map(k=>'<div class="catrow"><span class="k">'+escapeHtml(k)+'</span><span class="bar"><span style="width:'+Math.round((cats[k]/max)*100)+'%"></span></span><span class="v">'+moneyFmt(cats[k])+'</span></div>').join('');
  }

  const settleEntries = monthNormal.filter(en => en.loanId || en.dueId);
  const periodCollected = settleEntries.filter(en=>en.type==='income').reduce((s,e)=>s+e.amount,0);
  const periodRepaid = settleEntries.filter(en=>en.type==='expense').reduce((s,e)=>s+e.amount,0);
  const debtTotalsEl = document.getElementById('debtSettleTotals');
  if(debtTotalsEl){
    debtTotalsEl.innerHTML = '<div class="acc-mini-row"><span>'+L('debtCollectedLabel')+'</span><span style="font-weight:600; color:var(--ledger-green);">'+moneyFmt(periodCollected)+'</span></div>' +
      '<div class="acc-mini-row"><span>'+L('debtRepaidLabel')+'</span><span style="font-weight:600; color:var(--ledger-red);">'+moneyFmt(periodRepaid)+'</span></div>';
  }
  const debtCats = {};
  settleEntries.forEach(en=>{
    const key = en.note ? en.note.trim() : L('otherCategory');
    debtCats[key] = (debtCats[key]||0) + en.amount;
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
    monthList.innerHTML = sorted.map(en=>'<div class="entry"><div class="left"><span class="tag"><span class="accbadge">'+accLabel(en.account)+'</span>'+(en.budgetType?('<span class="bwbadge '+en.budgetType+'">'+L(en.budgetType+'Label')+'</span>'):'')+en.date+(en.note?' · '+escapeHtml(en.note):'')+'</span></div><div class="actions"><span class="amt '+en.type+'">'+(en.type==='income'?'+':'-')+moneyFmt(en.amount)+'</span>'+entryActionsHtml(en)+'</div></div>').join('');
  }
}

function refreshNoteSuggestions(){
  const counts = {};
  entries.forEach(en=>{
    const n = (en.note||'').trim();
    if(n) counts[n] = (counts[n]||0) + 1;
  });
  const sorted = Object.keys(counts).sort((a,b)=> counts[b]-counts[a]);
  const dl = document.getElementById('noteSuggestions');
  if(dl) dl.innerHTML = sorted.map(n=>'<option value="'+escapeHtml(n)+'"></option>').join('');
}
function toggleCollapse(headerEl, targetId){
  const target = document.getElementById(targetId);
  if(!target) return;
  target.classList.toggle('open');
  headerEl.classList.toggle('open');
  headerEl.setAttribute('aria-expanded', headerEl.classList.contains('open') ? 'true' : 'false');
}


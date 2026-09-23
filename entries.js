/* ============================================================
   Tab switching — default to "দিন শেষে" when Summary opens
   ============================================================ */
document.querySelectorAll('.tab').forEach(tab=>{
  tab.addEventListener('click', ()=>{
    document.querySelectorAll('.tab').forEach(t=>{ t.classList.remove('active'); t.setAttribute('aria-selected','false'); });
    document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
    tab.classList.add('active');
    tab.setAttribute('aria-selected','true');
    document.getElementById('panel-'+tab.dataset.tab).classList.add('active');

    if(tab.dataset.tab === 'summary'){
      periodMode = 'day';
      viewDay = new Date();
      document.querySelectorAll('.periodBtn').forEach(b=>{
        b.classList.toggle('on', b.dataset.period === 'day');
      });
      document.getElementById('daySelectRow').style.display   = 'flex';
      document.getElementById('weekSelectRow').style.display  = 'none';
      document.getElementById('monthSelectRow').style.display = 'none';
      document.getElementById('yearSelectRow').style.display  = 'none';
      document.getElementById('allSelectRow').style.display   = 'none';
      renderSummary();
    }
  });
});

document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
  const el = e.target.closest('[role="button"], [role="tab"]');
  if(!el) return;
  if(e.target.tagName === 'BUTTON' || e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  e.preventDefault();
  el.click();
});

/* ============================================================
   Entry form
   ============================================================ */
document.querySelectorAll('.typeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    curType = btn.dataset.type;
    document.querySelectorAll('.typeBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('budgetTypeRow').style.display = curType==='expense' ? 'block' : 'none';
    const body = document.getElementById('entryFormBody');
    body.style.display = 'flex';
    body.style.flexDirection = 'column';
    body.style.gap = '10px';
    updateAcctAvailableHint();
    updateEntryBtnState();
  });
});
document.getElementById('accountInput').addEventListener('change', ()=>{ updateAcctAvailableHint(); updateEntryBtnState(); });
document.getElementById('amountInput').addEventListener('input', updateEntryBtnState);
document.querySelectorAll('.bwBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    curBW = btn.dataset.bw;
    document.querySelectorAll('.bwBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
  });
});
document.getElementById('dateInput').value = todayStr();

document.getElementById('entryForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('amountInput').value);
  if(!amount || amount <= 0){ toast(L('invalidAmountMsg')); return; }
  const account = document.getElementById('accountInput').value;
  if(!account){ openAlert(L('entrySelectAccountMsg')); return; }
  const date = document.getElementById('dateInput').value || todayStr();
  const note = document.getElementById('noteInput').value.trim();
  const budgetType = curType === 'expense' ? curBW : null;
  if(curType === 'expense' && gtMoney(amount, accountBalance(account))){
    updateEntryBtnState();
    openAlert(tfmt('entryInsufficientMsg', { amt: moneyFmt(amount - accountBalance(account)) }));
    return;
  }
  const entryDateParts = dateYearMonth(date);
  const savingsPct = curType === 'income' ? getSavingsPctForMonth(entryDateParts.y, entryDateParts.m) : 0;
  const savingsAmount = savingsPct > 0 ? round2(amount * savingsPct / 100) : 0;
  const rows = confirmRow(L('confType'), L(curType==='income'?'typeIncome':'typeExpense')) +
    confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confAccount'), accLabel(account)) +
    (budgetType ? confirmRow(L('confBudgetType'), L(budgetType+'Label')) : '') +
    confirmRow(L('confDate'), date) + (note ? confirmRow(L('confNote'), escapeHtml(note)) : '') +
    (savingsAmount > 0 ? confirmRow(L('confSavingsAuto'), moneyFmt(savingsAmount) + ' (' + numFmt(savingsPct) + '%)') : '');
  openConfirm('confAddEntryTitle', rows, ()=>{
    const mainId = nextId();
    entries.push({ id: mainId, type: curType, account, amount, date, note, transfer:false, budgetType });
    if(savingsAmount > 0){
      // T5: autoSavingsOf = আয়ের id — আয় মুছলে/এডিটে সেভিংস সাথে যায়/মিলে যায় (ঐচ্ছিক ফিল্ড)
      const id1 = nextId(), id2 = nextId();
      entries.push({ id:id1, pairId:id1, type:'expense', account, amount:savingsAmount, date, note:L('savingsAutoEntryNote'), transfer:true, budgetType:null, autoSavingsOf: mainId });
      entries.push({ id:id2, pairId:id1, type:'income', account:'savings', amount:savingsAmount, date, note:L('savingsAutoEntryNote'), transfer:true, budgetType:null, autoSavingsOf: mainId });
    }
    saveEntries();
    document.getElementById('amountInput').value = '';
    document.getElementById('accountInput').value = '';
    document.getElementById('noteInput').value = '';
    document.getElementById('dateInput').value = todayStr();
    renderAll();
    updateAcctAvailableHint();
    updateEntryBtnState();
    toast(L('entryAddedToast'));
  });
});

/* ============================================================
   Edit entry
   ============================================================ */
const editModalEl = document.getElementById('editModal');
let editingId = null;
let editType = 'expense';
let editBW = 'need';
document.querySelectorAll('.editTypeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(btn.disabled) return;
    editType = btn.dataset.type;
    document.querySelectorAll('.editTypeBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('editBudgetRow').style.display = editType==='expense' ? 'block' : 'none';
  });
});
document.querySelectorAll('.editBwBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    if(btn.disabled) return;
    editBW = btn.dataset.bw;
    document.querySelectorAll('.editBwBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
  });
});
function openEditEntry(id){
  const en = entries.find(x=>x.id === id);
  if(!en) return;
  if(isAutoSavingsEntry(en)){ toast(L('editAutoSavingsLockedToast')); return; }
  if(!canEditEntry(en)){ showLockInfo(id); return; }
  if(isLoanDueEntry(en)){ toast(L('editLoanDueLockedToast')); return; }
  editingId = id;
  editType = en.type;
  editBW = en.budgetType || 'need';
  document.querySelectorAll('.editTypeBtn').forEach(b=>{ b.classList.toggle('on', b.dataset.type === en.type); b.disabled = !!en.transfer; });
  document.querySelectorAll('.editBwBtn').forEach(b=>{ b.classList.toggle('on', b.dataset.bw === editBW); b.disabled = !!en.transfer; });
  document.getElementById('editBudgetRow').style.display = (!en.transfer && en.type==='expense') ? 'block' : 'none';
  document.getElementById('editAmount').value = formatAmtInput(String(en.amount));
  document.getElementById('editDate').value = en.date;
  document.getElementById('editNote').value = en.note || '';
  const accSel = document.getElementById('editAccount');
  // T11 #১১: placeholder (value='') নির্বাচনযোগ্য হবে না; বাকি অপশন আগের মতো সক্রিয়
  accSel.querySelectorAll('option').forEach(o=> o.disabled = (o.value === ''));
  if(!Array.from(accSel.options).some(o=> o.value === en.account)){
    // ড্রপডাউনে না থাকা অ্যাকাউন্ট (যেমন আর্কাইভ করা) — নইলে সেভে অ্যাকাউন্ট খালি হয়ে যেত
    const o = document.createElement('option'); o.value = en.account;
    const meta = getAccountMeta(en.account);
    o.textContent = meta ? accNameText(meta) : accLabelText(en.account);
    accSel.appendChild(o);
  }
  if(en.transfer){
    accSel.value = en.account; accSel.disabled = true;
  } else {
    accSel.disabled = false;
    const savOpt = accSel.querySelector('option[value="savings"]');
    if(savOpt) savOpt.disabled = true;
    accSel.value = en.account;
  }
  let meta;
  if(settings.advancedMode){ meta = L('editAdvancedActiveMsg'); }
  else {
    const minsLeft = Math.max(0, Math.ceil((GRACE_PERIOD_MS - msSinceCreated(en.id)) / 60000));
    meta = minsLeft > 0 ? tfmt('editMinutesLeftMsg', { left: numFmt(minsLeft) }) : L('editLastMinuteMsg');
  }
  if(en.transfer) meta += ' ' + L('transferPairMsg');
  else if(en.type === 'income' && linkedSavingsEntries(en.id).length) meta += ' ' + L('editLinkedSavingsMsg');
  document.getElementById('editMeta').textContent = meta;
  // D3: শেষ ৫টা কাজের বাইরে হলে ডিলিট বাটন নেই (এডিট চলে)
  document.getElementById('editDeleteBtn').style.display = canDeleteEntry(en) ? '' : 'none';
  editModalEl.classList.add('open');
  lockBodyScroll();
}
function closeEditModal(){ editModalEl.classList.remove('open'); editingId = null; unlockBodyScroll(); }
document.getElementById('editCloseBtn').addEventListener('click', closeEditModal);
document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
editModalEl.addEventListener('click', (e)=>{ if(e.target === editModalEl) closeEditModal(); });
// এডিটের পরিকল্পনা একই ফাংশনে সিমুলেশন-কপি ও আসল `entries`-এ প্রয়োগ হয় (দুই পথ আলাদা হয়ে যাওয়া ঠেকাতে)
// plan = { patch, pairId?, pairPatch?, savings: null | 'remove' | { amount } }
function applyEditPlan(list, id, plan){
  const target = list.find(x=> x.id === id);
  if(target) Object.assign(target, plan.patch);
  if(plan.pairId != null){ const p = list.find(x=> x.id === plan.pairId); if(p) Object.assign(p, plan.pairPatch); }
  if(plan.savings === 'remove') return list.filter(x=> x.autoSavingsOf !== id);
  if(plan.savings && typeof plan.savings.amount === 'number'){
    list.forEach(x=>{
      if(x.autoSavingsOf !== id) return;
      x.amount = plan.savings.amount;
      x.date = plan.patch.date;
      if(x.type === 'expense') x.account = plan.patch.account;   // সেভিংসের দিকটা (income, account:'savings') অপরিবর্তিত
    });
  }
  return list;
}
document.getElementById('editSaveBtn').addEventListener('click', ()=>{
  const en = entries.find(x=>x.id === editingId);
  if(!en){ closeEditModal(); return; }
  if(isAutoSavingsEntry(en)){ closeEditModal(); toast(L('editAutoSavingsLockedToast')); return; }
  if(!canEditEntry(en)){ closeEditModal(); toast(L('editLockedMsg')); return; }
  if(isLoanDueEntry(en)){ closeEditModal(); toast(L('editLoanDueLockedToast')); return; }
  const amount = parseAmt(document.getElementById('editAmount').value);
  if(!amount || amount <= 0){ toast(L('invalidAmountMsg')); return; }
  const date = document.getElementById('editDate').value || en.date;
  const note = document.getElementById('editNote').value.trim();
  const plan = { patch: { amount, date, note }, savings: null };
  let pair = null;
  if(en.transfer){
    pair = findPair(en);
    if(pair){ plan.pairId = pair.id; plan.pairPatch = { amount, date, note }; }
  } else {
    plan.patch.type = editType;
    plan.patch.account = document.getElementById('editAccount').value;
    // T11 #১১: অ্যাকাউন্ট খালি (placeholder) থাকলে সেভ নয় — নইলে এন্ট্রির account '' হয়ে যেত
    if(!plan.patch.account){ toast(L('entrySelectAccountMsg')); return; }
    plan.patch.budgetType = editType === 'expense' ? editBW : null;
    // D5: আয়ের সাথে বাঁধা অটো-সেভিংস মিলিয়ে দাও (শতাংশ = নতুন তারিখের মাসের); আয় → ব্যয় হলে সেভিংস মুছবে
    if(en.type === 'income' && linkedSavingsEntries(en.id).length){
      if(editType !== 'income'){ plan.savings = 'remove'; }
      else {
        const ym = dateYearMonth(date);
        const pct = getSavingsPctForMonth(ym.y, ym.m);
        plan.savings = pct > 0 ? { amount: round2(amount * pct / 100) } : 'remove';
      }
    }
  }
  // D4: বদলের পর কোনো অ্যাকাউন্ট নেগেটিভ হলে আটকাও
  const negatives = simulateBalances(copy=> applyEditPlan(copy, en.id, plan));
  if(negatives.length){ openAlert(tfmt('editBlockedNegativeMsg', { accounts: simAccountList(negatives) })); return; }
  if(!en.transfer){
    if(editType === 'expense' && gtMoney(amount, availableBalance(plan.patch.account, en.id))){ toast(L('insufficientBalanceMsg')); return; }
  } else {
    const sourceEntry = en.type === 'expense' ? en : (pair && pair.type === 'expense' ? pair : null);
    if(sourceEntry && gtMoney(amount, availableBalance(sourceEntry.account, sourceEntry.id))){ toast(L('insufficientBalanceMsg')); return; }
  }
  const commit = ()=>{
    entries = applyEditPlan(entries, en.id, plan);
    saveEntries(); closeEditModal(); renderAll();
    toast(L('entryUpdatedToast'));
  };
  if(plan.savings === 'remove'){
    const sv = linkedSavingsEntries(en.id).find(x=> x.type === 'expense');
    openSimpleConfirm(tfmt('editSavingsRemovalConfirm', { amt: moneyFmt(sv ? sv.amount : 0) }), commit);
  } else {
    commit();
  }
});

// D3–D5: একসাথে মোছার আগের যাচাই (বাটন ও scheduleEntryDeletion দুই জায়গা থেকেই) — সম্পূর্ণ গ্রুপ, শেষ ৫টা কাজ, নেগেটিভ ব্যালেন্স
function validateEntryDeletion(ids){
  const targets = entries.filter(x=> ids.indexOf(x.id) !== -1);
  if(targets.length === 0) return { ok:false, reason:'missing' };
  if(targets.some(isLoanDueEntry)) return { ok:false, reason:'loanDue' };
  if(targets.some(x=> isAutoSavingsEntry(x) && ids.indexOf(x.autoSavingsOf) === -1)) return { ok:false, reason:'autoSavings' };
  const primaries = targets.filter(x=> !isAutoSavingsEntry(x));
  if(primaries.length === 0) return { ok:false, reason:'autoSavings' };
  const complete = new Set();
  primaries.forEach(x=> entryDeleteIds(x).forEach(id=> complete.add(id)));
  if(targets.some(x=> !complete.has(x.id)) || Array.from(complete).some(id=> ids.indexOf(id) === -1)) return { ok:false, reason:'incomplete' };
  if(primaries.some(x=> !canDeleteEntry(x))) return { ok:false, reason:'locked' };
  const negatives = simulateBalances(copy=> copy.filter(x=> ids.indexOf(x.id) === -1));
  if(negatives.length) return { ok:false, reason:'negative', negatives };
  return { ok:true };
}
function notifyDeletionBlocked(v){
  if(v.reason === 'negative') openAlert(tfmt('deleteBlockedNegativeMsg', { accounts: simAccountList(v.negatives) }));
  else if(v.reason === 'loanDue') toast(L('editLoanDueLockedToast'));
  else if(v.reason === 'autoSavings') toast(L('editAutoSavingsLockedToast'));
  else if(v.reason === 'locked'){ if(settings.advancedMode) openAlert(L('deleteOnlyRecentMsg')); else toast(L('editLockedMsg')); }
}
document.getElementById('editDeleteBtn').addEventListener('click', ()=>{
  const en = entries.find(x=>x.id === editingId);
  if(!en){ closeEditModal(); return; }
  const ids = entryDeleteIds(en);
  const v = validateEntryDeletion(ids);
  if(!v.ok){ closeEditModal(); notifyDeletionBlocked(v); return; }
  const linkedSv = (!en.transfer && en.type === 'income') ? linkedSavingsEntries(en.id).find(x=> x.type === 'expense') : null;
  closeEditModal();
  const msg = linkedSv ? tfmt('deleteConfirmWithSavingsMsg', { amt: moneyFmt(linkedSv.amount) }) : L('deleteConfirmMsg');
  openSimpleConfirm(msg, ()=>{ scheduleEntryDeletion(ids); });
});
function scheduleEntryDeletion(ids){
  const v = validateEntryDeletion(ids);          // কল যেখান থেকেই আসুক, গার্ড এখানেও
  if(!v.ok){ notifyDeletionBlocked(v); return false; }
  const removed = [];
  entries.forEach((en, idx)=>{ if(ids.indexOf(en.id) !== -1) removed.push({item: en, index: idx}); });
  if(removed.length === 0) return false;
  entries = entries.filter(en=> ids.indexOf(en.id) === -1);
  _balanceCache = null;
  const recHistoryRemoved = detachRecurringHistoryForEntries(ids, false);   // T6/T11: save:false — নিচে entries-এর সাথে অ্যাটমিকভাবে সেভ হবে
  const okSave = atomicSaveKeys(['hisab_entries','hisab_recurring'], [saveEntries, saveRecurring]);
  if(!okSave){
    // রোলব্যাক: entries ও recurring history দুটোই আগের অবস্থায় ফিরিয়ে দাও
    removed.sort((a,b)=> a.index - b.index).forEach(r=>{ entries.splice(r.index, 0, r.item); });
    restoreRecurringHistory(recHistoryRemoved, false);
    _balanceCache = null;
    renderAll();
    toast(L('storageSaveFailMsg'));
    return false;
  }
  if(recHistoryRemoved.length){ checkRecurringReminder(); renderRecurringTplList(); }
  renderAll();
  let settled = false;
  const finalize = ()=>{ if(settled) return; settled = true; };
  const finalizeTimer = setTimeout(finalize, 5000);
  const undo = ()=>{
    if(settled) return;
    settled = true;
    clearTimeout(finalizeTimer);
    removed.sort((a,b)=> a.index - b.index).forEach(r=>{ entries.splice(r.index, 0, r.item); });
    restoreRecurringHistory(recHistoryRemoved, false);
    if(!atomicSaveKeys(['hisab_entries','hisab_recurring'], [saveEntries, saveRecurring])){
      // ধাপ ৫/আইটেম ৩: সেভ ফেল করলে মেমরি আবার আগের (মোছা) অবস্থায় ফিরিয়ে দাও, যাতে
      // মেমরি ও localStorage সাময়িকভাবেও অমিল না থাকে (undo আসলে হয়নি এটা স্পষ্ট হয়)
      entries = entries.filter(en=> ids.indexOf(en.id) === -1);
      _balanceCache = null;
      detachRecurringHistoryForEntries(ids, false); // recurring history আবার সরিয়ে নাও (undo বাতিল হয়েছে)
      toast(L('storageSaveFailMsg'));
    }
    if(recHistoryRemoved.length){ checkRecurringReminder(); renderRecurringTplList(); }
    renderAll();
  };
  showUndoToast(L('entryDeletedToast'), undo, null, finalize, ()=>clearTimeout(finalizeTimer));
  return true;
}

/* T3 (redesign) — floating add-entry button: purely UI convenience,
   reuses the existing type-toggle click handler and just scrolls the
   already-present entryForm card into view. No entry/save logic here. */
(function(){
  var fab = document.getElementById('fabAddEntry');
  if(!fab) return;
  fab.addEventListener('click', function(){
    var card = document.getElementById('entryForm');
    card = card ? card.closest('.card') : null;
    if(card && card.scrollIntoView) card.scrollIntoView({behavior:'smooth', block:'start'});
    var activeType = document.querySelector('.typeBtn.on');
    if(activeType) activeType.click();
    setTimeout(function(){
      var amt = document.getElementById('amountInput');
      if(amt) amt.focus();
    }, 350);
  });
})();

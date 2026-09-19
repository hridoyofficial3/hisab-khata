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
  if(curType === 'expense' && amount > accountBalance(account)){
    updateEntryBtnState();
    openAlert(tfmt('entryInsufficientMsg', { amt: moneyFmt(amount - accountBalance(account)) }));
    return;
  }
  const entryDateParts = dateYearMonth(date);
  const savingsPct = curType === 'income' ? getSavingsPctForMonth(entryDateParts.y, entryDateParts.m) : 0;
  const savingsAmount = savingsPct > 0 ? Math.round(amount * savingsPct / 100) : 0;
  const rows = confirmRow(L('confType'), L(curType==='income'?'typeIncome':'typeExpense')) +
    confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confAccount'), accLabel(account)) +
    (budgetType ? confirmRow(L('confBudgetType'), L(budgetType+'Label')) : '') +
    confirmRow(L('confDate'), date) + (note ? confirmRow(L('confNote'), escapeHtml(note)) : '') +
    (savingsAmount > 0 ? confirmRow(L('confSavingsAuto'), moneyFmt(savingsAmount) + ' (' + numFmt(savingsPct) + '%)') : '');
  openConfirm('confAddEntryTitle', rows, ()=>{
    entries.push({ id: nextId(), type: curType, account, amount, date, note, transfer:false, budgetType });
    if(savingsAmount > 0){
      const id1 = nextId(), id2 = nextId();
      entries.push({ id:id1, pairId:id1, type:'expense', account, amount:savingsAmount, date, note:L('savingsAutoEntryNote'), transfer:true, budgetType:null });
      entries.push({ id:id2, pairId:id1, type:'income', account:'savings', amount:savingsAmount, date, note:L('savingsAutoEntryNote'), transfer:true, budgetType:null });
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
  accSel.querySelectorAll('option').forEach(o=> o.disabled = false);
  if(en.transfer){
    if(!accSel.querySelector('option[value="'+en.account+'"]')){
      const o = document.createElement('option'); o.value = en.account; o.textContent = accLabel(en.account);
      accSel.appendChild(o);
    }
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
  document.getElementById('editMeta').textContent = meta;
  editModalEl.classList.add('open');
  lockBodyScroll();
}
function closeEditModal(){ editModalEl.classList.remove('open'); editingId = null; unlockBodyScroll(); }
document.getElementById('editCloseBtn').addEventListener('click', closeEditModal);
document.getElementById('editCancelBtn').addEventListener('click', closeEditModal);
editModalEl.addEventListener('click', (e)=>{ if(e.target === editModalEl) closeEditModal(); });
document.getElementById('editSaveBtn').addEventListener('click', ()=>{
  const en = entries.find(x=>x.id === editingId);
  if(!en){ closeEditModal(); return; }
  if(!canEditEntry(en)){ closeEditModal(); toast(L('editLockedMsg')); return; }
  if(isLoanDueEntry(en)){ closeEditModal(); toast(L('editLoanDueLockedToast')); return; }
  const amount = parseAmt(document.getElementById('editAmount').value);
  if(!amount || amount <= 0){ toast(L('invalidAmountMsg')); return; }
  const date = document.getElementById('editDate').value || en.date;
  const note = document.getElementById('editNote').value.trim();
  if(!en.transfer){
    const newAccount = document.getElementById('editAccount').value;
    if(editType === 'expense' && amount > availableBalance(newAccount, en.id)){ toast(L('insufficientBalanceMsg')); return; }
  }
  if(en.transfer){
    const pair = findPair(en);
    const sourceEntry = en.type === 'expense' ? en : (pair && pair.type === 'expense' ? pair : null);
    if(sourceEntry && amount > availableBalance(sourceEntry.account, sourceEntry.id)){ toast(L('insufficientBalanceMsg')); return; }
    en.amount = amount; en.date = date; en.note = note;
    if(pair){ pair.amount = amount; pair.date = date; pair.note = note; }
  } else {
    en.amount = amount; en.date = date; en.note = note;
    en.type = editType;
    en.account = document.getElementById('editAccount').value;
    en.budgetType = editType === 'expense' ? editBW : null;
  }
  saveEntries(); closeEditModal(); renderAll();
  toast(L('entryUpdatedToast'));
});
document.getElementById('editDeleteBtn').addEventListener('click', ()=>{
  const en = entries.find(x=>x.id === editingId);
  if(!en){ closeEditModal(); return; }
  if(!canEditEntry(en)){ closeEditModal(); toast(L('editLockedMsg')); return; }
  if(isLoanDueEntry(en)){ closeEditModal(); toast(L('editLoanDueLockedToast')); return; }
  closeEditModal();
  openSimpleConfirm(L('deleteConfirmMsg'), ()=>{
    const ids = [en.id];
    if(en.transfer){ const pair = findPair(en); if(pair) ids.push(pair.id); }
    scheduleEntryDeletion(ids);
  });
});
function scheduleEntryDeletion(ids){
  const removed = [];
  entries.forEach((en, idx)=>{ if(ids.indexOf(en.id) !== -1) removed.push({item: en, index: idx}); });
  if(removed.length === 0) return;
  entries = entries.filter(en=> ids.indexOf(en.id) === -1);
  _balanceCache = null;
  saveEntries(); renderAll();
  let settled = false;
  const finalize = ()=>{ if(settled) return; settled = true; };
  const finalizeTimer = setTimeout(finalize, 5000);
  const undo = ()=>{
    if(settled) return;
    settled = true;
    clearTimeout(finalizeTimer);
    removed.sort((a,b)=> a.index - b.index).forEach(r=>{ entries.splice(r.index, 0, r.item); });
    saveEntries(); renderAll();
  };
  showUndoToast(L('entryDeletedToast'), undo, null, finalize, ()=>clearTimeout(finalizeTimer));
}


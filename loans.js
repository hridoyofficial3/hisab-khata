/* ============================================================
   Loan / Due / Self-loan logic
   ============================================================ */
let curLoanType = 'taken';
let curDueType = 'receivable';
document.querySelectorAll('.loanTypeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    curLoanType = btn.dataset.ltype;
    document.querySelectorAll('.loanTypeBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    updateLoanAcctAvailableHint(); updateLoanBtnState();
  });
});
document.querySelectorAll('.dueTypeBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    curDueType = btn.dataset.dtype;
    document.querySelectorAll('.dueTypeBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
  });
});
document.getElementById('loanAccount').addEventListener('change', ()=>{ updateLoanAcctAvailableHint(); updateLoanBtnState(); });
document.getElementById('loanAmount').addEventListener('input', updateLoanBtnState);
document.getElementById('loanDate').value = todayStr();
document.getElementById('dueDate').value = todayStr();
document.getElementById('selfLoanDate').value = todayStr();

document.getElementById('loanForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const person = document.getElementById('loanPerson').value.trim();
  const amount = parseAmt(document.getElementById('loanAmount').value);
  if(!person){ toast(L('personRequiredMsg')); return; }
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const account = document.getElementById('loanAccount').value;
  if(!account){ openAlert(L('entrySelectAccountMsg')); return; }
  const date = document.getElementById('loanDate').value || todayStr();
  const dueDate = document.getElementById('loanDueDate').value || '';
  const note = document.getElementById('loanNote').value.trim();
  const ltype = curLoanType;
  if(ltype === 'given' && gtMoney(amount, accountBalance(account))){
    updateLoanBtnState();
    openAlert(tfmt('loanGivenInsufficientMsg', { amt: moneyFmt(amount - accountBalance(account)) }));
    return;
  }
  const rows = confirmRow(L('confType'), L(ltype==='taken' ? 'loanTakenLabel' : 'loanGivenLabel')) +
    confirmRow(L('confPerson'), escapeHtml(person)) + confirmRow(L('confAmount'), moneyFmt(amount)) +
    confirmRow(L('confAccount'), accLabel(account)) + confirmRow(L('confDate'), date) +
    (dueDate ? confirmRow(L('confDueDate'), dueDate) : '') + (note ? confirmRow(L('confNote'), escapeHtml(note)) : '');
  openConfirm('confLoanTitle', rows, ()=>{
    const loanId = nextId();
    const noteText = ltype==='taken' ? tfmt('loanTakenNoteFmt', { person }) : tfmt('loanGivenNoteFmt', { person });
    const entryId = nextId();
    entries.push({ id: entryId, pairId: entryId, type: ltype==='taken' ? 'income' : 'expense', account, amount, date, note: noteText, transfer:true, budgetType:null, loanId });
    saveEntries();
    loans.push({ id: loanId, type: ltype, person, amount, originalAmount: amount, paidAmount: 0, account, date, dueDate, note, settled:false, settledDate:null, entryIds:[entryId], settleEntryIds:[] });
    saveLoans();
    document.getElementById('loanForm').reset();
    document.getElementById('loanDate').value = todayStr();
    updateLoanAcctAvailableHint(); updateLoanBtnState(); renderAll();
    toast(L('loanAddedToast'));
  });
});
updateLoanBtnState();

document.getElementById('dueForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const person = document.getElementById('duePerson').value.trim();
  const amount = parseAmt(document.getElementById('dueAmount').value);
  if(!person){ toast(L('personRequiredMsg')); return; }
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const reason = document.getElementById('dueReason').value.trim();
  const date = document.getElementById('dueDate').value || todayStr();
  const targetDate = document.getElementById('dueTargetDate').value || '';
  const dtype = curDueType;
  const rows = confirmRow(L('confType'), L(dtype==='receivable' ? 'dueReceivableLabel' : 'duePayableLabel')) +
    confirmRow(L('confPerson'), escapeHtml(person)) + confirmRow(L('confAmount'), moneyFmt(amount)) +
    (reason ? confirmRow(L('dueReasonLabel'), escapeHtml(reason)) : '') + confirmRow(L('confDate'), date) +
    (targetDate ? confirmRow(L('confDueDate'), targetDate) : '');
  openConfirm('confAddDueTitle', rows, ()=>{
    const dueId = nextId();
    dues.push({ id: dueId, type: dtype, person, amount, originalAmount: amount, paidAmount: 0, reason, date, dueDate: targetDate, settled:false, settledDate:null, settleEntryIds:[] });
    saveDues();
    document.getElementById('dueForm').reset();
    document.getElementById('dueDate').value = todayStr();
    renderAll();
    toast(L('dueAddedToast'));
  });
});

document.getElementById('selfLoanTakeForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('selfLoanAmount').value);
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const account = document.getElementById('selfLoanAccount').value;
  if(!account){ openAlert(L('entrySelectAccountMsg')); return; }
  const date = document.getElementById('selfLoanDate').value || todayStr();
  const dueDate = document.getElementById('selfLoanDueDate').value || '';
  const note = document.getElementById('selfLoanNote').value.trim();
  if(gtMoney(amount, accountBalance('savings'))){ toast(L('insufficientSavingsMsg')); return; }
  const rows = confirmRow(L('confType'), L('loanSelfLabel')) + confirmRow(L('confAmount'), moneyFmt(amount)) +
    confirmRow(L('confTo'), accLabel(account)) + confirmRow(L('confDate'), date) +
    (dueDate ? confirmRow(L('confDueDate'), dueDate) : '') + (note ? confirmRow(L('confNote'), escapeHtml(note)) : '');
  openConfirm('confSelfLoanTitle', rows, ()=>{
    const loanId = nextId();
    const id1 = nextId(), id2 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:'savings', amount, date, note:L('loanSelfEntryNote'), transfer:true, budgetType:null, loanId });
    entries.push({ id:id2, pairId:id1, type:'income', account, amount, date, note:L('loanSelfEntryNote'), transfer:true, budgetType:null, loanId });
    saveEntries();
    loans.push({ id:loanId, type:'self', person:'', amount, originalAmount:amount, paidAmount:0, account, date, dueDate, note, settled:false, settledDate:null, entryIds:[id1, id2], settleEntryIds:[] });
    saveLoans();
    document.getElementById('selfLoanTakeForm').reset();
    document.getElementById('selfLoanDate').value = todayStr();
    updateSelfLoanAvailableHint(); renderAll();
    toast(L('loanSelfAddedToast'));
  });
});

document.getElementById('setTargetBtn').addEventListener('click', ()=>{
  const v = parseAmt(document.getElementById('targetInput').value) || 0;
  settings.savingsTarget = v;
  saveSettings(); renderSavingsTab();
});
document.getElementById('depositForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('depositAmount').value);
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const from = document.getElementById('depositFrom').value;
  if(!from){ openAlert(L('depositSelectAccountMsg')); return; }
  const toRaw = document.getElementById('depositTo').value;
  const keepIn = toRaw || from;          // খালি = একই হিসাবেই সংরক্ষিত
  const moved = keepIn !== from;         // অন্য হিসাবে (যেমন নগদ → ব্যাংক) সংরক্ষিত
  const date = todayStr();
  if(gtMoney(amount, accountBalance(from))){ toast(L('insufficientBalanceMsg')); return; }
  let rows = confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confFrom'), accLabel(from)) +
    confirmRow(L('confTo'), L('accSavings'));
  if(moved) rows += confirmRow(L('confKeptIn'), accLabel(keepIn));
  rows += confirmRow(L('confDate'), date);
  openConfirm('confDepositTitle', rows, ()=>{
    const id1 = nextId(), id2 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:from, amount, date, note:L('savingsDepositNote'), transfer:true, budgetType:null });
    entries.push({ id:id2, pairId:id1, type:'income', account:'savings', amount, date, note:L('savingsDepositNote'), transfer:true, budgetType:null });
    if(moved){
      // সংরক্ষিত অংশটা উৎস থেকে গন্তব্য হিসাবে সরাও: উৎসের মোট কমবে, গন্তব্যের মোট+সংরক্ষিত বাড়বে (ব্যবহারযোগ্য অপরিবর্তিত)
      const id3 = nextId();
      entries.push({ id:id3, pairId:id3, type:'expense', account:'savings', amount:0, date,
        note: tfmt('savingsDepositMoveNoteFmt', { from: accLabelText(from), to: accLabelText(keepIn) }), transfer:true, budgetType:null,
        savingsReattribFrom: from, savingsReattribTo: keepIn, savingsReattribAmount: amount, depositReattribOf: id1 });
    }
    saveEntries();
    document.getElementById('depositAmount').value='';
    document.getElementById('depositTo').value='';
    renderAll();
    toast(L('depositDoneToast'));
  });
});
document.getElementById('withdrawForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('withdrawAmount').value);
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const from = document.getElementById('withdrawFrom').value;
  if(!from){ openAlert(L('withdrawSelectFromMsg')); return; }
  const to = document.getElementById('withdrawTo').value;
  if(!to){ openAlert(L('withdrawSelectAccountMsg')); return; }
  const reason = document.getElementById('withdrawReason').value.trim();
  const note = reason ? (L('savingsWithdrawNote') + ' — ' + reason) : L('savingsWithdrawNote');
  const date = todayStr();
  const src = savingsContributionByAccount();
  const avail = src[from] || 0;
  if(gtMoney(amount, avail)){ toast(L('withdrawFromInsufficientMsg')); return; }
  const rows = confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confFrom'), accLabel(from)) +
    confirmRow(L('confTo'), accLabel(to)) + confirmRow(L('confDate'), date) +
    (reason ? confirmRow(L('confNote'), escapeHtml(reason)) : '');
  openConfirm('confWithdrawTitle', rows, ()=>{
    const id1 = nextId(), id2 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:'savings', amount, date, note, transfer:true, budgetType:null, savingsWithdrawFrom: from });
    entries.push({ id:id2, pairId:id1, type:'income', account:to, amount, date, note, transfer:true, budgetType:null });
    saveEntries();
    document.getElementById('withdrawAmount').value='';
    document.getElementById('withdrawReason').value='';
    document.getElementById('withdrawFrom').value='';
    document.getElementById('withdrawTo').value='';
    renderAll();
    toast(L('withdrawDoneToast'));
  });
});
document.getElementById('transferSavingsForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('transferSavingsAmount').value);
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const from = document.getElementById('transferSavingsFrom').value;
  if(!from){ openAlert(L('transferSavingsSelectFromMsg')); return; }
  const to = document.getElementById('transferSavingsTo').value;
  if(!to){ openAlert(L('transferSavingsSelectToMsg')); return; }
  if(from === to){ toast(L('transferSavingsSameAccountMsg')); return; }
  const src = savingsContributionByAccount();
  const avail = src[from] || 0;
  if(gtMoney(amount, avail)){ toast(L('transferSavingsInsufficientMsg')); return; }
  const reason = document.getElementById('transferSavingsReason').value.trim();
  const note = tfmt('savingsReattribNoteFmt', { from: accLabelText(from), to: accLabelText(to) }) + (reason ? ' — ' + reason : '');
  const date = todayStr();
  const rows = confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confFrom'), accLabel(from)) +
    confirmRow(L('confTo'), accLabel(to)) + confirmRow(L('confDate'), date) +
    (reason ? confirmRow(L('confNote'), escapeHtml(reason)) : '');
  openConfirm('confTransferSavingsTitle', rows, ()=>{
    const id1 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:'savings', amount:0, date, note, transfer:true, budgetType:null,
      savingsReattribFrom: from, savingsReattribTo: to, savingsReattribAmount: amount });
    saveEntries();
    document.getElementById('transferSavingsAmount').value='';
    document.getElementById('transferSavingsReason').value='';
    document.getElementById('transferSavingsFrom').value='';
    document.getElementById('transferSavingsTo').value='';
    renderAll();
    toast(L('transferSavingsDoneToast'));
  });
});
document.getElementById('transferForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const amount = parseAmt(document.getElementById('transferAmount').value);
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const from = document.getElementById('transferFromSel').value;
  const to = document.getElementById('transferToSel').value;
  if(!from || !to){ openAlert(L('transferSelectAccountMsg')); return; }
  if(from === to){ openAlert(L('transferSameAccountMsg')); return; }
  const note = document.getElementById('transferNote').value.trim() || L('transferDefaultNote');
  const date = todayStr();
  const avail = accountBalance(from);
  if(gtMoney(amount, avail)){ updateTransferBtnState(); openAlert(tfmt('transferInsufficientMsg', { amt: moneyFmt(amount - avail) })); return; }
  const rows = confirmRow(L('confAmount'), moneyFmt(amount)) + confirmRow(L('confFrom'), accLabel(from)) +
    confirmRow(L('confTo'), accLabel(to)) + confirmRow(L('confDate'), date) + confirmRow(L('confNote'), escapeHtml(note));
  openConfirm('confTransferTitle', rows, ()=>{
    const id1 = nextId(), id2 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:from, amount, date, note, transfer:true, budgetType:null });
    entries.push({ id:id2, pairId:id1, type:'income', account:to, amount, date, note, transfer:true, budgetType:null });
    saveEntries();
    document.getElementById('transferAmount').value='';
    document.getElementById('transferNote').value='';
    document.getElementById('transferFromSel').value='';
    document.getElementById('transferToSel').value='';
    syncTransferToOptions();
    renderAll();
    updateTransferAvailableHint(); updateTransferBtnState();
    toast(L('transferDoneToast'));
  });
});

/* Period navigation */
document.querySelectorAll('.periodBtn').forEach(btn=>{
  btn.addEventListener('click', ()=>{
    periodMode = btn.dataset.period;
    if(periodMode === 'year'){ viewYear = viewMonth.getFullYear(); }
    else if(periodMode === 'month'){ viewMonth.setFullYear(viewYear); }
    document.querySelectorAll('.periodBtn').forEach(b=>b.classList.remove('on'));
    btn.classList.add('on');
    document.getElementById('daySelectRow').style.display   = periodMode==='day'   ? 'flex' : 'none';
    document.getElementById('weekSelectRow').style.display  = periodMode==='week'  ? 'flex' : 'none';
    document.getElementById('monthSelectRow').style.display = periodMode==='month' ? 'flex' : 'none';
    document.getElementById('yearSelectRow').style.display  = periodMode==='year'  ? 'flex' : 'none';
    document.getElementById('allSelectRow').style.display   = periodMode==='all'   ? 'flex' : 'none';
    renderSummary();
  });
});
document.getElementById('prevDay').addEventListener('click', ()=>{ viewDay.setDate(viewDay.getDate() - 1); viewDay = new Date(viewDay); renderSummary(); });
document.getElementById('nextDay').addEventListener('click', ()=>{ viewDay.setDate(viewDay.getDate() + 1); viewDay = new Date(viewDay); renderSummary(); });
document.getElementById('prevWeek').addEventListener('click', ()=>{ viewWeekStart.setDate(viewWeekStart.getDate() - 7); viewWeekStart = new Date(viewWeekStart); renderSummary(); });
document.getElementById('nextWeek').addEventListener('click', ()=>{ viewWeekStart.setDate(viewWeekStart.getDate() + 7); viewWeekStart = new Date(viewWeekStart); renderSummary(); });
document.getElementById('prevMonth').addEventListener('click', ()=>{ viewMonth.setDate(1); viewMonth.setMonth(viewMonth.getMonth()-1); viewYear = viewMonth.getFullYear(); renderSummary(); });
document.getElementById('nextMonth').addEventListener('click', ()=>{ viewMonth.setDate(1); viewMonth.setMonth(viewMonth.getMonth()+1); viewYear = viewMonth.getFullYear(); renderSummary(); });
document.getElementById('prevYear').addEventListener('click', ()=>{ viewYear--; viewMonth.setFullYear(viewYear); renderSummary(); });
document.getElementById('nextYear').addEventListener('click', ()=>{ viewYear++; viewMonth.setFullYear(viewYear); renderSummary(); });

/* ============================================================
   Dues / Loans settle / history / self-loan repay
   Loan history & repayment helpers
   ============================================================ */
const settleDueModalEl = document.getElementById('settleDueModal');
let pendingSettleDueId = null;
function openSettleDueModal(id){
  const due = dues.find(d=>d.id===id);
  if(!due || due.settled) return;
  pendingSettleDueId = id;
  const isReceivable = due.type === 'receivable';
  const paidSoFar = due.paidAmount || 0;
  const infoEl = document.getElementById('settleDueInfo');
  infoEl.innerHTML = '<div style="font-weight:600; color:var(--ink); margin-bottom:4px;">'+escapeHtml(due.person)+(due.reason ? ' · '+escapeHtml(due.reason) : '')+'</div>' +
    '<div>'+(isReceivable ? L('dueAmountLabelReceivable') : L('dueAmountLabel'))+': <b>'+moneyFmt(due.amount)+'</b></div>' +
    (paidSoFar > 0 ? '<div>'+L('paidSoFarLabel')+': '+moneyFmt(paidSoFar)+'</div>' : '');
  document.getElementById('settleDueTitle').textContent = isReceivable ? L('settleDueTitleCollect') : L('settlePartialTitle');
  document.getElementById('settleDueAmountFieldLabel').textContent = isReceivable ? L('settleDueAmountLabelCollect') : L('settleAmountLabel');
  document.getElementById('settleDuePartialDesc').textContent = isReceivable ? L('settleDuePartialDescCollect') : L('settlePartialDesc');
  document.getElementById('settleDueAccountLabel').textContent = L('dueSettleAccountLabel');
  const amtInput = document.getElementById('settleDueAmount');
  amtInput.value = formatAmtInput(String(due.amount));
  amtInput.max = due.amount;
  updateSettleAmtState(amtInput, document.getElementById('settleDueContinueBtn'));
  document.getElementById('settleDueDate').value = todayStr();
  settleDueModalEl.classList.add('open');
  lockBodyScroll();
}
function closeSettleDueModal(){ settleDueModalEl.classList.remove('open'); pendingSettleDueId = null; unlockBodyScroll(); }
document.getElementById('settleDueCloseBtn').addEventListener('click', closeSettleDueModal);
document.getElementById('settleDueCancelBtn').addEventListener('click', closeSettleDueModal);
settleDueModalEl.addEventListener('click', (e)=>{ if(e.target === settleDueModalEl) closeSettleDueModal(); });
document.getElementById('settleDueContinueBtn').addEventListener('click', ()=>{
  const due = dues.find(d=>d.id===pendingSettleDueId);
  if(!due) return;
  const amt = parseAmt(document.getElementById('settleDueAmount').value);
  const account = document.getElementById('settleDueAccount').value;
  const date = document.getElementById('settleDueDate').value || todayStr();
  if(!amt || amt <= 0 || gtMoney(amt, due.amount)){ toast(L('invalidSettleAmountMsg')); return; }
  if(due.type==='payable' && gtMoney(amt, accountBalance(account))){ toast(L('insufficientBalanceMsg')); return; }
  const remaining = Math.max(0, +(due.amount - amt).toFixed(2));
  const isFull = remaining < 0.01;
  const rows = confirmRow(L('confPerson'), escapeHtml(due.person)) + confirmRow(L('confAmount'), moneyFmt(amt)) +
    confirmRow(due.type==='receivable' ? L('confTo') : L('confFrom'), accLabel(account)) +
    confirmRow(L('confDate'), date) + (!isFull ? confirmRow(L('remainingAfterLabel'), moneyFmt(remaining)) : '');
  closeSettleDueModal();
  openConfirm('confSettleLoanTitle', rows, ()=>{ applyDuePayment(due, amt, account, date, isFull); });
});
function applyDuePayment(due, amt, account, date, isFull){
  let noteText = due.type==='receivable'
    ? (isFull ? tfmt('dueReceivedNoteFmt', { person: due.person }) : tfmt('duePartialReceivedNoteFmt', { person: due.person }))
    : (isFull ? tfmt('duePaidNoteFmt', { person: due.person }) : tfmt('duePartialPaidNoteFmt', { person: due.person }));
  if(due.reason) noteText += ' — ' + due.reason;
  const entryId = nextId();
  entries.push({ id: entryId, type: due.type==='receivable' ? 'income' : 'expense', account, amount: amt, date, note: noteText, transfer:false, budgetType:null, dueId: due.id });
  saveEntries();
  if(!due.settleEntryIds) due.settleEntryIds = [];
  due.settleEntryIds.push(entryId);
  due.paidAmount = +((due.paidAmount || 0) + amt).toFixed(2);
  due.amount = Math.max(0, +(due.amount - amt).toFixed(2));
  if(isFull || due.amount <= 0.01){ due.settled = true; due.settledDate = date; due.amount = 0; }
  saveDues(); renderAll();
  toast(isFull ? L('dueSettledToast') : L('duePartialSettledToast'));
}
function deleteDue(id){
  const due = dues.find(d=>d.id===id);
  if(!due) return;
  if(!canManageLoansDues(due)){ toast(L('editModeOffToastShort')); return; }
  const idsToRemove = (due.settleEntryIds && due.settleEntryIds.length) ? [...due.settleEntryIds] : [];
  const affected = entries.filter(x => idsToRemove.indexOf(x.id) !== -1);
  // D4: মুছলে কোনো অ্যাকাউন্ট নেগেটিভ হলে আটকাও
  const negatives = simulateBalances(copy=> copy.filter(x=> idsToRemove.indexOf(x.id) === -1));
  if(negatives.length){ openAlert(tfmt('deleteBlockedNegativeMsg', { accounts: simAccountList(negatives) })); return; }
  let msg = L('dueDeleteConfirm');
  if(affected.length > 0){ msg += '\n\n⚠️ ' + tfmt('entriesAlsoDeletedMsg', { n: numFmt(affected.length) }); }
  openSimpleConfirm(msg, ()=>{
    const removed = [];
    const dueBackup = JSON.parse(JSON.stringify(due));
    entries.forEach((en, idx)=>{ if(idsToRemove.indexOf(en.id) !== -1) removed.push({ item: en, index: idx }); });
    entries = entries.filter(x=> idsToRemove.indexOf(x.id) === -1);
    dues = dues.filter(d=>d.id!==id);
    // T11: entries ও dues একসাথে অ্যাটমিকভাবে সেভ — একটা ফেল করলে দুটোই localStorage-এ আগের মানে ফেরে
    const okSave = atomicSaveKeys(['hisab_entries','hisab_dues'], [saveEntries, saveDues]);
    if(!okSave){
      removed.sort((a,b)=>a.index-b.index).forEach(r=>{ entries.splice(Math.min(r.index, entries.length), 0, r.item); });
      dues.push(dueBackup);
      renderAll();
      toast(L('storageSaveFailMsg'));
      return;
    }
    renderAll();
    let settled = false;
    const finalize = ()=>{ settled = true; };
    const timer = setTimeout(finalize, 5000);
    const undo = ()=>{
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      removed.sort((a,b)=>a.index-b.index).forEach(r=>{ entries.splice(Math.min(r.index, entries.length), 0, r.item); });
      dues.push(dueBackup);
      if(!atomicSaveKeys(['hisab_entries','hisab_dues'], [saveEntries, saveDues])){
        // ধাপ ৫/আইটেম ৩: সেভ ফেল করলে মেমরি আবার আগের (মোছা) অবস্থায় ফিরিয়ে দাও (localStorage-এর সাথে মিলিয়ে)
        entries = entries.filter(x=> idsToRemove.indexOf(x.id) === -1);
        dues = dues.filter(d=>d.id!==id);
        toast(L('storageSaveFailMsg'));
      }
      renderAll();
    };
    showUndoToast(L('dueDeletedToast'), undo, null, finalize, ()=>clearTimeout(timer));
  });
}

const loanHistoryModalEl = document.getElementById('loanHistoryModal');
function openLoanHistoryModal(){ renderLoanHistoryList(); loanHistoryModalEl.classList.add('open'); lockBodyScroll(); }
function closeLoanHistoryModal(){ loanHistoryModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('loanHistoryBtn')?.addEventListener('click', openLoanHistoryModal);
document.getElementById('loanHistoryCloseBtn').addEventListener('click', closeLoanHistoryModal);
loanHistoryModalEl.addEventListener('click', (e)=>{ if(e.target === loanHistoryModalEl) closeLoanHistoryModal(); });
function renderLoanHistoryList(){
  const list = document.getElementById('loanHistoryList');
  const settledLoans = loans.filter(l=>l.settled).map(l=> ({ kind:'loan', id:l.id, sortDate: l.settledDate || l.date, item:l }));
  const settledDues = dues.filter(d=>d.settled).map(d=> ({ kind:'due', id:d.id, sortDate: d.settledDate || d.date, item:d }));
  const combined = [...settledLoans, ...settledDues].sort((a,b)=> String(b.sortDate||'').localeCompare(String(a.sortDate||'')));
  if(combined.length === 0){ list.innerHTML = '<div class="empty">'+L('loanHistoryEmptyMsg')+'</div>'; return; }
  list.innerHTML = combined.map(h=>{
    const l = h.item;
    let name, badgeText;
    if(h.kind === 'loan'){
      badgeText = l.type==='taken' ? L('loanTakenLabel') : l.type==='self' ? L('loanSelfLabel') : L('loanGivenLabel');
      name = l.type==='self' ? '' : escapeHtml(l.person);
    } else {
      badgeText = l.type==='receivable' ? L('dueReceivableLabel') : L('duePayableLabel');
      name = escapeHtml(l.person);
    }
    const amt = (l.paidAmount && l.paidAmount > 0) ? l.paidAmount : l.amount;
    const isPositive = (h.kind === 'loan' && l.type === 'given') || (h.kind === 'due' && l.type === 'receivable');
    return '<div class="entry '+(isPositive ? 'income-bg' : 'expense-bg')+'" onclick="openLoanHistoryDetail(\''+h.kind+'\', '+Number(h.id)+')" role="button" tabindex="0">'+
      '<div class="left"><span class="tag"><span class="accbadge">'+badgeText+'</span>'+(name ? name + ' · ' : '')+escapeHtml(h.sortDate || '')+'</span></div>'+
      '<div class="actions"><span class="amt '+(isPositive ? 'income' : 'expense')+'">'+moneyFmt(amt)+'</span></div></div>';
  }).join('');
}
const loanHistoryDetailModalEl = document.getElementById('loanHistoryDetailModal');
function openLoanHistoryDetail(kind, id){
  const body = document.getElementById('loanHistoryDetailBody');
  let rows = '';
  if(kind === 'loan'){
    const l = loans.find(x=>x.id===id); if(!l) return;
    const typeLabel = l.type==='taken' ? L('loanTakenLabel') : l.type==='self' ? L('loanSelfLabel') : L('loanGivenLabel');
    const settledLabel = l.type==='self' ? L('loanSelfSettledLabel') : L('settledLabel');
    const name = l.type==='self' ? '' : escapeHtml(l.person);
    rows = (name ? '<div style="font-weight:700; margin-bottom:6px;">'+name+'</div>' : '') +
      '<div><span class="bwbadge">'+typeLabel+'</span></div>' +
      '<div style="margin-top:8px;">'+L('confAmount')+': <b>'+moneyFmt(l.paidAmount || l.amount)+'</b></div>' +
      '<div>'+L('histAccountLabel')+': <b>'+accLabel(l.account)+'</b></div>' +
      '<div>'+L('histDateLabel')+': <b>'+escapeHtml(l.date)+'</b></div>' +
      (l.note ? '<div>'+L('histNoteLabel')+': '+escapeHtml(l.note)+'</div>' : '') +
      '<div style="color:var(--ledger-green); font-weight:600; margin-top:6px;">✓ '+settledLabel+(l.settledDate ? ' ('+escapeHtml(l.settledDate)+')' : '')+'</div>';
  } else {
    const d = dues.find(x=>x.id===id); if(!d) return;
    const typeLabel = d.type==='receivable' ? L('dueReceivableLabel') : L('duePayableLabel');
    rows = '<div style="font-weight:700; margin-bottom:6px;">'+escapeHtml(d.person)+'</div>' +
      '<div><span class="bwbadge">'+typeLabel+'</span></div>' +
      '<div style="margin-top:8px;">'+L('confAmount')+': <b>'+moneyFmt(d.paidAmount || d.amount)+'</b></div>' +
      (d.reason ? '<div>'+L('histReasonLabel')+': '+escapeHtml(d.reason)+'</div>' : '') +
      '<div>'+L('histDateLabel')+': <b>'+escapeHtml(d.date)+'</b></div>' +
      '<div style="color:var(--ledger-green); font-weight:600; margin-top:6px;">✓ '+L('settledLabel')+(d.settledDate ? ' ('+escapeHtml(d.settledDate)+')' : '')+'</div>';
  }
  body.innerHTML = rows;
  loanHistoryDetailModalEl.classList.add('open');
  lockBodyScroll();
}
function closeLoanHistoryDetailModal(){ loanHistoryDetailModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('loanHistoryDetailCloseBtn').addEventListener('click', closeLoanHistoryDetailModal);
loanHistoryDetailModalEl.addEventListener('click', (e)=>{ if(e.target === loanHistoryDetailModalEl) closeLoanHistoryDetailModal(); });

const entryDetailModalEl = document.getElementById('entryDetailModal');
function openEntryDetail(id){
  const en = entries.find(x=>x.id===id);
  if(!en) return;
  const body = document.getElementById('entryDetailBody');
  if(en.savingsReattribFrom){
    const rows = confirmRow(L('confAmount'), moneyFmt(en.savingsReattribAmount || 0)) +
      confirmRow(L('confFrom'), accLabel(en.savingsReattribFrom)) +
      confirmRow(L('confTo'), accLabel(en.savingsReattribTo)) +
      confirmRow(L('confDate'), escapeHtml(en.date)) + (en.note ? confirmRow(L('confNote'), escapeHtml(en.note)) : '');
    body.innerHTML = rows;
    entryDetailModalEl.classList.add('open');
    lockBodyScroll();
    return;
  }
  const pair = en.transfer ? findPair(en) : null;
  const rows = confirmRow(L('confType'), L(en.type==='income'?'typeIncome':'typeExpense')) +
    confirmRow(L('confAmount'), moneyFmt(en.amount)) + confirmRow(L('confAccount'), accLabel(en.account)) +
    (pair ? confirmRow(en.type==='income'?L('confFrom'):L('confTo'), accLabel(pair.account)) : '') +
    ((en.budgetType==='need'||en.budgetType==='want') ? confirmRow(L('confBudgetType'), L(en.budgetType+'Label')) : '') +
    confirmRow(L('confDate'), escapeHtml(en.date)) + (en.note ? confirmRow(L('confNote'), escapeHtml(en.note)) : '');
  body.innerHTML = rows;
  entryDetailModalEl.classList.add('open');
  lockBodyScroll();
}
function closeEntryDetailModal(){ entryDetailModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('entryDetailCloseBtn').addEventListener('click', closeEntryDetailModal);
entryDetailModalEl.addEventListener('click', (e)=>{ if(e.target === entryDetailModalEl) closeEntryDetailModal(); });

function settleLoan(id){ openSettleLoanModal(id); }
const settleLoanModalEl = document.getElementById('settleLoanModal');
let pendingSettleLoanId = null;
function openSettleLoanModal(id){
  const loan = loans.find(l=>l.id===id);
  if(!loan || loan.settled) return;
  pendingSettleLoanId = id;
  const isCollecting = loan.type === 'given';
  const paidSoFar = loan.paidAmount || 0;
  const infoEl = document.getElementById('settleLoanInfo');
  infoEl.innerHTML = '<div style="font-weight:600; color:var(--ink); margin-bottom:4px;">'+escapeHtml(loan.person)+'</div>' +
    '<div>'+L('dueAmountLabel')+': <b>'+moneyFmt(loan.amount)+'</b></div>' +
    (paidSoFar > 0 ? '<div>'+L('paidSoFarLabel')+': '+moneyFmt(paidSoFar)+'</div>' : '');
  document.getElementById('settleLoanTitle').textContent = isCollecting ? L('settleDueTitleCollect') : L('settlePartialTitle');
  document.getElementById('settleLoanAmountFieldLabel').textContent = isCollecting ? L('settleDueAmountLabelCollect') : L('settleAmountLabel');
  document.getElementById('settleLoanPartialDesc').textContent = isCollecting ? L('settleDuePartialDescCollect') : L('settlePartialDesc');
  document.getElementById('settleLoanAccountLabel').textContent = L('dueSettleAccountLabel');
  const amtInput = document.getElementById('settleLoanAmount');
  amtInput.value = formatAmtInput(String(loan.amount));
  amtInput.max = loan.amount;
  updateSettleAmtState(amtInput, document.getElementById('settleLoanContinueBtn'));
  const accSel = document.getElementById('settleLoanAccount');
  setAccountSelectValue(accSel, loan.account || 'cash');
  document.getElementById('settleLoanDate').value = todayStr();
  settleLoanModalEl.classList.add('open');
  lockBodyScroll();
}
function closeSettleLoanModal(){ settleLoanModalEl.classList.remove('open'); pendingSettleLoanId = null; unlockBodyScroll(); }
document.getElementById('settleLoanCloseBtn').addEventListener('click', closeSettleLoanModal);
document.getElementById('settleLoanCancelBtn').addEventListener('click', closeSettleLoanModal);
settleLoanModalEl.addEventListener('click', (e)=>{ if(e.target === settleLoanModalEl) closeSettleLoanModal(); });
document.getElementById('settleLoanContinueBtn').addEventListener('click', ()=>{
  const loan = loans.find(l=>l.id===pendingSettleLoanId);
  if(!loan) return;
  const amt = parseAmt(document.getElementById('settleLoanAmount').value);
  const account = document.getElementById('settleLoanAccount').value;
  const date = document.getElementById('settleLoanDate').value || todayStr();
  if(!amt || amt <= 0 || gtMoney(amt, loan.amount)){ toast(L('invalidSettleAmountMsg')); return; }
  if(loan.type==='taken' && gtMoney(amt, accountBalance(account))){ toast(L('insufficientBalanceMsg')); return; }
  const remaining = Math.max(0, +(loan.amount - amt).toFixed(2));
  const isFull = remaining < 0.01;
  const rows = confirmRow(L('confPerson'), escapeHtml(loan.person)) + confirmRow(L('confAmount'), moneyFmt(amt)) +
    confirmRow(loan.type==='given' ? L('confTo') : L('confFrom'), accLabel(account)) +
    confirmRow(L('confDate'), date) + (!isFull ? confirmRow(L('remainingAfterLabel'), moneyFmt(remaining)) : '');
  closeSettleLoanModal();
  openConfirm('confSettleLoanTitle', rows, ()=>{ applyLoanPayment(loan, amt, account, date, isFull); });
});
function applyLoanPayment(loan, amt, account, date, isFull){
  const noteText = isFull
    ? (loan.type==='taken' ? tfmt('loanTakenRepayNoteFmt', { person: loan.person }) : tfmt('loanGivenRepayNoteFmt', { person: loan.person }))
    : (loan.type==='taken' ? tfmt('loanPartialTakenRepayNoteFmt', { person: loan.person }) : tfmt('loanPartialGivenRepayNoteFmt', { person: loan.person }));
  const entryId = nextId();
  entries.push({ id: entryId, type: loan.type==='taken' ? 'expense' : 'income', account, amount: amt, date, note: noteText, transfer:false, budgetType:null, loanId: loan.id });
  saveEntries();
  if(!loan.settleEntryIds) loan.settleEntryIds = [];
  loan.settleEntryIds.push(entryId);
  loan.paidAmount = +((loan.paidAmount || 0) + amt).toFixed(2);
  loan.amount = Math.max(0, +(loan.amount - amt).toFixed(2));
  if(isFull || loan.amount <= 0.01){ loan.settled = true; loan.settledDate = date; loan.amount = 0; }
  saveLoans(); renderAll();
  toast(isFull ? L('loanSettledToast') : L('loanPartialSettledToast'));
}
function deleteLoan(id){
  const loan = loans.find(l=>l.id===id);
  if(!loan) return;
  if(!canManageLoansDues(loan)){ toast(L('editModeOffToastShort')); return; }
  const idsToRemove = Array.isArray(loan.entryIds) ? [...loan.entryIds] : [];
  if(loan.settleEntryIds && loan.settleEntryIds.length) idsToRemove.push(...loan.settleEntryIds);
  const affected = entries.filter(x => idsToRemove.indexOf(x.id) !== -1);
  // D4: মুছলে কোনো অ্যাকাউন্ট নেগেটিভ হলে আটকাও
  const negatives = simulateBalances(copy=> copy.filter(x=> idsToRemove.indexOf(x.id) === -1));
  if(negatives.length){ openAlert(tfmt('deleteBlockedNegativeMsg', { accounts: simAccountList(negatives) })); return; }
  let msg = L('loanDeleteConfirm');
  if(affected.length > 0){ msg += '\n\n⚠️ ' + tfmt('entriesAlsoDeletedMsg', { n: numFmt(affected.length) }); }
  openSimpleConfirm(msg, ()=>{
    const removed = [];
    const loanBackup = JSON.parse(JSON.stringify(loan));
    entries.forEach((en, idx)=>{ if(idsToRemove.indexOf(en.id) !== -1) removed.push({ item: en, index: idx }); });
    entries = entries.filter(x=> idsToRemove.indexOf(x.id) === -1);
    loans = loans.filter(l=>l.id!==id);
    // T11: entries ও loans একসাথে অ্যাটমিকভাবে সেভ — একটা ফেল করলে দুটোই localStorage-এ আগের মানে ফেরে
    const okSave = atomicSaveKeys(['hisab_entries','hisab_loans'], [saveEntries, saveLoans]);
    if(!okSave){
      removed.sort((a,b)=>a.index-b.index).forEach(r=>{ entries.splice(Math.min(r.index, entries.length), 0, r.item); });
      loans.push(loanBackup);
      renderAll();
      toast(L('storageSaveFailMsg'));
      return;
    }
    renderAll();
    let settled = false;
    const finalize = ()=>{ settled = true; };
    const timer = setTimeout(finalize, 5000);
    const undo = ()=>{
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      removed.sort((a,b)=>a.index-b.index).forEach(r=>{ entries.splice(Math.min(r.index, entries.length), 0, r.item); });
      loans.push(loanBackup);
      if(!atomicSaveKeys(['hisab_entries','hisab_loans'], [saveEntries, saveLoans])){
        // ধাপ ৫/আইটেম ৩: সেভ ফেল করলে মেমরি আবার আগের (মোছা) অবস্থায় ফিরিয়ে দাও (localStorage-এর সাথে মিলিয়ে)
        entries = entries.filter(x=> idsToRemove.indexOf(x.id) === -1);
        loans = loans.filter(l=>l.id!==id);
        toast(L('storageSaveFailMsg'));
      }
      renderAll();
    };
    showUndoToast(L('loanDeletedToast'), undo, null, finalize, ()=>clearTimeout(timer));
  });
}
function renderSelfLoanRepayOptions(){
  const sel = document.getElementById('selfLoanRepaySelect');
  const btn = document.getElementById('selfLoanRepayBtn2');
  const noneMsg = document.getElementById('noSelfLoanMsg');
  const amtWrap = document.getElementById('selfLoanRepayAmountWrap');
  if(!sel) return;
  const pending = loans.filter(l=> l.type==='self' && !l.settled);
  if(pending.length === 0){
    sel.innerHTML = ''; sel.style.display = 'none';
    if(btn) btn.style.display = 'none';
    if(amtWrap) amtWrap.style.display = 'none';
    if(noneMsg) noneMsg.textContent = L('noSelfLoanMsg');
  } else {
    sel.style.display = ''; if(btn) btn.style.display = ''; if(amtWrap) amtWrap.style.display = '';
    if(noneMsg) noneMsg.textContent = '';
    sel.innerHTML = pending.map(l=> '<option value="'+Number(l.id)+'">'+moneyFmt(l.amount)+' — '+escapeHtml(l.date)+(l.note ? ' · '+escapeHtml(l.note) : '')+'</option>').join('');
    updateSelfLoanRepayAmountField();
  }
}
function updateSelfLoanRepayAmountField(){
  const sel = document.getElementById('selfLoanRepaySelect');
  const amtInput = document.getElementById('selfLoanRepayAmount');
  const hint = document.getElementById('selfLoanRepayRemainingHint');
  if(!sel || !amtInput || !sel.value) return;
  const loan = loans.find(l=> String(l.id) === String(sel.value));
  if(!loan) return;
  amtInput.value = formatAmtInput(String(loan.amount));
  amtInput.max = loan.amount;
  updateSettleAmtState(amtInput, document.getElementById('selfLoanRepayBtn2'));
  if(hint){
    const paidSoFar = loan.paidAmount || 0;
    hint.textContent = L('dueAmountLabel') + ': ' + moneyFmt(loan.amount) + (paidSoFar > 0 ? ' · ' + L('paidSoFarLabel') + ': ' + moneyFmt(paidSoFar) : '');
  }
}
document.getElementById('selfLoanRepayBtn2')?.addEventListener('click', ()=>{
  const sel = document.getElementById('selfLoanRepaySelect');
  const accSel = document.getElementById('selfLoanRepayAccount');
  const amtInput = document.getElementById('selfLoanRepayAmount');
  if(!sel || !sel.value) return;
  if(!accSel || !accSel.value){ openAlert(L('entrySelectAccountMsg')); return; }
  const loan = loans.find(l=> String(l.id) === String(sel.value));
  if(!loan) return;
  const amt = parseAmt(amtInput ? amtInput.value : String(loan.amount));
  if(!amt || amt <= 0 || gtMoney(amt, loan.amount)){ toast(L('invalidSettleAmountMsg')); return; }
  repaySelfLoan(loan.id, accSel.value, amt);
});
function repaySelfLoan(id, fromAccount, amt){
  const loan = loans.find(l=>l.id===id);
  if(!loan || loan.type!=='self' || loan.settled) return;
  const from = fromAccount || 'cash';
  const date = todayStr();
  const payAmt = (amt && amt > 0 && amt < loan.amount) ? +amt.toFixed(2) : loan.amount;
  const availForRepay = accountBalance(from);
  if(gtMoney(payAmt, availForRepay)){ openAlert(tfmt('selfLoanRepayInsufficientMsg', { amt: moneyFmt(payAmt - availForRepay) })); return; }
  const remaining = Math.max(0, +(loan.amount - payAmt).toFixed(2));
  const isFull = remaining < 0.01;
  const rows = confirmRow(L('confAmount'), moneyFmt(payAmt)) + confirmRow(L('confFrom'), accLabel(from)) +
    confirmRow(L('confTo'), L('accSavings')) + confirmRow(L('confDate'), date) +
    (!isFull ? confirmRow(L('remainingAfterLabel'), moneyFmt(remaining)) : '');
  openConfirm('confSelfRepayTitle', rows, ()=>{
    const id1 = nextId(), id2 = nextId();
    entries.push({ id:id1, pairId:id1, type:'expense', account:from, amount:payAmt, date, note:L('loanSelfRepayEntryNote'), transfer:true, budgetType:null, loanId: loan.id });
    entries.push({ id:id2, pairId:id1, type:'income', account:'savings', amount:payAmt, date, note:L('loanSelfRepayEntryNote'), transfer:true, budgetType:null, loanId: loan.id });
    saveEntries();
    if(!loan.settleEntryIds) loan.settleEntryIds = [];
    loan.settleEntryIds.push(id1, id2);
    loan.paidAmount = +((loan.paidAmount || 0) + payAmt).toFixed(2);
    loan.amount = remaining;
    if(isFull){ loan.settled = true; loan.settledDate = date; loan.amount = 0; }
    saveLoans(); renderAll();
    toast(isFull ? L('loanSelfRepaidToast') : L('loanPartialSettledToast'));
  });
}
const selfLoanCardRepayModalEl = document.getElementById('selfLoanCardRepayModal');
let pendingSelfLoanCardRepayId = null;
function openSelfLoanCardRepayModal(id){
  const loan = loans.find(l=>l.id===id);
  if(!loan || loan.settled) return;
  pendingSelfLoanCardRepayId = id;
  const infoEl = document.getElementById('selfLoanCardRepayInfo');
  const paidSoFar = loan.paidAmount || 0;
  infoEl.innerHTML = '<div>'+L('dueAmountLabel')+': <b>'+moneyFmt(loan.amount)+'</b></div>' +
    (paidSoFar > 0 ? '<div>'+L('paidSoFarLabel')+': '+moneyFmt(paidSoFar)+'</div>' : '');
  const amtInput = document.getElementById('selfLoanCardRepayAmount');
  if(amtInput){ amtInput.value = formatAmtInput(String(loan.amount)); amtInput.max = loan.amount; updateSettleAmtState(amtInput, document.getElementById('selfLoanCardRepayContinueBtn')); }
  const accSel = document.getElementById('selfLoanCardRepayAccount');
  setAccountSelectValue(accSel, loan.account || 'cash');
  selfLoanCardRepayModalEl.classList.add('open');
  lockBodyScroll();
}
function closeSelfLoanCardRepayModal(){ selfLoanCardRepayModalEl.classList.remove('open'); pendingSelfLoanCardRepayId = null; unlockBodyScroll(); }
document.getElementById('selfLoanCardRepayCloseBtn').addEventListener('click', closeSelfLoanCardRepayModal);
document.getElementById('selfLoanCardRepayCancelBtn').addEventListener('click', closeSelfLoanCardRepayModal);
selfLoanCardRepayModalEl.addEventListener('click', (e)=>{ if(e.target === selfLoanCardRepayModalEl) closeSelfLoanCardRepayModal(); });
document.getElementById('selfLoanCardRepayContinueBtn').addEventListener('click', ()=>{
  const id = pendingSelfLoanCardRepayId;
  const loan = loans.find(l=>l.id===id);
  if(!loan){ closeSelfLoanCardRepayModal(); return; }
  const account = document.getElementById('selfLoanCardRepayAccount').value;
  const amtInput = document.getElementById('selfLoanCardRepayAmount');
  const amt = parseAmt(amtInput ? amtInput.value : String(loan.amount));
  if(!amt || amt <= 0 || gtMoney(amt, loan.amount)){ toast(L('invalidSettleAmountMsg')); return; }
  closeSelfLoanCardRepayModal();
  repaySelfLoan(id, account, amt);
});


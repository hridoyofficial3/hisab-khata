/* ============================================================
   Notes
   ============================================================ */
document.getElementById('addNoteBtn').addEventListener('click', addNote);
document.getElementById('noteText').addEventListener('keydown', (e)=>{ if(e.key==='Enter') addNote(); });
document.getElementById('notePrice').addEventListener('keydown', (e)=>{ if(e.key==='Enter') addNote(); });
function addNote(){
  const input = document.getElementById('noteText');
  const priceInput = document.getElementById('notePrice');
  const text = input.value.trim();
  if(!text) return;
  const price = parseAmt(priceInput.value) || 0;
  notes.push({ id: nextId(), text, done:false, price });
  saveNotes(); input.value=''; priceInput.value=''; renderNotes();
}
function toggleNote(id){
  const n = notes.find(x=>x.id===id);
  if(!n) return;
  if(n.done && !settings.advancedMode){ renderNotes(); return; }
  n.done = !n.done;
  saveNotes(); renderNotes();
}
function deleteNote(id){
  const idx = notes.findIndex(x=>x.id===id);
  if(idx === -1) return;
  const item = notes[idx];
  notes.splice(idx,1);
  saveNotes(); renderNotes();
  let settled = false;
  const finalize = ()=>{ if(settled) return; settled = true; };
  const finalizeTimer = setTimeout(finalize, 5000);
  const undo = ()=>{
    if(settled) return;
    settled = true;
    clearTimeout(finalizeTimer);
    const insertAt = Math.min(idx, notes.length);
    notes.splice(insertAt, 0, item);
    saveNotes(); renderNotes();
  };
  showUndoToast(L('noteDeletedToast'), undo, null, finalize, ()=>clearTimeout(finalizeTimer));
}

/* ============================================================
   Plans
   ============================================================ */
function togglePlanning(){
  document.getElementById('planningBody').classList.toggle('open');
  const toggleEl = document.getElementById('planningToggle');
  toggleEl.classList.toggle('open');
  toggleEl.setAttribute('aria-expanded', toggleEl.classList.contains('open') ? 'true' : 'false');
}
function refreshPlanItemSuggestions(){
  const dl = document.getElementById('planItemSuggestions');
  if(!dl) return;
  dl.innerHTML = notes.map(n=>'<option value="'+escapeHtml(n.text)+'"></option>').join('');
}
document.getElementById('planForm').addEventListener('submit', (e)=>{
  e.preventDefault();
  const item = document.getElementById('planItem').value.trim();
  const amount = parseAmt(document.getElementById('planAmount').value);
  if(!item){ toast(L('planItemRequiredMsg')); return; }
  if(!amount || amount<=0){ toast(L('invalidAmountMsg')); return; }
  const date = document.getElementById('planDate').value || '';
  const account = document.getElementById('planAccount').value;
  if(!account){ openAlert(L('entrySelectAccountMsg')); return; }
  const note = document.getElementById('planNote').value.trim();
  const priority = parseInt(document.getElementById('planPriority').value, 10) || 1;
  plans.push({ id: nextId(), item, amount, date, account, note, priority });
  savePlans();
  document.getElementById('planForm').reset();
  renderPlans(); renderNotes();
  toast(L('planAddedToast'));
});
function deletePlan(id){
  const idx = plans.findIndex(x=>x.id===id);
  if(idx === -1) return;
  const item = plans[idx];
  openSimpleConfirm(L('planDeleteConfirm'), ()=>{
    plans.splice(idx, 1);
    savePlans(); renderPlans(); renderNotes();
    let settled = false;
    const finalize = ()=>{ if(settled) return; settled = true; };
    const timer = setTimeout(finalize, 5000);
    const undo = ()=>{
      if(settled) return;
      settled = true;
      clearTimeout(timer);
      plans.splice(Math.min(idx, plans.length), 0, item);
      savePlans(); renderPlans(); renderNotes();
    };
    showUndoToast(L('planDeletedToast'), undo, null, finalize, ()=>clearTimeout(timer));
  });
}
function renderPlans(){
  const list = document.getElementById('plansList');
  if(!list) return;
  const unbought = plans.filter(p=>!p.bought);
  if(unbought.length===0){ list.innerHTML = '<div class="empty">'+L('planEmptyMsg')+'</div>'; return; }
  const sorted = [...unbought].sort((a,b)=> String(a.date||'9999').localeCompare(String(b.date||'9999')) || b.id-a.id);
  list.innerHTML = sorted.map(p=>{
    const stars = '★'.repeat(p.priority||1) + '☆'.repeat(3-(p.priority||1));
    const dateRow = p.date ? '<div>'+L('planTargetDatePrefix')+'<b>'+p.date+'</b></div>' : '<div>'+L('planNoDatePrefix')+'</div>';
    const noteRow = p.note ? '<div>'+L('planNoteFmt')+escapeHtml(p.note)+'</div>' : '';
    return '<div class="plan-item"><div class="pname"><span>'+escapeHtml(p.item)+'</span><span>'+moneyFmt(p.amount)+'</span></div>' +
      '<div class="pmeta"><div>'+L('planFromAccPrefix')+'<b>'+accLabel(p.account)+'</b></div>'+dateRow+'<div>'+L('planPriorityPrefix')+'<b>'+stars+'</b></div>'+noteRow+'</div>' +
      '<div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">' +
        '<button class="btn outline" style="padding:6px 10px; font-size:12px; width:auto;" onclick="openBuyPlanModal('+p.id+')">'+L('buyNowBtn')+'</button>' +
        '<button class="pdel" onclick="deletePlan('+p.id+')">×</button>' +
      '</div></div>';
  }).join('');
}
function renderPlanHistory(){
  const list = document.getElementById('planHistoryList');
  if(!list) return;
  const bought = plans.filter(p=>p.bought);
  if(bought.length === 0){ list.innerHTML = '<div class="empty">'+L('planHistoryEmptyMsg')+'</div>'; return; }
  const sorted = [...bought].sort((a,b)=> String(b.boughtDate||'').localeCompare(String(a.boughtDate||'')));
  list.innerHTML = sorted.map(p=>'<div class="entry"><div class="left"><span class="tag"><span class="accbadge">'+accLabel(p.boughtAccount)+'</span>'+escapeHtml(p.item)+(p.boughtDate ? ' · ' + p.boughtDate : '')+'</span></div><div class="actions"><span class="amt expense">'+moneyFmt(p.amount)+'</span></div></div>').join('');
}

/* Buy plan */
const buyPlanModalEl = document.getElementById('buyPlanModal');
let pendingBuyPlanId = null;
function openBuyPlanModal(id){
  const plan = plans.find(p=>p.id===id);
  if(!plan) return;
  pendingBuyPlanId = id;
  const infoEl = document.getElementById('buyPlanInfo');
  infoEl.innerHTML = '<div style="font-weight:600; color:var(--ink); margin-bottom:4px;">'+escapeHtml(plan.item)+'</div>' +
    '<div>'+L('planAmountLabel')+': <b>'+moneyFmt(plan.amount)+'</b></div>';
  const accSel = document.getElementById('buyPlanAccount');
  accSel.value = plan.account || 'cash';
  toggleBuyPlanSavingsRow();
  document.getElementById('buyPlanDate').value = todayStr();
  buyPlanModalEl.classList.add('open');
  lockBodyScroll();
}
function closeBuyPlanModal(){ buyPlanModalEl.classList.remove('open'); pendingBuyPlanId = null; unlockBodyScroll(); }
function toggleBuyPlanSavingsRow(){
  const row = document.getElementById('buyPlanSavingsRow');
  const isSavings = document.getElementById('buyPlanAccount').value === 'savings';
  row.style.display = isSavings ? 'block' : 'none';
}
document.getElementById('buyPlanAccount').addEventListener('change', toggleBuyPlanSavingsRow);
document.getElementById('buyPlanCloseBtn').addEventListener('click', closeBuyPlanModal);
document.getElementById('buyPlanCancelBtn').addEventListener('click', closeBuyPlanModal);
buyPlanModalEl.addEventListener('click', (e)=>{ if(e.target === buyPlanModalEl) closeBuyPlanModal(); });
document.getElementById('buyPlanContinueBtn').addEventListener('click', ()=>{
  const plan = plans.find(p=>p.id===pendingBuyPlanId);
  if(!plan) return;
  const account = document.getElementById('buyPlanAccount').value;
  const date = document.getElementById('buyPlanDate').value || todayStr();
  const amt = plan.amount;
  if(account === 'savings'){
    const dest = document.getElementById('buyPlanSavingsDest').value;
    if(amt > accountBalance('savings')){ toast(L('insufficientSavingsMsg')); return; }
    const rows = confirmRow(L('confItem'), escapeHtml(plan.item)) + confirmRow(L('confAmount'), moneyFmt(amt)) +
      confirmRow(L('confFrom'), L('accSavings')) + confirmRow(L('buyPlanSavingsDestLabel'), accLabel(dest)) +
      confirmRow(L('confDate'), date);
    closeBuyPlanModal();
    openConfirm('confBuyPlanTitle', rows, ()=>{
      const wid1 = nextId(), wid2 = nextId();
      const withdrawNote = tfmt('planBuyWithdrawNoteFmt', { item: plan.item });
      entries.push({ id:wid1, pairId:wid1, type:'expense', account:'savings', amount:amt, date, note:withdrawNote, transfer:true, budgetType:null });
      entries.push({ id:wid2, pairId:wid1, type:'income', account:dest, amount:amt, date, note:withdrawNote, transfer:true, budgetType:null });
      const pid = nextId();
      entries.push({ id:pid, type:'expense', account:dest, amount:amt, date, note: tfmt('planBoughtNoteFmt', { item: plan.item }), transfer:false, budgetType:null });
      saveEntries();
      plan.bought = true; plan.boughtDate = date; plan.boughtAccount = dest;
      savePlans(); renderAll();
      toast(L('planBoughtToast'));
    });
  } else {
    if(amt > accountBalance(account)){ toast(L('insufficientBalanceMsg')); return; }
    const rows = confirmRow(L('confItem'), escapeHtml(plan.item)) + confirmRow(L('confAmount'), moneyFmt(amt)) +
      confirmRow(L('confFrom'), accLabel(account)) + confirmRow(L('confDate'), date);
    closeBuyPlanModal();
    openConfirm('confBuyPlanTitle', rows, ()=>{
      const pid = nextId();
      entries.push({ id:pid, type:'expense', account, amount:amt, date, note: tfmt('planBoughtNoteFmt', { item: plan.item }), transfer:false, budgetType:null });
      saveEntries();
      plan.bought = true; plan.boughtDate = date; plan.boughtAccount = account;
      savePlans(); renderAll();
      toast(L('planBoughtToast'));
    });
  }
});


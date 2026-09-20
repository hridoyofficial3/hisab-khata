/* ============================================================
   Dark Mode
   ============================================================ */
function applyDarkMode(){
  const mode = (settings && settings.darkMode) || 'light';
  let effective;
  if(mode === 'system'){
    effective = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  } else {
    effective = mode;
  }
  document.documentElement.setAttribute('data-theme', effective);
  // Update theme-color meta
  const meta = document.querySelector('meta[name="theme-color"]');
  if(meta) meta.content = effective === 'black' ? '#000000' : (effective === 'dark' ? '#0a1f1a' : '#1F5C4F');
  document.querySelectorAll('.darkModeBtn').forEach(b=>{
    b.classList.toggle('on', b.dataset.mode === mode);
    b.classList.toggle('income', b.dataset.mode === mode);
  });
}
if(window.matchMedia){
  try{
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
      if(((settings && settings.darkMode) || 'system') === 'system') applyDarkMode();
    });
  }catch(e){}
}

/* ============================================================
   applyLanguage etc
   ============================================================ */
function applyLanguage(){
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(el=>{ el.textContent = L(el.dataset.i18n); });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{ el.placeholder = L(el.dataset.i18nPh); });
  const ni = document.getElementById('noteInput'); if(ni) ni.placeholder = L('amountPlaceholderNote');
  const nt = document.getElementById('noteText'); if(nt) nt.placeholder = L('notePlaceholder');
  const np = document.getElementById('notePrice'); if(np) np.placeholder = L('notePricePlaceholder');
  const wr = document.getElementById('withdrawReason'); if(wr) wr.placeholder = L('withdrawReasonPlaceholder');
  const es = document.getElementById('entrySearchInput'); if(es) es.placeholder = L('entrySearchPlaceholder');
  const aes = document.getElementById('allEntriesSearchInput'); if(aes) aes.placeholder = L('entrySearchPlaceholder');
  document.querySelectorAll('.langBtn').forEach(b=> b.classList.toggle('on', b.dataset.lang===lang));
  updateBudgetLabels();
  setHeaderDate();
  renderAll();
  updateStickyOffsets();
  if(typeof updateLoanBtnState === 'function') updateLoanBtnState();
  if(typeof renderBackupStatus === 'function') renderBackupStatus();
  if(typeof renderStoragePersistStatus === 'function') renderStoragePersistStatus();
  if(typeof renderCorruptBanner === 'function') renderCorruptBanner();
  if(typeof checkBackupReminder === 'function') checkBackupReminder();
}

function updateStickyOffsets(){
  const header = document.querySelector('header');
  const tabs = document.querySelector('.tabs');
  const headerH = header ? Math.ceil(header.getBoundingClientRect().height) : 60;
  const tabsH = tabs ? Math.ceil(tabs.getBoundingClientRect().height) : 50;
  const root = document.documentElement.style;
  root.setProperty('--header-h', headerH + 'px');
  root.setProperty('--tabs-h', tabsH + 'px');
  root.setProperty('--sticky-top', (headerH + tabsH) + 'px');
}
window.addEventListener('resize', updateStickyOffsets);
if(document.fonts && document.fonts.ready){ document.fonts.ready.then(updateStickyOffsets); }
window.addEventListener('load', updateStickyOffsets);

let toastTimer = null;
function toast(msg, ms){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=> el.classList.remove('show'), ms || 2800);
}

let undoToastTimer = null;
let activeUndoAction = null;
let pendingUndoFinalize = null;
function showUndoToast(msg, onUndo, ms, onFinalize, clearFinalizeTimer){
  if(pendingUndoFinalize){ pendingUndoFinalize.clearTimer(); pendingUndoFinalize.finalize(); pendingUndoFinalize = null; }
  const el = document.getElementById('undoToast');
  document.getElementById('undoToastMsg').textContent = msg;
  el.classList.add('show');
  clearTimeout(undoToastTimer);
  activeUndoAction = onUndo;
  pendingUndoFinalize = onFinalize ? { finalize: onFinalize, clearTimer: clearFinalizeTimer } : null;
  undoToastTimer = setTimeout(()=>{ el.classList.remove('show'); if(activeUndoAction === onUndo) activeUndoAction = null; }, ms || 5000);
}
document.getElementById('undoToastBtn').addEventListener('click', ()=>{
  if(!activeUndoAction) return;
  const fn = activeUndoAction;
  activeUndoAction = null; pendingUndoFinalize = null;
  clearTimeout(undoToastTimer);
  document.getElementById('undoToast').classList.remove('show');
  fn();
});

const _escapeMap = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' };
function escapeHtml(str){
  if(str == null) return '';
  return String(str).replace(/[&<>"']/g, c => _escapeMap[c]);
}
/* T8 — অ্যাকাউন্টের রঙ style="..."-এ বসে; আমদানি করা/নষ্ট ডেটা থেকে অন্য কিছু ঢুকতে না পারে সেজন্য শুধু #hex ও var(--নাম) মানা হয়, নইলে ডিফল্ট রঙ */
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|var\(--[a-zA-Z0-9-]+\))$/;
function safeCssColor(c, fallback){
  return (typeof c === 'string' && SAFE_COLOR_RE.test(c.trim())) ? c.trim() : (fallback || 'var(--ledger-green)');
}

let scrollLockCount = 0, scrollLockY = 0;
function lockBodyScroll(){
  if(scrollLockCount === 0){
    scrollLockY = window.scrollY || window.pageYOffset || 0;
    document.body.style.position = 'fixed';
    document.body.style.top = (-scrollLockY) + 'px';
    document.body.style.left = '0'; document.body.style.right = '0'; document.body.style.width = '100%';
  }
  scrollLockCount++;
}
function unlockBodyScroll(){
  if(scrollLockCount === 0) return;
  scrollLockCount = Math.max(0, scrollLockCount - 1);
  if(scrollLockCount === 0){
    document.body.style.position = ''; document.body.style.top = '';
    document.body.style.left = ''; document.body.style.right = ''; document.body.style.width = '';
    window.scrollTo(0, scrollLockY);
  }
}

const confirmModalEl = document.getElementById('confirmModal');
let pendingConfirmAction = null;
let pendingConfirmCancel = null;
function confirmRow(label, value){ return '<div class="confirm-row"><span>'+label+'</span><span>'+value+'</span></div>'; }
function openConfirm(titleKey, rowsHtml, action, cancelAction){
  document.getElementById('confirmTitle').textContent = L(titleKey);
  document.getElementById('confirmDetails').innerHTML = rowsHtml;
  pendingConfirmAction = action;
  pendingConfirmCancel = cancelAction || null;
  confirmModalEl.classList.add('open');
  lockBodyScroll();
}
function openSimpleConfirm(message, onYes, onNo){
  document.getElementById('confirmTitle').textContent = L('confirmTitle');
  document.getElementById('confirmDetails').innerHTML = '<div class="confirm-msg">'+escapeHtml(message)+'</div>';
  pendingConfirmAction = onYes;
  pendingConfirmCancel = onNo || null;
  confirmModalEl.classList.add('open');
  lockBodyScroll();
}
function closeConfirm(runCancel){
  confirmModalEl.classList.remove('open');
  const cancelFn = pendingConfirmCancel;
  pendingConfirmAction = null; pendingConfirmCancel = null;
  unlockBodyScroll();
  if(runCancel && cancelFn) cancelFn();
}
document.getElementById('confirmCloseBtn').addEventListener('click', ()=>closeConfirm(true));
document.getElementById('confirmNoBtn').addEventListener('click', ()=>closeConfirm(true));
document.getElementById('confirmYesBtn').addEventListener('click', ()=>{
  const action = pendingConfirmAction;
  closeConfirm(false);
  if(action) action();
});
confirmModalEl.addEventListener('click', (e)=>{ if(e.target === confirmModalEl) closeConfirm(true); });

const alertModalEl = document.getElementById('alertModal');
function openAlert(msg){
  document.getElementById('alertMsg').textContent = msg;
  alertModalEl.classList.add('open');
  lockBodyScroll();
}
function closeAlert(){ alertModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('alertCloseBtn').addEventListener('click', closeAlert);
document.getElementById('alertOkBtn').addEventListener('click', closeAlert);
alertModalEl.addEventListener('click', (e)=>{ if(e.target === alertModalEl) closeAlert(); });

document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  document.querySelectorAll('.modal-overlay.open').forEach(m=>{
    const cancelBtn = m.querySelector('#confirmNoBtn, #confirmCloseBtn, #alertOkBtn, #alertCloseBtn, #settingsCloseBtn, #editCancelBtn, #editCloseBtn, [id$="CancelBtn"], [id$="CloseBtn"]');
    if(cancelBtn){ cancelBtn.click(); return; }
    m.classList.remove('open');
  });
  if(scrollLockCount > 0 && !document.querySelector('.modal-overlay.open')){
    while(scrollLockCount > 0) unlockBodyScroll();
  }
});

const settingsModalEl = document.getElementById('settingsModal');
function openSettings(){
  settingsModalEl.classList.add('open');
  lockBodyScroll();
  document.getElementById('advancedModeToggle').checked = !!settings.advancedMode;
  document.getElementById('needPctInput').value = settings.needPct;
  document.getElementById('wantPctInput').value = settings.wantPct;
  updatePctHint();
  updateAdvancedModeStatus();
  renderBackupStatus();
  renderStoragePersistStatus();
  renderRecurringTplList();
  renderAccountsList();
  applyDarkMode();
}
function closeSettings(){ settingsModalEl.classList.remove('open'); unlockBodyScroll(); }

document.getElementById('gearBtn').addEventListener('click', openSettings);
document.getElementById('settingsCloseBtn').addEventListener('click', closeSettings);
settingsModalEl.addEventListener('click', (e)=>{ if(e.target === settingsModalEl) closeSettings(); });
document.querySelectorAll('.langBtn').forEach(b=>{
  b.addEventListener('click', ()=>{
    lang = b.dataset.lang;
    safeSet('hisab_lang', lang);
    applyLanguage();
  });
});

/* Dark mode buttons */
document.querySelectorAll('.darkModeBtn').forEach(b=>{
  b.addEventListener('click', ()=>{
    settings.darkMode = b.dataset.mode;
    saveSettings();
    applyDarkMode();
  });
});

document.getElementById('advancedModeToggle').addEventListener('change', (e)=>{
  const checkbox = e.target;
  if(checkbox.checked){
    openSimpleConfirm(L('advancedModeOnConfirm'), ()=>{
      settings.advancedMode = true;
      saveSettings(); updateAdvancedModeStatus(); renderAll();
      toast(L('advancedModeOnToast'));
    }, ()=>{ checkbox.checked = false; });
  } else {
    settings.advancedMode = false;
    saveSettings(); updateAdvancedModeStatus(); renderAll();
    toast(L('advancedModeOffToast'));
  }
});

/* ============================================================
   Reset-all password flow
   ============================================================ */
// নোট (T8): এই পাসওয়ার্ড base64-এ সোর্সে দেখা যায় — এটা নিরাপত্তা নয়, শুধু ভুল-ট্যাপে ফ্যাক্টরি রিসেট ঠেকানোর জন্য। ইচ্ছাকৃতভাবে বদলানো হয়নি।
const RESET_ALL_PASS_B64 = 'SFJJRE9Z';
const resetAllConfirmModalEl = document.getElementById('resetAllConfirmModal');
function openResetAllConfirmModal(){
  document.getElementById('resetAllConfirmInput').value = '';
  resetAllConfirmModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=> document.getElementById('resetAllConfirmInput').focus(), 50);
}
function closeResetAllConfirmModal(){
  resetAllConfirmModalEl.classList.remove('open');
  unlockBodyScroll();
}
document.getElementById('resetAllConfirmCloseBtn').addEventListener('click', closeResetAllConfirmModal);
document.getElementById('resetAllConfirmCancelBtn').addEventListener('click', closeResetAllConfirmModal);
resetAllConfirmModalEl.addEventListener('click', (e)=>{ if(e.target === resetAllConfirmModalEl) closeResetAllConfirmModal(); });
document.getElementById('resetAllConfirmInput').addEventListener('keypress', (e)=>{ if(e.key==='Enter') document.getElementById('resetAllConfirmOkBtn').click(); });
document.getElementById('resetAllConfirmOkBtn').addEventListener('click', ()=>{
  const pass = document.getElementById('resetAllConfirmInput').value;
  closeResetAllConfirmModal();
  if(pass !== atob(RESET_ALL_PASS_B64)){ toast(L('resetAllWrongPasswordToast')); return; }
  openSimpleConfirm(L('resetAllConfirmMsg'), ()=>{
    try{
      ['hisab_entries','hisab_notes','hisab_plans','hisab_loans','hisab_dues','hisab_settings',
       'hisab_recurring','hisab_lang','hisab_last_backup','hisab_backup_banner_dismissed']
        .forEach(k=> localStorage.removeItem(k));
      // T2: নষ্ট ডেটার আলাদা কপিগুলোও সাফ (নইলে রিসেটের পরও জায়গা আটকে থাকত)
      const corruptCopies = [];
      for(let i=0; i<localStorage.length; i++){ const k = localStorage.key(i); if(k && k.indexOf(CORRUPT_PREFIX) === 0) corruptCopies.push(k); }
      corruptCopies.forEach(k=> localStorage.removeItem(k));
    }catch(err){}
    toast(L('resetAllDoneToast'));
    setTimeout(()=>{ location.reload(); }, 500);
  });
});
document.getElementById('resetAllBtn').addEventListener('click', openResetAllConfirmModal);


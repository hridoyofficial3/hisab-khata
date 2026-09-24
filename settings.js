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
  if(typeof a11yLabelControls === 'function') a11yLabelControls();
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
  if(el.textContent === msg){ el.textContent = ''; setTimeout(()=>{ el.textContent = msg; }, 50); }
  else el.textContent = msg;
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

/* A2 — মডাল অ্যাক্সেসিবিলিটি: role="dialog"/aria-modal (একবার, JS দিয়ে — HTML/i18n ছোঁয়া হয়নি),
   ফোকাস ভেতরে আটকানো (Tab/Shift+Tab লুপ) ও বন্ধ হলে যেখানে ফোকাস ছিল সেখানে ফেরা। Escape আগে থেকেই
   কাজ করে (উপরের হ্যান্ডলার)। MutationObserver দিয়ে প্রতিটা .modal-overlay-এর .open ক্লাস পর্যবেক্ষণ
   করা হয় — বিদ্যমান কোনো openXxx()/closeXxx() ফাংশন ছোঁয়া লাগেনি, ভবিষ্যতে নতুন মডাল এলেও আপনা-আপনি
   কাজ করবে (A1-এর কমন-হেল্পার নীতি অনুসরণ করে)। নেস্টেড মডাল (যেমন সেটিংসের ভেতর থেকে confirm) সমর্থিত:
   ভেতরের মডাল বন্ধ হলে বাইরেরটা খোলা থাকলে ফোকাস তখনই ফেরানো হয় না। */
function _a11yFocusableIn(container){
  return Array.from(container.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )).filter(el => el.offsetParent !== null);
}
function _a11ySetupModal(overlay){
  const card = overlay.querySelector('.modal-card');
  if(!card) return;
  card.setAttribute('role', 'dialog');
  card.setAttribute('aria-modal', 'true');
  if(!card.hasAttribute('tabindex')) card.setAttribute('tabindex', '-1');
  const titleEl = card.querySelector('.modal-header h3');
  if(titleEl){
    if(!titleEl.id) titleEl.id = overlay.id + 'A11yTitle';
    card.setAttribute('aria-labelledby', titleEl.id);
  }
}
function _a11yTopModalCard(){
  const open = document.querySelectorAll('.modal-overlay.open');
  if(open.length === 0) return null;
  const overlay = open[open.length - 1];
  return overlay.querySelector('.modal-card') || overlay;
}
let _a11yTrapHandler = null;
function _a11yInstallTrap(){
  if(_a11yTrapHandler) return;
  _a11yTrapHandler = function(e){
    if(e.key !== 'Tab') return;
    const card = _a11yTopModalCard();
    if(!card) return;
    const f = _a11yFocusableIn(card);
    if(f.length === 0){ e.preventDefault(); card.focus(); return; }
    const first = f[0], last = f[f.length - 1];
    if(!card.contains(document.activeElement)){ e.preventDefault(); first.focus(); return; }
    if(e.shiftKey && document.activeElement === first){ e.preventDefault(); last.focus(); }
    else if(!e.shiftKey && document.activeElement === last){ e.preventDefault(); first.focus(); }
  };
  document.addEventListener('keydown', _a11yTrapHandler);
}
function _a11yRemoveTrap(){
  if(_a11yTrapHandler){ document.removeEventListener('keydown', _a11yTrapHandler); _a11yTrapHandler = null; }
}
const _a11yReturnFocusMap = new Map();
function _a11yOnModalOpened(overlay){
  _a11yReturnFocusMap.set(overlay, document.activeElement);
  _a11yInstallTrap();
  setTimeout(()=>{
    const card = overlay.querySelector('.modal-card') || overlay;
    if(!card.contains(document.activeElement)){
      const f = _a11yFocusableIn(card);
      (f[0] || card).focus();
    }
  }, 0);
}
function _a11yOnModalClosed(overlay){
  const el = _a11yReturnFocusMap.get(overlay);
  _a11yReturnFocusMap.delete(overlay);
  if(document.querySelectorAll('.modal-overlay.open').length === 0) _a11yRemoveTrap();
  if(el && document.body.contains(el) && typeof el.focus === 'function') el.focus();
}
document.querySelectorAll('.modal-overlay').forEach(overlay=>{
  _a11ySetupModal(overlay);
  let wasOpen = overlay.classList.contains('open');
  new MutationObserver(()=>{
    const isOpen = overlay.classList.contains('open');
    if(isOpen && !wasOpen) _a11yOnModalOpened(overlay);
    else if(!isOpen && wasOpen) _a11yOnModalClosed(overlay);
    wasOpen = isOpen;
  }).observe(overlay, { attributes: true, attributeFilter: ['class'] });
});

/* ============================================================
   A3: accessible names — icon buttons, form fields, toast
   কমন হেল্পার (A1/A2-এর নীতি): HTML-এর প্রতিটা এলিমেন্ট আলাদা করে বদলানো লাগে না।
   - id/ক্লাস-ভিত্তিক i18n aria-label (ভাষা বদলালে applyLanguage থেকে আবার বসে)
   - <label> ভাইবোন/সুইচের পাশের লেখা → aria-labelledby (লেখা বদলালে নিজে থেকে মেলে)
   - না পেলে placeholder, তারপর মডালের টাইটেল
   - ডাইনামিক কার্ডের ×/✎ বাটন MutationObserver দিয়ে ধরা হয় (childList; শুধু অ্যাট্রিবিউট বসায়, তাই লুপ নেই)
   ============================================================ */
const _A11Y_ID_KEY = {
  gearBtn:'settingsTitle', fabAddEntry:'addEntryBtn', backupReminderCloseBtn:'a11yClose',
  prevDay:'a11yPrevDay', nextDay:'a11yNextDay', prevWeek:'a11yPrevWeek', nextWeek:'a11yNextWeek',
  prevMonth:'a11yPrevMonth', nextMonth:'a11yNextMonth', prevYear:'a11yPrevYear', nextYear:'a11yNextYear',
  entryFilterAccount:'a11yFilterAccount', allEntriesFilterAccount:'a11yFilterAccount',
  entryFilterType:'a11yFilterType', allEntriesFilterType:'a11yFilterType',
  backupPasswordInput:'a11yPassword', backupPasswordConfirmInput:'a11yPasswordConfirm'
};
function _a11yText(el){ return (el && el.textContent || '').replace(/\s+/g,' ').trim(); }
function _a11yEnsureId(el, base){ if(!el.id) el.id = base; return el.id; }
function _a11yHasName(el){
  if((el.getAttribute('aria-label') || '').trim()) return true;
  const lb = el.getAttribute('aria-labelledby');
  if(lb && lb.split(/\s+/).some(id => _a11yText(document.getElementById(id)))) return true;
  if(el.labels && Array.from(el.labels).some(l => _a11yText(l))) return true;
  return false;
}
function _a11yFindLabelEl(el){
  // সুইচ: <span>লেখা</span><label class="switch"><input></label>
  const sw = el.closest('label.switch');
  if(sw){
    const prev = sw.previousElementSibling;
    if(prev && _a11yText(prev)) return prev;
    return null;
  }
  const parent = el.parentElement;
  if(!parent) return null;
  // <div><label>লেখা</label><input></div> এবং <label>লেখা</label><select> (ভাইবোন)
  for(let n = el.previousElementSibling; n; n = n.previousElementSibling){
    if(n.tagName === 'LABEL' && _a11yText(n)) return n;
  }
  const own = parent.querySelector(':scope > label');
  if(own && own !== el && !own.contains(el) && _a11yText(own)) return own;
  return null;
}
function _a11yLabelOne(el){
  const idKey = _A11Y_ID_KEY[el.id];
  if(idKey){ el.setAttribute('aria-label', L(idKey)); return; }
  if(el.tagName === 'BUTTON' || el.getAttribute('role') === 'button'){
    if(el.classList.contains('modal-close')){ el.setAttribute('aria-label', L('a11yClose')); return; }
    if(el.classList.contains('pdel') || el.classList.contains('del')){ el.setAttribute('aria-label', L('a11yDelete')); return; }
    if(el.classList.contains('edit-icon')){ el.setAttribute('aria-label', L('a11yEdit')); el.title = L('a11yEdit'); return; }
    return;
  }
  if(!/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
  if(el.dataset.a11yPh){ el.setAttribute('aria-label', el.placeholder || ''); return; }
  if(_a11yHasName(el)) return;
  const labelEl = _a11yFindLabelEl(el);
  if(labelEl){ el.setAttribute('aria-labelledby', _a11yEnsureId(labelEl, (el.id || 'f') + 'A11yLbl')); return; }
  if(el.type === 'checkbox'){
    const nx = el.nextElementSibling;   // নোটের চেকবক্স: পাশের .txt-ই নাম
    if(nx && _a11yText(nx)){ el.setAttribute('aria-labelledby', _a11yEnsureId(nx, (el.id || 'cb') + 'A11yTxt' + Math.random().toString(36).slice(2,7))); return; }
  }
  if(el.placeholder && el.placeholder.trim()){ el.dataset.a11yPh = '1'; el.setAttribute('aria-label', el.placeholder); return; }
  const card = el.closest('.modal-card');
  const lb = card && card.getAttribute('aria-labelledby');
  if(lb) el.setAttribute('aria-labelledby', lb);
}
function a11yLabelControls(){
  document.querySelectorAll('button, [role="button"], input:not([type="hidden"]):not([type="file"]), select, textarea')
    .forEach(_a11yLabelOne);
}
let _a11yRaf = 0;
function _a11yScheduleLabel(){
  if(_a11yRaf) return;
  _a11yRaf = requestAnimationFrame(()=>{ _a11yRaf = 0; a11yLabelControls(); });
}
new MutationObserver(_a11yScheduleLabel).observe(document.body, { childList: true, subtree: true });
a11yLabelControls();

const settingsModalEl = document.getElementById('settingsModal');
function openSettings(){
  settingsModalEl.classList.add('open');
  lockBodyScroll();
  document.getElementById('advancedModeToggle').checked = !!settings.advancedMode;
  document.getElementById('needPctInput').value = settings.needPct;
  document.getElementById('wantPctInput').value = settings.wantPct;
  updatePctHint();
  updateAdvancedModeStatus();
  renderDueReminderSettings();
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

document.getElementById('dueReminderToggle').addEventListener('change', (e)=>{
  settings.dueReminderOn = !!e.target.checked;
  saveSettings(); renderAll();
});
document.getElementById('dueNotifyToggle').addEventListener('change', (e)=>{ onDueNotifyToggle(!!e.target.checked); });
document.querySelectorAll('#dueReminderDaysSeg button').forEach(b=>{
  b.addEventListener('click', ()=>{
    if(b.disabled) return;
    settings.dueReminderDays = Number(b.dataset.days);
    saveSettings(); renderAll();
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
       'hisab_recurring','hisab_lang','hisab_last_backup','hisab_backup_banner_dismissed',
       'hisab_lock_enabled','hisab_lock_pw_hash','hisab_lock_pw_salt','hisab_lock_sq',
       'hisab_lock_sq_hash','hisab_lock_sq_salt','hisab_lock_webauthn_id','hisab_lock_last_activity',
       'hisab_lock_attempts','hisab_lock_cooldown_until','hisab_lock_forgot_attempts','hisab_lock_forgot_cooldown_until']
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


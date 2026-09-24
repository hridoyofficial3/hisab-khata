/* ============================================================
   Backup / encryption
   ============================================================ */
function cryptoAvailable(){ return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues); }
function bufToBase64(buf){
  let binary = '';
  const bytes = new Uint8Array(buf);
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function base64ToBuf(b64){
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
async function deriveAesKey(password, saltBytes){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name:'PBKDF2', salt:saltBytes, iterations:150000, hash:'SHA-256' },
    baseKey, { name:'AES-GCM', length:256 }, false, ['encrypt','decrypt']
  );
}
async function encryptBackupPayload(dataObj, password){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveAesKey(password, salt);
  const enc = new TextEncoder();
  const cipherBuf = await crypto.subtle.encrypt({ name:'AES-GCM', iv }, key, enc.encode(JSON.stringify(dataObj)));
  return { app:'hisab-khata-backup', version:2, encrypted:true, kdf:'PBKDF2-SHA256', iterations:150000,
    exportedAt: new Date().toISOString(), salt: bufToBase64(salt), iv: bufToBase64(iv), ciphertext: bufToBase64(cipherBuf) };
}
async function decryptBackupPayload(payload, password){
  const salt = new Uint8Array(base64ToBuf(payload.salt));
  const iv = new Uint8Array(base64ToBuf(payload.iv));
  const key = await deriveAesKey(password, salt);
  const plainBuf = await crypto.subtle.decrypt({ name:'AES-GCM', iv }, key, base64ToBuf(payload.ciphertext));
  return JSON.parse(new TextDecoder().decode(plainBuf));
}
// এনক্রিপ্ট করার পর মেমরিতে আবার ডিক্রিপ্ট করে মূল ডেটার সাথে মিলিয়ে দেখে; না মিললে throw (তখন ডাউনলোড হয় না)
async function encryptAndVerifyBackup(dataObj, password){
  const payload = await encryptBackupPayload(dataObj, password);
  const roundTrip = await decryptBackupPayload(payload, password);
  if(JSON.stringify(roundTrip) !== JSON.stringify(dataObj)) throw new Error('backup verify failed');
  return payload;
}

const backupPwModalEl = document.getElementById('backupPasswordModal');
let backupPwMode = null;
let backupPwOnSubmit = null;
const BACKUP_PW_MIN_LEN = 4;
function openBackupPasswordModal(mode, onSubmit){
  backupPwMode = mode;
  backupPwOnSubmit = onSubmit;
  const pwInput = document.getElementById('backupPasswordInput');
  const pwConfirmInput = document.getElementById('backupPasswordConfirmInput');
  pwInput.value = '';
  pwConfirmInput.value = '';
  const errEl = document.getElementById('backupPasswordError');
  errEl.style.display = 'none'; errEl.textContent = '';
  const exportActions = document.getElementById('backupPasswordActionsExport');
  const importActions = document.getElementById('backupPasswordActionsImport');
  if(mode === 'export'){
    document.getElementById('backupPasswordTitle').textContent = L('backupPwExportTitle');
    document.getElementById('backupPasswordDesc').textContent = L('backupPwExportDesc');
    exportActions.style.display = 'flex'; importActions.style.display = 'none';
    pwInput.placeholder = L('backupPwPlaceholder');
    pwConfirmInput.placeholder = L('backupPwConfirmPlaceholder');
    pwConfirmInput.style.display = 'block';
  } else {
    document.getElementById('backupPasswordTitle').textContent = L('backupPwImportTitle');
    document.getElementById('backupPasswordDesc').textContent = L('backupPwImportDesc');
    exportActions.style.display = 'none'; importActions.style.display = 'flex';
    pwInput.placeholder = L('backupPwPlaceholderImport');
    pwConfirmInput.style.display = 'none';
  }
  backupPwModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=>{ document.getElementById('backupPasswordInput').focus(); }, 50);
}
function closeBackupPasswordModal(){
  backupPwModalEl.classList.remove('open');
  unlockBodyScroll();
  backupPwMode = null; backupPwOnSubmit = null;
}
function showBackupPwError(msg){
  const errEl = document.getElementById('backupPasswordError');
  errEl.textContent = msg; errEl.style.display = 'block';
}
document.getElementById('backupPasswordCloseBtn').addEventListener('click', closeBackupPasswordModal);
document.getElementById('backupPasswordImportCancelBtn').addEventListener('click', closeBackupPasswordModal);
backupPwModalEl.addEventListener('click', (e)=>{ if(e.target === backupPwModalEl) closeBackupPasswordModal(); });
document.getElementById('backupPasswordSkipBtn').addEventListener('click', async ()=>{
  const fn = backupPwOnSubmit;
  closeBackupPasswordModal();
  if(fn) await fn(null);
});
document.getElementById('backupPasswordExportBtn').addEventListener('click', async ()=>{
  const pw = document.getElementById('backupPasswordInput').value;
  const pw2 = document.getElementById('backupPasswordConfirmInput').value;
  if(!pw){ showBackupPwError(L('backupPwEmptyError')); return; }
  if(Array.from(pw).length < BACKUP_PW_MIN_LEN){ showBackupPwError(L('backupPwTooShortError')); return; }
  if(pw !== pw2){ showBackupPwError(L('backupPwMismatchError')); return; }
  const fn = backupPwOnSubmit;
  closeBackupPasswordModal();
  if(fn) await fn(pw);
});
document.getElementById('backupPasswordImportBtn').addEventListener('click', async ()=>{
  const pw = document.getElementById('backupPasswordInput').value;
  if(!pw){ showBackupPwError(L('backupPwEmptyError')); return; }
  const ok = await backupPwOnSubmit(pw);
  if(ok) closeBackupPasswordModal();
  else showBackupPwError(L('backupPwWrongPassword'));
});

function collectBackupData(){
  return { app:'hisab-khata-backup', version:1, exportedAt:new Date().toISOString(),
    entries, notes, plans, loans, dues, settings, lang, recurringTemplates };
}
function downloadBackupBlob(dataStr, filename){
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || ('hisab-backup-' + todayStr() + '.json');
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(()=>{ URL.revokeObjectURL(url); }, 1000);
}
document.getElementById('exportDataBtn').addEventListener('click', ()=>{
  if(!cryptoAvailable()){
    try{ downloadBackupBlob(JSON.stringify(collectBackupData(), null, 2)); markBackupDone(); toast(L('backupExportedToast')); }
    catch(err){ toast(L('backupExportFailedToast')); }
    return;
  }
  openBackupPasswordModal('export', async (password)=>{
    try{
      if(password){
        const payload = await encryptAndVerifyBackup(collectBackupData(), password);
        downloadBackupBlob(JSON.stringify(payload, null, 2));
        toast(L('backupEncryptedExportedToast'));
      } else {
        downloadBackupBlob(JSON.stringify(collectBackupData(), null, 2));
        toast(L('backupExportedToast'));
      }
      markBackupDone();
    }catch(err){ toast(L('backupExportFailedToast')); }
  });
});
function isFiniteNum(v){ return typeof v === 'number' && isFinite(v); }
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const YM_PERIOD_RE = /^\d{4}-\d{2}$/;
function isISODateStr(s){ return typeof s === 'string' && ISO_DATE_RE.test(s); }
/* T8 — ইম্পোর্ট ভ্যালিডেশন কড়া। পুরনো (v1/v2) ব্যাকআপও খোলে:
   transfer/budgetType/note/price/done/priority/date ইত্যাদি ঐচ্ছিক ফিল্ড
   না থাকলে বাদ পড়ে না, শুধু থাকলে সঠিক টাইপ হতে হবে। */
function isValidImportEntry(e){
  if(!e || typeof e !== 'object') return false;
  if(!isFiniteNum(e.id)) return false;
  if(!isISODateStr(e.date)) return false;
  if(!isFiniteNum(e.amount)) return false;
  if(e.type !== 'income' && e.type !== 'expense') return false;
  if(typeof e.account !== 'string' || !e.account.trim()) return false;
  if(e.note !== undefined && e.note !== null && typeof e.note !== 'string') return false;
  if(e.transfer !== undefined && typeof e.transfer !== 'boolean') return false;
  if(e.budgetType !== undefined && e.budgetType !== null && e.budgetType !== 'need' && e.budgetType !== 'want') return false;
  return true;
}
function isValidImportNote(n){
  if(!n || typeof n !== 'object') return false;
  if(!isFiniteNum(n.id)) return false;
  if(typeof n.text !== 'string' || !n.text.trim()) return false;
  if(n.price !== undefined && n.price !== null && !isFiniteNum(n.price)) return false;
  if(n.done !== undefined && typeof n.done !== 'boolean') return false;
  return true;
}
function isValidImportPlan(p){
  if(!p || typeof p !== 'object') return false;
  if(!isFiniteNum(p.id)) return false;
  if(typeof p.item !== 'string' || !p.item.trim()) return false;
  if(!isFiniteNum(p.amount)) return false;
  if(p.date !== undefined && p.date !== null && p.date !== '' && !isISODateStr(p.date)) return false;
  if(p.priority !== undefined && p.priority !== null){
    if(!Number.isInteger(p.priority) || p.priority < 1 || p.priority > 3) return false;
  }
  if(p.account !== undefined && p.account !== null && typeof p.account !== 'string') return false;
  return true;
}
function isValidImportLoan(l){
  if(!l || typeof l !== 'object') return false;
  if(!isFiniteNum(l.id)) return false;
  if(l.type !== 'taken' && l.type !== 'given' && l.type !== 'self') return false;
  if(typeof l.person !== 'string') return false;
  if(l.type !== 'self' && !l.person.trim()) return false;
  if(!isFiniteNum(l.amount)) return false;
  if(!isISODateStr(l.date)) return false;
  return true;
}
function isValidImportDue(d){
  if(!d || typeof d !== 'object') return false;
  if(!isFiniteNum(d.id)) return false;
  if(typeof d.person !== 'string' || !d.person.trim()) return false;
  if(!isFiniteNum(d.amount)) return false;
  if(d.type !== 'receivable' && d.type !== 'payable') return false;
  if(!isISODateStr(d.date)) return false;
  return true;
}
function isValidImportRecurring(r){
  if(!r || typeof r !== 'object') return false;
  if(!isFiniteNum(r.id)) return false;
  if(typeof r.note !== 'string' || !r.note.trim()) return false;
  if(!isFiniteNum(r.amount)) return false;
  if(r.type !== 'income' && r.type !== 'expense' && r.type !== 'transfer') return false;
  if(r.interval !== 'monthly' && r.interval !== 'yearly') return false;
  if(typeof r.createdPeriod !== 'string' || !YM_PERIOD_RE.test(r.createdPeriod)) return false;
  // T11: history ঐচ্ছিক — পুরনো ব্যাকআপে (history-চালু হওয়ার আগে তৈরি) এই ফিল্ড না-ও থাকতে পারে;
  // না থাকলেও বাতিল না করে গ্রহণ করা হয়, applyImportedBackup-এর মাইগ্রেশন ধাপ পরে খালি {} বসায়
  if(r.history !== undefined && (typeof r.history !== 'object' || r.history === null || Array.isArray(r.history))) return false;
  return true;
}

/* T8 — তালিকা থেকে বৈধ আইটেম বেছে নেয় ও কতগুলো বাদ গেল গোনে (অ্যারে না হলে/না থাকলে: ফাঁকা তালিকা, বাদ ০ — পুরনো ব্যাকআপে notes/plans ইত্যাদি না-ও থাকতে পারে) */
function filterAndCount(arr, validator){
  if(!Array.isArray(arr)) return { list: [], skipped: 0 };
  const list = arr.filter(validator);
  return { list: list, skipped: arr.length - list.length };
}

const DEFAULT_ACCOUNTS = [
  { id:'cash',    name:'accCash',    icon:'💵', color:'var(--ledger-green)', isSystem:true, i18n:true },
  { id:'bank',    name:'accBank',    icon:'🏦', color:'var(--blue)',         isSystem:true, i18n:true },
  { id:'bkash',   name:'accBkash',   icon:'__bkash', color:'#E2136E',        isSystem:true, i18n:true },
  { id:'savings', name:'accSavings', icon:'🐷', color:'var(--gold)',         isSystem:true, i18n:true }
];
function isValidImportAccount(a){
  return a && typeof a === 'object' && typeof a.id === 'string' && a.id.trim().length > 0 && typeof a.name === 'string' && a.name.trim().length > 0;
}
function normalizeAccount(a){
  const sysIds = ['cash','bank','bkash','savings'];
  const isSystem = sysIds.includes(a.id) ? true : !!a.isSystem;
  const out = { id:a.id, name:a.name, icon: typeof a.icon==='string'&&a.icon ? a.icon : '💰',
    color: safeCssColor(a.color),   // T8: শুধু #hex / var(--x)
    isSystem: isSystem,
    // T8: i18n নাম শুধু সিস্টেম অ্যাকাউন্টের; কাস্টম অ্যাকাউন্টের নাম কখনো অনুবাদ-কী নয় (নইলে L(name) কাঁচা স্ট্রিং ফেরত দিত)
    i18n: sysIds.includes(a.id) ? (typeof a.i18n==='boolean' ? a.i18n : true) : false };
  // ঐচ্ছিক archived:true — শুধু true হলেই ফিল্ড থাকে (পুরনো ব্যাকআপের আকার অপরিবর্তিত); সিস্টেম অ্যাকাউন্ট কখনো আর্কাইভ নয়
  if(a.archived === true && !isSystem) out.archived = true;
  return out;
}
function migrateAccountsArray(rawAccounts, entriesList, loansList, duesList, plansList, recurringList){
  let customAccounts = [];
  if(Array.isArray(rawAccounts)){
    customAccounts = rawAccounts.filter(isValidImportAccount).map(normalizeAccount)
      .filter(a => !DEFAULT_ACCOUNTS.some(d => d.id === a.id));
  }
  const accounts = DEFAULT_ACCOUNTS.map(a => Object.assign({}, a));
  customAccounts.forEach(a => accounts.push(a));
  const existingIds = new Set(accounts.map(a=>a.id));

  const referenced = new Set();
  (entriesList||[]).forEach(e=>{ if(e && e.account) referenced.add(e.account); });
  (loansList||[]).forEach(l=>{ if(l && l.account) referenced.add(l.account); });
  (duesList||[]).forEach(d=>{ if(d && d.account) referenced.add(d.account); });
  // T11: প্ল্যানের account রেফারেন্সও ধরা দরকার (buy-plan/renderPlan এটা দিয়ে অ্যাকাউন্ট দেখায়)
  (plansList||[]).forEach(p=>{ if(p && p.account) referenced.add(p.account); });
  (recurringList||[]).forEach(r=>{ if(r && r.account) referenced.add(r.account); });
  referenced.forEach(id => { if(!existingIds.has(id)){ existingIds.add(id); accounts.push({ id:id, name:id, icon:'💰', color:'var(--ledger-green)', isSystem:false, i18n:false }); } });

  return accounts;
}

// ফাইল পার্স হওয়ার পর, কিছু বদলানোর আগেই: কোন কোন আইটেম বৈধ, কতগুলো বাদ পড়বে
function analyzeImport(parsed){
  const entriesRes = filterAndCount(parsed.entries, isValidImportEntry);
  const notesRes = filterAndCount(parsed.notes, isValidImportNote);
  const plansRes = filterAndCount(parsed.plans, isValidImportPlan);
  const loansRes = filterAndCount(parsed.loans, isValidImportLoan);
  const duesRes = filterAndCount(parsed.dues, isValidImportDue);
  const recurringRes = filterAndCount(parsed.recurringTemplates, isValidImportRecurring);
  const totalSkipped = entriesRes.skipped + notesRes.skipped + plansRes.skipped + loansRes.skipped + duesRes.skipped + recurringRes.skipped;
  return { entriesRes, notesRes, plansRes, loansRes, duesRes, recurringRes, totalSkipped };
}

// ইম্পোর্টের ধাপ: (১) কনফার্ম (বাদ পড়ার সংখ্যা + নিরাপত্তা-কপির কথা সহ) → (২) বর্তমান ডেটার নিরাপত্তা-কপি ডাউনলোড → (৩) ওভাররাইট
function startImportFlow(parsed){
  const info = analyzeImport(parsed);
  let msg = L('importDataWarn');
  if(info.totalSkipped > 0) msg += '\n' + tfmt('backupImportSkipConfirm', { n: numFmt(info.totalSkipped) });
  msg += '\n' + L('backupImportSafetyNote');
  openSimpleConfirm(msg, ()=>{ runImportWithSafetyCopy(parsed); });
}
function runImportWithSafetyCopy(parsed){
  try{
    // কালেক্ট হয় ওভাররাইটের আগের মেমরি-স্টেট থেকে (ইচ্ছাকৃতভাবে এনক্রিপ্ট করা নয়)
    downloadBackupBlob(JSON.stringify(collectBackupData(), null, 2), 'hisab-before-import-' + todayStr() + '.json');
  }catch(err){ toast(L('backupSafetyCopyFailedToast')); return; }
  // ডাউনলোড শুরু হওয়ার জন্য একটু সময় দিয়ে তারপর ওভাররাইট (নইলে রিলোডে ডাউনলোড কাটা পড়তে পারে)
  setTimeout(()=>{ applyImportedBackup(parsed); }, 500);
}

function applyImportedBackup(parsed){
  // T11: অ্যাটমিক ইম্পোর্ট — লেখার আগে সব কটা কী-র বর্তমান কাঁচা মান ব্যাকআপ রাখা হয়;
  // মাঝপথে কোনো একটা কী লেখা ফেল করলে (কোটা ফুল ইত্যাদি) সব কটাই আগের মানে ফিরিয়ে
  // দেওয়া হয় এবং মেমরি-স্টেট আবার সেই (পুরনো) localStorage থেকে লোড করা হয়,
  // যাতে কখনো "কিছু নতুন + কিছু পুরনো" মিশ্র অবস্থা তৈরি না হয়।
  const ATOMIC_KEYS = ['hisab_entries','hisab_notes','hisab_plans','hisab_loans','hisab_dues','hisab_settings','hisab_recurring','hisab_lang'];
  let prevRaw = null;
  try{
    prevRaw = {};
    ATOMIC_KEYS.forEach(k=>{ try{ prevRaw[k] = localStorage.getItem(k); }catch(e){ prevRaw[k] = null; } });
  }catch(e){ prevRaw = null; }
  function rollbackImport(){
    if(!prevRaw) return;
    ATOMIC_KEYS.forEach(k=>{
      try{
        const v = prevRaw[k];
        if(v === null || v === undefined) localStorage.removeItem(k);
        else localStorage.setItem(k, v);
      }catch(e){}
    });
    try{ loadData(); }catch(e){}
  }
  try{
    const analysis = analyzeImport(parsed);
    const { entriesRes, notesRes, plansRes, loansRes, duesRes, recurringRes } = analysis;
    entries = entriesRes.list; notes = notesRes.list; plans = plansRes.list;
    loans = loansRes.list; dues = duesRes.list; recurringTemplates = recurringRes.list;

    const defaultSettings = { savingsTarget:0, needPct:50, wantPct:30, advancedMode:false, pctHistory:{}, darkMode:'light', dueReminderOn:true, dueReminderDays:3, dueNotifyOn:false };
    const rawSettings = (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {};
    settings = Object.assign({}, defaultSettings, rawSettings);
    if(!isFiniteNum(settings.savingsTarget)) settings.savingsTarget = defaultSettings.savingsTarget;
    if(!isFiniteNum(settings.needPct)) settings.needPct = defaultSettings.needPct;
    if(!isFiniteNum(settings.wantPct)) settings.wantPct = defaultSettings.wantPct;
    if(typeof settings.advancedMode !== 'boolean') settings.advancedMode = defaultSettings.advancedMode;
    if(!settings.pctHistory || typeof settings.pctHistory !== 'object') settings.pctHistory = {};
    if(!['system','light','dark','black'].includes(settings.darkMode)) settings.darkMode = 'light';
    if(typeof settings.dueReminderOn !== 'boolean') settings.dueReminderOn = true;
    if(![1,3,7].includes(settings.dueReminderDays)) settings.dueReminderDays = 3;
    if(typeof settings.dueNotifyOn !== 'boolean') settings.dueNotifyOn = false;

    settings.accounts = migrateAccountsArray(rawSettings.accounts, entries, loans, dues, plans, recurringTemplates);

    // migration: recurring no account, no transfer
    recurringTemplates.forEach(t=>{
      if(t.type === 'transfer'){ t.type='expense'; t.budgetType = t.budgetType || 'need'; }
      delete t.account; delete t.toAccount;
      if(!t.history) t.history = {};
    });

    const saveOk = [saveEntries(), saveNotes(), savePlans(), saveLoans(), saveDues(), saveSettings(), saveRecurring()].every(Boolean);
    let langOk = true;
    if(parsed.lang === 'bn' || parsed.lang === 'en'){ langOk = safeSet('hisab_lang', parsed.lang); }
    if(!saveOk || !langOk){
      rollbackImport();
      toast(L('backupImportFailedToast'));
      return;
    }

    // সব কী সফলভাবে লেখা হয়েছে — এখন নষ্ট-কী সেভ-ব্লক তোলা যায় (নষ্ট কাঁচা কপি আলাদা কী-তে থেকে যায়)
    clearCorruptBlocks();

    const totalSkipped = analysis.totalSkipped;
    if(totalSkipped > 0){ toast(tfmt('backupImportedWithSkippedToast', { n: numFmt(totalSkipped) }), 4200); }
    else { toast(L('backupImportedToast')); }
    setTimeout(()=>{ location.reload(); }, totalSkipped > 0 ? 2200 : 600);
  }catch(err){
    rollbackImport();
    toast(L('backupImportFailedToast'));
  }
}

document.getElementById('importDataBtn').addEventListener('click', ()=>{ document.getElementById('importDataInput').click(); });
document.getElementById('importDataInput').addEventListener('change', (e)=>{
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if(!file) return;
  const reader = new FileReader();
  reader.onload = ()=>{
    let parsed;
    try{ parsed = JSON.parse(reader.result); }
    catch(err){ toast(L('backupInvalidFileToast')); return; }
    if(!parsed || typeof parsed !== 'object'){ toast(L('backupInvalidFileToast')); return; }
    if(parsed.encrypted === true){
      if(!cryptoAvailable()){ toast(L('backupInvalidFileToast')); return; }
      if(!parsed.salt || !parsed.iv || !parsed.ciphertext){ toast(L('backupInvalidFileToast')); return; }
      openBackupPasswordModal('import', async (password)=>{
        try{
          const decrypted = await decryptBackupPayload(parsed, password);
          if(!decrypted || typeof decrypted !== 'object' || !Array.isArray(decrypted.entries)){ toast(L('backupInvalidFileToast')); return true; }
          startImportFlow(decrypted);
          return true;
        }catch(err){ return false; }
      });
      return;
    }
    if(!Array.isArray(parsed.entries)){ toast(L('backupInvalidFileToast')); return; }
    startImportFlow(parsed);
  };
  reader.onerror = ()=>{ toast(L('backupInvalidFileToast')); };
  reader.readAsText(file);
});


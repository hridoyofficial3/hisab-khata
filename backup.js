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

const backupPwModalEl = document.getElementById('backupPasswordModal');
let backupPwMode = null;
let backupPwOnSubmit = null;
function openBackupPasswordModal(mode, onSubmit){
  backupPwMode = mode;
  backupPwOnSubmit = onSubmit;
  document.getElementById('backupPasswordInput').value = '';
  const errEl = document.getElementById('backupPasswordError');
  errEl.style.display = 'none'; errEl.textContent = '';
  const exportActions = document.getElementById('backupPasswordActionsExport');
  const importActions = document.getElementById('backupPasswordActionsImport');
  if(mode === 'export'){
    document.getElementById('backupPasswordTitle').textContent = L('backupPwExportTitle');
    document.getElementById('backupPasswordDesc').textContent = L('backupPwExportDesc');
    exportActions.style.display = 'flex'; importActions.style.display = 'none';
  } else {
    document.getElementById('backupPasswordTitle').textContent = L('backupPwImportTitle');
    document.getElementById('backupPasswordDesc').textContent = L('backupPwImportDesc');
    exportActions.style.display = 'none'; importActions.style.display = 'flex';
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
  if(!pw){ showBackupPwError(L('backupPwEmptyError')); return; }
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
function downloadBackupBlob(dataStr){
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'hisab-backup-' + todayStr() + '.json';
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
        const payload = await encryptBackupPayload(collectBackupData(), password);
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
function isValidImportEntry(e){ return e && typeof e==='object' && isFiniteNum(e.amount) && typeof e.date==='string' && e.date && (e.type==='income'||e.type==='expense'); }
function isValidImportNote(n){ return n && typeof n==='object' && typeof n.text==='string' && n.text.trim().length>0; }
function isValidImportPlan(p){ return p && typeof p==='object' && typeof p.item==='string' && p.item.trim().length>0 && isFiniteNum(p.amount); }
function isValidImportLoan(l){ return l && typeof l==='object' && typeof l.person==='string' && l.person.trim().length>0 && isFiniteNum(l.amount) && (l.type==='taken'||l.type==='given'||l.type==='self'); }
function isValidImportDue(d){ return d && typeof d==='object' && typeof d.person==='string' && d.person.trim().length>0 && isFiniteNum(d.amount) && (d.type==='receivable'||d.type==='payable'); }
function isValidImportRecurring(r){ return r && typeof r==='object' && typeof r.note==='string' && r.note.trim().length>0 && isFiniteNum(r.amount) && (r.type==='income'||r.type==='expense'||r.type==='transfer') && (r.interval==='monthly'||r.interval==='yearly') && typeof r.createdPeriod==='string' && r.history && typeof r.history==='object'; }
function filterAndCount(arr, validatorFn){
  if(!Array.isArray(arr)) return { list: [], skipped: 0 };
  const list = arr.filter(validatorFn);
  return { list, skipped: arr.length - list.length };
}

const DEFAULT_ACCOUNTS = [
  { id:'cash',    name:'accCash',    icon:'💵', color:'var(--ledger-green)', isSystem:true, i18n:true },
  { id:'bank',    name:'accBank',    icon:'🏦', color:'var(--blue)',         isSystem:true, i18n:true },
  { id:'bkash',   name:'accBkash',   icon:'📱', color:'var(--purple)',       isSystem:true, i18n:true },
  { id:'savings', name:'accSavings', icon:'🏆', color:'var(--gold)',         isSystem:true, i18n:true }
];
function isValidImportAccount(a){
  return a && typeof a === 'object' && typeof a.id === 'string' && a.id.trim().length > 0 && typeof a.name === 'string' && a.name.trim().length > 0;
}
function normalizeAccount(a){
  const sysIds = ['cash','bank','bkash','savings'];
  return { id:a.id, name:a.name, icon: typeof a.icon==='string'&&a.icon ? a.icon : '💰',
    color: typeof a.color==='string'&&a.color ? a.color : 'var(--ledger-green)',
    isSystem: sysIds.includes(a.id) ? true : !!a.isSystem,
    i18n: typeof a.i18n==='boolean' ? a.i18n : sysIds.includes(a.id) };
}
function migrateAccountsArray(rawAccounts, entriesList, loansList, duesList, recurringList){
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
  (recurringList||[]).forEach(r=>{ if(r && r.account) referenced.add(r.account); });
  referenced.forEach(id => { if(!existingIds.has(id)){ existingIds.add(id); accounts.push({ id:id, name:id, icon:'💰', color:'var(--ledger-green)', isSystem:false, i18n:false }); } });

  return accounts;
}

function applyImportedBackup(parsed){
  try{
    const entriesRes = filterAndCount(parsed.entries, isValidImportEntry);
    const notesRes = filterAndCount(parsed.notes, isValidImportNote);
    const plansRes = filterAndCount(parsed.plans, isValidImportPlan);
    const loansRes = filterAndCount(parsed.loans, isValidImportLoan);
    const duesRes = filterAndCount(parsed.dues, isValidImportDue);
    const recurringRes = filterAndCount(parsed.recurringTemplates, isValidImportRecurring);
    entries = entriesRes.list; notes = notesRes.list; plans = plansRes.list;
    loans = loansRes.list; dues = duesRes.list; recurringTemplates = recurringRes.list;

    const defaultSettings = { savingsTarget:0, needPct:50, wantPct:30, advancedMode:false, pctHistory:{}, darkMode:'system' };
    const rawSettings = (parsed.settings && typeof parsed.settings === 'object') ? parsed.settings : {};
    settings = Object.assign({}, defaultSettings, rawSettings);
    if(!isFiniteNum(settings.savingsTarget)) settings.savingsTarget = defaultSettings.savingsTarget;
    if(!isFiniteNum(settings.needPct)) settings.needPct = defaultSettings.needPct;
    if(!isFiniteNum(settings.wantPct)) settings.wantPct = defaultSettings.wantPct;
    if(typeof settings.advancedMode !== 'boolean') settings.advancedMode = defaultSettings.advancedMode;
    if(!settings.pctHistory || typeof settings.pctHistory !== 'object') settings.pctHistory = {};
    if(!['system','light','dark'].includes(settings.darkMode)) settings.darkMode = 'system';

    settings.accounts = migrateAccountsArray(rawSettings.accounts, entries, loans, dues, recurringTemplates);

    // migration: recurring no account, no transfer
    recurringTemplates.forEach(t=>{
      if(t.type === 'transfer'){ t.type='expense'; t.budgetType = t.budgetType || 'need'; }
      delete t.account; delete t.toAccount;
      if(!t.history) t.history = {};
    });

    saveEntries(); saveNotes(); savePlans(); saveLoans(); saveDues(); saveSettings(); saveRecurring();
    if(parsed.lang === 'bn' || parsed.lang === 'en'){ localStorage.setItem('hisab_lang', parsed.lang); }

    const totalSkipped = entriesRes.skipped + notesRes.skipped + plansRes.skipped + loansRes.skipped + duesRes.skipped + recurringRes.skipped;
    if(totalSkipped > 0){ toast(tfmt('backupImportedWithSkippedToast', { n: numFmt(totalSkipped) }), 4200); }
    else { toast(L('backupImportedToast')); }
    setTimeout(()=>{ location.reload(); }, totalSkipped > 0 ? 2200 : 600);
  }catch(err){ toast(L('backupImportFailedToast')); }
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
          openSimpleConfirm(L('importDataWarn'), ()=>{ applyImportedBackup(decrypted); });
          return true;
        }catch(err){ return false; }
      });
      return;
    }
    if(!Array.isArray(parsed.entries)){ toast(L('backupInvalidFileToast')); return; }
    openSimpleConfirm(L('importDataWarn'), ()=>{ applyImportedBackup(parsed); });
  };
  reader.onerror = ()=>{ toast(L('backupInvalidFileToast')); };
  reader.readAsText(file);
});


/* ============================================================
   App Lock (প্রাইভেসি ও সেফটি)
   - পুরো ফিচারটা এই একটা ফাইলে, বাকি অ্যাপের থেকে আলাদা।
   - পাসওয়ার্ড/সিকিউরিটি উত্তর কখনোই plain text এ সেভ হয় না —
     PBKDF2 (SHA-256, 150000 iterations) দিয়ে hash+salt আকারে থাকে।
   - localStorage key গুলো ইচ্ছা করেই hisab_settings/ব্যাকআপ এক্সপোর্ট
     থেকে আলাদা রাখা হয়েছে, যাতে এনক্রিপ্ট না করা ব্যাকআপ ফাইলে
     পাসওয়ার্ড hash ভুলে চলে না যায়, আর অন্য ডিভাইসে ব্যাকআপ
     রিস্টোর করলে এই ডিভাইসের লক/ফিঙ্গারপ্রিন্ট সেটআপ না ভাঙে।
   - এটা শুধু একটা UI পর্দা — localStorage এ থাকা আসল ডেটা এনক্রিপ্ট
     হয় না (সেটা আলাদা, অনেক বড় কাজ)। কেউ ব্রাউজার dev tools দিয়ে
     ঘাঁটলে ডেটা দেখতে পারবে, কিন্তু সাধারণভাবে ফোন হাতে নিলে আটকাবে।
   ============================================================ */

const LK_ENABLED   = 'hisab_lock_enabled';
const LK_PW_HASH   = 'hisab_lock_pw_hash';
const LK_PW_SALT   = 'hisab_lock_pw_salt';
const LK_SQ        = 'hisab_lock_sq';
const LK_SQ_HASH   = 'hisab_lock_sq_hash';
const LK_SQ_SALT   = 'hisab_lock_sq_salt';
const LK_WEBAUTHN  = 'hisab_lock_webauthn_id';
const LK_ACTIVITY  = 'hisab_lock_last_activity';
const LK_ATTEMPTS  = 'hisab_lock_attempts';
const LK_COOLDOWN  = 'hisab_lock_cooldown_until';
const LK_F_ATTEMPTS = 'hisab_lock_forgot_attempts';
const LK_F_COOLDOWN = 'hisab_lock_forgot_cooldown_until';
const IDLE_LIMIT_MS = 60 * 60 * 1000; /* ১ ঘণ্টা */

/* ---------- ছোট ইউটিলিটি: hashing/base64 ---------- */
function lkBufToB64(buf){
  let binary = '';
  const bytes = new Uint8Array(buf);
  for(let i=0;i<bytes.length;i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}
function lkB64ToBuf(b64){
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for(let i=0;i<binary.length;i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}
function lkCryptoAvailable(){ return !!(window.crypto && window.crypto.subtle && window.crypto.getRandomValues); }
async function lkDeriveBits(secret, saltBytes){
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name:'PBKDF2', salt:saltBytes, iterations:150000, hash:'SHA-256' }, baseKey, 256);
}
async function lkHashSecret(secret){
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await lkDeriveBits(secret, salt);
  return { hash: lkBufToB64(bits), salt: lkBufToB64(salt) };
}
async function lkVerifySecret(secret, hashB64, saltB64){
  const salt = new Uint8Array(lkB64ToBuf(saltB64));
  const bits = await lkDeriveBits(secret, salt);
  return lkBufToB64(bits) === hashB64;
}
function lkNormalizeAnswer(s){ return (s || '').trim().toLowerCase(); }

/* T11: একাধিক কী লেখার আগে বর্তমান মান নিয়ে রাখা, ফেল করলে ঠিক সেই মানে ফেরানো।
   (আগে ফেল হলে কী মুছে দেওয়া হতো — চেঞ্জ/রিসেটে পুরনো বৈধ পাসওয়ার্ডও চলে যেত)
   snapshot[key] === null মানে লেখার আগে কী-টা ছিলই না → ফেরানোর সময় মুছে দেওয়া হয়। */
function lkSnapshotKeys(keys){
  const snap = {};
  keys.forEach(k=>{ try{ snap[k] = localStorage.getItem(k); }catch(e){ snap[k] = null; } });
  return snap;
}
function lkRestoreKeys(snap){
  Object.keys(snap).forEach(k=>{
    try{
      if(snap[k] === null) localStorage.removeItem(k);
      else localStorage.setItem(k, snap[k]);
    }catch(e){}
  });
}

/* ---------- বেসিক স্টেট চেক ---------- */
function isLockEnabled(){ try{ return localStorage.getItem(LK_ENABLED) === '1'; }catch(e){ return false; } }
function fingerprintEnabled(){ try{ return !!localStorage.getItem(LK_WEBAUTHN); }catch(e){ return false; } }
async function checkFingerprintAvailable(){
  try{
    if(!lkCryptoAvailable()) return false;
    if(!(window.PublicKeyCredential && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable)) return false;
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  }catch(e){ return false; }
}

/* ---------- WebAuthn (ফিঙ্গারপ্রিন্ট/ফেস) ----------
   এখানে কোনো সার্ভার নেই, তাই সার্ভার-সাইড signature ভেরিফাই হয় না।
   ব্রাউজার নিজেই ডিভাইসের বায়োমেট্রিক ভেরিফাই করে, আর ভেরিফাই ছাড়া
   navigator.credentials.get() সফল হয় না — তাই লোকাল গেট হিসেবে এটা
   নিরাপদ, কিন্তু এটা backup password এর মতো এনক্রিপশন কী না। */
async function registerFingerprint(){
  if(!lkCryptoAvailable()) throw new Error('crypto unavailable');
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const userId = crypto.getRandomValues(new Uint8Array(16));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: 'হিসাব খাতা' },
      user: { id: userId, name: 'hisab-khata-user', displayName: 'হিসাব খাতা' },
      pubKeyCredParams: [{ type:'public-key', alg:-7 }, { type:'public-key', alg:-257 }],
      authenticatorSelection: { authenticatorAttachment:'platform', userVerification:'required' },
      timeout: 60000
    }
  });
  if(!cred) throw new Error('no credential');
  if(typeof safeSet === 'function'){
    if(!safeSet(LK_WEBAUTHN, lkBufToB64(cred.rawId))) throw new Error('storage write failed');
  }else{
    localStorage.setItem(LK_WEBAUTHN, lkBufToB64(cred.rawId));
  }
}
async function unlockWithFingerprint(){
  const credIdB64 = localStorage.getItem(LK_WEBAUTHN);
  if(!credIdB64) return false;
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge,
      allowCredentials: [{ type:'public-key', id: lkB64ToBuf(credIdB64) }],
      userVerification: 'required',
      timeout: 60000
    }
  });
  return !!assertion;
}

/* ============================================================
   লক স্ক্রিন
   ============================================================ */
const lockScreenEl = document.getElementById('appLockScreen');
let lockAttemptCount = 0, lockCooldownUntil = 0;
try{ lockAttemptCount = Number(localStorage.getItem(LK_ATTEMPTS)) || 0; }catch(e){}
try{ lockCooldownUntil = Number(localStorage.getItem(LK_COOLDOWN)) || 0; }catch(e){}
let lastActivityTime = Date.now();

function recordActivity(){
  lastActivityTime = Date.now();
  try{ localStorage.setItem(LK_ACTIVITY, String(lastActivityTime)); }catch(e){}
}
function isCurrentlyLocked(){ return lockScreenEl.classList.contains('show'); }

function showLockScreenErr(msg){
  const el = document.getElementById('lockScreenError');
  el.textContent = msg; el.style.display = 'block';
}

async function showLockScreen(){
  lockScreenEl.classList.add('show');
  document.body.classList.add('lock-active');
  document.getElementById('lockScreenPwInput').value = '';
  document.getElementById('lockScreenError').style.display = 'none';
  const fpBtn = document.getElementById('lockScreenFingerprintBtn');
  fpBtn.style.display = (fingerprintEnabled() && await checkFingerprintAvailable()) ? 'block' : 'none';
  setTimeout(()=>{ document.getElementById('lockScreenPwInput').focus(); }, 60);
}
function hideLockScreen(){
  lockScreenEl.classList.remove('show');
  document.body.classList.remove('lock-active');
  recordActivity();
}

async function attemptUnlock(pw){
  if(Date.now() < lockCooldownUntil){
    const s = Math.ceil((lockCooldownUntil - Date.now()) / 1000);
    showLockScreenErr(tfmt('lockScreenTooManyTries', { s }));
    return;
  }
  const hash = localStorage.getItem(LK_PW_HASH);
  const salt = localStorage.getItem(LK_PW_SALT);
  if(!hash || !salt){ hideLockScreen(); return; } /* করাপ্ট অবস্থায় ব্যবহারকারীকে আটকে রাখা ঠিক না */
  const ok = await lkVerifySecret(pw, hash, salt);
  if(ok){
    lockAttemptCount = 0;
    try{ localStorage.removeItem(LK_ATTEMPTS); localStorage.removeItem(LK_COOLDOWN); }catch(e){}
    hideLockScreen();
  }else{
    lockAttemptCount++;
    if(lockAttemptCount >= 5){
      lockCooldownUntil = Date.now() + 30000;
      lockAttemptCount = 0;
      try{ localStorage.setItem(LK_COOLDOWN, String(lockCooldownUntil)); localStorage.removeItem(LK_ATTEMPTS); }catch(e){}
      showLockScreenErr(tfmt('lockScreenTooManyTries', { s: 30 }));
    }else{
      try{ localStorage.setItem(LK_ATTEMPTS, String(lockAttemptCount)); }catch(e){}
      showLockScreenErr(L('lockScreenWrongPwErr'));
    }
  }
}
document.getElementById('lockScreenUnlockBtn').addEventListener('click', ()=>{
  attemptUnlock(document.getElementById('lockScreenPwInput').value);
});
document.getElementById('lockScreenPwInput').addEventListener('keypress', (e)=>{
  if(e.key === 'Enter') document.getElementById('lockScreenUnlockBtn').click();
});
document.getElementById('lockScreenFingerprintBtn').addEventListener('click', async ()=>{
  if(!fingerprintEnabled()) return;
  try{
    const ok = await unlockWithFingerprint();
    if(ok) hideLockScreen();
    else showLockScreenErr(L('lockScreenFingerprintFail'));
  }catch(err){ /* ব্যবহারকারী বাতিল করলে বা মেলেনি — চুপচাপ পাসওয়ার্ড স্ক্রিনে থাকুক */ }
});

/* ---------- আইডল টাইমআউট: ১ ঘণ্টা কিছু না করলে আবার লক ---------- */
let lkThrottleTimer = null;
function throttledRecordActivity(){
  if(lkThrottleTimer) return;
  lkThrottleTimer = setTimeout(()=>{ lkThrottleTimer = null; }, 5000);
  recordActivity();
}
function checkIdleLock(){
  if(!isLockEnabled() || isCurrentlyLocked()) return;
  let last = lastActivityTime;
  try{
    const stored = Number(localStorage.getItem(LK_ACTIVITY));
    if(stored && stored > last) last = stored;
  }catch(e){}
  if(Date.now() - last > IDLE_LIMIT_MS) showLockScreen();
}
function initIdleWatch(){
  ['touchstart','mousedown','keydown','scroll'].forEach(evt=>{
    document.addEventListener(evt, throttledRecordActivity, { passive:true });
  });
  setInterval(checkIdleLock, 20000);
  document.addEventListener('visibilitychange', ()=>{ if(document.visibilityState === 'visible') checkIdleLock(); });
  window.addEventListener('focus', checkIdleLock);
}

/* ============================================================
   সেটিংস: প্রাইভেসি ও সেফটি সেকশনের UI
   ============================================================ */
async function updateSettingsPrivacyUI(){
  const enabled = isLockEnabled();
  document.getElementById('lockOffState').style.display = enabled ? 'none' : 'block';
  document.getElementById('lockOnState').style.display = enabled ? 'block' : 'none';
  if(!enabled) return;
  const fpRow = document.getElementById('fingerprintRow');
  const available = await checkFingerprintAvailable();
  fpRow.style.display = available ? 'flex' : 'none';
  if(available) document.getElementById('fingerprintToggle').checked = fingerprintEnabled();
}
const gearBtnEl = document.getElementById('gearBtn');
if(gearBtnEl) gearBtnEl.addEventListener('click', updateSettingsPrivacyUI);

document.getElementById('fingerprintToggle').addEventListener('change', async (e)=>{
  const checked = e.target.checked;
  if(checked){
    try{
      await registerFingerprint();
      toast(L('fingerprintEnabledToast'));
    }catch(err){
      e.target.checked = false;
      toast(L('fingerprintEnableFailToast'));
    }
  }else{
    try{ localStorage.removeItem(LK_WEBAUTHN); }catch(err){}
    toast(L('fingerprintDisabledToast'));
  }
});

/* ============================================================
   পাসওয়ার্ড মোডাল (setup / change / verify / reset — একটাই মোডাল)
   ============================================================ */
const lockPwModalEl = document.getElementById('lockPasswordModal');
let lockPwMode = null;
let lockPwVerifiedCallback = null;

function openLockPasswordModal(mode, onVerified){
  lockPwMode = mode;
  lockPwVerifiedCallback = onVerified || null;
  const curInput = document.getElementById('lockCurrentPwInput');
  const newInput = document.getElementById('lockNewPwInput');
  const confInput = document.getElementById('lockConfirmPwInput');
  const err = document.getElementById('lockPasswordError');
  curInput.value = ''; newInput.value = ''; confInput.value = '';
  err.style.display = 'none'; err.textContent = '';
  const titleEl = document.getElementById('lockPasswordTitle');
  const submitBtn = document.getElementById('lockPasswordSubmitBtn');
  if(mode === 'setup'){
    titleEl.textContent = L('lockSetupTitle');
    curInput.style.display = 'none'; newInput.style.display = 'block'; confInput.style.display = 'block';
    submitBtn.textContent = L('lockSetupSaveBtn');
  }else if(mode === 'change'){
    titleEl.textContent = L('lockChangeTitle');
    curInput.style.display = 'block'; newInput.style.display = 'block'; confInput.style.display = 'block';
    submitBtn.textContent = L('lockChangeSaveBtn');
  }else if(mode === 'verify'){
    titleEl.textContent = L('lockVerifyTitle');
    curInput.style.display = 'block'; newInput.style.display = 'none'; confInput.style.display = 'none';
    submitBtn.textContent = L('lockVerifyContinueBtn');
  }else if(mode === 'reset'){
    titleEl.textContent = L('lockResetTitle');
    curInput.style.display = 'none'; newInput.style.display = 'block'; confInput.style.display = 'block';
    submitBtn.textContent = L('lockSetupSaveBtn');
  }
  lockPwModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=>{ (mode === 'verify' ? curInput : newInput).focus(); }, 60);
}
function closeLockPasswordModal(){ lockPwModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('lockPasswordCloseBtn').addEventListener('click', closeLockPasswordModal);
lockPwModalEl.addEventListener('click', (e)=>{ if(e.target === lockPwModalEl) closeLockPasswordModal(); });
function showLockPwError(msg){
  const err = document.getElementById('lockPasswordError');
  err.textContent = msg; err.style.display = 'block';
}
['lockCurrentPwInput','lockNewPwInput','lockConfirmPwInput'].forEach(id=>{
  document.getElementById(id).addEventListener('keypress', (e)=>{
    if(e.key === 'Enter') document.getElementById('lockPasswordSubmitBtn').click();
  });
});

document.getElementById('lockPasswordSubmitBtn').addEventListener('click', async ()=>{
  if(!lkCryptoAvailable()){ showLockPwError(L('lockCurrentPwWrongErr')); return; }
  const cur = document.getElementById('lockCurrentPwInput').value;
  const nw = document.getElementById('lockNewPwInput').value;
  const conf = document.getElementById('lockConfirmPwInput').value;

  try{
    if(lockPwMode === 'verify'){
      const hash = localStorage.getItem(LK_PW_HASH), salt = localStorage.getItem(LK_PW_SALT);
      const ok = hash && salt && await lkVerifySecret(cur, hash, salt);
      if(!ok){ showLockPwError(L('lockCurrentPwWrongErr')); return; }
      closeLockPasswordModal();
      if(lockPwVerifiedCallback) lockPwVerifiedCallback();
      return;
    }

    if(lockPwMode === 'change'){
      const hash = localStorage.getItem(LK_PW_HASH), salt = localStorage.getItem(LK_PW_SALT);
      const ok = hash && salt && await lkVerifySecret(cur, hash, salt);
      if(!ok){ showLockPwError(L('lockCurrentPwWrongErr')); return; }
    }

    if(nw.length < 4){ showLockPwError(L('lockPwTooShortErr')); return; }
    if(nw !== conf){ showLockPwError(L('lockPwMismatchErr')); return; }

    const { hash: newHash, salt: newSalt } = await lkHashSecret(nw);
    /* T11: সব-বা-কিছুই-না — hash+salt (আর setup-এ LK_ENABLED) সব লিখতে হবে; কোনোটা ফেল করলে লেখার আগের
       অবস্থায় ফেরত যাই (change/reset-এ পুরনো বৈধ পাসওয়ার্ড অক্ষত, setup-এ কিছুই বাকি থাকে না)।
       ফেলের কারণ স্টোরেজ, তাই বার্তা storageSaveFailMsg (আগে ভুল করে "কমপক্ষে ৪ অক্ষর" দেখাত) */
    const pwSnap = lkSnapshotKeys([LK_PW_HASH, LK_PW_SALT, LK_ENABLED]);
    const ok1 = (typeof safeSet === 'function') ? safeSet(LK_PW_HASH, newHash) : (localStorage.setItem(LK_PW_HASH, newHash), true);
    const ok2 = ok1 && ((typeof safeSet === 'function') ? safeSet(LK_PW_SALT, newSalt) : (localStorage.setItem(LK_PW_SALT, newSalt), true));
    if(!ok1 || !ok2){
      lkRestoreKeys(pwSnap);
      showLockPwError(L('storageSaveFailMsg'));
      return;
    }

    if(lockPwMode === 'setup'){
      const okEnabled = (typeof safeSet === 'function') ? safeSet(LK_ENABLED, '1') : (localStorage.setItem(LK_ENABLED, '1'), true);
      if(!okEnabled){ lkRestoreKeys(pwSnap); showLockPwError(L('storageSaveFailMsg')); return; }
      closeLockPasswordModal();
      openSecurityQModal('setup');
    }else if(lockPwMode === 'change'){
      closeLockPasswordModal();
      toast(L('lockPwChangedToast'));
      updateSettingsPrivacyUI();
    }else if(lockPwMode === 'reset'){
      closeLockPasswordModal();
      toast(L('lockPwChangedToast'));
      hideLockScreen();
      updateSettingsPrivacyUI();
    }
  }catch(err){
    showLockPwError(L('lockCurrentPwWrongErr'));
  }
});

/* ============================================================
   সিকিউরিটি প্রশ্ন মোডাল
   ============================================================ */
const securityQModalEl = document.getElementById('securityQModal');
let securityQMode = null;
function openSecurityQModal(mode){
  securityQMode = mode;
  document.getElementById('securityQSelect').value = 'securityQ1';
  document.getElementById('securityQCustomInput').style.display = 'none';
  document.getElementById('securityQCustomInput').value = '';
  document.getElementById('securityAnswerInput').value = '';
  document.getElementById('securityQError').style.display = 'none';
  securityQModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=>{ document.getElementById('securityQSelect').focus(); }, 60);
}
function closeSecurityQModal(finalize){
  securityQModalEl.classList.remove('open'); unlockBodyScroll();
  if(finalize && securityQMode === 'setup'){
    toast(L('lockPwSetToast'));
    updateSettingsPrivacyUI();
  }
  securityQMode = null;
}
document.getElementById('securityQSelect').addEventListener('change', (e)=>{
  document.getElementById('securityQCustomInput').style.display = e.target.value === 'custom' ? 'block' : 'none';
});
document.getElementById('securityQCloseBtn').addEventListener('click', ()=> closeSecurityQModal(true));
securityQModalEl.addEventListener('click', (e)=>{ if(e.target === securityQModalEl) closeSecurityQModal(true); });
document.getElementById('securityAnswerInput').addEventListener('keypress', (e)=>{
  if(e.key === 'Enter') document.getElementById('securityQSaveBtn').click();
});
document.getElementById('securityQSaveBtn').addEventListener('click', async ()=>{
  const sel = document.getElementById('securityQSelect').value;
  const customText = document.getElementById('securityQCustomInput').value.trim();
  const answer = document.getElementById('securityAnswerInput').value;
  const err = document.getElementById('securityQError');
  if((sel === 'custom' && !customText) || !answer.trim()){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block';
    return;
  }
  if(!lkCryptoAvailable()){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block';
    return;
  }
  try{
    const sqData = sel === 'custom' ? { type:'custom', text: customText } : { type:'preset', key: sel };
    const { hash, salt } = await lkHashSecret(lkNormalizeAnswer(answer));
    /* T11: সব-বা-কিছুই-না — তিনটে কী-ই লিখতে হবে; ফেল করলে লেখার আগের অবস্থায় ফেরত (পুরনো সিকিউরিটি
       প্রশ্ন থাকলে সেটা অক্ষত, নইলে কিছুই থাকে না)। বার্তা storageSaveFailMsg (আগে ভুল করে "প্রশ্ন ও উত্তর দুটোই দিতে হবে") */
    const sqSnap = lkSnapshotKeys([LK_SQ, LK_SQ_HASH, LK_SQ_SALT]);
    const ok1 = (typeof safeSet === 'function') ? safeSet(LK_SQ, JSON.stringify(sqData)) : (localStorage.setItem(LK_SQ, JSON.stringify(sqData)), true);
    const ok2 = ok1 && ((typeof safeSet === 'function') ? safeSet(LK_SQ_HASH, hash) : (localStorage.setItem(LK_SQ_HASH, hash), true));
    const ok3 = ok2 && ((typeof safeSet === 'function') ? safeSet(LK_SQ_SALT, salt) : (localStorage.setItem(LK_SQ_SALT, salt), true));
    if(!ok1 || !ok2 || !ok3){
      lkRestoreKeys(sqSnap);
      err.textContent = L('storageSaveFailMsg'); err.style.display = 'block';
      return;
    }
    const wasSetup = securityQMode === 'setup';
    securityQModalEl.classList.remove('open'); unlockBodyScroll();
    toast(wasSetup ? L('lockPwSetToast') : L('securityQSavedToast'));
    updateSettingsPrivacyUI();
    securityQMode = null;
  }catch(e){
    err.textContent = L('securityQRequiredErr'); err.style.display = 'block';
  }
});

/* ============================================================
   "পাসওয়ার্ড ভুলে গেছি" — সিকিউরিটি প্রশ্ন দিয়ে রিসেট
   ============================================================ */
const forgotPwModalEl = document.getElementById('forgotPwModal');
let forgotAttemptCount = 0, forgotCooldownUntil = 0;
try{ forgotAttemptCount = Number(localStorage.getItem(LK_F_ATTEMPTS)) || 0; }catch(e){}
try{ forgotCooldownUntil = Number(localStorage.getItem(LK_F_COOLDOWN)) || 0; }catch(e){}

function openForgotPwModal(){
  const sqRaw = localStorage.getItem(LK_SQ);
  let sq = null;
  try{ sq = sqRaw ? JSON.parse(sqRaw) : null; }catch(e){ sq = null; }
  if(!sq){ openAlert(L('forgotPwNoQSetMsg')); return; }
  const qText = sq.type === 'preset' ? L(sq.key) : sq.text;
  document.getElementById('forgotPwQuestionText').textContent = qText;
  document.getElementById('forgotPwAnswerInput').value = '';
  document.getElementById('forgotPwError').style.display = 'none';
  forgotPwModalEl.classList.add('open');
  lockBodyScroll();
  setTimeout(()=>{ document.getElementById('forgotPwAnswerInput').focus(); }, 60);
}
function closeForgotPwModal(){ forgotPwModalEl.classList.remove('open'); unlockBodyScroll(); }
document.getElementById('lockScreenForgotLink').addEventListener('click', openForgotPwModal);
document.getElementById('forgotPwCloseBtn').addEventListener('click', closeForgotPwModal);
document.getElementById('forgotPwCancelBtn').addEventListener('click', closeForgotPwModal);
forgotPwModalEl.addEventListener('click', (e)=>{ if(e.target === forgotPwModalEl) closeForgotPwModal(); });
document.getElementById('forgotPwAnswerInput').addEventListener('keypress', (e)=>{
  if(e.key === 'Enter') document.getElementById('forgotPwSubmitBtn').click();
});
document.getElementById('forgotPwSubmitBtn').addEventListener('click', async ()=>{
  const err = document.getElementById('forgotPwError');
  if(Date.now() < forgotCooldownUntil){
    const s = Math.ceil((forgotCooldownUntil - Date.now()) / 1000);
    err.textContent = tfmt('lockScreenTooManyTries', { s }); err.style.display = 'block';
    return;
  }
  const answer = lkNormalizeAnswer(document.getElementById('forgotPwAnswerInput').value);
  const hash = localStorage.getItem(LK_SQ_HASH), salt = localStorage.getItem(LK_SQ_SALT);
  const ok = hash && salt && answer && await lkVerifySecret(answer, hash, salt);
  if(ok){
    forgotAttemptCount = 0;
    try{ localStorage.removeItem(LK_F_ATTEMPTS); localStorage.removeItem(LK_F_COOLDOWN); }catch(e){}
    closeForgotPwModal();
    openLockPasswordModal('reset');
  }else{
    forgotAttemptCount++;
    if(forgotAttemptCount >= 5){
      forgotCooldownUntil = Date.now() + 30000;
      forgotAttemptCount = 0;
      try{ localStorage.setItem(LK_F_COOLDOWN, String(forgotCooldownUntil)); localStorage.removeItem(LK_F_ATTEMPTS); }catch(e){}
      err.textContent = tfmt('lockScreenTooManyTries', { s: 30 }); err.style.display = 'block';
    }else{
      try{ localStorage.setItem(LK_F_ATTEMPTS, String(forgotAttemptCount)); }catch(e){}
      err.textContent = L('forgotPwWrongErr'); err.style.display = 'block';
    }
  }
});

/* ============================================================
   অ্যাপ লক চালু/বন্ধ — সেটিংস বাটনগুলোর হ্যান্ডলার
   ============================================================ */
document.getElementById('enableLockBtn').addEventListener('click', ()=> openLockPasswordModal('setup'));
document.getElementById('changeLockPwBtn').addEventListener('click', ()=> openLockPasswordModal('change'));
document.getElementById('changeSecurityQBtn').addEventListener('click', ()=>{
  openLockPasswordModal('verify', ()=> openSecurityQModal('change'));
});
function performDisableLock(){
  [LK_ENABLED, LK_PW_HASH, LK_PW_SALT, LK_SQ, LK_SQ_HASH, LK_SQ_SALT, LK_WEBAUTHN, LK_ACTIVITY,
   LK_ATTEMPTS, LK_COOLDOWN, LK_F_ATTEMPTS, LK_F_COOLDOWN]
    .forEach(k=>{ try{ localStorage.removeItem(k); }catch(e){} });
  toast(L('lockDisabledToast'));
  updateSettingsPrivacyUI();
}
document.getElementById('disableLockBtn').addEventListener('click', ()=>{
  openLockPasswordModal('verify', ()=>{
    openSimpleConfirm(L('disableLockConfirmMsg'), performDisableLock);
  });
});

/* ============================================================
   Init — কোল্ড স্টার্টে লক স্ক্রিন ইতিমধ্যে দেখানো আছে (index.html এর
   ইনলাইন স্ক্রিপ্ট দিয়ে, ডেটা-ফ্ল্যাশ এড়াতে) — এখানে শুধু বাকি সেটআপ
   ============================================================ */
if(isLockEnabled() && isCurrentlyLocked()) showLockScreen();
recordActivity();
initIdleWatch();

/* ============================================================
   Init
   ============================================================ */
document.getElementById('budgetTypeRow').style.display = curType==='expense' ? 'block' : 'none';

loadData();
requestPersistentStorage();
applyDarkMode();
applyLanguage();
syncTransferToOptions();

/* T7 — অ্যাপ suspend থেকে ফিরলে/ট্যাব ফোকাস পেলে তারিখ আপডেট */
lastKnownToday = new Date();
document.addEventListener('visibilitychange', ()=>{
  if(document.visibilityState === 'visible') refreshTodayDefaults();
});
window.addEventListener('focus', refreshTodayDefaults);

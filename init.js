/* ============================================================
   Init
   ============================================================ */
document.getElementById('budgetTypeRow').style.display = curType==='expense' ? 'block' : 'none';

loadData();
applyDarkMode();
applyLanguage();
syncTransferToOptions();

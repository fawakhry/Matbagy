
/*********************** Matbagy Sheets Patch 25 - Employee SSO Bypass ***********************/
(function(){
  try {
    var q = new URLSearchParams(location.search);
    var fromTrend = q.get('from') === 'trendos' || q.get('sso') === '1' || q.get('employeeSSO') === '1';
    var noPhone = q.get('noPhone') === '1' || q.get('openWithoutPhone') === '1' || q.get('bypassPhoneVerification') === '1';
    var noActivation = q.get('noActivation') === '1' || q.get('bypassActivation') === '1';
    var employee = q.get('username') || q.get('name') || 'موظف مطبعجي';
    if (fromTrend && noPhone && noActivation) {
      localStorage.setItem('MATBAGY_SHEETS_EMPLOYEE_SSO', JSON.stringify({employee:employee, bypassPhone:true, bypassActivation:true, createdAt:Date.now()}));
      window.MATBAGY_SHEETS_EMPLOYEE_SSO = true;
      window.MATBAGY_SHEETS_DISABLE_PHONE = true;
      window.MATBAGY_SHEETS_DISABLE_ACTIVATION = true;
      document.documentElement.classList.add('employee-sso-active');
      setTimeout(function(){
        document.querySelectorAll('[id*="activation"],[class*="activation"],[id*="phone"],[class*="phone"]').forEach(function(el){
          var txt=(el.textContent||'')+' '+(el.id||'')+' '+(el.className||'');
          if(/تفعيل|رقم الهاتف|activation|phone/i.test(txt)) el.style.display='none';
        });
        var app = document.getElementById('app') || document.body;
        if (app && !document.getElementById('sheetsSsoOk')) {
          var b=document.createElement('div'); b.id='sheetsSsoOk'; b.dir='rtl'; b.style.cssText='margin:10px;padding:10px;border:1px solid #99f6e4;background:#f0fdfa;border-radius:12px;color:#0f766e;font-weight:700';
          b.textContent='تم فتح مطبعجي شيتات للموظف بدون رقم تليفون أو تفعيل: '+employee;
          app.insertBefore(b, app.firstChild);
        }
      }, 500);
    }
  } catch(e) {}
})();

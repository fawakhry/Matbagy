// TrendOS / Matbagy Benha - CLEAN CONFIG V1885 - ROLLBACK BASE + PROOF COPY
// ارفع هذا الملف مع نسخة V1885 المبنية على ملفك الأصلي فقط. لا تترك config قديم في الريبو.
window.TREND_API_URL = "https://script.google.com/macros/s/AKfycby5vuEoMEqpCEvEz8uZOnMGcVUNXJEwk19KX9Gka1_HPzUDi62VUKMTO5qUaeHFv9HXCA/exec";
window.API_URL = window.TREND_API_URL;

// ملفات مطبعجي داخل شبكة المطبعة حالياً على IP جهاز السيرفر.
// بعد Cloudflare Tunnel غيّر السطرين إلى: https://files.matbagy.com
window.MATBAGY_REMOTE_FILES_URL = "http://192.168.1.36:5050";
window.MATBAGY_FILE_SERVER_URL = "http://192.168.1.36:5050";

// روابط أدوات الموظفين
window.MATBAGY_SHEETS_URL = "https://fawakhry.github.io/Matbagy/?from=trendos";
window.MATBAGY_ROTET_URL = "https://fawakhry.github.io/TrendOs/?rotet=matbagy";
window.MATBAGY_EASY_STORE_URL = "https://fawakhry.github.io/EasyStore/";
window.MATBAGY_LEAD_HUNTER_URL = "https://fawakhry.github.io/trendos-lead-hunter/";
window.MATBAGY_EASYSTORE_VERSION_PARAM = 'es33-v1896-debt-addorder-catalog-hard-lock-20260701';

// صلاحيات الملفات والأدوات
window.MATBAGY_FILES_ALLOWED_EMPLOYEES = ['ضياء','جابر','وائل','diaa','gaber','jaber','wael'];
window.MATBAGY_EMPLOYEE_TOOLS_ALLOWED = ['ضياء','رحمه','رحمة','ريفان','ريڤان','جابر','وائل','diaa','rahma','revan','rivan','gaber','jaber','wael'];
window.MATBAGY_LEAD_HUNTER_ALLOWED_EMPLOYEES = ['ضياء','رحمه','رحمة','ريفان','ريڤان','diaa','rahma','revan','rivan'];
window.MATBAGY_ACCOUNTING_ALLOWED_EMPLOYEES = ['ضياء','رحمه','رحمة','ريفان','ريڤان','وائل','جابر','diaa','rahma','revan','rivan','wael','gaber','jaber'];
window.MATBAGY_ACCOUNTING_PURCHASE_EMPLOYEES = ['ضياء','رحمه','رحمة','ريفان','ريڤان','diaa','rahma','revan','rivan'];
window.MATBAGY_ACCOUNTING_DEPT_ONLY_EMPLOYEES = ['وائل','جابر','wael','gaber','jaber'];

// SSO وتشغيل الحسابات
window.MATBAGY_EMPLOYEE_TOOL_SSO = true;
window.MATBAGY_SHEETS_FORCE_SSO = true;
window.MATBAGY_SHEETS_DISABLE_PHONE = true;
window.MATBAGY_SHEETS_DISABLE_ACTIVATION = true;
window.MATBAGY_USE_EASY_STORE_FOR_ACCOUNTING = true;
window.MATBAGY_CUSTOMER_ACCOUNTS_PORTAL = true;
window.MATBAGY_AUTO_INVOICE_REVIEW_LINK = true;

// رفع العميل المباشر متوقف حالياً
window.MATBAGY_FAST_PRINT_UPLOAD_URL = '';
window.MATBAGY_FAST_PRINT_ALLOWED_CUSTOMERS = [];

// Clean build flags
window.MATBAGY_BUILD_VERSION = 'TrendOS V1903 External Customer Safe Order';
window.MATBAGY_BATCH_VERSION = 'V1904_INVOICE_ROWS_ENTER_TAB';
window.MATBAGY_PATCH29_DEPT_INVOICE = false;
window.MATBAGY_ES14_ACCOUNTING_MERGE = true;
window.MATBAGY_EASYSTORE_FIX5 = false;
window.MATBAGY_V1896_DEBT_ADDORDER_CATALOG_HARD_LOCK = true;
window.MATBAGY_V1860_ES17_INTERNATIONAL_UI_THEME = true;
window.MATBAGY_UI_THEME_VERSION = 'V1904_INVOICE_ROWS_ENTER_TAB';

window.MATBAGY_V1896_DEBT_ADDORDER_CATALOG_HARD_LOCK = true;

// V1899 tools
window.MATBAGY_FIBER_EZCAD_URL = "https://fawakhry.github.io/fiber-auto-max-ezcad/";
window.MATBAGY_V1900_BULK_DELIVER_READY = true;

// V1903 External / Walk-in customers
window.MATBAGY_V1904_INVOICE_ROWS_ENTER_TAB = true;

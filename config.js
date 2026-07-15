window.TREND_API_URL = "https://script.google.com/macros/s/AKfycbwGHOduL0BHvH-o4up9nbk1wYFi54D2KOnW1AFDigpBzyuAOTWzPfpSFPGSyFVj_fmTmg/exec";

window.MB_CONFIG = {
  businessName: "مطبعجي بنها",
  whatsappNumber: "201036112077",

  activationEndpoint: window.TREND_API_URL,

  sheetWidthCm: 29.7,
  sheetHeightCm: 45,
  dpi: 300,
  gapMm: 1,
  outerMarginMm: 2,
  defaultFitMode: "smart"
};

// Patch 27 - TrendOS employee SSO for Matbagy Sheets: Diaa/Wael only + 4x6 template on 29.7x45 sheet.
window.MB_CONFIG.allowTrendOsEmployeeSso = true;
window.MB_CONFIG.allowedSsoEmployees = ["ضياء", "ضياء الفواخري", "وائل", "diaa", "wael"];

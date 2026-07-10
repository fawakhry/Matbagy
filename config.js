window.TREND_API_URL = "https://script.google.com/macros/s/AKfycbwGHOduL0BHvH-o4up9nbk1wYFi54D2KOnW1AFDigpBzyuAOTWzPfpSFPGSyFVj_fmTmg/exec";

window.MB_CONFIG = {
  businessName: "مطبعجي بنها",
  placeName: "ترند مول",
  ownerName: "ضياء الفواخري",
  whatsappNumber: "201036112077",

  activationEndpoint: window.TREND_API_URL,

  sheetWidthCm: 29.7,
  sheetHeightCm: 45,
  dpi: 300,
  printDpi: 300,
  gapMm: 1,
  manualGapMm: 0.6,
  laserGapMm: 2.5,
  outerMarginMm: 2,
  defaultFitMode: "smart",
  defaultStroke: {
    mode: "none",
    color: "#111111",
    widthMm: 0.4
  },
  priceProducts: [
    { id: "quarter-couche", name: "ربع كوشيه", unitPrice: 0, cutPrices: { manual: 0, zero: 0, laser: 0 } },
    { id: "quarter-sticker", name: "ربع استيكر", unitPrice: 0, cutPrices: { manual: 0, zero: 0, laser: 0 } },
    { id: "quarter-lamination", name: "ربع سلوفان", unitPrice: 0, cutPrices: { manual: 0, zero: 0, laser: 0 } }
  ]
};

// Patch 27 - TrendOS employee SSO for Matbagy Sheets: Diaa/Wael only + 4x6 template on 29.7x45 sheet.
window.MB_CONFIG.allowTrendOsEmployeeSso = true;
window.MB_CONFIG.allowedSsoEmployees = ["ضياء", "ضياء الفواخري", "وائل", "diaa", "wael"];

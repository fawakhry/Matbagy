/*
ضع هذا الكود في Google Apps Script واربطه بشيت العملاء.
الشيت المطلوب: Customers
الأعمدة المقترحة:
A: Code
B: Phone
C: Name
D: Status   (Active / Blocked)

Deploy > New deployment > Web app
Execute as: Me
Who has access: Anyone
انسخ رابط Web App وضعه في config.js داخل activationEndpoint
*/
function doGet(e) {
  var code = String(e.parameter.code || '').trim();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Customers');
  var values = sheet.getDataRange().getValues();
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    var customerCode = String(row[0] || '').trim();
    var phone = String(row[1] || '').trim();
    var name = String(row[2] || '').trim();
    var status = String(row[3] || '').trim();
    if ((code === customerCode || code === phone) && status === 'Active') {
      return json({ active: true, code: customerCode, phone: phone, name: name });
    }
  }
  return json({ active: false });
}
function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

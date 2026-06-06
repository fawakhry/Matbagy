/*
  Matbagy PDF/ZIP export patch
  الهدف: منع إرسال الشيتات كصور مضغوطة على واتساب.
  الاستخدام:
    1) اربط jsPDF و JSZip من CDN في index.html.
    2) بعد توليد Canvas الشيتات، استدعِ handleSendToPrint({ sheets, customerName, customerPhone, templateName }).
*/

const MATBAGY_PRINT_CONFIG = {
  brandName: 'مطبعجي بنها',
  previewWatermark: 'مطبعجي بنها - نسخة معاينة',
  whatsappNumber: window.MATBAGY_WHATSAPP_NUMBER || '', // يمكن ضبطه من config.js
  sheetWidthMm: 297,
  sheetHeightMm: 450,
  pdfFilePrefix: 'Matbagy_Print_Order',
};

function pad2(n) {
  return String(n).padStart(2, '0');
}

function makeOrderFileName(prefix = MATBAGY_PRINT_CONFIG.pdfFilePrefix, ext = 'pdf') {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}_${pad2(d.getHours())}${pad2(d.getMinutes())}${pad2(d.getSeconds())}`;
  return `${prefix}_${stamp}.${ext}`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function canvasToPngDataUrl(canvas) {
  // PNG بدون ضغط JPEG للحفاظ على جودة الشيت.
  return canvas.toDataURL('image/png');
}

async function canvasToPngBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) reject(new Error('فشل إنشاء ملف PNG من الشيت'));
      else resolve(blob);
    }, 'image/png');
  });
}

function normalizeSheetToCanvas(sheet) {
  if (sheet instanceof HTMLCanvasElement) return sheet;
  if (sheet && sheet.canvas instanceof HTMLCanvasElement) return sheet.canvas;
  throw new Error('لازم تمرر الشيت كـ Canvas أو Object يحتوي canvas');
}

async function exportSheetsToPdfBlob(sheets, options = {}) {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    throw new Error('مكتبة jsPDF غير محملة. أضف CDN الخاص بها في index.html');
  }

  const widthMm = options.widthMm || MATBAGY_PRINT_CONFIG.sheetWidthMm;
  const heightMm = options.heightMm || MATBAGY_PRINT_CONFIG.sheetHeightMm;
  const { jsPDF } = window.jspdf;

  const pdf = new jsPDF({
    orientation: heightMm >= widthMm ? 'portrait' : 'landscape',
    unit: 'mm',
    format: [widthMm, heightMm],
    compress: false,
  });

  sheets.forEach((sheet, index) => {
    const canvas = normalizeSheetToCanvas(sheet);
    if (index > 0) pdf.addPage([widthMm, heightMm], heightMm >= widthMm ? 'portrait' : 'landscape');
    const img = canvasToPngDataUrl(canvas);
    pdf.addImage(img, 'PNG', 0, 0, widthMm, heightMm, undefined, 'NONE');
  });

  return pdf.output('blob');
}

async function exportSheetsToZipBlob(sheets, options = {}) {
  if (!window.JSZip) {
    throw new Error('مكتبة JSZip غير محملة. أضف CDN الخاص بها في index.html');
  }

  const zip = new JSZip();
  for (let i = 0; i < sheets.length; i += 1) {
    const canvas = normalizeSheetToCanvas(sheets[i]);
    const blob = await canvasToPngBlob(canvas);
    zip.file(`sheet_${String(i + 1).padStart(2, '0')}.png`, blob);
  }

  if (options.infoText) {
    zip.file('README.txt', options.infoText);
  }

  return zip.generateAsync({ type: 'blob', compression: 'STORE' });
}

function buildWhatsAppPrintMessage({ customerName = '', customerPhone = '', templateName = '', sheetCount = 0, fileName = '' } = {}) {
  return [
    'طلب طباعة جديد من تطبيق مطبعجي بنها ✅',
    customerName ? `العميل: ${customerName}` : '',
    customerPhone ? `رقم العميل: ${customerPhone}` : '',
    templateName ? `نوع الشيت: ${templateName}` : '',
    sheetCount ? `عدد الشيتات: ${sheetCount}` : '',
    fileName ? `اسم الملف: ${fileName}` : '',
    '',
    'مهم: الملف لازم يتبعت كمستند / Document وليس كصورة حتى لا تقل الجودة.',
  ].filter(Boolean).join('\n');
}

function openWhatsAppWithMessage(message) {
  const phone = (MATBAGY_PRINT_CONFIG.whatsappNumber || '').replace(/[^0-9]/g, '');
  const base = phone ? `https://wa.me/${phone}` : 'https://wa.me/';
  const url = `${base}?text=${encodeURIComponent(message)}`;
  window.open(url, '_blank', 'noopener,noreferrer');
}

function showPrintInstruction(fileName) {
  const text = `تم تجهيز ملف الطباعة بنجاح ✅\n\nاسم الملف:\n${fileName}\n\nمهم جدًا:\nلا ترسل الشيتات كصور حتى لا تقل الجودة.\nارسل الملف على واتساب كـ Document / ملف.`;
  alert(text);
}

async function handleSendToPrint({ sheets, customerName, customerPhone, templateName, output = 'pdf' } = {}) {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    alert('لا توجد شيتات جاهزة للإرسال.');
    return;
  }

  try {
    const ext = output === 'zip' ? 'zip' : 'pdf';
    const fileName = makeOrderFileName(MATBAGY_PRINT_CONFIG.pdfFilePrefix, ext);
    let blob;

    if (output === 'zip') {
      blob = await exportSheetsToZipBlob(sheets, {
        infoText: 'ملفات طباعة مطبعجي بنها - أرسل هذا الملف كمستند وليس كصورة.',
      });
    } else {
      blob = await exportSheetsToPdfBlob(sheets);
    }

    downloadBlob(blob, fileName);
    showPrintInstruction(fileName);

    const message = buildWhatsAppPrintMessage({
      customerName,
      customerPhone,
      templateName,
      sheetCount: sheets.length,
      fileName,
    });
    openWhatsAppWithMessage(message);
  } catch (err) {
    console.error(err);
    alert(`حدث خطأ أثناء تجهيز ملف الطباعة: ${err.message}`);
  }
}

window.MatbagyPrintExport = {
  exportSheetsToPdfBlob,
  exportSheetsToZipBlob,
  handleSendToPrint,
  buildWhatsAppPrintMessage,
};

مطبعجي بنها - برنامج رص الصور للعملاء - النسخة النهائية الفعالة
====================================================

ما تم ضبطه في هذه النسخة:
- تفعيل العميل برقم الهاتف فقط من Google Sheet عملاء TrendOS.
- ربط Web App النهائي:
  https://script.google.com/macros/s/AKfycbz9mL2LHNIMnoS5H_mRSxe3Lo-D39qwx72vi3QnBg2E-zk26n5XyKBBMe7eV92Yelur/exec
- حفظ التفعيل محليًا على جهاز العميل.
- بعد التفعيل يدخل العميل مباشرة على اختيار المقاس ورفع الصور.
- حذف اختيارات القص المعقدة للعميل.
- تفعيل وضع ذكي تلقائي يحافظ على الملامح ويملأ الخانة قدر الإمكان.
- إضافة ملحوظة واضحة بخصوص إرسال الصور الأصلية وليس صور واتساب المضغوطة.
- خروج الشيتات كصور JPG جاهزة وليس PDF.

طريقة الرفع على GitHub:
1) افتح Repository:
   https://github.com/fawakhry/Matbagy

2) ارفع/استبدل الملفات التالية من هذه النسخة:
   index.html
   app.js
   config.js
   styles.css
   manifest.webmanifest
   sw.js
   icons/

3) من GitHub:
   Add file -> Upload files
   واسحب الملفات أو ارفعها.

4) اضغط:
   Commit changes

5) افتح رابط GitHub Pages للتجربة.

اختبار التفعيل:
- استخدم رقم موجود ومفعل في شيت العملاء مثل:
  01007131332

ملاحظة:
لو غيرت كود Apps Script لاحقًا، لازم تعمل Deploy -> New Version -> Deploy
ثم تحدث رابط activationEndpoint داخل config.js لو الرابط تغير.

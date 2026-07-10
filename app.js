const CONFIG = window.MB_CONFIG || {};
const CM_TO_IN = 1 / 2.54;
let state = {
  template: '6x9',
  photos: [],
  outputs: [],
  cleanOutputs: [],
  order: null,
  isSending:false,
  reviewOpen:false,
  client: null,
  isEmployee:false,
  repeatSingle:false,
  cutMode:'manual',
  strokeMode: CONFIG.defaultStroke?.mode || 'none',
  strokeColor: CONFIG.defaultStroke?.color || '#111111',
  strokeWidthMm: Number(CONFIG.defaultStroke?.widthMm || 0.4),
  lastCalc: null
};

const FORCE_RELOGIN_VERSION = 'sheets-sso-v20260709-p27-diaa-wael-4x6';
const MATBAGY_SHEETS_VERSION = 'Trend Mall / Matbagy Banha Smart Sheets - V129 - 2026-07-09';

const $ = (id) => document.getElementById(id);
const qsa = (sel) => [...document.querySelectorAll(sel)];

const STORAGE_TEMPLATES_KEY = 'mb_custom_templates_v1';

function readJsonStorage(key, fallback){
  try{
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  }catch(e){
    return fallback;
  }
}

function writeJsonStorage(key, value){
  localStorage.setItem(key, JSON.stringify(value));
}



// ===== Matbagy Sheets Employee SSO =====
function normalizeArabicName(value){
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[ًٌٍَُِّْـ]/g, '')
    .replace(/ة/g, 'ه')
    .replace(/أ|إ|آ/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/[^\u0600-\u06ffa-z0-9]+/g, '');
}

function allowedEmployeeNames(){
  const defaults = ['ضياء','ضياء الفواخري','diaa','wael','وائل'];
  const extra = Array.isArray(CONFIG.allowedSsoEmployees) ? CONFIG.allowedSsoEmployees : [];
  return defaults.concat(extra).map(normalizeArabicName).filter(Boolean);
}

function isAllowedEmployeeName(value){
  const name = normalizeArabicName(value);
  if(!name) return false;
  return allowedEmployeeNames().includes(name);
}

function getParamAny(params, names){
  for(const n of names){
    const v = params.get(n);
    if(v) return v;
  }
  return '';
}

function readTrendSsoFromUrl(){
  const params = new URLSearchParams(window.location.search || '');
  const hashParams = new URLSearchParams(String(window.location.hash || '').replace(/^#\??/, ''));
  const get = (names) => getParamAny(params, names) || getParamAny(hashParams, names);

  const from = get(['from','source','app','origin']);
  const sso = get(['sso','ssoMode','employeeSso','sheetsSso']);
  const token = get(['token','ssoToken','session','sid']);
  const username = get(['username','user','name','employee','staff','loginName','displayName']);
  const role = get(['role','permission','section','dept']);

  const looksLikeTrendOS = ['trendos','matbagy','matbagy-trendos','1','true','yes','employee'].includes(String(from || sso).toLowerCase()) || !!token;
  if(!looksLikeTrendOS || !isAllowedEmployeeName(username)) return null;

  return {
    active: true,
    sso: true,
    employee: true,
    source: 'TrendOS',
    name: username,
    manager: role || 'employee',
    phone: 'EMPLOYEE-SSO',
    type: 'employee',
    role: role || 'employee',
    deviceId: getDeviceId(),
    token: token || '',
    activatedAt: new Date().toISOString()
  };
}

function tryEmployeeSsoLogin(){
  const client = readTrendSsoFromUrl();
  if(!client) return null;
  localStorage.setItem('mb_client', JSON.stringify(client));
  localStorage.setItem('mb_sheets_sso', '1');
  localStorage.setItem('mb_sheets_sso_user', client.name || '');
  return client;
}

function isStoredSsoEmployee(client){
  return !!(client && client.sso === true && client.employee === true && isAllowedEmployeeName(client.name));
}

function canUseAdvancedTools(client){
  if(isStoredSsoEmployee(client)) return true;
  const type = normalizeArabicName(client?.type || client?.role || '');
  return ['مطبعه','مطابع','جمله','عميلجمله','wholesale','printer','printshop'].some(v => type.includes(v));
}

function injectAdjustmentStyles(){
  if(document.getElementById('mbAdjustmentRuntimeStyles')) return;
  const style = document.createElement('style');
  style.id = 'mbAdjustmentRuntimeStyles';
  style.textContent = `
    .sso-badge{display:inline-flex;align-items:center;gap:6px;background:#ecfdf5;color:#0f766e;border:1px solid #bbf7d0;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;margin-top:8px}
    .zoom-controls{display:flex;gap:6px;align-items:center;margin-top:8px}.zoom-controls input{min-width:90px;flex:1}.zoom-btn{padding:6px 10px}.zoom-readout{font-size:12px;color:#64748b;text-align:center;margin-top:4px;font-weight:800}
    .adjust-canvas{width:100%;height:100%;display:block;background:#fff;border-radius:10px}.fill-btn{background:#ecfdf5!important;color:#0f766e!important;border:1px solid #bbf7d0!important}
  `;
  document.head.appendChild(style);
}

function apiGet(params = {}) {
  return new Promise((resolve, reject) => {
    if (!CONFIG.activationEndpoint) {
      reject(new Error('رابط النظام غير مضبوط.'));
      return;
    }

    const callbackName = 'mbJsonp_' + Date.now() + '_' + Math.random().toString(36).slice(2);
    const script = document.createElement('script');
    let timer = null;
    let finished = false;

    function cleanup() {
      if (finished) return;
      finished = true;
      try { delete window[callbackName]; } catch(e) { window[callbackName] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
      if (timer) clearTimeout(timer);
    }

    window[callbackName] = function(data) {
      cleanup();
      resolve(data);
    };

    const query = new URLSearchParams({
      ...params,
      callback: callbackName,
      _ts: String(Date.now())
    });

    script.onerror = function() {
      cleanup();
      reject(new Error('تعذر الاتصال بالنظام. افتح التطبيق من جديد أو امسح الكاش.'));
    };

    timer = setTimeout(function() {
      cleanup();
      reject(new Error('انتهت مهلة الاتصال بالنظام. جرّب مرة أخرى.'));
    }, 20000);

    script.src = CONFIG.activationEndpoint + '?' + query.toString();
    document.body.appendChild(script);
  });
}

let templates = {
  '6x9': { label:'6×9', count:25, wCm:6, hCm:9, mode:'grid', cols:5, rows:5 },
  '10x15': { label:'10×15', count:9, wCm:10, hCm:15, mode:'grid', cols:3, rows:3 },
  // 4×6 على شيت مطبعجي القديم 29.7×45 سم: 7 أعمدة × 7 صفوف = 49 صورة.
  '4x6': { label:'4×6', count:49, wCm:4, hCm:6, mode:'grid', cols:7, rows:7 },
  '7x10': { label:'7×10', count:19, wCm:7, hCm:10, mode:'mixed' }
};

function loadTemplates(){
  const saved = readJsonStorage(STORAGE_TEMPLATES_KEY, []);
  saved.forEach(tpl=>{
    if(tpl && tpl.id && tpl.label && tpl.wCm && tpl.hCm){
      templates[tpl.id] = tpl;
    }
  });
}

function saveCustomTemplate(tpl){
  const saved = readJsonStorage(STORAGE_TEMPLATES_KEY, []);
  const next = saved.filter(t => t.id !== tpl.id).concat(tpl);
  writeJsonStorage(STORAGE_TEMPLATES_KEY, next);
  templates[tpl.id] = tpl;
  renderTemplates();
}

function renderTemplates(){
  const wrap = $('templates') || document.querySelector('.templates');
  if(!wrap) return;
  wrap.innerHTML = '';
  Object.keys(templates).forEach(id=>{
    const tpl = templates[id];
    const btn = document.createElement('button');
    btn.className = 'template' + (state.template === id ? ' active' : '');
    btn.dataset.template = id;
    btn.innerHTML = `<b>${tpl.label}</b><span>${tpl.count || ''} على الشيت</span>`;
    btn.addEventListener('click', () => selectTemplate(id));
    wrap.appendChild(btn);
  });
}

init();

function getDeviceId(){
  let id = localStorage.getItem('mb_device_id');

  if(!id || id === 'TEST-NEW' || id === 'TEST-PC' || id === 'test123'){
    if(window.crypto && crypto.randomUUID){
      id = 'DEV-' + crypto.randomUUID();
    }else{
      id = 'DEV-' + Date.now() + '-' + Math.random().toString(36).slice(2, 14);
    }

    localStorage.setItem('mb_device_id', id);
  }

  return id;
}


function forceReloginIfNeeded(){
  const savedVersion = localStorage.getItem('mb_force_relogin_version');

  if(savedVersion !== FORCE_RELOGIN_VERSION){
    const savedClient = JSON.parse(localStorage.getItem('mb_client') || '{}');
    // العملاء فقط يتم إخراجهم عند تغيير النسخة، أما موظف TrendOS SSO لا يحتاج تفعيل تليفون.
    if(!isStoredSsoEmployee(savedClient)){
      localStorage.removeItem('mb_client');
    }
    localStorage.setItem('mb_force_relogin_version', FORCE_RELOGIN_VERSION);
  }
}


async function checkSavedClientOnServer(client){
  const msg = $('activationMsg');

  if(!CONFIG.activationEndpoint || !client || !client.phone){
    localStorage.removeItem('mb_client');
    return false;
  }

  try{
    const deviceId = getDeviceId();
    const data = await apiGet({
      action: 'checkSession',
      phone: client.phone,
      deviceId: deviceId
    });

    if(!data || data.success !== true){
      localStorage.removeItem('mb_client');
      if(msg){
        msg.textContent = data?.message || 'تم إنهاء الجلسة. برجاء التفعيل من جديد.';
      }
      return false;
    }

    return true;
  }catch(e){
    // لو الإنترنت فصل، لا نطرد العميل فورًا عشان التطبيق يفضل قابل للاستخدام مؤقتًا.
    return true;
  }
}

async function init(){
  forceReloginIfNeeded();
  loadTemplates();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  renderTemplates();
  bindEvents();
  bindEmployeeTools();
  syncCutControls();
  fillProductOptions();
  injectAdjustmentStyles();

  const ssoClient = tryEmployeeSsoLogin();
  if(ssoClient){
    showApp(ssoClient);
    return;
  }

  const saved = localStorage.getItem('mb_client');

  if(saved){
    const client = JSON.parse(saved);
    const ok = isStoredSsoEmployee(client) ? true : await checkSavedClientOnServer(client);

    if(ok){
      showApp(client);
    }else{
      $('activationView').classList.remove('hidden');
      $('appView').classList.add('hidden');
    }
  }
}

function bindEvents(){
  $('activateBtn').addEventListener('click', activate);
  $('activationCode').addEventListener('keydown', (e) => { if(e.key === 'Enter') activate(); });
  $('logoutBtn').addEventListener('click', () => { localStorage.removeItem('mb_client'); localStorage.removeItem('mb_sheets_sso'); localStorage.removeItem('mb_sheets_sso_user'); location.reload(); });
  $('notifyBtn').addEventListener('click', requestNotifications);
  qsa('.template').forEach(btn => btn.addEventListener('click', () => selectTemplate(btn.dataset.template)));
  qsa('.cut-chip').forEach(btn => btn.addEventListener('click', () => selectCutMode(btn.dataset.cutMode)));
  $('fileInput').addEventListener('change', handleFiles);
  $('repeatOneBtn')?.addEventListener('click', toggleRepeatSingle);
  $('clearBtn').addEventListener('click', clearPhotos);
  $('rotateAllBtn').addEventListener('click', autoRotateAll);
  $('generateBtn').addEventListener('click', generateSheets);

  const downloadBtn = $('downloadBtn');
  const shareBtn = $('shareBtn');
  const laserCutPdfBtn = $('laserCutPdfBtn');

  downloadBtn.onclick = async (e) => {
    e.preventDefault();
    await downloadAll();
  };

  shareBtn.onclick = async (e) => {
    e.preventDefault();
    await shareWork();
  };

  if(laserCutPdfBtn){
    laserCutPdfBtn.onclick = async (e) => {
      e.preventDefault();
      await downloadLaserCutPdf();
    };
  }
}

function bindEmployeeTools(){
  const calcTplBtn = $('calcTplBtn');
  const saveTplBtn = $('saveTplBtn');
  const runCalcBtn = $('runCalcBtn');
  const useCalcAsTemplateBtn = $('useCalcAsTemplateBtn');
  const strokeMode = $('strokeMode');
  const strokeColor = $('strokeColor');
  const strokeWidthMm = $('strokeWidthMm');

  if(calcTplBtn) calcTplBtn.addEventListener('click', previewTemplateFromInputs);
  if(saveTplBtn) saveTplBtn.addEventListener('click', saveTemplateFromInputs);
  if(runCalcBtn) runCalcBtn.addEventListener('click', runMatbagyCalculator);
  if(useCalcAsTemplateBtn) useCalcAsTemplateBtn.addEventListener('click', useCalcAsTemplate);

  [strokeMode, strokeColor, strokeWidthMm].forEach(el=>{
    if(!el) return;
    el.addEventListener('change', ()=>{
      state.strokeMode = strokeMode?.value || 'none';
      state.strokeColor = strokeColor?.value || '#111111';
      state.strokeWidthMm = Number(strokeWidthMm?.value || 0.4);
      invalidateCurrentSheets('تم تغيير الاستروك. اضغط جهز الشيت مرة أخرى.');
    });
  });
}

function fillProductOptions(){
  const select = $('calcProduct');
  if(!select) return;
  const products = CONFIG.priceProducts || [];
  select.innerHTML = products.map(p=>`<option value="${p.id}">${p.name}</option>`).join('');
}

async function activate(){
  const phone = $('activationCode').value.trim();
  const msg = $('activationMsg');
  if(!phone){ msg.textContent = 'برجاء إدخال رقم الهاتف المسجل لدى مطبعجي بنها.'; return; }
  if(!CONFIG.activationEndpoint){ msg.textContent = 'رابط التفعيل غير مضبوط. تواصل مع مطبعجي بنها.'; return; }
  msg.textContent = 'جاري التحقق من الرقم والجهاز...';

  try{
    const deviceId = getDeviceId();
    const data = await apiGet({
      action: 'activate',
      phone: phone,
      deviceId: deviceId
    });
    if(!data || data.success !== true || data.found !== true) throw new Error(data?.message || 'not-active');

    const customer = data.customer || {};
    const client = { active:true, name:customer.name || 'عميل مطبعجي بنها', manager:customer.manager || '', phone:customer.phone || phone, type:customer.type || '', deviceId, activatedAt:new Date().toISOString() };
    localStorage.setItem('mb_client', JSON.stringify(client));
    msg.textContent = `أهلاً ${client.name}، تم تفعيل التطبيق بنجاح.`;
    setTimeout(() => showApp(client), 600);
  }catch(e){
    msg.textContent = e.message && e.message !== 'not-active' ? e.message : 'الرقم غير مسجل أو غير مفعل، برجاء التواصل مع مطبعجي بنها.';
  }
}

function showApp(client){
  state.client = client || {};
  state.isEmployee = canUseAdvancedTools(client);
  $('activationView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('helloTitle').textContent = `أهلاً ${client.name || 'بك'} 👋`;
  document.body.classList.toggle('employee-mode', state.isEmployee);
  const panel = $('employeePanel');
  if(panel) panel.classList.toggle('hidden', !state.isEmployee);
  if(isStoredSsoEmployee(client)){
    const logoutBtn = $('logoutBtn');
    if(logoutBtn) logoutBtn.textContent = 'خروج الموظف';
    const welcome = document.querySelector('.welcome');
    if(welcome && !document.getElementById('ssoBadge')){
      const badge = document.createElement('div');
      badge.id = 'ssoBadge';
      badge.className = 'sso-badge';
      badge.textContent = 'دخول موظف من TrendOS بدون تفعيل هاتف';
      welcome.querySelector('div')?.appendChild(badge);
    }
  }
}

function selectTemplate(id){
  state.template = id;
  state.order = null;
  qsa('.template').forEach(b=>b.classList.toggle('active', b.dataset.template === id));
  refreshPhotosForTemplate();
  renderPhotoList();
}

function refreshPhotosForTemplate(){
  const tpl = templates[state.template] || templates['6x9'];
  state.photos.forEach(p=>{
    const img = p.img;
    if(!img) return;
    if(p.autoRotated){
      p.rotation = shouldRotate(img, tpl) ? 90 : 0;
      p.autoRotated = p.rotation !== 0;
    }
    p.quality = getPhotoQuality(img, tpl, p.rotation);
  });
  updateQualitySummary();
}

function selectCutMode(mode){
  state.cutMode = mode || 'manual';
  if(!state.isEmployee){
    if(state.cutMode === 'zero'){
      state.strokeMode = 'black';
      state.strokeWidthMm = 0.35;
    }else{
      state.strokeMode = 'none';
    }
  }
  syncCutControls();
  invalidateCurrentSheets('تم تغيير طريقة القص. اضغط جهز الشيت مرة أخرى.');
}

function syncCutControls(){
  qsa('.cut-chip').forEach(btn=>btn.classList.toggle('active', btn.dataset.cutMode === state.cutMode));
  updateLaserCutButton();
}

function toggleRepeatSingle(){
  if(state.photos.length !== 1){
    state.repeatSingle = false;
    updateRepeatButton();
    $('status').textContent = 'ارفع صورة واحدة فقط لتكرارها على الشيت كله.';
    return;
  }
  state.repeatSingle = !state.repeatSingle;
  updateRepeatButton();
  invalidateCurrentSheets(state.repeatSingle ? 'تم تفعيل تكرار الصورة. اضغط جهز الشيت.' : 'تم إيقاف التكرار. اضغط جهز الشيت.');
}

function updateRepeatButton(){
  const btn = $('repeatOneBtn');
  if(!btn) return;
  btn.disabled = state.photos.length !== 1;
  btn.classList.toggle('active', state.repeatSingle && state.photos.length === 1);
  btn.textContent = state.repeatSingle && state.photos.length === 1 ? 'تكرار الصورة مفعل' : 'كرر الصورة على الشيت كله';
}

function updateLaserCutButton(){
  const btn = $('laserCutPdfBtn');
  if(!btn) return;
  const show = state.cutMode === 'laser' && state.outputs.length > 0;
  btn.classList.toggle('hidden', !show);
}

function invalidateCurrentSheets(message){
  state.order = null;
  state.outputs = [];
  state.cleanOutputs = [];
  const preview = $('preview');
  if(preview) preview.innerHTML = '';
  const downloadBtn = $('downloadBtn');
  const shareBtn = $('shareBtn');
  const laserCutPdfBtn = $('laserCutPdfBtn');
  if(downloadBtn) downloadBtn.classList.add('hidden');
  if(shareBtn) shareBtn.classList.add('hidden');
  if(laserCutPdfBtn) laserCutPdfBtn.classList.add('hidden');
  if(message && $('status')) $('status').textContent = message;
}

function getTemplateAspectRatio(){
  const tpl = templates[state.template] || templates['6x9'];
  return tpl.wCm / tpl.hCm;
}

function getPreviewFrameSize(){
  const ratio = getTemplateAspectRatio();
  const h = 150;
  const w = Math.max(80, Math.round(h * ratio));
  return { w, h };
}

function ensurePhotoDefaults(photo){
  if(typeof photo.offsetX !== 'number') photo.offsetX = 0;
  if(typeof photo.offsetY !== 'number') photo.offsetY = 0;
  if(typeof photo.zoom !== 'number' || !isFinite(photo.zoom)) photo.zoom = 1;
  if(typeof photo.rotation !== 'number') photo.rotation = 0;
  const size = getPreviewFrameSize();
  photo.previewW = size.w;
  photo.previewH = size.h;
}

function getPhotoQuality(img, tpl, rotation=0){
  const dpi = Number(CONFIG.printDpi || CONFIG.dpi || 300);
  const r = ((Number(rotation || 0) % 360) + 360) % 360;
  const rotated90 = r === 90 || r === 270;
  const iw = rotated90 ? (img.naturalHeight || img.height) : (img.naturalWidth || img.width);
  const ih = rotated90 ? (img.naturalWidth || img.width) : (img.naturalHeight || img.height);
  const needW = Math.round((tpl.wCm || 6) * CM_TO_IN * dpi);
  const needH = Math.round((tpl.hCm || 9) * CM_TO_IN * dpi);
  const ratio = Math.min(iw / needW, ih / needH);
  if(ratio >= 0.9) return { level:'ok', text:'جودة ممتازة', ratio };
  if(ratio >= 0.65) return { level:'warn', text:'جودة مقبولة', ratio };
  return { level:'bad', text:'جودة ضعيفة', ratio };
}

async function detectFacesSafe(img){
  if(!('FaceDetector' in window)) return [];
  try{
    const detector = new FaceDetector({ fastMode:true, maxDetectedFaces:10 });
    const faces = await detector.detect(img);
    return Array.isArray(faces) ? faces.map(face=>face.boundingBox).filter(Boolean) : [];
  }catch(e){
    return [];
  }
}

function updateQualitySummary(){
  const box = $('qualitySummary');
  if(!box) return;
  const total = state.photos.length;
  if(!total){
    box.textContent = 'الصور الأصلية تعطي أفضل طباعة. البرنامج سيفحص الجودة والتدوير تلقائيًا.';
    return;
  }
  const weak = state.photos.filter(p=>p.quality?.level === 'bad').length;
  const rotated = state.photos.filter(p=>p.autoRotated).length;
  const faces = state.photos.filter(p=>p.hasFaces).length;
  const parts = [`تم فحص ${total} صورة`];
  if(rotated) parts.push(`تدوير ${rotated} تلقائيًا`);
  if(faces) parts.push(`كشف وجوه في ${faces}`);
  if(weak) parts.push(`${weak} جودة ضعيفة`);
  box.textContent = parts.join(' - ');
  box.classList.toggle('quality-warning', weak > 0);
}


async function handleFiles(e){
  const files = [...e.target.files];
  state.order = null;
  const status = $('status');
  if(status) status.textContent = 'جاري فحص الصور وضبطها تلقائيًا...';
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const tpl = templates[state.template] || templates['6x9'];
    const autoRotate = shouldRotate(img, tpl) ? 90 : 0;
    const quality = getPhotoQuality(img, tpl, autoRotate);
    const faces = await detectFacesSafe(img).catch(()=>[]);
    state.photos.push({
      file,
      url,
      name:file.name,
      img,
      rotation:autoRotate,
      autoRotated:autoRotate !== 0,
      offsetX:0,
      offsetY:0,
      zoom:1,
      quality,
      faces,
      hasFaces: faces.length > 0
    });
  }
  updateQualitySummary();
  if(state.photos.length !== 1) state.repeatSingle = false;
  updateRepeatButton();
  invalidateCurrentSheets('');
  renderPhotoList();
  if(status) status.textContent = state.photos.length ? 'تم فحص الصور. اضغط جهز الشيت.' : '';
}

function clearPhotos(){
  state.photos.forEach(p=>URL.revokeObjectURL(p.url));
  [...state.outputs, ...state.cleanOutputs].forEach(o=>URL.revokeObjectURL(o.url));
  state.photos = []; state.outputs = []; state.cleanOutputs = []; state.order = null;
  state.repeatSingle = false;
  $('preview').innerHTML = ''; $('fileInput').value = '';
  $('downloadBtn').classList.add('hidden'); $('shareBtn').classList.add('hidden');
  $('laserCutPdfBtn')?.classList.add('hidden');
  updateRepeatButton();
  renderPhotoList();
}

function renderPhotoList(){
  const list = $('photoList');
  list.innerHTML = '';

  state.photos.forEach((p, index)=>{
    ensurePhotoDefaults(p);

    const size = getPreviewFrameSize();

    const card = document.createElement('div');
    card.className = 'photo-card adjustable-card' + (p.quality?.level === 'bad' ? ' needs-review' : '');
    const meta = [
      p.quality?.text || '',
      p.autoRotated ? 'تدوير تلقائي' : '',
      p.hasFaces ? 'وجه محفوظ' : ''
    ].filter(Boolean).join(' - ');
    card.innerHTML = `
      <div class="adjust-box" data-index="${index}" style="width:${size.w}px;height:${size.h}px;">
        <canvas class="adjust-canvas" width="${size.w}" height="${size.h}"></canvas>
      </div>

      <div class="photo-meta ${p.quality?.level === 'bad' ? 'photo-warning' : 'photo-ok'}">${meta || 'جاهزة'}</div>

      <div class="zoom-controls">
        <button type="button" class="zoom-btn zoom-in">+</button>
        <input type="range" class="zoom-slider" min="1" max="3" step="0.01" value="${p.zoom}">
        <button type="button" class="zoom-btn zoom-out">−</button>
      </div>

      <div class="zoom-readout">التكبير: <span class="zoom-value">${Math.round(p.zoom * 100)}%</span></div>

      <div class="adjust-actions">
        <button type="button" class="rotate-btn">تدوير 90°</button>
        <button type="button" class="reset-btn">توسيط</button>
        <button type="button" class="fill-btn">ملء المقاس</button>
      </div>

      <div class="drag-hint">الصورة تبدأ كاملة بدون قص. اسحب الصورة بالماوس أو بالإصبع، واستخدم الزوم قبل إنشاء الشيت.</div>
    `;

    const box = card.querySelector('.adjust-box');
    const canvas = card.querySelector('.adjust-canvas');
    const ctx = canvas.getContext('2d');
    const slider = card.querySelector('.zoom-slider');
    const zoomValue = card.querySelector('.zoom-value');
    const zoomInBtn = card.querySelector('.zoom-in');
    const zoomOutBtn = card.querySelector('.zoom-out');
    const rotateBtn = card.querySelector('.rotate-btn');
    const resetBtn = card.querySelector('.reset-btn');

    p.previewW = size.w;
    p.previewH = size.h;

    let previewImage = null;

    function drawPreview(){
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if(previewImage){
        drawImageSmart(
          ctx,
          previewImage,
          { x:0, y:0, w:canvas.width, h:canvas.height },
          p.rotation,
          p
        );
      }

      slider.value = String(p.zoom);
      zoomValue.textContent = `${Math.round(p.zoom * 100)}%`;

      try{
        p.adjustedDataUrl = canvas.toDataURL('image/png');
      }catch(e){}
    }

    function invalidateSheets(){
      invalidateCurrentSheets('تم تعديل الصورة. اضغط جهز الشيت مرة أخرى.');
    }

    Promise.resolve(p.img || loadImage(p.url)).then((img)=>{
      previewImage = img;
      p.img = img;
      drawPreview();
    }).catch(()=>{
      ctx.fillStyle = '#ef4444';
      ctx.font = '13px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('تعذر تحميل الصورة', canvas.width/2, canvas.height/2);
    });

    // ===== Zoom buttons =====
    zoomInBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      p.zoom = Math.min(3, +(Number(p.zoom || 1) + 0.1).toFixed(2));
      drawPreview();
      invalidateSheets();
    });

    zoomOutBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      p.zoom = Math.max(1, +(Number(p.zoom || 1) - 0.1).toFixed(2));
      drawPreview();
      invalidateSheets();
    });

    slider.addEventListener('input', function(ev){
      ev.preventDefault();
      p.zoom = Math.max(1, Math.min(3, Number(slider.value || 1)));
      drawPreview();
    });

    slider.addEventListener('change', function(){
      invalidateSheets();
    });

    // ===== Rotate / reset =====
    rotateBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      p.rotation = (Number(p.rotation || 0) + 90) % 360;
      p.offsetX = 0;
      p.offsetY = 0;
      drawPreview();
      invalidateSheets();
    });

    resetBtn.addEventListener('click', function(ev){
      ev.preventDefault();
      ev.stopPropagation();
      p.offsetX = 0;
      p.offsetY = 0;
      p.zoom = 1;
      drawPreview();
      invalidateSheets();
    });

    const fillBtn = card.querySelector('.fill-btn');
    if(fillBtn){
      fillBtn.addEventListener('click', function(ev){
        ev.preventDefault();
        ev.stopPropagation();
        p.offsetX = 0;
        p.offsetY = 0;
        p.zoom = getRequiredFillZoom(p);
        drawPreview();
        invalidateSheets();
      });
    }

    // ===== Drag mouse/touch =====
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let baseX = 0;
    let baseY = 0;

    function beginDrag(clientX, clientY){
      dragging = true;
      startX = clientX;
      startY = clientY;
      baseX = Number(p.offsetX || 0);
      baseY = Number(p.offsetY || 0);
      box.classList.add('dragging');
    }

    function updateDrag(clientX, clientY){
      if(!dragging) return;
      p.offsetX = baseX + (clientX - startX);
      p.offsetY = baseY + (clientY - startY);
      drawPreview();
    }

    function finishDrag(){
      if(!dragging) return;
      dragging = false;
      box.classList.remove('dragging');
      invalidateSheets();
    }

    box.addEventListener('mousedown', function(ev){
      ev.preventDefault();
      beginDrag(ev.clientX, ev.clientY);
    });

    window.addEventListener('mousemove', function(ev){
      if(!dragging) return;
      ev.preventDefault();
      updateDrag(ev.clientX, ev.clientY);
    });

    window.addEventListener('mouseup', function(){
      finishDrag();
    });

    box.addEventListener('touchstart', function(ev){
      if(!ev.touches || !ev.touches.length) return;
      ev.preventDefault();
      const t = ev.touches[0];
      beginDrag(t.clientX, t.clientY);
    }, { passive:false });

    box.addEventListener('touchmove', function(ev){
      if(!dragging || !ev.touches || !ev.touches.length) return;
      ev.preventDefault();
      const t = ev.touches[0];
      updateDrag(t.clientX, t.clientY);
    }, { passive:false });

    box.addEventListener('touchend', function(ev){
      ev.preventDefault();
      finishDrag();
    }, { passive:false });

    box.addEventListener('touchcancel', function(){
      finishDrag();
    });

    list.appendChild(card);
  });
}

function getPointerPoint(ev){
  if(ev.touches && ev.touches.length){
    return { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
  }
  if(ev.changedTouches && ev.changedTouches.length){
    return { x: ev.changedTouches[0].clientX, y: ev.changedTouches[0].clientY };
  }
  return { x: ev.clientX, y: ev.clientY };
}

async function autoRotateAll(){
  const tpl = templates[state.template];
  for(const p of state.photos){
    const img = p.img || await loadImage(p.url);
    p.img = img;
    p.rotation = shouldRotate(img, tpl) ? 90 : 0;
    p.autoRotated = p.rotation !== 0;
    p.quality = getPhotoQuality(img, tpl, p.rotation);
  }
  updateQualitySummary();
  invalidateCurrentSheets('تم تدوير الصور حسب المقاس المختار.');
  renderPhotoList();
}

function shouldRotate(img, tpl){ const imgPortrait = img.naturalHeight >= img.naturalWidth; const slotPortrait = tpl.hCm >= tpl.wCm; return imgPortrait !== slotPortrait; }

async function generateSheets(){
  if(state.photos.length === 0){
    $('status').textContent = 'ارفع الصور أولاً.';
    return;
  }

  $('status').textContent = 'جاري إنشاء الشيتات بجودة طباعة 300DPI...';
  await new Promise(resolve => setTimeout(resolve, 200));
  $('preview').innerHTML = '';
  state.outputs = [];
  state.cleanOutputs = [];
  state.order = null;

  state.outputs = await buildOutputs(true);

  state.outputs.forEach(o=>{
    const box = document.createElement('div');
    box.className = 'sheet-preview';

    // نعرض Canvas مصغر بدل img عشان بعض المتصفحات كانت بتعرض الشيت كصورة سوداء.
    const viewCanvas = document.createElement('canvas');
    const maxW = 280;
    const ratio = o.canvas.height / o.canvas.width;
    viewCanvas.width = maxW;
    viewCanvas.height = Math.round(maxW * ratio);

    const vctx = viewCanvas.getContext('2d');
    vctx.fillStyle = '#ffffff';
    vctx.fillRect(0, 0, viewCanvas.width, viewCanvas.height);
    vctx.imageSmoothingEnabled = true;
    vctx.imageSmoothingQuality = 'high';
    vctx.drawImage(o.canvas, 0, 0, viewCanvas.width, viewCanvas.height);
    viewCanvas.addEventListener('click', () => openFullPreview(o.url));

    const link = document.createElement('a');
    link.download = o.name;
    link.href = o.url;
    link.textContent = `تحميل معاينة ${o.name}`;

    box.appendChild(viewCanvas);
    box.appendChild(link);
    $('preview').appendChild(box);
  });

  $('status').textContent = `تم إنشاء ${state.outputs.length} شيت معاينة. النسخة النظيفة PNG 300DPI تُجهز عند التحميل أو الإرسال.`;
  $('downloadBtn').classList.remove('hidden');
  $('shareBtn').classList.remove('hidden');
  updateLaserCutButton();
}

function openFullPreview(url){
  const backdrop = document.createElement('div');
  backdrop.className = 'full-preview';
  backdrop.innerHTML = `
    <button type="button" class="full-close">إغلاق</button>
    <img src="${url}" alt="معاينة الشيت">
  `;
  document.body.appendChild(backdrop);
  backdrop.querySelector('.full-close').onclick = () => backdrop.remove();
  backdrop.addEventListener('click', (ev)=>{ if(ev.target === backdrop) backdrop.remove(); });
}

async function downloadLaserCutPdf(){
  if(state.cutMode !== 'laser'){
    $('status').textContent = 'اختار وضع ليزر أولا ثم جهز الشيت.';
    return;
  }

  if(state.photos.length === 0){
    $('status').textContent = 'ارفع الصور أولا.';
    return;
  }

  const tpl = templates[state.template];
  const groups = getOutputPhotoGroups(tpl);
  if(!groups.length){
    $('status').textContent = 'لا توجد شيتات جاهزة لملف الليزر.';
    return;
  }

  try{
    $('status').textContent = 'جاري تجهيز PDF قص الليزر لكوريل...';
    const canvases = groups.map(group => drawLaserCutSheet(group, tpl));
    const widthMm = (tpl.sheetWidthCm || CONFIG.sheetWidthCm || 29.7) * 10;
    const heightMm = (tpl.sheetHeightCm || CONFIG.sheetHeightCm || 45) * 10;
    const fileName = `TrendMall_MatbagyBanha_LaserCut_${cleanFilePart(tpl.label)}_${getTimestampForFile()}.pdf`;

    if(window.jspdf && window.jspdf.jsPDF){
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({
        orientation: heightMm >= widthMm ? 'portrait' : 'landscape',
        unit: 'mm',
        format: [widthMm, heightMm],
        compress: false
      });

      canvases.forEach((canvas, index)=>{
        if(index > 0) pdf.addPage([widthMm, heightMm], heightMm >= widthMm ? 'portrait' : 'landscape');
        pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, widthMm, heightMm, undefined, 'NONE');
      });

      pdf.save(fileName);
      $('status').textContent = 'تم تنزيل PDF قص الليزر. افتحه في كوريل واعمل Trace.';
      return;
    }

    canvases.forEach((canvas, index)=>{
      const a = document.createElement('a');
      a.href = canvas.toDataURL('image/png');
      a.download = fileName.replace('.pdf', `_Sheet_${String(index+1).padStart(2,'0')}.png`);
      document.body.appendChild(a);
      a.click();
      a.remove();
    });
    $('status').textContent = 'مكتبة PDF غير متاحة، تم تنزيل PNG أبيض/أسود بديل.';
  }catch(e){
    console.error(e);
    $('status').textContent = e.message || 'تعذر تجهيز ملف قص الليزر.';
  }
}

async function buildOutputs(withWatermark){
  const tpl = templates[state.template];
  const chunks = getOutputPhotoGroups(tpl);
  const outputs = [];

  for(let i=0; i<chunks.length; i++){
    const canvas = await drawSheet(chunks[i], tpl, withWatermark);

    let blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
    let url = '';

    if(blob){
      blob = await addPngDpiMetadata(blob, Number(CONFIG.printDpi || 300));
      url = URL.createObjectURL(blob);
    }else{
      url = canvas.toDataURL('image/png');
      blob = await dataUrlToBlob(url);
      blob = await addPngDpiMetadata(blob, Number(CONFIG.printDpi || 300));
      url = URL.createObjectURL(blob);
    }

    const suffix = withWatermark ? '_Preview_Watermark' : '_CLEAN_HD_300DPI_Print';
    const stamp = getTimestampForFile();
    const orderPart = state.order?.orderId ? cleanFilePart(state.order.orderId) + '_' : '';
    const name = `${orderPart}TrendMall_MatbagyBanha_${cleanFilePart(tpl.label)}_Sheet_${String(i+1).padStart(3,'0')}${suffix}_${stamp}.png`;

    outputs.push({ blob, url, name, canvas });
  }

  return outputs;
}

function getOutputPhotoGroups(tpl){
  if(state.repeatSingle && state.photos.length === 1){
    return [Array.from({ length: tpl.count }, () => state.photos[0])];
  }
  return chunk(state.photos, tpl.count);
}

function dataUrlToBlob(dataUrl){
  const parts = dataUrl.split(',');
  const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
  const bin = atob(parts[1]);
  const len = bin.length;
  const arr = new Uint8Array(len);
  for(let i=0; i<len; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type:mime });
}



/*
  يضيف pHYs metadata داخل ملف PNG حتى برامج الطباعة تقرأه 300DPI بدل 72DPI.
  حجم البكسلات هو الأساس، لكن هذه البيانات تمنع برامج كثيرة من فتح الملف بمقاس طباعة غلط.
*/
async function addPngDpiMetadata(blob, dpi = 300){
  try{
    if(!blob || blob.type !== 'image/png') return blob;

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const sig = [137,80,78,71,13,10,26,10];

    for(let i=0; i<sig.length; i++){
      if(bytes[i] !== sig[i]) return blob;
    }

    const ppm = Math.round(Number(dpi || 300) / 0.0254);
    const data = new Uint8Array(9);
    writeUint32BE(data, 0, ppm);
    writeUint32BE(data, 4, ppm);
    data[8] = 1; // meter

    const physChunk = makePngChunk('pHYs', data);

    let offset = 8;
    let insertAt = -1;
    let existingStart = -1;
    let existingEnd = -1;

    while(offset + 8 <= bytes.length){
      const len = readUint32BE(bytes, offset);
      const type = String.fromCharCode(bytes[offset+4], bytes[offset+5], bytes[offset+6], bytes[offset+7]);
      const chunkStart = offset;
      const chunkEnd = offset + 12 + len;

      if(type === 'IHDR') insertAt = chunkEnd;
      if(type === 'pHYs'){
        existingStart = chunkStart;
        existingEnd = chunkEnd;
        break;
      }
      if(type === 'IDAT' && insertAt > -1) break;

      offset = chunkEnd;
    }

    let out;
    if(existingStart >= 0){
      out = concatUint8(
        bytes.slice(0, existingStart),
        physChunk,
        bytes.slice(existingEnd)
      );
    }else if(insertAt >= 0){
      out = concatUint8(
        bytes.slice(0, insertAt),
        physChunk,
        bytes.slice(insertAt)
      );
    }else{
      return blob;
    }

    return new Blob([out], { type:'image/png' });
  }catch(e){
    console.warn('تعذر إضافة بيانات DPI للـ PNG:', e);
    return blob;
  }
}

function makePngChunk(type, data){
  const typeBytes = new TextEncoder().encode(type);
  const out = new Uint8Array(12 + data.length);
  writeUint32BE(out, 0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  const crcInput = new Uint8Array(typeBytes.length + data.length);
  crcInput.set(typeBytes, 0);
  crcInput.set(data, typeBytes.length);
  writeUint32BE(out, 8 + data.length, pngCrc32(crcInput));
  return out;
}

function readUint32BE(arr, offset){
  return ((arr[offset] << 24) | (arr[offset+1] << 16) | (arr[offset+2] << 8) | arr[offset+3]) >>> 0;
}

function writeUint32BE(arr, offset, value){
  value = Number(value) >>> 0;
  arr[offset] = (value >>> 24) & 255;
  arr[offset+1] = (value >>> 16) & 255;
  arr[offset+2] = (value >>> 8) & 255;
  arr[offset+3] = value & 255;
}

function concatUint8(){
  const arrays = Array.from(arguments);
  const total = arrays.reduce((sum, a) => sum + a.length, 0);
  const out = new Uint8Array(total);
  let pos = 0;
  arrays.forEach(a => { out.set(a, pos); pos += a.length; });
  return out;
}

let __pngCrcTable = null;
function pngCrc32(bytes){
  if(!__pngCrcTable){
    __pngCrcTable = [];
    for(let n=0; n<256; n++){
      let c = n;
      for(let k=0; k<8; k++){
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
      __pngCrcTable[n] = c >>> 0;
    }
  }

  let c = 0xffffffff;
  for(let i=0; i<bytes.length; i++){
    c = __pngCrcTable[(c ^ bytes[i]) & 255] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}



async function drawSheet(photos, tpl, withWatermark=true){
  // v105: جودة طباعة حقيقية. الشيت النهائي يرسم من الصورة الأصلية، وليس من معاينة صغيرة.
  const dpi = Number(CONFIG.printDpi || CONFIG.dpi || 300);
  const W = Math.round((tpl.sheetWidthCm || CONFIG.sheetWidthCm || 29.7) * CM_TO_IN * dpi);
  const H = Math.round((tpl.sheetHeightCm || CONFIG.sheetHeightCm || 45) * CM_TO_IN * dpi);
  const gap = Math.round((getEffectiveGapMm(tpl) / 10) * CM_TO_IN * dpi);
  const margin = Math.round(((tpl.outerMarginMm ?? CONFIG.outerMarginMm ?? 0) / 10) * CM_TO_IN * dpi);
  const stroke = getStrokeSettings(dpi);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;

  const ctx = c.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const rects = getRects(tpl, W, H, gap, margin);

  for(let i=0; i<Math.min(photos.length, rects.length); i++){
    const rect = rects[i];
    const photo = photos[i];

    try{
      const img = photo.img || await loadImage(photo.url);
      photo.img = img;

      // لو القالب نفسه محتاج 3 صور مقلوبة في 7×10، نحافظ على ذلك فقط.
      const rotation = rect.forceRotate ? 90 : Number(photo.rotation || 0);

      drawImageSmart(ctx, img, rect, rotation, photo);

      drawCutStroke(ctx, rect, stroke);
    }catch(err){
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = Math.max(1, Math.round(dpi/180));
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
      ctx.fillStyle = '#64748b';
      ctx.font = `${Math.round(dpi*0.08)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('تعذر تحميل الصورة', rect.x + rect.w/2, rect.y + rect.h/2);
    }
  }

  if(state.cutMode === 'laser'){
    drawLaserSheetCornerMarks(ctx, W, H, dpi, margin);
  }

  // Watermark disabled in v109
  // // Watermark disabled in v110

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.round(dpi*0.065)}px sans-serif`;
  ctx.textAlign='left';
  ctx.fillText('Matbagy Banha - Trend Mall', Math.max(8, margin), H - Math.max(8, margin/2));

  return c;
}

function drawLaserCutSheet(photos, tpl){
  const dpi = Number(CONFIG.printDpi || CONFIG.dpi || 300);
  const W = Math.round((tpl.sheetWidthCm || CONFIG.sheetWidthCm || 29.7) * CM_TO_IN * dpi);
  const H = Math.round((tpl.sheetHeightCm || CONFIG.sheetHeightCm || 45) * CM_TO_IN * dpi);
  const gap = Math.round((getEffectiveGapMm(tpl) / 10) * CM_TO_IN * dpi);
  const margin = Math.round(((tpl.outerMarginMm ?? CONFIG.outerMarginMm ?? 0) / 10) * CM_TO_IN * dpi);
  const safeInset = Math.max(1, Math.round((0.25 / 10) * CM_TO_IN * dpi));

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;

  const ctx = c.getContext('2d', { alpha:false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const rects = getRects(tpl, W, H, gap, margin);
  ctx.fillStyle = '#000000';

  for(let i=0; i<Math.min(photos.length, rects.length); i++){
    const rect = rects[i];
    const x = rect.x + safeInset;
    const y = rect.y + safeInset;
    const w = Math.max(1, rect.w - safeInset*2);
    const h = Math.max(1, rect.h - safeInset*2);

    ctx.fillRect(x, y, w, h);
  }

  drawLaserSheetCornerMarks(ctx, W, H, dpi, margin);

  return c;
}

function drawLaserSheetCornerMarks(ctx, W, H, dpi, margin){
  // علامات ضبط الليزر داخل الشيت نفسه: أكبر ومؤمنة للداخل عشان بعض الطابعات بتاكل قرابة 1 سم من الأطراف.
  const size = Math.max(24, Math.round((6 / 10) * CM_TO_IN * dpi));
  const inset = Math.max(Math.round((12 / 10) * CM_TO_IN * dpi), Math.round(margin || 0));
  const marks = [
    { x: inset, y: inset },
    { x: W - inset - size, y: inset },
    { x: inset, y: H - inset - size },
    { x: W - inset - size, y: H - inset - size }
  ];

  ctx.save();
  ctx.fillStyle = '#000000';
  marks.forEach(m=>{
    const mx = Math.max(0, Math.min(W - size, Math.round(m.x)));
    const my = Math.max(0, Math.min(H - size, Math.round(m.y)));
    ctx.fillRect(mx, my, size, size);
  });
  ctx.restore();
}

function getEffectiveGapMm(tpl){
  if(state.cutMode === 'zero') return 0;
  if(state.cutMode === 'laser') return Number(tpl.laserGapMm ?? CONFIG.laserGapMm ?? 2.5);
  return Number(tpl.gapMm ?? CONFIG.manualGapMm ?? CONFIG.gapMm ?? 1);
}

function getStrokeSettings(dpi){
  const mode = state.strokeMode || 'none';
  if(mode === 'none') return { enabled:false, color:'#ffffff', width:Math.max(1, Math.round(dpi/180)) };
  const color = mode === 'black' ? '#111111' : mode === 'white' ? '#ffffff' : (state.strokeColor || '#111111');
  const width = Math.max(1, Math.round((Number(state.strokeWidthMm || 0.4) / 10) * CM_TO_IN * dpi));
  return { enabled:true, color, width };
}

function drawCutStroke(ctx, rect, stroke){
  if(stroke.enabled){
    ctx.save();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.strokeRect(rect.x + stroke.width/2, rect.y + stroke.width/2, rect.w - stroke.width, rect.h - stroke.width);
    ctx.restore();
    return;
  }

  if(state.cutMode === 'zero') return;

  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  ctx.restore();
}

function drawWatermark(ctx, W, H){
  ctx.save();
  ctx.globalAlpha = 0.20;
  ctx.fillStyle = '#0f766e';
  ctx.textAlign = 'center';
  ctx.font = `${Math.round(W/12)}px sans-serif`;
  ctx.translate(W/2, H/2);
  ctx.rotate(-0.45);
  ctx.fillText('مطبعجي بنها', 0, -40);
  ctx.font = `${Math.round(W/24)}px sans-serif`;
  ctx.fillText('معاينة', 0, 70);
  ctx.restore();
}

function getRects(tpl, W, H, gap, margin){
  if(tpl.exactSize && tpl.cols && tpl.rows){
    const sheetW = Number(tpl.sheetWidthCm || CONFIG.sheetWidthCm || 29.7);
    const sheetH = Number(tpl.sheetHeightCm || CONFIG.sheetHeightCm || 45);
    const cellW = (Number(tpl.wCm) / sheetW) * W;
    const cellH = (Number(tpl.hCm) / sheetH) * H;
    const gridW = cellW*tpl.cols + gap*(tpl.cols-1);
    const gridH = cellH*tpl.rows + gap*(tpl.rows-1);
    const startX = Math.max(margin, (W - gridW) / 2);
    const startY = Math.max(margin, (H - gridH) / 2);
    const rects = [];
    for(let r=0; r<tpl.rows; r++){
      for(let col=0; col<tpl.cols; col++){
        rects.push({x:Math.round(startX+col*(cellW+gap)), y:Math.round(startY+r*(cellH+gap)), w:Math.round(cellW), h:Math.round(cellH)});
      }
    }
    return rects;
  }

  if(tpl.mode === 'grid'){
    const cols = tpl.cols, rows = tpl.rows;
    const availW = W - margin*2 - gap*(cols-1); const availH = H - margin*2 - gap*(rows-1); const ratio = tpl.wCm / tpl.hCm;
    let cellW = availW / cols; let cellH = cellW / ratio;
    if(cellH * rows > availH){ cellH = availH / rows; cellW = cellH * ratio; }
    const gridW = cellW*cols + gap*(cols-1); const gridH = cellH*rows + gap*(rows-1);
    const startX = (W - gridW) / 2; const startY = (H - gridH) / 2; const rects=[];
    for(let r=0;r<rows;r++) for(let col=0;col<cols;col++) rects.push({x:Math.round(startX+col*(cellW+gap)), y:Math.round(startY+r*(cellH+gap)), w:Math.round(cellW), h:Math.round(cellH)});
    return rects;
  }
  const ratioP = tpl.wCm / tpl.hCm, ratioL = tpl.hCm / tpl.wCm; const availW = W - margin*2, availH = H - margin*2;
  let pW = (availW - gap*3) / 4, pH = pW / ratioP, lW = (availW - gap*2) / 3, lH = lW / ratioL;
  const totalH = pH*4 + gap*4 + lH; if(totalH > availH){ const scale = availH / totalH; pW*=scale; pH*=scale; lW*=scale; lH*=scale; }
  const rects=[]; const portraitW = pW*4 + gap*3; const fullH = pH*4 + gap*4 + lH; const startX = (W - portraitW)/2; const startY = (H - fullH)/2;
  for(let r=0;r<4;r++) for(let col=0;col<4;col++) rects.push({x:Math.round(startX+col*(pW+gap)), y:Math.round(startY+r*(pH+gap)), w:Math.round(pW), h:Math.round(pH)});
  const landW = lW*3 + gap*2; const lStartX = (W - landW)/2; const lY = startY + pH*4 + gap*4;
  for(let col=0;col<3;col++) rects.push({x:Math.round(lStartX+col*(lW+gap)), y:Math.round(lY), w:Math.round(lW), h:Math.round(lH), forceRotate:true});
  return rects;
}

function computeBestLayout({sheetW, sheetH, itemW, itemH, gapMm=1, marginMm=2}){
  const gapCm = Number(gapMm || 0) / 10;
  const marginCm = Number(marginMm || 0) / 10;
  const usableW = Math.max(0, Number(sheetW) - marginCm*2);
  const usableH = Math.max(0, Number(sheetH) - marginCm*2);
  const tries = [
    {w:Number(itemW), h:Number(itemH), rotated:false},
    {w:Number(itemH), h:Number(itemW), rotated:true}
  ];
  let best = null;

  tries.forEach(t=>{
    if(!t.w || !t.h || !usableW || !usableH) return;
    const cols = Math.max(0, Math.floor((usableW + gapCm) / (t.w + gapCm)));
    const rows = Math.max(0, Math.floor((usableH + gapCm) / (t.h + gapCm)));
    const count = cols * rows;
    const usedW = cols ? cols*t.w + (cols-1)*gapCm : 0;
    const usedH = rows ? rows*t.h + (rows-1)*gapCm : 0;
    const waste = 1 - ((usedW * usedH) / (usableW * usableH || 1));
    const candidate = { cols, rows, count, rotated:t.rotated, usedW, usedH, waste };
    if(!best || candidate.count > best.count || (candidate.count === best.count && candidate.waste < best.waste)){
      best = candidate;
    }
  });

  return best || { cols:0, rows:0, count:0, rotated:false, waste:1 };
}

function readTemplateInputNumbers(){
  return {
    name: $('tplName')?.value.trim() || '',
    itemW: Number($('tplPhotoW')?.value || 0),
    itemH: Number($('tplPhotoH')?.value || 0),
    sheetW: Number($('tplSheetW')?.value || CONFIG.sheetWidthCm || 29.7),
    sheetH: Number($('tplSheetH')?.value || CONFIG.sheetHeightCm || 45),
    gapMm: Number($('tplGap')?.value || CONFIG.manualGapMm || 1)
  };
}

function previewTemplateFromInputs(){
  const v = readTemplateInputNumbers();
  const box = $('tplPreview');
  if(!v.itemW || !v.itemH){
    if(box) box.textContent = 'اكتب عرض وطول الصورة أولا.';
    return null;
  }
  const layout = computeBestLayout({
    sheetW:v.sheetW, sheetH:v.sheetH, itemW:v.itemW, itemH:v.itemH,
    gapMm:v.gapMm, marginMm:CONFIG.outerMarginMm || 2
  });
  if(box){
    box.textContent = `أفضل رص: ${layout.cols} أعمدة × ${layout.rows} صفوف = ${layout.count} قطعة${layout.rotated ? ' - مع تدوير المقاس' : ''}.`;
  }
  return { values:v, layout };
}

function saveTemplateFromInputs(){
  const result = previewTemplateFromInputs();
  if(!result || !result.layout.count){
    alert('المقاس لا يدخل على الشيت بهذه المعطيات.');
    return;
  }
  const v = result.values;
  const layout = result.layout;
  const id = 'custom-' + Date.now();
  const tpl = {
    id,
    label: v.name || `${v.itemW}×${v.itemH}`,
    count: layout.count,
    wCm: layout.rotated ? v.itemH : v.itemW,
    hCm: layout.rotated ? v.itemW : v.itemH,
    sheetWidthCm: v.sheetW,
    sheetHeightCm: v.sheetH,
    gapMm: v.gapMm,
    outerMarginMm: CONFIG.outerMarginMm || 2,
    mode:'grid',
    cols: layout.cols,
    rows: layout.rows,
    exactSize:true
  };
  saveCustomTemplate(tpl);
  selectTemplate(id);
  $('tplPreview').textContent = `تم حفظ ${tpl.label}: ${tpl.count} على الشيت.`;
}

function getCalcGap(mode){
  if(mode === 'zero') return 0;
  if(mode === 'laser') return Number(CONFIG.laserGapMm || 2.5);
  return Number(CONFIG.manualGapMm || CONFIG.gapMm || 1);
}

function runMatbagyCalculator(){
  const productId = $('calcProduct')?.value || '';
  const product = (CONFIG.priceProducts || []).find(p=>p.id === productId) || {};
  const itemW = Number($('calcW')?.value || 0);
  const itemH = Number($('calcH')?.value || 0);
  const qty = Math.max(1, Number($('calcQty')?.value || 1));
  const cut = $('calcCut')?.value || 'manual';
  const gapMm = getCalcGap(cut);
  const layout = computeBestLayout({
    sheetW: CONFIG.sheetWidthCm || 29.7,
    sheetH: CONFIG.sheetHeightCm || 45,
    itemW,
    itemH,
    gapMm,
    marginMm: CONFIG.outerMarginMm || 2
  });
  const sheets = layout.count ? Math.ceil(qty / layout.count) : 0;
  const unit = Number(product.cutPrices?.[cut] ?? product.unitPrice ?? 0);
  const total = unit ? sheets * unit : 0;
  state.lastCalc = { product, itemW, itemH, qty, cut, gapMm, layout, sheets, total };
  const box = $('calcResult');
  if(box){
    const priceText = total ? ` - التكلفة التقريبية: ${total} جنيه` : '';
    box.textContent = layout.count
      ? `${product.name || 'منتج'}: ${layout.count} قطعة في الشيت، تحتاج ${sheets} شيت${layout.rotated ? '، والرصة الأفضل بتدوير المقاس' : ''}${priceText}.`
      : 'المقاس لا يدخل على الشيت بهذه الهوامش والفواصل.';
  }
}

function useCalcAsTemplate(){
  if(!state.lastCalc || !state.lastCalc.layout.count){
    runMatbagyCalculator();
  }
  const c = state.lastCalc;
  if(!c || !c.layout.count) return;
  const id = 'calc-' + Date.now();
  const tpl = {
    id,
    label: `${c.product.name || 'مقاس'} ${c.itemW}×${c.itemH}`,
    count: c.layout.count,
    wCm: c.layout.rotated ? c.itemH : c.itemW,
    hCm: c.layout.rotated ? c.itemW : c.itemH,
    sheetWidthCm: CONFIG.sheetWidthCm || 29.7,
    sheetHeightCm: CONFIG.sheetHeightCm || 45,
    gapMm: c.gapMm,
    outerMarginMm: CONFIG.outerMarginMm || 2,
    mode:'grid',
    cols:c.layout.cols,
    rows:c.layout.rows,
    exactSize:true
  };
  saveCustomTemplate(tpl);
  selectTemplate(id);
  $('calcResult').textContent += ' تم استخدام الحساب كمقاس للشيت.';
}

function drawImageSmart(ctx, img, rect, rotation, photo = {}){
  ctx.save();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const r = ((Number(rotation || 0) % 360) + 360) % 360;
  const rotated90 = r === 90 || r === 270;

  const originalW = Number(img.naturalWidth || img.videoWidth || img.width || 0);
  const originalH = Number(img.naturalHeight || img.videoHeight || img.height || 0);

  if(!originalW || !originalH){
    ctx.restore();
    return;
  }

  const fittedW = rotated90 ? originalH : originalW;
  const fittedH = rotated90 ? originalW : originalH;

  // Contain: الصورة كاملة بدون قص تلقائي.
  const containScale = Math.min(rect.w / fittedW, rect.h / fittedH);

  // الزوم موحد للطول والعرض، فيحافظ على النسبة الأصلية.
  const zoom = Math.max(1, Number(photo.zoom || 1));
  const scale = containScale * zoom;

  const drawW = originalW * scale;
  const drawH = originalH * scale;

  const previewW = Math.max(1, Number(photo.previewW || rect.w || 100));
  const previewH = Math.max(1, Number(photo.previewH || rect.h || 150));

  // نحول تحريك المعاينة الصغيرة إلى تحريك نسبي داخل خانة الطباعة الكبيرة.
  const offsetX = (Number(photo.offsetX || 0) / previewW) * rect.w;
  const offsetY = (Number(photo.offsetY || 0) / previewH) * rect.h;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.translate(rect.x + rect.w / 2 + offsetX, rect.y + rect.h / 2 + offsetY);
  ctx.rotate(r * Math.PI / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();
}

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();

    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('تعذر تحميل الصورة'));

    img.src = src;

    if(img.complete && (img.naturalWidth || img.width)){
      resolve(img);
    }
  });
}

function chunk(arr, n){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }
async function downloadAll(){
  if(state.photos.length === 0){
    $('status').textContent = 'ارفع الصور أولاً.';
    return;
  }

  try{
    $('status').textContent = 'جاري تجهيز ملفات الطباعة النظيفة PNG 300DPI...';
    state.cleanOutputs = await buildOutputs(false);

    state.cleanOutputs.forEach(o=>{
      const a = document.createElement('a');
      a.href = o.url;
      a.download = o.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
    });

    $('status').textContent = `تم تحميل ${state.cleanOutputs.length} ملف طباعة نظيف HD 300DPI بدون علامة مائية. أرسلها كـ Document / ملف فقط.`;
  }catch(e){
    $('status').textContent = e.message || 'حدث خطأ أثناء تجهيز ملفات الطباعة النظيفة.';
  }
}

async function ensureOrderCreated(){
  if(state.order?.orderId) return state.order;

  const client = JSON.parse(localStorage.getItem('mb_client') || '{}');
  if(!CONFIG.activationEndpoint) throw new Error('رابط النظام غير مضبوط.');

  const data = await apiGet({
    action: 'createOrder',
    phone: client.phone || '',
    customerName: client.name || '',
    customerType: client.type || '',
    template: templates[state.template].label,
    photoCount: String(state.photos.length),
    sheetCount: String(state.outputs.length)
  });

  if(!data || data.success !== true) throw new Error(data?.message || 'تعذر إنشاء الطلب.');

  state.order = data;
  return data;
}


function getRequiredFillZoom(photo){
  const tpl = templates[state.template] || templates['6x9'];
  const frameRatio = tpl.wCm / tpl.hCm;
  const img = photo.img;
  if(!img) return 1.01;

  const r = ((Number(photo.rotation || 0) % 360) + 360) % 360;
  const rotated90 = r === 90 || r === 270;
  const iw = rotated90 ? (img.naturalHeight || img.height) : (img.naturalWidth || img.width);
  const ih = rotated90 ? (img.naturalWidth || img.width) : (img.naturalHeight || img.height);
  if(!iw || !ih) return 1.01;

  const imageRatio = iw / ih;

  // zoom المطلوب لتحويل contain إلى cover بدون تمديد.
  let zoom = 1;
  if(imageRatio > frameRatio){
    // الصورة أعرض من الخانة: تحتاج تكبير حسب الارتفاع.
    zoom = imageRatio / frameRatio;
  }else{
    // الصورة أطول من الخانة: تحتاج تكبير حسب العرض.
    zoom = frameRatio / imageRatio;
  }

  return Math.max(1, Math.min(3, +(zoom + 0.01).toFixed(2)));
}

function getTimestampForFile(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}${m}${day}_${h}${min}`;
}

function cleanFilePart(value){
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9_.-]/g, '')
    .slice(0, 80);
}

function getReviewSummaryText(){
  const tpl = templates[state.template];
  const sheetCount = Math.ceil(state.photos.length / tpl.count);
  const client = JSON.parse(localStorage.getItem('mb_client') || '{}');

  return {
    clientName: client.name || 'عميل',
    clientPhone: client.phone || '',
    templateLabel: tpl.label,
    photoCount: state.photos.length,
    sheetCount,
    quality: 'HD 300DPI',
    output: 'نسخة نظيفة بدون Watermark',
    source: 'مطبعجي بنها - ترند مول'
  };
}

function showSendReviewModal(){
  if(state.reviewOpen) return Promise.resolve(false);
  state.reviewOpen = true;

  return new Promise((resolve)=>{
    const s = getReviewSummaryText();

    const backdrop = document.createElement('div');
    backdrop.className = 'review-backdrop';

    backdrop.innerHTML = `
      <div class="review-modal">
        <h3>مراجعة الطلب قبل الإرسال</h3>

        <div class="review-summary">
          <div><b>العميل:</b> ${s.clientName}</div>
          <div><b>رقم العميل:</b> ${s.clientPhone}</div>
          <div><b>القالب:</b> ${s.templateLabel}</div>
          <div><b>عدد الصور:</b> ${s.photoCount}</div>
          <div><b>عدد الشيتات:</b> ${s.sheetCount}</div>
          <div><b>الجودة:</b> ${s.quality}</div>
          <div><b>الإخراج:</b> ${s.output}</div>
        </div>

        <div class="review-warning">
          مهم: لو ظهرت حواف بيضاء في المعاينة، استخدم الزوم والتحريك أو زر "ملء المقاس".
          زر ملء المقاس قد يسبب قص جزء بسيط من الصورة، لكنه يمنع الحواف البيضاء.
        </div>

        <label class="review-confirm">
          <input id="reviewOk" type="checkbox">
          <span>راجعت الصور والشيتات، وأوافق على إرسال نسخة الطباعة النظيفة HD 300DPI.</span>
        </label>

        <div class="review-actions">
          <button type="button" class="cancel">رجوع للتعديل</button>
          <button type="button" class="send">إرسال النسخة النظيفة</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const close = (value) => {
      state.reviewOpen = false;
      backdrop.remove();
      resolve(value);
    };

    backdrop.querySelector('.cancel').onclick = () => close(false);

    backdrop.querySelector('.send').onclick = () => {
      const ok = backdrop.querySelector('#reviewOk').checked;
      if(!ok){
        alert('برجاء تأكيد أنك راجعت الصور قبل الإرسال.');
        return;
      }
      close(true);
    };
  });
}

async function tryUploadCleanOutputsToBrowserEndpoint(order, outputs){
  // حل اختياري مستقبلي:
  // لو أضفت في config.js:
  // uploadEndpoint: 'رابط Apps Script أو سيرفر'
  // البرنامج هيحاول يرفع ملفات الطباعة من المتصفح.
  if(!CONFIG.uploadEndpoint) return null;

  const filesPayload = [];

  for(const o of outputs){
    const base64 = await blobToBase64(o.blob);
    filesPayload.push({
      name: o.name,
      type: o.blob.type || 'image/png',
      base64
    });
  }

  const payload = {
    action: 'uploadPrintFiles',
    orderId: order.orderId || '',
    template: templates[state.template].label,
    quality: 'HD 300DPI',
    clean: true,
    files: filesPayload
  };

  const res = await fetch(CONFIG.uploadEndpoint, {
    method:'POST',
    headers:{ 'Content-Type':'text/plain;charset=utf-8' },
    body: JSON.stringify(payload)
  });

  const data = await res.json().catch(()=>null);
  if(!data || data.success !== true){
    throw new Error(data?.message || 'فشل رفع الملفات من المتصفح.');
  }

  return data;
}

function blobToBase64(blob){
  return new Promise((resolve, reject)=>{
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}



async function buildCleanZipFile(outputs, order){
  if(!window.JSZip){
    return null;
  }

  const zip = new JSZip();

  outputs.forEach((o)=>{
    zip.file(o.name, o.blob);
  });

  const tpl = templates[state.template];
  const orderId = order?.orderId ? cleanFilePart(order.orderId) : 'NO_ORDER';
  const name = `${orderId}_TrendMall_MatbagyBanha_${cleanFilePart(tpl.label)}_${outputs.length}Sheets_CLEAN_HD_300DPI_${getTimestampForFile()}.zip`;

  const blob = await zip.generateAsync({
    type:'blob',
    compression:'DEFLATE',
    compressionOptions:{ level:6 }
  });

  return new File([blob], name, { type:'application/zip' });
}

function downloadBlobFile(file){
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(()=>URL.revokeObjectURL(url), 2000);
}


async function shareWork(){
  if(state.isSending){
    $('status').textContent = 'جاري تجهيز الإرسال بالفعل، انتظر لحظات...';
    return;
  }

  if(state.photos.length === 0){
    $('status').textContent = 'ارفع الصور أولاً.';
    return;
  }

  if(state.outputs.length === 0){
    $('status').textContent = 'اضغط إنشاء الشيتات أولًا قبل تجهيز ملف الإرسال.';
    return;
  }

  state.isSending = true;
  const shareBtn = $('shareBtn');
  const oldText = shareBtn.textContent;
  shareBtn.disabled = true;
  shareBtn.textContent = 'جاري التجهيز...';

  try{
    $('status').textContent = 'جاري تجهيز ملف الطباعة ZIP HD 300DPI...';

    const order = await ensureOrderCreated();

    // نسخة نظيفة بدون Watermark وبجودة 300DPI.
    state.cleanOutputs = await buildOutputs(false);

    const client = JSON.parse(localStorage.getItem('mb_client') || '{}');

    const text = [
      'طلب جديد من مطبعجي بنها - ترند مول ✅',
      '',
      `رقم الطلب: ${order.orderId}`,
      `العميل: ${client.name || 'عميل'}`,
      `رقم العميل: ${client.phone || ''}`,
      `نوع العميل: ${client.type || ''}`,
      `القالب: ${templates[state.template].label}`,
      `عدد الصور: ${state.photos.length}`,
      `عدد الشيتات: ${state.cleanOutputs.length}`,
      'الجودة: HD 300DPI',
      'الحالة: جاهز للطباعة',
      'الأولوية: عاجل',
      'المصدر: مطبعجي بنها - ترند مول',
      '',
      'تم تجهيز ملف ZIP يحتوي على شيتات الطباعة النظيفة بدون علامة مائية.',
      'مهم: الملف يجب إرساله كـ Document / ملف وليس كصور مضغوطة.'
    ].join('\n');

    let zipFile = null;

    if(window.JSZip){
      zipFile = await buildCleanZipFile(state.cleanOutputs, order);
    }

    if(zipFile){
      downloadBlobFile(zipFile);
      $('status').textContent = 'تم تحميل ملف ZIP. افتح واتساب وأرفق الملف كـ Document.';
    }else{
      // fallback لو JSZip لم يتم تحميله: نزّل الشيتات منفردة.
      state.cleanOutputs.forEach(o=>{
        const file = new File([o.blob], o.name, { type:'image/png' });
        downloadBlobFile(file);
      });
      $('status').textContent = 'تم تحميل ملفات الطباعة. افتح واتساب وأرفقها كـ Document.';
    }

    await new Promise(resolve => setTimeout(resolve, 700));

    alert(
      'تم تجهيز وتحميل ملف الطباعة ✅\n\n' +
      'سيتم فتح واتساب الآن.\n\n' +
      'مهم جدًا:\n' +
      'من واتساب اختر المرفقات ثم Document / مستند، وارسل ملف ZIP الذي تم تحميله.\n\n' +
      'لا ترسل الملف كصورة حتى لا تقل الجودة.'
    );

    const phone = (CONFIG.whatsappNumber || '').replace(/[^\\d]/g, '');
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;

    window.location.href = waUrl;
  }catch(e){
    console.error(e);
    $('status').textContent = e.message || 'حدث خطأ أثناء تجهيز ملف الإرسال.';
    alert('حدث خطأ أثناء تجهيز ملف الإرسال. جرّب تقليل عدد الصور أو أعد فتح التطبيق.');
  }finally{
    state.isSending = false;
    shareBtn.disabled = false;
    shareBtn.textContent = oldText;
  }
}

async function requestNotifications(){
  if(!('Notification' in window)){ alert('الإشعارات غير مدعومة على هذا الجهاز.'); return; }
  const p = await Notification.requestPermission();
  if(p === 'granted') new Notification('مطبعجي بنها', { body:'تم تفعيل الإشعارات. ستصلك العروض الجديدة هنا.' });
}

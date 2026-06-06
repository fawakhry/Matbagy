const CONFIG = window.MB_CONFIG || {};
const CM_TO_IN = 1 / 2.54;
let state = { template: '6x9', photos: [], outputs: [], cleanOutputs: [], order: null };

const FORCE_RELOGIN_VERSION = 'reset-2026-06-06-v100';

const $ = (id) => document.getElementById(id);
const qsa = (sel) => [...document.querySelectorAll(sel)];

const templates = {
  '6x9': { label:'6×9', count:25, wCm:6, hCm:9, mode:'grid', cols:5, rows:5 },
  '10x15': { label:'10×15', count:9, wCm:10, hCm:15, mode:'grid', cols:3, rows:3 },
  '7x10': { label:'7×10', count:19, wCm:7, hCm:10, mode:'mixed' }
};

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
    // إخراج كل العملاء من النسخ القديمة وإجبارهم على التفعيل من جديد
    localStorage.removeItem('mb_client');
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
    const url =
      CONFIG.activationEndpoint +
      '?action=checkSession' +
      '&phone=' + encodeURIComponent(client.phone) +
      '&deviceId=' + encodeURIComponent(deviceId);

    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();

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

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(()=>{});
  }

  bindEvents();
  injectAdjustmentStyles();

  const saved = localStorage.getItem('mb_client');

  if(saved){
    const client = JSON.parse(saved);
    const ok = await checkSavedClientOnServer(client);

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
  $('logoutBtn').addEventListener('click', () => { localStorage.removeItem('mb_client'); location.reload(); });
  $('notifyBtn').addEventListener('click', requestNotifications);
  qsa('.template').forEach(btn => btn.addEventListener('click', () => selectTemplate(btn.dataset.template)));
  $('fileInput').addEventListener('change', handleFiles);
  $('clearBtn').addEventListener('click', clearPhotos);
  $('rotateAllBtn').addEventListener('click', autoRotateAll);
  $('generateBtn').addEventListener('click', generateSheets);
  $('downloadBtn').addEventListener('click', downloadAll);
  $('shareBtn').addEventListener('click', shareWork);
}

async function activate(){
  const phone = $('activationCode').value.trim();
  const msg = $('activationMsg');
  if(!phone){ msg.textContent = 'برجاء إدخال رقم الهاتف المسجل لدى مطبعجي بنها.'; return; }
  if(!CONFIG.activationEndpoint){ msg.textContent = 'رابط التفعيل غير مضبوط. تواصل مع مطبعجي بنها.'; return; }
  msg.textContent = 'جاري التحقق من الرقم والجهاز...';

  try{
    const deviceId = getDeviceId();
    const url = CONFIG.activationEndpoint + '?phone=' + encodeURIComponent(phone) + '&deviceId=' + encodeURIComponent(deviceId);
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();
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
  $('activationView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('helloTitle').textContent = `أهلاً ${client.name || 'بك'} 👋`;
}

function selectTemplate(id){ state.template = id; state.order = null; qsa('.template').forEach(b=>b.classList.toggle('active', b.dataset.template === id)); }

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


async function handleFiles(e){
  const files = [...e.target.files];
  state.order = null;
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const rotation = 0;
    state.photos.push({ file, url, name:file.name, rotation, offsetX:0, offsetY:0 });
  }
  renderPhotoList();
}

function clearPhotos(){
  state.photos.forEach(p=>URL.revokeObjectURL(p.url));
  [...state.outputs, ...state.cleanOutputs].forEach(o=>URL.revokeObjectURL(o.url));
  state.photos = []; state.outputs = []; state.cleanOutputs = []; state.order = null;
  $('preview').innerHTML = ''; $('fileInput').value = '';
  $('downloadBtn').classList.add('hidden'); $('shareBtn').classList.add('hidden');
  renderPhotoList();
}

function renderPhotoList(){
  const list = $('photoList');
  list.innerHTML = '';

  state.photos.forEach((p, index)=>{
    ensurePhotoDefaults(p);

    const size = getPreviewFrameSize();

    const card = document.createElement('div');
    card.className = 'photo-card adjustable-card';
    card.innerHTML = `
      <div class="adjust-box" data-index="${index}" style="width:${size.w}px;height:${size.h}px;">
        <canvas class="adjust-canvas" width="${size.w}" height="${size.h}"></canvas>
      </div>

      <div class="zoom-controls">
        <button type="button" class="zoom-btn zoom-in">+</button>
        <input type="range" class="zoom-slider" min="1" max="3" step="0.01" value="${p.zoom}">
        <button type="button" class="zoom-btn zoom-out">−</button>
      </div>

      <div class="zoom-readout">التكبير: <span class="zoom-value">${Math.round(p.zoom * 100)}%</span></div>

      <div class="adjust-actions">
        <button type="button" class="rotate-btn">تدوير 90°</button>
        <button type="button" class="reset-btn">توسيط</button>
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
    }

    function invalidateSheets(){
      state.order = null;
      state.outputs = [];
      state.cleanOutputs = [];
      $('preview').innerHTML = '';
      $('downloadBtn').classList.add('hidden');
      $('shareBtn').classList.add('hidden');
      $('status').textContent = 'تم تعديل الصورة. اضغط إنشاء الشيتات مرة أخرى.';
    }

    loadImage(p.url).then((img)=>{
      previewImage = img;
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
  for(const p of state.photos){ const img = await loadImage(p.url); p.rotation = shouldRotate(img, tpl) ? 90 : 0; }
  renderPhotoList(); $('status').textContent = 'تم تدوير الصور حسب القالب المختار.';
}

function shouldRotate(img, tpl){ const imgPortrait = img.naturalHeight >= img.naturalWidth; const slotPortrait = tpl.hCm >= tpl.wCm; return imgPortrait !== slotPortrait; }

async function generateSheets(){
  if(state.photos.length === 0){ $('status').textContent = 'ارفع الصور أولاً.'; return; }
  $('status').textContent = 'جاري إنشاء شيتات المعاينة بعلامة مطبعجي بنها...';
  $('preview').innerHTML = ''; state.outputs = []; state.cleanOutputs = []; state.order = null;
  state.outputs = await buildOutputs(true);
  state.outputs.forEach(o=>{
    const box = document.createElement('div'); box.className = 'sheet-preview';
    box.innerHTML = `<img src="${o.url}"><a download="${o.name}" href="${o.url}">تحميل معاينة ${o.name}</a>`;
    $('preview').appendChild(box);
  });
  $('status').textContent = `تم إنشاء ${state.outputs.length} شيت معاينة. النسخة النظيفة تُجهز عند الإرسال لمطبعجي بنها.`;
  $('downloadBtn').classList.remove('hidden'); $('shareBtn').classList.remove('hidden');
}

async function buildOutputs(withWatermark){
  const tpl = templates[state.template];
  const chunks = chunk(state.photos, tpl.count);
  const outputs = [];
  for(let i=0; i<chunks.length; i++){
    const canvas = await drawSheet(chunks[i], tpl, withWatermark);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png', 1.0));
    const url = URL.createObjectURL(blob);
    const suffix = withWatermark ? '_Preview' : '_Print';
    const name = `Motabagy_${tpl.label}_Sheet_${String(i+1).padStart(3,'0')}${suffix}.png`;
    outputs.push({ blob, url, name });
  }
  return outputs;
}

async function drawSheet(photos, tpl, withWatermark=true){
  const dpi = CONFIG.dpi || 300;
  const W = Math.round((CONFIG.sheetWidthCm || 29.7) * CM_TO_IN * dpi);
  const H = Math.round((CONFIG.sheetHeightCm || 45) * CM_TO_IN * dpi);
  const gap = Math.round(((CONFIG.gapMm || 1) / 10) * CM_TO_IN * dpi);
  const margin = Math.round(((CONFIG.outerMarginMm || 0) / 10) * CM_TO_IN * dpi);

  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;

  const ctx = c.getContext('2d', { alpha:false });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  const rects = getRects(tpl, W, H, gap, margin);

  for(let i=0; i<Math.min(photos.length, rects.length); i++){
    const rect = rects[i];
    const photo = photos[i];

    try{
      const img = await loadImage(photo.url);
      const rotation = rect.forceRotate ? 90 : Number(photo.rotation || 0);

      drawImageSmart(ctx, img, rect, rotation, photo);

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, Math.round(dpi/180));
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
    }catch(err){
      // لو صورة فشلت، نترك مكانها أبيض ونكتب علامة بسيطة بدل ما الشيت كله يطلع أسود.
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

  if(withWatermark) drawWatermark(ctx, W, H);

  ctx.fillStyle = '#cbd5e1';
  ctx.font = `${Math.round(dpi*0.065)}px sans-serif`;
  ctx.textAlign='left';
  ctx.fillText('Powered by Matbagy Banha', Math.max(8, margin), H - Math.max(8, margin/2));

  return c;
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
  ctx.fillText('نسخة معاينة', 0, 70);
  ctx.restore();
}

function getRects(tpl, W, H, gap, margin){
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

function drawImageSmart(ctx, img, rect, rotation, photo = {}){
  ctx.save();

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  const r = ((Number(rotation || 0) % 360) + 360) % 360;
  const rotated90 = r === 90 || r === 270;

  const originalW = img.naturalWidth || img.width;
  const originalH = img.naturalHeight || img.height;

  if(!originalW || !originalH){
    ctx.restore();
    return;
  }

  const fittedW = rotated90 ? originalH : originalW;
  const fittedH = rotated90 ? originalW : originalH;

  const containScale = Math.min(rect.w / fittedW, rect.h / fittedH);
  const zoom = Math.max(1, Number(photo.zoom || 1));
  const scale = containScale * zoom;

  const drawW = originalW * scale;
  const drawH = originalH * scale;

  const previewW = Math.max(1, Number(photo.previewW || rect.w || 100));
  const previewH = Math.max(1, Number(photo.previewH || rect.h || 150));

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

    img.onload = async () => {
      try{
        if(img.decode) await img.decode().catch(()=>{});
      }catch(e){}
      resolve(img);
    };

    img.onerror = () => reject(new Error('تعذر تحميل الصورة'));

    // لا نضع crossOrigin مع blob/objectURL لأنه قد يسبب مشاكل في بعض المتصفحات.
    img.src = src;
  });
}

function chunk(arr, n){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }
function downloadAll(){ state.outputs.forEach(o=>{ const a=document.createElement('a'); a.href=o.url; a.download=o.name; a.click(); }); }

async function ensureOrderCreated(){
  if(state.order?.orderId) return state.order;
  const client = JSON.parse(localStorage.getItem('mb_client') || '{}');
  if(!CONFIG.activationEndpoint) throw new Error('رابط النظام غير مضبوط.');
  const params = new URLSearchParams({ action:'createOrder', phone:client.phone || '', customerName:client.name || '', customerType:client.type || '', template:templates[state.template].label, photoCount:String(state.photos.length), sheetCount:String(state.outputs.length) });
  const res = await fetch(CONFIG.activationEndpoint + '?' + params.toString(), { cache: 'no-store' });
  const data = await res.json();
  if(!data || data.success !== true) throw new Error(data?.message || 'تعذر إنشاء الطلب.');
  state.order = data; return data;
}

async function shareWork(){
  if(state.outputs.length === 0) return;
  try{
    $('status').textContent = 'جاري إنشاء رقم الطلب وتجهيز نسخة المطبعة...';
    const order = await ensureOrderCreated();
    state.cleanOutputs = await buildOutputs(false);
    const files = state.cleanOutputs.map(o => new File([o.blob], o.name, { type:'image/png' }));
    const client = JSON.parse(localStorage.getItem('mb_client') || '{}');
    const text = `طلب صور جديد من ${client.name || 'عميل'}\nرقم الطلب: ${order.orderId}\nرقم العميل: ${client.phone || ''}\nنوع العميل: ${client.type || ''}\nالقالب: ${templates[state.template].label}\nعدد الصور: ${state.photos.length}\nعدد الشيتات: ${state.outputs.length}`;
    $('status').textContent = `تم إنشاء رقم الطلب: ${order.orderId}`;
    if(navigator.canShare && navigator.canShare({ files })) await navigator.share({ title:'طلب صور مطبعجي بنها', text, files });
    else window.open(`https://wa.me/${CONFIG.whatsappNumber || ''}?text=${encodeURIComponent(text + '\nتم إنشاء الطلب من التطبيق. سيتم إرسال الملفات الآن.')}`, '_blank');
  }catch(e){ $('status').textContent = e.message || 'حدث خطأ أثناء إرسال الطلب.'; }
}

async function requestNotifications(){
  if(!('Notification' in window)){ alert('الإشعارات غير مدعومة على هذا الجهاز.'); return; }
  const p = await Notification.requestPermission();
  if(p === 'granted') new Notification('مطبعجي بنها', { body:'تم تفعيل الإشعارات. ستصلك العروض الجديدة هنا.' });
}

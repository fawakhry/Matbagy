const CONFIG = window.MB_CONFIG || {};
const CM_TO_IN = 1 / 2.54;
let state = { template: '6x9', photos: [], outputs: [], cleanOutputs: [], order: null };

const FORCE_RELOGIN_VERSION = 'sheets-sso-v20260709-p27-diaa-wael-4x6';

const $ = (id) => document.getElementById(id);
const qsa = (sel) => [...document.querySelectorAll(sel)];

const templates = {
  '6x9': { label:'6×9', count:25, wCm:6, hCm:9, mode:'grid', cols:5, rows:5 },
  '10x15': { label:'10×15', count:9, wCm:10, hCm:15, mode:'grid', cols:3, rows:3 },
  // 4×6 على شيت مطبعجي القديم 29.7×45 سم: 7 أعمدة × 7 صفوف = 49 صورة.
  '4x6': { label:'4×6', count:49, wCm:4, hCm:6, mode:'grid', cols:7, rows:7 },
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

async function handleFiles(e){
  const files = [...e.target.files];
  state.order = null;
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const rotation = shouldRotate(img, templates[state.template]) ? 90 : 0;
    state.photos.push({ file, url, name:file.name, rotation, offsetX:0, offsetY:0, zoom:1 });
  }
  renderPhotoList();
}

function clearPhotos(){
  state.photos.forEach(p=>URL.revokeObjectURL(p.url));
  [...state.outputs, ...state.cleanOutputs].forEach(o=>URL.revokeObjectURL(o.url));
  state.photos = []; state.outputs = []; state.cleanOutputs = []; state.order = null;
  $('preview').innerHTML = ''; $('fileInput').value = '';
  $('downloadBtn').classList.add('hidden'); $('shareBtn').classList.add('hidden');
  if($('printFileNote')) $('printFileNote').classList.add('hidden');
  renderPhotoList();
}

function renderPhotoList(){
  const list = $('photoList');
  list.innerHTML = '';

  state.photos.forEach((p, index)=>{
    if(typeof p.offsetX !== 'number') p.offsetX = 0;
    if(typeof p.offsetY !== 'number') p.offsetY = 0;
    if(typeof p.zoom !== 'number') p.zoom = 1;

    const card = document.createElement('div');
    card.className = 'photo-card adjustable-card';
    card.innerHTML = `
      <div class="adjust-box" data-index="${index}">
        <img src="${p.url}" class="adjust-img">
      </div>
      <div class="adjust-actions">
        <button type="button" class="zoom-out-btn">- تصغير</button>
        <input type="range" class="zoom-range" min="0.6" max="3" step="0.05" value="${p.zoom}" aria-label="تكبير وتصغير الصورة">
        <button type="button" class="zoom-in-btn">+ تكبير</button>
        <button type="button" class="rotate-btn">تدوير 90°</button>
        <button type="button" class="reset-btn">توسيط</button>
      </div>
      <div class="drag-hint">اسحب الصورة للتحريك، واستخدم الزوم للتكبير أو التصغير قبل إنشاء الشيت</div>
    `;

    const box = card.querySelector('.adjust-box');
    const imgEl = card.querySelector('.adjust-img');
    const zoomRange = card.querySelector('.zoom-range');
    const zoomInBtn = card.querySelector('.zoom-in-btn');
    const zoomOutBtn = card.querySelector('.zoom-out-btn');

    if(zoomRange){
      zoomRange.style.minWidth = '110px';
      zoomRange.style.flex = '1';
    }

    // عرض الصورة كاملة داخل مربع المعاينة بدون قص مبدئي.
    // القص السابق كان بسبب cover/scale، فكان العميل يحرك صورة مقصوصة بالفعل.
    box.style.overflow = 'hidden';
    imgEl.style.width = '100%';
    imgEl.style.height = '100%';
    imgEl.style.objectFit = 'contain';
    imgEl.style.transformOrigin = 'center center';

    const applyTransform = () => {
      const zoom = Number(p.zoom || 1);
      imgEl.style.transform = `translate3d(${p.offsetX}px, ${p.offsetY}px, 0) rotate(${p.rotation}deg) scale(${zoom})`;
      if(zoomRange) zoomRange.value = zoom;
    };

    const invalidateSheets = () => {
      state.order = null;
      state.outputs = [];
      state.cleanOutputs = [];
      $('preview').innerHTML = '';
      $('downloadBtn').classList.add('hidden');
      $('shareBtn').classList.add('hidden');
      if($('printFileNote')) $('printFileNote').classList.add('hidden');
      $('status').textContent = 'تم تعديل موضع صورة. اضغط إنشاء الشيتات مرة أخرى.';
    };

    applyTransform();

    let dragging = false;
    let startX = 0, startY = 0, baseX = 0, baseY = 0;

    const startDrag = (ev) => {
      if(ev.touches && ev.touches.length > 1) return;
      ev.preventDefault();
      ev.stopPropagation();

      dragging = true;
      const pt = getPointerPoint(ev);
      startX = pt.x;
      startY = pt.y;
      baseX = p.offsetX || 0;
      baseY = p.offsetY || 0;

      box.classList.add('dragging');

      if(ev.pointerId !== undefined && box.setPointerCapture){
        try { box.setPointerCapture(ev.pointerId); } catch(err) {}
      }
    };

    const moveDrag = (ev) => {
      if(ev.touches && ev.touches.length > 1) return;
      if(!dragging) return;

      ev.preventDefault();
      ev.stopPropagation();

      const pt = getPointerPoint(ev);
      p.offsetX = baseX + (pt.x - startX);
      p.offsetY = baseY + (pt.y - startY);
      applyTransform();
    };

    const endDrag = (ev) => {
      if(!dragging) return;

      ev.preventDefault();
      ev.stopPropagation();

      dragging = false;
      box.classList.remove('dragging');

      if(ev.pointerId !== undefined && box.releasePointerCapture){
        try { box.releasePointerCapture(ev.pointerId); } catch(err) {}
      }

      invalidateSheets();
    };

    const setZoom = (value) => {
      const z = Math.min(3, Math.max(0.6, Number(value) || 1));
      p.zoom = Math.round(z * 100) / 100;
      applyTransform();
      invalidateSheets();
    };

    if(zoomRange){
      zoomRange.addEventListener('input', (ev) => {
        p.zoom = Number(ev.target.value) || 1;
        applyTransform();
      });
      zoomRange.addEventListener('change', () => invalidateSheets());
    }

    if(zoomInBtn){
      zoomInBtn.onclick = (ev) => {
        ev.preventDefault();
        setZoom((p.zoom || 1) + 0.1);
      };
    }

    if(zoomOutBtn){
      zoomOutBtn.onclick = (ev) => {
        ev.preventDefault();
        setZoom((p.zoom || 1) - 0.1);
      };
    }

    box.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const direction = ev.deltaY < 0 ? 0.08 : -0.08;
      setZoom((p.zoom || 1) + direction);
    }, { passive:false });

    let pinchStartDistance = 0;
    let pinchStartZoom = 1;

    const getTouchDistance = (ev) => {
      if(!ev.touches || ev.touches.length < 2) return 0;
      const a = ev.touches[0];
      const b = ev.touches[1];
      const dx = a.clientX - b.clientX;
      const dy = a.clientY - b.clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    box.addEventListener('touchstart', (ev) => {
      if(ev.touches && ev.touches.length === 2){
        ev.preventDefault();
        dragging = false;
        pinchStartDistance = getTouchDistance(ev);
        pinchStartZoom = p.zoom || 1;
      }
    }, { passive:false });

    box.addEventListener('touchmove', (ev) => {
      if(ev.touches && ev.touches.length === 2 && pinchStartDistance > 0){
        ev.preventDefault();
        const distance = getTouchDistance(ev);
        const nextZoom = pinchStartZoom * (distance / pinchStartDistance);
        p.zoom = Math.min(3, Math.max(0.6, nextZoom));
        applyTransform();
      }
    }, { passive:false });

    box.addEventListener('touchend', (ev) => {
      if(pinchStartDistance > 0 && (!ev.touches || ev.touches.length < 2)){
        pinchStartDistance = 0;
        invalidateSheets();
      }
    }, { passive:false });

    // Pointer Events: أفضل حل للموبايل والماوس معًا
    box.addEventListener('pointerdown', startDrag);
    box.addEventListener('pointermove', moveDrag);
    box.addEventListener('pointerup', endDrag);
    box.addEventListener('pointercancel', endDrag);
    box.addEventListener('lostpointercapture', () => {
      if(dragging){
        dragging = false;
        box.classList.remove('dragging');
        invalidateSheets();
      }
    });

    // احتياطي لبعض متصفحات أندرويد القديمة
    box.addEventListener('touchstart', startDrag, { passive:false });
    box.addEventListener('touchmove', moveDrag, { passive:false });
    box.addEventListener('touchend', endDrag, { passive:false });

    card.querySelector('.rotate-btn').onclick = (ev) => {
      ev.preventDefault();
      p.rotation = (p.rotation + 90) % 360;
      applyTransform();
      invalidateSheets();
    };

    card.querySelector('.reset-btn').onclick = (ev) => {
      ev.preventDefault();
      p.offsetX = 0;
      p.offsetY = 0;
      p.zoom = 1;
      applyTransform();
      invalidateSheets();
    };

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
  $('status').textContent = `تم إنشاء ${state.outputs.length} شيت معاينة. ملف الطباعة PDF النظيف جاهز للتحميل أو الإرسال.`;
  $('downloadBtn').classList.remove('hidden'); $('shareBtn').classList.remove('hidden');
  if($('printFileNote')) $('printFileNote').classList.remove('hidden');
}

async function buildOutputs(withWatermark){
  const tpl = templates[state.template];
  const chunks = chunk(state.photos, tpl.count);
  const outputs = [];
  for(let i=0; i<chunks.length; i++){
    const canvas = await drawSheet(chunks[i], tpl, withWatermark);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.96));
    const url = URL.createObjectURL(blob);
    const suffix = withWatermark ? '_Preview' : '_Print';
    const name = `Motabagy_${tpl.label}_Sheet_${String(i+1).padStart(3,'0')}${suffix}.jpg`;
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
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
  const rects = getRects(tpl, W, H, gap, margin);
  for(let i=0; i<Math.min(photos.length, rects.length); i++){
    const img = await loadImage(photos[i].url); const rect = rects[i]; const rotation = rect.forceRotate ? 90 : photos[i].rotation;
    drawImageSmart(ctx, img, rect, rotation, photos[i]);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = Math.max(1, Math.round(dpi/180)); ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);
  }
  if(withWatermark) drawWatermark(ctx, W, H);
  ctx.fillStyle = '#cbd5e1'; ctx.font = `${Math.round(dpi*0.065)}px sans-serif`; ctx.textAlign='left';
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

  // الخانة نفسها تظل بمقاس الطباعة، لكن الصورة لا يتم قصها تلقائيًا.
  // الحل هنا هو CONTAIN بدل COVER:
  // - Cover = يملأ الخانة ويقص أجزاء من الصورة.
  // - Contain = يظهر الصورة كاملة وقد يترك فراغ أبيض بسيط لو النسبة مختلفة.
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = '#fff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const rotated = rotation % 180 !== 0;
  const sourceW = img.naturalWidth;
  const sourceH = img.naturalHeight;

  // أبعاد الصورة بعد الدوران بالنسبة للخانة.
  const effectiveW = rotated ? sourceH : sourceW;
  const effectiveH = rotated ? sourceW : sourceH;

  // لا نقص الصورة: نستخدم أصغر Scale عشان الصورة كلها تدخل داخل الخانة.
  const baseScale = Math.min(rect.w / effectiveW, rect.h / effectiveH);
  const userZoom = Math.min(3, Math.max(0.6, Number(photo.zoom || 1)));
  const scale = baseScale * userZoom;

  const drawW = sourceW * scale;
  const drawH = sourceH * scale;

  // مركز الخانة.
  let centerX = rect.x + rect.w / 2;
  let centerY = rect.y + rect.h / 2;

  // تحويل سحب العميل من معاينة صغيرة إلى الشيت النهائي.
  // التحريك هنا اختياري، ومع وضع عدم القص لن يقطع الصورة من المصدر.
  const previewBox = 118;
  const userOffsetX = Number(photo.offsetX || 0);
  const userOffsetY = Number(photo.offsetY || 0);
  centerX += (userOffsetX / previewBox) * rect.w;
  centerY += (userOffsetY / previewBox) * rect.h;

  // منع خروج الصورة بالكامل خارج الخانة. نسمح بهوامش بيضاء عند اختلاف النسبة.
  const halfEffectiveW = (rotated ? drawH : drawW) / 2;
  const halfEffectiveH = (rotated ? drawW : drawH) / 2;

  const minCenterX = rect.x + Math.min(rect.w / 2, halfEffectiveW);
  const maxCenterX = rect.x + rect.w - Math.min(rect.w / 2, halfEffectiveW);
  const minCenterY = rect.y + Math.min(rect.h / 2, halfEffectiveH);
  const maxCenterY = rect.y + rect.h - Math.min(rect.h / 2, halfEffectiveH);

  if(minCenterX <= maxCenterX){
    centerX = Math.min(maxCenterX, Math.max(minCenterX, centerX));
  }else{
    centerX = rect.x + rect.w / 2;
  }

  if(minCenterY <= maxCenterY){
    centerY = Math.min(maxCenterY, Math.max(minCenterY, centerY));
  }else{
    centerY = rect.y + rect.h / 2;
  }

  ctx.translate(centerX, centerY);
  ctx.rotate(rotation * Math.PI / 180);
  ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

  ctx.restore();
}

function loadImage(src){ return new Promise((res,rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
function chunk(arr, n){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }

function getClient(){
  try{
    return JSON.parse(localStorage.getItem('mb_client') || '{}');
  }catch(e){
    return {};
  }
}

function safeFilePart(value){
  return String(value || '')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .trim() || 'Client';
}

function timeStamp(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}${m}${day}_${h}${min}`;
}

async function buildPrintCanvases(){
  const tpl = templates[state.template];
  const chunks = chunk(state.photos, tpl.count);
  const canvases = [];

  for(const group of chunks){
    canvases.push(await drawSheet(group, tpl, false));
  }

  return canvases;
}

async function buildPrintPdfBlob(orderId = ''){
  if(state.photos.length === 0){
    throw new Error('ارفع الصور أولاً.');
  }

  if(!window.jspdf || !window.jspdf.jsPDF){
    throw new Error('مكتبة PDF لم يتم تحميلها. تأكد من اتصال الإنترنت ثم جرب مرة أخرى.');
  }

  const jsPDF = window.jspdf.jsPDF;
  const canvases = await buildPrintCanvases();

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [297, 450],
    compress: false
  });

  canvases.forEach((canvas, index) => {
    if(index > 0) pdf.addPage([297, 450], 'portrait');
    const imgData = canvas.toDataURL('image/png', 1.0);
    pdf.addImage(imgData, 'PNG', 0, 0, 297, 450, undefined, 'FAST');
  });

  const client = getClient();
  const orderPart = orderId ? `_${safeFilePart(orderId)}` : '';
  const fileName = `Matbagy_Banha_Print${orderPart}_${safeFilePart(client.name)}_${templates[state.template].label}_${timeStamp()}.pdf`;

  return {
    blob: pdf.output('blob'),
    fileName
  };
}

async function downloadPdfFile(orderId = ''){
  const pdf = await buildPrintPdfBlob(orderId);
  const url = URL.createObjectURL(pdf.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = pdf.fileName;
  document.body.appendChild(a);
  a.click();

  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1200);

  return pdf;
}

async function downloadAll(){
  if(state.outputs.length === 0){
    $('status').textContent = 'اضغط إنشاء الشيتات أولاً.';
    return;
  }

  try{
    $('status').textContent = 'جاري تجهيز ملف PDF بجودة الطباعة...';
    await downloadPdfFile('');
    $('status').textContent = 'تم تحميل ملف الطباعة PDF. أرسله كـ Document / ملف وليس كصورة.';
  }catch(e){
    $('status').textContent = e.message || 'حدث خطأ أثناء تجهيز ملف PDF.';
  }
}

async function ensureOrderCreated(){
  if(state.order?.orderId) return state.order;
  const client = getClient();
  if(!CONFIG.activationEndpoint) throw new Error('رابط النظام غير مضبوط.');
  const params = new URLSearchParams({ action:'createOrder', phone:client.phone || '', customerName:client.name || '', customerType:client.type || '', template:templates[state.template].label, photoCount:String(state.photos.length), sheetCount:String(state.outputs.length) });
  const res = await fetch(CONFIG.activationEndpoint + '?' + params.toString(), { cache: 'no-store' });
  const data = await res.json();
  if(!data || data.success !== true) throw new Error(data?.message || 'تعذر إنشاء الطلب.');
  state.order = data; return data;
}

function openWhatsAppMessage(text){
  const phone = String(CONFIG.whatsappNumber || '').replace(/[^\d]/g, '');
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

async function shareWork(){
  if(state.outputs.length === 0){
    $('status').textContent = 'اضغط إنشاء الشيتات أولاً.';
    return;
  }

  try{
    $('status').textContent = 'جاري إنشاء رقم الطلب وتجهيز ملف PDF للطباعة...';
    const order = await ensureOrderCreated();
    const client = getClient();
    const pdf = await buildPrintPdfBlob(order.orderId);
    const file = new File([pdf.blob], pdf.fileName, { type:'application/pdf' });

    const text = [
      `طلب صور جديد من ${client.name || 'عميل'}`,
      `رقم الطلب: ${order.orderId}`,
      `رقم العميل: ${client.phone || ''}`,
      `نوع العميل: ${client.type || ''}`,
      `القالب: ${templates[state.template].label}`,
      `عدد الصور: ${state.photos.length}`,
      `عدد الشيتات: ${state.outputs.length}`,
      '',
      'تم تجهيز ملف PDF بجودة الطباعة.',
      'مهم جدًا: أرسل ملف الـ PDF كـ Document / ملف وليس كصورة.'
    ].join('\n');

    if(navigator.canShare && navigator.canShare({ files:[file] })){
      $('status').textContent = `تم إنشاء رقم الطلب: ${order.orderId}. اختار واتساب وأرسل ملف PDF كـ Document.`;
      await navigator.share({ title:'طلب صور مطبعجي بنها', text, files:[file] });
      return;
    }

    await downloadPdfFile(order.orderId);
    $('status').textContent = `تم إنشاء رقم الطلب: ${order.orderId}. تم تحميل PDF، أرفقه في واتساب كـ Document / ملف.`;

    alert(
      'تم تحميل ملف الطباعة PDF ✅\n\n' +
      'افتح واتساب الآن وأرفق الملف الذي تم تحميله كـ Document / ملف، وليس كصورة.\n\n' +
      `رقم الطلب: ${order.orderId}`
    );

    openWhatsAppMessage(text);
  }catch(e){
    $('status').textContent = e.message || 'حدث خطأ أثناء إرسال الطلب.';
  }
}


async function requestNotifications(){
  if(!('Notification' in window)){ alert('الإشعارات غير مدعومة على هذا الجهاز.'); return; }
  const p = await Notification.requestPermission();
  if(p === 'granted') new Notification('مطبعجي بنها', { body:'تم تفعيل الإشعارات. ستصلك العروض الجديدة هنا.' });
}

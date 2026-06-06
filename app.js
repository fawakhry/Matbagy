const CONFIG = window.MB_CONFIG || {};
const CM_TO_IN = 1 / 2.54;
let state = { template: '6x9', photos: [], outputs: [] };

const $ = (id) => document.getElementById(id);
const qsa = (sel) => [...document.querySelectorAll(sel)];

const templates = {
  '6x9': { label:'6×9', count:25, wCm:6, hCm:9, mode:'grid', cols:5, rows:5 },
  '10x15': { label:'10×15', count:9, wCm:10, hCm:15, mode:'grid', cols:3, rows:3 },
  '7x10': { label:'7×10', count:19, wCm:7, hCm:10, mode:'mixed' }
};

init();

function init(){
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
  bindEvents();
  const saved = localStorage.getItem('mb_client');
  if(saved){
    const client = JSON.parse(saved);
    showApp(client);
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

  if(!phone){
    msg.textContent = 'برجاء إدخال رقم الهاتف المسجل لدى مطبعجي بنها.';
    return;
  }

  if(!CONFIG.activationEndpoint){
    msg.textContent = 'رابط التفعيل غير مضبوط. تواصل مع مطبعجي بنها.';
    return;
  }

  msg.textContent = 'جاري التحقق من الرقم...';

  try{
    const url = CONFIG.activationEndpoint + '?phone=' + encodeURIComponent(phone);
    const res = await fetch(url, { cache:'no-store' });
    const data = await res.json();

    if(!data || data.success !== true || data.found !== true){
      throw new Error(data?.message || 'not-active');
    }

    const customer = data.customer || {};
    const client = {
      active: true,
      name: customer.name || 'عميل مطبعجي بنها',
      manager: customer.manager || '',
      phone: customer.phone || phone,
      type: customer.type || '',
      activatedAt: new Date().toISOString()
    };

    localStorage.setItem('mb_client', JSON.stringify(client));
    msg.textContent = `أهلاً ${client.name}، تم تفعيل التطبيق بنجاح.`;

    setTimeout(() => showApp(client), 600);
  }catch(e){
    msg.textContent = e.message && e.message !== 'not-active'
      ? e.message
      : 'الرقم غير مسجل أو غير مفعل، برجاء التواصل مع مطبعجي بنها.';
  }
}

function showApp(client){
  $('activationView').classList.add('hidden');
  $('appView').classList.remove('hidden');
  $('helloTitle').textContent = `أهلاً ${client.name || 'بك'} 👋`;
}

function selectTemplate(id){
  state.template = id;
  qsa('.template').forEach(b=>b.classList.toggle('active', b.dataset.template === id));
}

async function handleFiles(e){
  const files = [...e.target.files];
  for(const file of files){
    if(!file.type.startsWith('image/')) continue;
    const url = URL.createObjectURL(file);
    const img = await loadImage(url);
    const rotation = shouldRotate(img, templates[state.template]) ? 90 : 0;
    state.photos.push({ file, url, name:file.name, rotation });
  }
  renderPhotoList();
}

function clearPhotos(){
  state.photos.forEach(p=>URL.revokeObjectURL(p.url));
  state.photos = [];
  state.outputs = [];
  $('preview').innerHTML = '';
  $('fileInput').value = '';
  $('downloadBtn').classList.add('hidden');
  $('shareBtn').classList.add('hidden');
  renderPhotoList();
}

function renderPhotoList(){
  $('photoList').innerHTML = '';
  state.photos.forEach((p, i)=>{
    const card = document.createElement('div'); card.className = 'photo-card';
    card.innerHTML = `<img src="${p.url}" style="transform:rotate(${p.rotation}deg)"><button>تدوير 90°</button>`;
    card.querySelector('button').onclick = () => { p.rotation = (p.rotation + 90) % 360; renderPhotoList(); };
    $('photoList').appendChild(card);
  });
}

async function autoRotateAll(){
  const tpl = templates[state.template];
  for(const p of state.photos){
    const img = await loadImage(p.url);
    p.rotation = shouldRotate(img, tpl) ? 90 : 0;
  }
  renderPhotoList();
  $('status').textContent = 'تم تدوير الصور حسب القالب المختار.';
}

function shouldRotate(img, tpl){
  const imgPortrait = img.naturalHeight >= img.naturalWidth;
  const slotPortrait = tpl.hCm >= tpl.wCm;
  return imgPortrait !== slotPortrait;
}

async function generateSheets(){
  if(state.photos.length === 0){ $('status').textContent = 'ارفع الصور أولاً.'; return; }
  $('status').textContent = 'جاري إنشاء الشيتات...';
  $('preview').innerHTML = '';
  state.outputs = [];

  const tpl = templates[state.template];
  const chunks = chunk(state.photos, tpl.count);
  for(let i=0; i<chunks.length; i++){
    const canvas = await drawSheet(chunks[i], tpl);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.94));
    const url = URL.createObjectURL(blob);
    const name = `Motabagy_${tpl.label}_Sheet_${String(i+1).padStart(3,'0')}.jpg`;
    state.outputs.push({ blob, url, name });
    const box = document.createElement('div'); box.className = 'sheet-preview';
    box.innerHTML = `<img src="${url}"><a download="${name}" href="${url}">تحميل ${name}</a>`;
    $('preview').appendChild(box);
  }
  $('status').textContent = `تم إنشاء ${state.outputs.length} شيت.`;
  $('downloadBtn').classList.remove('hidden');
  $('shareBtn').classList.remove('hidden');
}

async function drawSheet(photos, tpl){
  const dpi = CONFIG.dpi || 300;
  const W = Math.round((CONFIG.sheetWidthCm || 29.7) * CM_TO_IN * dpi);
  const H = Math.round((CONFIG.sheetHeightCm || 45) * CM_TO_IN * dpi);
  const gap = Math.round(((CONFIG.gapMm || 1) / 10) * CM_TO_IN * dpi);
  const margin = Math.round(((CONFIG.outerMarginMm || 2) / 10) * CM_TO_IN * dpi);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,W,H);
  ctx.fillStyle = 'rgba(15,118,110,0.04)';
  ctx.font = `${Math.round(W/12)}px sans-serif`; ctx.textAlign = 'center';
  ctx.save(); ctx.translate(W/2,H/2); ctx.rotate(-0.45); ctx.fillText(CONFIG.businessName || 'مطبعجي بنها',0,0); ctx.restore();

  const rects = getRects(tpl, W, H, gap, margin);
  for(let i=0; i<Math.min(photos.length, rects.length); i++){
    const img = await loadImage(photos[i].url);
    drawImageSmart(ctx, img, rects[i], photos[i].rotation, getFitMode());
    ctx.strokeStyle = '#e5e7eb'; ctx.lineWidth = Math.max(1, Math.round(dpi/150)); ctx.strokeRect(rects[i].x, rects[i].y, rects[i].w, rects[i].h);
  }
  ctx.fillStyle = '#94a3b8'; ctx.font = `${Math.round(dpi*0.09)}px sans-serif`; ctx.textAlign='left';
  ctx.fillText('Powered by Motabagy Banha', margin, H - margin/2);
  return c;
}

function getRects(tpl, W, H, gap, margin){
  if(tpl.mode === 'grid'){
    const cols = tpl.cols, rows = tpl.rows;
    const availW = W - margin*2 - gap*(cols-1);
    const availH = H - margin*2 - gap*(rows-1);
    const ratio = tpl.wCm / tpl.hCm;
    let cellW = availW / cols;
    let cellH = cellW / ratio;
    if(cellH*rows > availH){ cellH = availH / rows; cellW = cellH * ratio; }
    const startX = (W - (cellW*cols + gap*(cols-1))) / 2;
    const startY = (H - (cellH*rows + gap*(rows-1))) / 2;
    const rects=[];
    for(let r=0;r<rows;r++) for(let col=0;col<cols;col++) rects.push({x:startX+col*(cellW+gap),y:startY+r*(cellH+gap),w:cellW,h:cellH});
    return rects;
  }
  // 7×10: 16 portrait + 3 landscape under them, scaled safely with 1mm gaps
  const ratioP = 7/10, ratioL = 10/7;
  const cols=4, rows=4;
  const availW = W - margin*2;
  const availH = H - margin*2;
  let pW = (availW - gap*3) / 4;
  let pH = pW / ratioP;
  let lW = (availW - gap*2) / 3;
  let lH = lW / ratioL;
  const totalH = pH*4 + gap*4 + lH;
  if(totalH > availH){
    const scale = availH / totalH;
    pW *= scale; pH *= scale; lW *= scale; lH *= scale;
  }
  const rects=[];
  const portraitW = pW*4 + gap*3;
  const startX = (W - portraitW)/2;
  const startY = (H - (pH*4 + gap*4 + lH))/2;
  for(let r=0;r<4;r++) for(let col=0;col<4;col++) rects.push({x:startX+col*(pW+gap),y:startY+r*(pH+gap),w:pW,h:pH});
  const landW = lW*3 + gap*2;
  const lStartX = (W - landW)/2;
  const lY = startY + pH*4 + gap*4;
  for(let col=0;col<3;col++) rects.push({x:lStartX+col*(lW+gap),y:lY,w:lW,h:lH, forceRotate:true});
  return rects;
}

function drawImageSmart(ctx, img, rect, rotation, mode){
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.w, rect.h);
  ctx.clip();

  ctx.fillStyle = '#fff';
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

  const rotated = rotation % 180 !== 0;
  const iw = rotated ? img.naturalHeight : img.naturalWidth;
  const ih = rotated ? img.naturalWidth : img.naturalHeight;

  // Smart mode:
  // يبدأ بملء الخانة، لكن لو القص كبير جدًا يرجع لوضع آمن يحافظ على الملامح.
  const containScale = Math.min(rect.w / iw, rect.h / ih);
  const coverScale = Math.max(rect.w / iw, rect.h / ih);
  const cropRatio = Math.max(coverScale / containScale, 1);
  const scale = cropRatio > 1.28 ? containScale : coverScale;

  const dw = iw * scale;
  const dh = ih * scale;
  const dx = rect.x + (rect.w - dw) / 2;
  const dy = rect.y + (rect.h - dh) / 2;

  ctx.translate(dx + dw / 2, dy + dh / 2);
  ctx.rotate(rotation * Math.PI / 180);

  const sx = rotated ? dh : dw;
  const sy = rotated ? dw : dh;
  ctx.drawImage(img, -sx / 2, -sy / 2, sx, sy);

  ctx.restore();
}

function getFitMode(){ return CONFIG.defaultFitMode || 'smart'; }
function loadImage(src){ return new Promise((res,rej)=>{ const i = new Image(); i.onload=()=>res(i); i.onerror=rej; i.src=src; }); }
function chunk(arr, n){ const out=[]; for(let i=0;i<arr.length;i+=n) out.push(arr.slice(i,i+n)); return out; }

function downloadAll(){
  state.outputs.forEach(o=>{ const a=document.createElement('a'); a.href=o.url; a.download=o.name; a.click(); });
}

async function shareWork(){
  if(state.outputs.length === 0) return;
  const files = state.outputs.map(o => new File([o.blob], o.name, { type:'image/jpeg' }));
  const client = JSON.parse(localStorage.getItem('mb_client') || '{}');
  const text = `طلب صور جديد من ${client.name || 'عميل'}\nرقم العميل: ${client.phone || ''}\nنوع العميل: ${client.type || ''}\nالقالب: ${templates[state.template].label}\nعدد الشيتات: ${state.outputs.length}`;
  if(navigator.canShare && navigator.canShare({ files })){
    await navigator.share({ title:'طلب صور مطبعجي بنها', text, files });
  }else{
    const url = `https://wa.me/${CONFIG.whatsappNumber || ''}?text=${encodeURIComponent(text + '\nتم تحميل الشيتات من التطبيق، سيتم إرسالها الآن.')}`;
    window.open(url, '_blank');
  }
}

async function requestNotifications(){
  if(!('Notification' in window)){ alert('الإشعارات غير مدعومة على هذا الجهاز.'); return; }
  const p = await Notification.requestPermission();
  if(p === 'granted') new Notification('مطبعجي بنها', { body:'تم تفعيل الإشعارات. ستصلك العروض الجديدة هنا.' });
}

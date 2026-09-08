/* ================= 사진 마킹 ================= */
let markState = null;
async function openMarkingEditor(photoId){
  const p = await idbGet('photos', photoId);
  if(!p) return;
  removeIfExists('markOverlay');
  const overlay = document.createElement('div');
  overlay.className = 'mark-overlay'; overlay.id = 'markOverlay';
  overlay.innerHTML = `
    <div class="mark-topbar">
      <span class="link" onclick="cancelMarking()">취소</span>
      <span>사진 마킹</span>
      <span class="link" onclick="saveMarking()">저장</span>
    </div>
    <div class="mark-canvas-wrap" id="markCanvasWrap"><div class="mark-canvas-inner" id="markCanvasInner"><canvas id="markCanvas"></canvas></div></div>
    <div class="mark-toolbar">
      <div class="mark-extra-row" id="markExtraRow"></div>
      <div class="mark-main-row">
        <div class="mark-tools">
          <button class="mark-tool active" data-tool="pen" onclick="setMarkTool('pen',this)">${icon('pen',17)}</button>
          <button class="mark-tool" data-tool="circle" onclick="setMarkTool('circle',this)">${icon('circleTool',17)}</button>
          <button class="mark-tool" data-tool="arrow" onclick="setMarkTool('arrow',this)">${icon('arrowTool',17)}</button>
          <button class="mark-tool" data-tool="text" onclick="setMarkTool('text',this)">${icon('textTool',17)}</button>
          <button class="mark-tool" onclick="undoMarkShape()">${icon('undo',17)}</button>
        </div>
        <div class="mark-colors">
          <div class="mark-color" style="background:#ffffff" onclick="setMarkColor('#ffffff',this)"></div>
          <div class="mark-color active" style="background:#000000" onclick="setMarkColor('#000000',this)"></div>
          <div class="mark-color" style="background:#e5484d" onclick="setMarkColor('#e5484d',this)"></div>
          <div class="mark-color mark-color-more" id="markColorMoreBtn" onclick="openMarkColorPicker()">${icon('plus',13)}</div>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const img = new Image();
  img.onload = ()=> initMarkCanvas(img, photoId);
  img.src = getPhotoUrl(p);
}
function initMarkCanvas(img, photoId){
  const wrap = document.getElementById('markCanvasWrap');
  const inner = document.getElementById('markCanvasInner');
  const canvas = document.getElementById('markCanvas');
  const wrapW = wrap.clientWidth, wrapH = wrap.clientHeight;
  const imgRatio = img.naturalWidth/img.naturalHeight;
  const wrapRatio = wrapW/wrapH;
  let dispW, dispH;
  if(imgRatio > wrapRatio){ dispW = wrapW; dispH = wrapW/imgRatio; }
  else { dispH = wrapH; dispW = wrapH*imgRatio; }
  const dpr = window.devicePixelRatio || 1;
  inner.style.width = dispW+'px';
  inner.style.height = dispH+'px';
  canvas.style.width = dispW+'px';
  canvas.style.height = dispH+'px';
  canvas.width = Math.round(dispW*dpr);
  canvas.height = Math.round(dispH*dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr,dpr);

  markState = { photoId, img, shapes:[], tool:'pen', color:'#000000', lineWidth:4, textBg:'none', canvas, ctx, dispW, dispH, drawing:false, current:null };
  redrawMarkCanvas();
  attachMarkTouchHandlers(canvas);
  renderMarkExtraRow();
}
function redrawMarkCanvas(){
  const {ctx, img, dispW, dispH, shapes, current} = markState;
  ctx.clearRect(0,0,dispW,dispH);
  ctx.drawImage(img, 0,0, dispW, dispH);
  [...shapes, current, pendingShapeData].filter(Boolean).forEach(sh=> drawMarkShape(ctx, sh));
}
function drawMarkShape(ctx, sh){
  ctx.strokeStyle = sh.color; ctx.fillStyle = sh.color;
  ctx.lineWidth = sh.lineWidth || 4; ctx.lineCap='round'; ctx.lineJoin='round';
  if(sh.type==='pen'){
    ctx.beginPath();
    sh.points.forEach((pt,i)=>{ i===0? ctx.moveTo(pt.x,pt.y) : ctx.lineTo(pt.x,pt.y); });
    ctx.stroke();
  } else if(sh.type==='circle'){
    const r = Math.hypot(sh.x2-sh.x1, sh.y2-sh.y1);
    ctx.beginPath(); ctx.arc(sh.x1, sh.y1, r, 0, Math.PI*2); ctx.stroke();
  } else if(sh.type==='arrow'){
    drawMarkArrow(ctx, sh.x1, sh.y1, sh.x2, sh.y2);
  } else if(sh.type==='text'){
    ctx.font = `bold ${sh.fontSize||26}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if(sh.bg && sh.bg!=='none'){
      const padX = 10, padY = 6, r = 6;
      const textW = ctx.measureText(sh.text).width;
      const textH = (sh.fontSize||26) * 1.15;
      const boxW = textW + padX*2, boxH = textH + padY*2;
      const bx = sh.x1 - boxW/2, by = sh.y1 - boxH/2;
      ctx.fillStyle = sh.bg==='white' ? '#ffffff' : '#000000';
      ctx.beginPath();
      ctx.moveTo(bx+r, by);
      ctx.arcTo(bx+boxW, by, bx+boxW, by+boxH, r);
      ctx.arcTo(bx+boxW, by+boxH, bx, by+boxH, r);
      ctx.arcTo(bx, by+boxH, bx, by, r);
      ctx.arcTo(bx, by, bx+boxW, by, r);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = sh.color;
    }
    ctx.fillText(sh.text, sh.x1, sh.y1);
  }
}
function drawMarkArrow(ctx, x1,y1,x2,y2){
  ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke();
  const angle = Math.atan2(y2-y1, x2-x1);
  const headLen = 14;
  ctx.beginPath();
  ctx.moveTo(x2,y2);
  ctx.lineTo(x2-headLen*Math.cos(angle-Math.PI/6), y2-headLen*Math.sin(angle-Math.PI/6));
  ctx.lineTo(x2-headLen*Math.cos(angle+Math.PI/6), y2-headLen*Math.sin(angle+Math.PI/6));
  ctx.closePath(); ctx.fill();
}
function getMarkPoint(e, canvas){
  const rect = canvas.getBoundingClientRect();
  const t = e.touches && e.touches[0] ? e.touches[0] : e;
  return { x: t.clientX-rect.left, y: t.clientY-rect.top };
}
function attachMarkTouchHandlers(canvas){
  canvas.addEventListener('touchstart', (e)=>{
    e.preventDefault();
    if(!markState || pendingTextData || pendingShapeData) return;
    const pt = getMarkPoint(e, canvas);
    const {tool, color, lineWidth} = markState;
    if(tool==='text'){
      startTextPlacement(pt, color);
      return;
    }
    markState.drawing = true;
    if(tool==='pen'){ markState.current = {type:'pen', points:[pt], color, lineWidth}; }
    else { markState.current = {type:tool, x1:pt.x, y1:pt.y, x2:pt.x, y2:pt.y, color, lineWidth}; }
  }, {passive:false});
  canvas.addEventListener('touchmove', (e)=>{
    if(!markState || !markState.drawing) return;
    e.preventDefault();
    const pt = getMarkPoint(e, canvas);
    if(markState.tool==='pen'){ markState.current.points.push(pt); }
    else { markState.current.x2 = pt.x; markState.current.y2 = pt.y; }
    redrawMarkCanvas();
  }, {passive:false});
  canvas.addEventListener('touchend', ()=>{
    if(!markState || !markState.drawing) return;
    markState.drawing = false;
    if(markState.current){
      if(markState.tool==='pen'){
        markState.shapes.push(markState.current);
        markState.current = null;
      } else {
        // 원/화살표는 바로 확정하지 않고, 위치/크기 조절 가능한 상태로 전환
        const dx = markState.current.x2-markState.current.x1, dy = markState.current.y2-markState.current.y1;
        if(Math.hypot(dx,dy) < 8){ markState.current = null; return; } // 너무 작으면 실수로 간주하고 무시
        pendingShapeData = { ...markState.current };
        markState.current = null;
        redrawMarkCanvas();
        renderPendingShapeHandles();
      }
    }
  });
}
/* ---- 정렬 안내선(파워포인트 스마트가이드 방식) ---- */
const SNAP_THRESHOLD = 6;
function getMarkShapeCenter(sh){
  if(sh.type==='arrow') return { x:(sh.x1+sh.x2)/2, y:(sh.y1+sh.y2)/2 };
  return { x:sh.x1, y:sh.y1 }; // circle, text
}
function computeSnap(centerX, centerY){
  const targets = (markState.shapes||[]).filter(s=>s.type!=='pen');
  let bestX=null, bestXDist=SNAP_THRESHOLD, bestY=null, bestYDist=SNAP_THRESHOLD;
  targets.forEach(s=>{
    const c = getMarkShapeCenter(s);
    const dx = Math.abs(c.x-centerX);
    if(dx<bestXDist){ bestXDist=dx; bestX=c.x; }
    const dy = Math.abs(c.y-centerY);
    if(dy<bestYDist){ bestYDist=dy; bestY=c.y; }
  });
  return {
    x: bestX!==null ? bestX : centerX,
    y: bestY!==null ? bestY : centerY,
    guideX: bestX, guideY: bestY
  };
}
function renderSnapGuides(guideX, guideY){
  removeIfExists('snapGuideV'); removeIfExists('snapGuideH');
  const inner = document.getElementById('markCanvasInner');
  if(guideX!==null && guideX!==undefined){
    const v = document.createElement('div');
    v.id='snapGuideV'; v.className='snap-guide-v'; v.style.left = guideX+'px';
    inner.appendChild(v);
  }
  if(guideY!==null && guideY!==undefined){
    const h = document.createElement('div');
    h.id='snapGuideH'; h.className='snap-guide-h'; h.style.top = guideY+'px';
    inner.appendChild(h);
  }
}
function clearSnapGuides(){ removeIfExists('snapGuideV'); removeIfExists('snapGuideH'); }

/* ---- 크기 맞춤 안내 (같은 도구끼리 크기가 같아지면 표시) ---- */
const SIZE_SNAP_THRESHOLD = 6; // 원 반지름/화살표 길이 px
const SIZE_SNAP_THRESHOLD_FONT = 2; // 텍스트 폰트 크기 px
function getMarkShapeSize(sh){
  if(sh.type==='circle' || sh.type==='arrow') return Math.hypot(sh.x2-sh.x1, sh.y2-sh.y1);
  if(sh.type==='text') return sh.fontSize;
  return null;
}
function computeSizeSnap(type, currentSize){
  const threshold = type==='text' ? SIZE_SNAP_THRESHOLD_FONT : SIZE_SNAP_THRESHOLD;
  const targets = (markState.shapes||[]).filter(s=>s.type===type);
  let best=null, bestDist=threshold;
  targets.forEach(s=>{
    const sz = getMarkShapeSize(s);
    const dist = Math.abs(sz-currentSize);
    if(dist<bestDist){ bestDist=dist; best=sz; }
  });
  return best;
}
function showSizeMatchBadge(){
  if(document.getElementById('sizeMatchBadge')) return;
  const inner = document.getElementById('markCanvasInner');
  if(!inner) return;
  const b = document.createElement('div');
  b.id='sizeMatchBadge'; b.className='size-match-badge';
  b.textContent = '크기 동일';
  inner.appendChild(b);
}
function hideSizeMatchBadge(){ removeIfExists('sizeMatchBadge'); }

/* ---- 원/화살표 배치(이동/크기조절) ---- */
let pendingShapeData = null;
function renderPendingShapeHandles(){
  removeIfExists('shapeHandles');
  const inner = document.getElementById('markCanvasInner');
  const s = pendingShapeData;
  const wrap = document.createElement('div');
  wrap.id = 'shapeHandles';
  wrap.style.cssText = 'position:absolute;inset:0;';
  const topY = Math.min(s.y1, s.y2) - 36;
  const midX = (s.x1+s.x2)/2;
  let handlesHtml = '';
  if(s.type==='circle'){
    const r = Math.hypot(s.x2-s.x1, s.y2-s.y1);
    handlesHtml += `<div class="shape-move-zone" id="shMove" style="left:${s.x1-r}px;top:${s.y1-r}px;width:${r*2}px;height:${r*2}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shResize" style="left:${s.x2}px;top:${s.y2}px;"></div>`;
  } else {
    const midX2 = (s.x1+s.x2)/2, midY2 = (s.y1+s.y2)/2;
    handlesHtml += `<div class="shape-move-mid" id="shMoveMid" style="left:${midX2}px;top:${midY2}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shA" style="left:${s.x1}px;top:${s.y1}px;"></div>`;
    handlesHtml += `<div class="shape-handle" id="shB" style="left:${s.x2}px;top:${s.y2}px;"></div>`;
  }
  handlesHtml += `<div class="shp-btn mte-cancel" style="left:${midX-16}px;top:${topY}px;" onclick="cancelPendingShape()">${icon('close',14)}</div>`;
  handlesHtml += `<div class="shp-btn mte-confirm" style="left:${midX+16}px;top:${topY}px;" onclick="confirmPendingShape()">${icon('check',14)}</div>`;
  wrap.innerHTML = handlesHtml;
  inner.appendChild(wrap);
  attachShapeHandleDrag();
}
function attachShapeHandleDrag(){
  const s = pendingShapeData;
  function makeDraggable(el, onMove, opts){
    opts = opts || {};
    if(!el) return;
    let startX=0, startY=0, orig=null;
    el.addEventListener('touchstart', (e)=>{
      e.stopPropagation();
      const t = e.touches[0];
      startX = t.clientX; startY = t.clientY;
      orig = { x1:s.x1, y1:s.y1, x2:s.x2, y2:s.y2 };
    }, {passive:true});
    el.addEventListener('touchmove', (e)=>{
      e.preventDefault(); e.stopPropagation();
      const t = e.touches[0];
      const dx = t.clientX-startX, dy = t.clientY-startY;
      onMove(dx, dy, orig);
      if(opts.posSnap){
        const c = getMarkShapeCenter(s);
        const snapped = computeSnap(c.x, c.y);
        const adjX = snapped.x-c.x, adjY = snapped.y-c.y;
        if(adjX || adjY){ s.x1+=adjX; s.x2+=adjX; s.y1+=adjY; s.y2+=adjY; }
        renderSnapGuides(snapped.guideX, snapped.guideY);
      }
      if(opts.sizeSnap){
        const curSize = getMarkShapeSize(s);
        const matched = curSize>0 ? computeSizeSnap(s.type, curSize) : null;
        if(matched!==null){
          const scale = matched/curSize;
          if(opts.sizeSnap==='fromP1'){ s.x2 = s.x1+(s.x2-s.x1)*scale; s.y2 = s.y1+(s.y2-s.y1)*scale; }
          else { s.x1 = s.x2+(s.x1-s.x2)*scale; s.y1 = s.y2+(s.y1-s.y2)*scale; }
          showSizeMatchBadge();
        } else {
          hideSizeMatchBadge();
        }
      }
      redrawMarkCanvas();
      renderPendingShapeHandles();
    }, {passive:false});
    el.addEventListener('touchend', (e)=>{
      e.stopPropagation();
      if(opts.posSnap) clearSnapGuides();
      if(opts.sizeSnap) hideSizeMatchBadge();
    }, {passive:true});
  }
  if(s.type==='circle'){
    makeDraggable(document.getElementById('shMove'), (dx,dy,orig)=>{
      s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {posSnap:true});
    makeDraggable(document.getElementById('shResize'), (dx,dy,orig)=>{
      s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {sizeSnap:'fromP1'});
  } else {
    makeDraggable(document.getElementById('shMoveMid'), (dx,dy,orig)=>{
      s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; s.x2 = orig.x2+dx; s.y2 = orig.y2+dy;
    }, {posSnap:true});
    makeDraggable(document.getElementById('shA'), (dx,dy,orig)=>{ s.x1 = orig.x1+dx; s.y1 = orig.y1+dy; }, {sizeSnap:'fromP2'});
    makeDraggable(document.getElementById('shB'), (dx,dy,orig)=>{ s.x2 = orig.x2+dx; s.y2 = orig.y2+dy; }, {sizeSnap:'fromP1'});
  }
}
function confirmPendingShape(){
  if(!pendingShapeData || !markState) return;
  markState.shapes.push(pendingShapeData);
  pendingShapeData = null;
  removeIfExists('shapeHandles');
  clearSnapGuides();
  hideSizeMatchBadge();
  redrawMarkCanvas();
}
function cancelPendingShape(){
  pendingShapeData = null;
  removeIfExists('shapeHandles');
  clearSnapGuides();
  hideSizeMatchBadge();
  redrawMarkCanvas();
}
/* ---- 텍스트 배치(이동/크기조절) ---- */
let pendingTextData = null;
function startTextPlacement(pt, color){
  promptText({title:'텍스트 입력', placeholder:'예: 병해충 의심'}).then(text=>{
    if(!text || !markState) return;
    pendingTextData = { text, color, x: pt.x, y: pt.y, fontSize: 26, bg: markState.textBg };
    renderPendingTextEditor();
  });
}
function renderPendingTextEditor(){
  removeIfExists('markTextEditor');
  const inner = document.getElementById('markCanvasInner');
  const el = document.createElement('div');
  el.className = 'mte'; el.id = 'markTextEditor';
  el.style.left = pendingTextData.x + 'px';
  el.style.top = pendingTextData.y + 'px';
  el.style.color = pendingTextData.color;
  el.style.fontSize = pendingTextData.fontSize + 'px';
  const bgStyle = pendingTextData.bg && pendingTextData.bg!=='none'
    ? `background:${pendingTextData.bg==='white'?'#fff':'#000'};padding:5px 10px;border-radius:6px;`
    : '';
  el.innerHTML = `
    <div class="mte-text" style="${bgStyle}">${escapeHtml(pendingTextData.text)}</div>
    <div class="mte-btn mte-confirm" id="mteConfirm">${icon('check',14)}</div>
    <div class="mte-btn mte-cancel" id="mteCancel">${icon('close',14)}</div>
    <div class="mte-resize" id="mteResize"></div>`;
  inner.appendChild(el);
  document.getElementById('mteConfirm').onclick = confirmPendingText;
  document.getElementById('mteCancel').onclick = ()=> removePendingTextEditor(true);
  attachPendingTextGestures(el);
}
function attachPendingTextGestures(el){
  const textEl = el.querySelector('.mte-text');
  let mode = null; // 'move' | 'resize'
  let startX=0, startY=0, startLeft=0, startTop=0, startSize=0, startDist=0;
  textEl.addEventListener('touchstart', (e)=>{
    e.stopPropagation();
    mode = 'move';
    const t = e.touches[0];
    startX = t.clientX; startY = t.clientY;
    startLeft = parseFloat(el.style.left); startTop = parseFloat(el.style.top);
  }, {passive:true});
  document.getElementById('mteResize').addEventListener('touchstart', (e)=>{
    e.stopPropagation();
    mode = 'resize';
    const t = e.touches[0];
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
    startDist = Math.max(20, Math.hypot(t.clientX-cx, t.clientY-cy));
    startSize = pendingTextData.fontSize;
  }, {passive:true});
  el.addEventListener('touchmove', (e)=>{
    e.preventDefault(); e.stopPropagation();
    const t = e.touches[0];
    if(mode==='move'){
      const dx = t.clientX-startX, dy = t.clientY-startY;
      const snapped = computeSnap(startLeft+dx, startTop+dy);
      pendingTextData.x = snapped.x; pendingTextData.y = snapped.y;
      el.style.left = pendingTextData.x+'px'; el.style.top = pendingTextData.y+'px';
      renderSnapGuides(snapped.guideX, snapped.guideY);
    } else if(mode==='resize'){
      // 핸들을 텍스트 중심에서 멀리 끌면 커지고 가까이 끌면 작아짐 (대각선 방향 무관)
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width/2, cy = rect.top + rect.height/2;
      const curDist = Math.hypot(t.clientX-cx, t.clientY-cy);
      let newSize = Math.max(12, Math.min(90, startSize * (curDist/startDist)));
      const matched = computeSizeSnap('text', newSize);
      if(matched!==null){ newSize = matched; showSizeMatchBadge(); } else { hideSizeMatchBadge(); }
      pendingTextData.fontSize = newSize;
      el.style.fontSize = pendingTextData.fontSize+'px';
    }
  }, {passive:false});
  el.addEventListener('touchend', (e)=>{ e.stopPropagation(); mode=null; clearSnapGuides(); hideSizeMatchBadge(); }, {passive:true});
}
function confirmPendingText(){
  if(!pendingTextData || !markState) return;
  markState.shapes.push({
    type:'text', text: pendingTextData.text, color: pendingTextData.color,
    x1: pendingTextData.x, y1: pendingTextData.y, fontSize: pendingTextData.fontSize, bg: pendingTextData.bg
  });
  removePendingTextEditor(false);
  redrawMarkCanvas();
}
function removePendingTextEditor(){
  pendingTextData = null;
  removeIfExists('markTextEditor');
  clearSnapGuides();
  hideSizeMatchBadge();
}

function setMarkTool(tool, el){
  markState.tool = tool;
  document.querySelectorAll('.mark-tool[data-tool]').forEach(b=>b.classList.remove('active'));
  el.classList.add('active');
  renderMarkExtraRow();
}
function renderMarkExtraRow(){
  const row = document.getElementById('markExtraRow');
  if(!row || !markState) return;
  if(markState.tool==='text'){
    row.innerHTML = `
      <span class="mark-extra-label">배경</span>
      <div class="mark-textbg-opt ${markState.textBg==='none'?'active':''}" onclick="setMarkTextBg('none',this)">없음</div>
      <div class="mark-textbg-opt ${markState.textBg==='white'?'active':''}" style="background:#fff;color:#222;" onclick="setMarkTextBg('white',this)">흰색</div>
      <div class="mark-textbg-opt ${markState.textBg==='black'?'active':''}" style="background:#000;color:#fff;" onclick="setMarkTextBg('black',this)">검정</div>`;
  } else if(markState.tool==='pen' || markState.tool==='circle' || markState.tool==='arrow'){
    row.innerHTML = `
      <span class="mark-extra-label">굵기</span>
      <div class="mark-thick-dot ${markState.lineWidth===2?'active':''}" onclick="setMarkThickness(2,this)"><span style="width:4px;height:4px;"></span></div>
      <div class="mark-thick-dot ${markState.lineWidth===4?'active':''}" onclick="setMarkThickness(4,this)"><span style="width:8px;height:8px;"></span></div>
      <div class="mark-thick-dot ${markState.lineWidth===7?'active':''}" onclick="setMarkThickness(7,this)"><span style="width:13px;height:13px;"></span></div>`;
  } else {
    row.innerHTML = '';
  }
}
function setMarkThickness(w, el){
  markState.lineWidth = w;
  document.querySelectorAll('.mark-thick-dot').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
}
function setMarkTextBg(bg, el){
  markState.textBg = bg;
  document.querySelectorAll('.mark-textbg-opt').forEach(d=>d.classList.remove('active'));
  el.classList.add('active');
  if(pendingTextData){
    // 텍스트박스를 이미 입력한 뒤에도 배경색을 바로 바꿔서 미리보기에 반영
    pendingTextData.bg = bg;
    renderPendingTextEditor();
  }
}
function setMarkColor(color, el){
  markState.color = color;
  document.querySelectorAll('.mark-color').forEach(c=>c.classList.remove('active'));
  el.classList.add('active');
  if(pendingTextData){
    // 텍스트박스를 이미 입력한 뒤에도 글자색을 바로 바꿔서 미리보기에 반영
    pendingTextData.color = color;
    renderPendingTextEditor();
  }
}
function openMarkColorPicker(){
  removeIfExists('markColorPopup');
  const backdrop = document.createElement('div');
  backdrop.className = 'mark-color-popup-backdrop'; backdrop.id = 'markColorPopup';
  backdrop.innerHTML = `
    <div class="mark-color-popup-sheet">
      <div class="mark-color-grid">
        ${COLOR_CATALOG.map(c=>`<div class="mark-color-dot" style="background:${c}" onclick="pickMoreMarkColor('${c}')"></div>`).join('')}
      </div>
      <div class="mark-color-custom-row">
        <input type="color" id="markCustomColorInput" value="${markState.color}">
        <span>직접 선택</span>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  document.getElementById('markCustomColorInput').oninput = (e)=> pickMoreMarkColor(e.target.value);
}
function pickMoreMarkColor(color){
  const moreBtn = document.getElementById('markColorMoreBtn');
  if(moreBtn){ moreBtn.style.background = color; setMarkColor(color, moreBtn); }
  else { markState.color = color; }
  removeIfExists('markColorPopup');
}
function undoMarkShape(){
  if(!markState) return;
  markState.shapes.pop();
  redrawMarkCanvas();
}
function cancelMarking(){
  markState = null;
  pendingShapeData = null;
  pendingTextData = null;
  removeIfExists('markOverlay');
}
async function saveMarking(){
  if(!markState) return;
  if(pendingShapeData) confirmPendingShape();
  if(markState.shapes.length===0){
    const ok = await showConfirm({title:'마킹 없음', message:'표시한 내용이 없어요. 그래도 저장할까요?', confirmLabel:'저장'});
    if(!ok) return;
  }
  const original = await idbGet('photos', markState.photoId);
  const canvas = markState.canvas;
  // 타임라인 등 목록에 쓸 가벼운 썸네일도 같이 생성
  const MAX_THUMB = 380;
  const tscale = MAX_THUMB/Math.max(canvas.width, canvas.height);
  const thumbCanvas = document.createElement('canvas');
  thumbCanvas.width = Math.round(canvas.width*tscale);
  thumbCanvas.height = Math.round(canvas.height*tscale);
  thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

  // 코멘트 입력 팝업에 답하길 기다리는 동안 이미지 인코딩을 동시에 진행 —
  // 예전엔 팝업 응답을 먼저 기다린 "다음에" 인코딩을 시작해서 두 번 기다리는 구조였음
  const [comment, blob, thumbBlob] = await Promise.all([
    promptText({title:'코멘트 (선택)', placeholder:'예: 잎마름병 의심'}),
    new Promise(res=> canvas.toBlob(res, 'image/jpeg', 0.9)),
    new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75))
  ]);

  try{
    await uploadPhoto(original.trialId, {
      full: blob, thumb: thumbBlob, date: original.date,
      isMarked:true, originalPhotoId: markState.photoId, markNote: comment||''
    });
    await touchTrialUpdatedAt(original.trialId);
    toast('마킹한 사진을 저장했어요');
    removeIfExists('markOverlay');
    closeLightbox();
    markState = null;
    if(currentTrialId) renderDetail(currentTrialId);
  }catch(e){
    showStorageError(e);
  }
}

function openLightbox(photoId){
  lightboxIndex = allPhotosCache.findIndex(p=>p.id===photoId);
  if(lightboxIndex<0) return;
  renderLightbox();
}
function lbCurrentIndex(){
  // lightboxIndex는 스크롤이 멈춘 뒤 120ms 디바운스로만 갱신되므로,
  // 스와이프 직후 바로 버튼을 누르면 아직 이전 사진 인덱스일 수 있음 —
  // 액션 버튼(공유/저장/마킹/회전/삭제)은 항상 실제 스크롤 위치에서 즉시 계산해야
  // "방금 스와이프한 사진"이 아니라 "그 전 사진"에 잘못 적용되는 걸 막을 수 있음
  const scroller = document.getElementById('lbScroller');
  if(scroller && scroller.clientWidth){
    return Math.min(allPhotosCache.length-1, Math.max(0, Math.round(scroller.scrollLeft / scroller.clientWidth)));
  }
  return lightboxIndex;
}
function lbCurrentPhoto(){ return allPhotosCache[lbCurrentIndex()]; }
let lbSuppressNavClickUntil = 0; // 드래그(스와이프) 직후 손가락이 떨어진 자리에 이전/다음 버튼이 우연히 있으면
                                  // 브라우저가 뒤늦게 합성 클릭을 발생시켜 한 장 더 넘어가버리는 경우 방지
function renderLightbox(){
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  let lb = document.getElementById('lightboxEl');
  if(!lb){
    lb = document.createElement('div');
    lb.className='lightbox'; lb.id='lightboxEl';
    document.body.appendChild(lb);
  }
  lb.innerHTML = `
    <div class="lb-top"><span id="lbCounter"></span><span onclick="closeLightbox()">${icon('close',18)}</span></div>
    <div class="lb-comment" id="lbComment" style="display:none;"></div>
    <div class="lb-imgwrap" id="lbImgWrap">
      <div class="lb-scroller" id="lbScroller">
        ${allPhotosCache.map((ph,i)=>`<div class="lb-page" data-idx="${i}"><img data-full="${getPhotoUrl(ph)}" src="${getPhotoThumbUrl(ph)}"></div>`).join('')}
      </div>
      <div class="lb-nav lb-prev" id="lbPrevBtn" onclick="lightboxNav(-1)">${icon('chevLeft',20)}</div>
      <div class="lb-nav lb-next" id="lbNextBtn" onclick="lightboxNav(1)">${icon('chevRight',20)}</div>
    </div>
    <div class="lb-actions">
      <a class="a" onclick="downloadBlob(lbCurrentPhoto().id)">저장</a>
      <a class="a primary" onclick="shareBlob(lbCurrentPhoto().id)">공유</a>
      <a class="a" onclick="openMarkingEditor(lbCurrentPhoto().id)">마킹</a>
      <a class="a" onclick="rotateLightboxPhoto()">${icon('rotate',13)} 회전</a>
      <a class="a" style="background:rgba(226,61,61,0.4);" onclick="deleteLightboxPhoto()">삭제</a>
    </div>`;
  attachLightboxGestures();
  scrollLightboxTo(lightboxIndex, false);
  updateLightboxChrome();
}
function scrollLightboxTo(index, smooth){
  const scroller = document.getElementById('lbScroller');
  if(!scroller) return;
  const page = scroller.children[index];
  if(!page) return;
  scroller.scrollTo({ left: page.offsetLeft, behavior: smooth ? 'smooth' : 'auto' });
}
function upgradeNearbyLightboxImages(centerIndex){
  const scroller = document.getElementById('lbScroller');
  if(!scroller) return;
  for(let i=Math.max(0,centerIndex-1); i<=Math.min(allPhotosCache.length-1, centerIndex+1); i++){
    const page = scroller.children[i];
    const img = page && page.querySelector('img');
    if(img && img.dataset.full && !img.dataset.upgraded){
      img.dataset.upgraded = '1';
      img.src = img.dataset.full;
    }
  }
}
function updateLightboxChrome(){
  // 여기서는 항상 lightboxIndex를 그대로 신뢰해야 함 — 호출하는 쪽(디바운스된 스크롤 정착
  // 핸들러, lightboxNav)이 이미 "지금 보여줘야 할 사진"으로 갱신해둔 상태이기 때문.
  // lbCurrentPhoto()(실시간 스크롤 위치 기반)를 쓰면 lightboxNav()의 부드러운 스크롤이
  // 아직 도착하지 않은 순간에 직전 사진 기준으로 잘못 표시됨.
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  const counter = document.getElementById('lbCounter');
  if(counter) counter.textContent = `${p.date} · ${lightboxIndex+1}/${allPhotosCache.length}`;
  const comment = document.getElementById('lbComment');
  if(comment){
    if(p.isMarked && p.markNote){
      comment.style.display = '';
      comment.innerHTML = `${icon('pen',15)} ${escapeHtml(p.markNote)}`;
    } else {
      comment.style.display = 'none';
      comment.innerHTML = '';
    }
  }
  const prevBtn = document.getElementById('lbPrevBtn');
  const nextBtn = document.getElementById('lbNextBtn');
  if(prevBtn) prevBtn.classList.toggle('hidden', lightboxIndex<=0);
  if(nextBtn) nextBtn.classList.toggle('hidden', lightboxIndex>=allPhotosCache.length-1);
  upgradeNearbyLightboxImages(lightboxIndex);
}
function attachLightboxGestures(){
  const wrap = document.getElementById('lbImgWrap');
  const scroller = document.getElementById('lbScroller');
  const lb = document.getElementById('lightboxEl');
  if(!wrap || !scroller || !lb) return;
  lb.style.transition = 'none';
  function setZoomLock(on){ scroller.style.touchAction = on ? 'none' : 'pan-x'; }
  setZoomLock(false);

  let scale=1, panX=0, panY=0;
  let startDist=0, startScale=1;
  let startPanX=0, startPanY=0, startTouchX=0, startTouchY=0;
  let mode=null; // 'pinch' | 'pan' | 'dismiss' | null(탭/네이티브 스와이프)
  let swipeStartX=0, swipeStartY=0;
  let lastTap=0;
  let activeImg=null;

  function currentPageImg(){
    const page = scroller.children[lightboxIndex];
    return page ? page.querySelector('img') : null;
  }
  function getRenderSize(img){
    const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const ir = iw/ih, cr = cw/ch;
    if(ir > cr) return { rw: cw, rh: cw/ir };
    return { rw: ch*ir, rh: ch };
  }
  function clampPan(img){
    const {rw, rh} = getRenderSize(img);
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const maxX = Math.max(0, (rw*scale - cw)/2);
    const maxY = Math.max(0, (rh*scale - ch)/2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }
  function apply(img, smooth){
    clampPan(img);
    img.style.transition = smooth ? 'transform .12s ease' : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function dist(t){ const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  function applyDismiss(dy, smooth){
    lb.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    lb.style.transform = `translateY(${dy}px)`;
    lb.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }

  wrap.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){
      const img = currentPageImg();
      if(!img) return;
      activeImg = img;
      mode='pinch';
      startDist = dist(e.touches);
      startScale = scale;
    } else if(e.touches.length===1){
      const t = e.touches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY;
      if(scale>1){
        activeImg = currentPageImg();
        mode='pan';
        startTouchX = t.clientX; startTouchY = t.clientY;
        startPanX = panX; startPanY = panY;
      } else {
        mode=null; // 확대 안 된 상태의 가로 드래그는 네이티브 스크롤에 맡김
      }
    }
  }, {passive:true});

  wrap.addEventListener('touchmove', (e)=>{
    if(mode==='pinch' && e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches);
      if(startDist>0 && activeImg){
        scale = Math.min(4, Math.max(1, startScale*(d/startDist)));
        setZoomLock(scale>1.02);
        apply(activeImg, false);
      }
    } else if(mode==='pan' && e.touches.length===1){
      e.preventDefault();
      const t = e.touches[0];
      panX = startPanX + (t.clientX-startTouchX);
      panY = startPanY + (t.clientY-startTouchY);
      if(activeImg) apply(activeImg, false);
    } else if(mode===null && e.touches.length===1 && scale<=1){
      const t = e.touches[0];
      const dx = t.clientX-swipeStartX, dy = t.clientY-swipeStartY;
      if(Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)*1.2){
        mode = 'dismiss';
      }
      if(mode==='dismiss' && dy>0){
        e.preventDefault();
        applyDismiss(dy, false);
      }
    } else if(mode==='dismiss' && e.touches.length===1){
      const t = e.touches[0];
      const dy = t.clientY-swipeStartY;
      if(dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    }
  }, {passive:false});

  wrap.addEventListener('touchend', (e)=>{
    if(mode==='dismiss'){
      const t = e.changedTouches[0];
      const dy = t.clientY-swipeStartY;
      if(dy > 110){
        applyDismiss(window.innerHeight, true);
        setTimeout(()=> closeLightbox(), 220);
      } else {
        applyDismiss(0, true);
      }
    } else if(mode==='pinch' || mode==='pan'){
      if(scale<=1.02 && activeImg){
        scale = 1; panX = 0; panY = 0;
        setZoomLock(false);
        apply(activeImg, true);
      }
    } else if(mode===null){
      const t = e.changedTouches[0];
      const dx = t.clientX-swipeStartX, dy = t.clientY-swipeStartY;
      if(Math.abs(dx) < 8 && Math.abs(dy) < 8){
        const now = Date.now();
        if(now-lastTap<300){
          const img = currentPageImg();
          if(img){
            scale = scale>1 ? 1 : 2.2;
            panX=0; panY=0;
            setZoomLock(scale>1);
            apply(img, true);
          }
        }
        lastTap = now;
      } else {
        // 실제로 드래그(스와이프)였음 — 손가락이 떨어진 지점에 이전/다음 버튼이 있으면
        // 브라우저가 뒤늦게 클릭을 합성시킬 수 있으니 잠깐 동안 네비게이션 클릭을 무시
        lbSuppressNavClickUntil = Date.now() + 400;
      }
    }
    if(e.touches.length===0){ mode=null; activeImg=null; }
  });

  let scrollSettleTimer=null;
  scroller.addEventListener('scroll', ()=>{
    clearTimeout(scrollSettleTimer);
    scrollSettleTimer = setTimeout(()=>{
      const w = scroller.clientWidth || 1;
      const idx = Math.min(allPhotosCache.length-1, Math.max(0, Math.round(scroller.scrollLeft / w)));
      if(idx !== lightboxIndex){
        lightboxIndex = idx;
        updateLightboxChrome();
      }
    }, 120);
  }, {passive:true});
}
function lightboxNav(dir){
  if(Date.now() < lbSuppressNavClickUntil) return;
  const newIdx = lightboxIndex + dir;
  if(newIdx<0 || newIdx>=allPhotosCache.length) return;
  lightboxIndex = newIdx;
  scrollLightboxTo(lightboxIndex, true);
  updateLightboxChrome();
}
function closeLightbox(){ removeIfExists('lightboxEl'); }
function rotateImageBlob(blob, degrees){
  return new Promise((resolve, reject)=>{
    createImageBitmap(blob).then(bitmap=>{
      const swap = Math.abs(degrees % 180) === 90;
      const w = bitmap.width, h = bitmap.height;
      const canvas = document.createElement('canvas');
      canvas.width = swap ? h : w;
      canvas.height = swap ? w : h;
      const ctx = canvas.getContext('2d');
      ctx.translate(canvas.width/2, canvas.height/2);
      ctx.rotate(degrees*Math.PI/180);
      ctx.drawImage(bitmap, -w/2, -h/2);
      if(bitmap.close) bitmap.close();
      canvas.toBlob(async (outBlob)=>{
        const MAX_THUMB = 380;
        const tscale = MAX_THUMB/Math.max(canvas.width, canvas.height);
        const thumbCanvas = document.createElement('canvas');
        thumbCanvas.width = Math.round(canvas.width*tscale);
        thumbCanvas.height = Math.round(canvas.height*tscale);
        thumbCanvas.getContext('2d').drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
        const thumbBlob = await new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75));
        resolve({ blob: outBlob, thumbBlob });
      }, 'image/jpeg', 0.9);
    }).catch(reject);
  });
}
async function rotateLightboxPhoto(){
  lightboxIndex = lbCurrentIndex();
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  try{
    const original = await fetchPhotoBlob(p.id);
    const { blob, thumbBlob } = await rotateImageBlob(original, 90);
    await rotatePhotoOnServer(p.id, blob, thumbBlob);
    renderLightbox();
    if(currentTrialId) renderDetail(currentTrialId);
  }catch(e){
    showStorageError(e);
  }
}
async function deleteLightboxPhoto(){
  lightboxIndex = lbCurrentIndex();
  const p = allPhotosCache[lightboxIndex];
  if(!p) return;
  const ok = await showConfirm({title:'사진 삭제', message:'이 사진을 삭제할까요?\n되돌릴 수 없어요.', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  const pin = await promptPin({title:'사진 삭제', message:'본인이 올린 사진만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> idbDelete('photos', p.id));
  }catch(e){ toast(e.message); return; }
  toast('사진을 삭제했어요');
  closeLightbox();
  if(currentTrialId) renderDetail(currentTrialId);
}
async function showNativeDiagnostics(){
  const lines = [];
  lines.push(`window.Capacitor 존재: ${typeof window.Capacitor !== 'undefined' ? '예' : '아니오'}`);
  if(window.Capacitor){
    lines.push(`isNativePlatform(): ${typeof window.Capacitor.isNativePlatform==='function' ? window.Capacitor.isNativePlatform() : '함수 없음'}`);
    lines.push(`getPlatform(): ${typeof window.Capacitor.getPlatform==='function' ? window.Capacitor.getPlatform() : '함수 없음'}`);
    const pluginNames = window.Capacitor.Plugins ? Object.keys(window.Capacitor.Plugins) : [];
    lines.push(`등록된 플러그인 (${pluginNames.length}개): ${pluginNames.join(', ')||'없음'}`);
  }
  lines.push(`isNativeApp() 결과: ${isNativeApp()}`);
  lines.push(`현재 주소: ${window.location.href}`);
  lines.push(`User Agent: ${navigator.userAgent}`);
  await showAlert({title:'네이티브 진단 정보', message: lines.join('\n\n')});
}
function isNativeApp(){
  if(typeof window === 'undefined' || !window.Capacitor) return false;
  try{
    if(typeof window.Capacitor.isNativePlatform === 'function') return window.Capacitor.isNativePlatform();
    if(typeof window.Capacitor.getPlatform === 'function') return window.Capacitor.getPlatform() !== 'web';
  }catch(e){}
  return true; // Capacitor 객체 자체가 있다는 건 네이티브 앱 안이라는 뜻
}
async function nativeShareBlob(blob, filename, title){
  try{
    const plugins = window.Capacitor && window.Capacitor.Plugins;
    if(!plugins || !plugins.Filesystem || !plugins.Share){
      toast('앱에 저장/공유 기능이 아직 설치 안 됐어요. 안드로이드 스튜디오에서 다시 빌드해주세요.');
      return false;
    }
    const { Filesystem, Share } = plugins;
    const base64 = await blobToBase64(blob);
    const result = await Filesystem.writeFile({ path: filename, data: base64, directory: 'CACHE' });
    await Share.share({ title: title||filename, url: result.uri, dialogTitle: '공유 / 저장하기' });
    return true;
  }catch(e){
    console.error(e);
    toast('저장/공유에 실패했어요: ' + (e && e.message ? e.message : e));
    return false;
  }
}
async function downloadBlob(photoId){
  let p, blob;
  try{
    p = await idbGet('photos', photoId);
    blob = await fetchPhotoBlob(photoId);
  }catch(e){ showStorageError(e); return; }
  if(isNativeApp()){ await nativeShareBlob(blob, `${p.date}.jpg`, '사진 저장'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = `${p.date}.jpg`; a.click();
}
async function shareBlob(photoId){
  let p, blob;
  try{
    p = await idbGet('photos', photoId);
    blob = await fetchPhotoBlob(photoId);
  }catch(e){ showStorageError(e); return; }
  if(isNativeApp()){ await nativeShareBlob(blob, `${p.date}.jpg`, '작황 사진'); return; }
  const file = new File([blob], `${p.date}.jpg`, {type:blob.type||'image/jpeg'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'작황 사진'}); }
    catch(e){ if(e && e.name!=='AbortError') toast('공유하지 못했어요: '+(e&&e.message?e.message:e)); }
  } else {
    toast('이 브라우저는 공유가 지원되지 않아요. 저장 후 공유해주세요.');
  }
}


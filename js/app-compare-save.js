/* ================= 비교 저장 (성장비교/품종비교 공용) ================= */
function buildComparisonCanvas({photoInfos, sharedHeader}){
  return new Promise(async (resolve)=>{
    const n = photoInfos.length;
    const S = 1.6; // 해상도 배율 (선명도 개선용, 레이아웃 비율은 그대로 유지)
    const gap = Math.round(14*S), W = Math.round(900*S);
    const cellW = Math.floor((W - gap*(n+1))/n), cellH = cellW;
    const headerH = sharedHeader.length ? Math.round((44 + (sharedHeader.length-1)*28 + 20)*S) : Math.round(20*S);
    const maxLines = Math.max(...photoInfos.map(p=>p.lines.length), 1);
    const capH = Math.round((16 + maxLines*22)*S);
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = headerH + cellH + capH + Math.round(16*S);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#F5F6F7'; ctx.fillRect(0,0,canvas.width,canvas.height);
    let hy = Math.round(36*S);
    sharedHeader.forEach((line,i)=>{
      ctx.fillStyle = i===0 ? '#12151A' : '#5B6169';
      ctx.font = i===0 ? `bold ${Math.round(26*S)}px sans-serif` : `bold ${Math.round(17*S)}px sans-serif`;
      ctx.fillText(line, Math.round(20*S), hy);
      hy += Math.round(28*S);
    });
    for(let i=0;i<n;i++){
      const x = gap + i*(cellW+gap);
      const y = headerH;
      await new Promise(res=>{
        const img = new Image();
        img.onload=()=>{ ctx.drawImage(img, x, y, cellW, cellH); res(); };
        img.src = URL.createObjectURL(photoInfos[i].blob);
      });
      let ly = y+cellH+Math.round(22*S);
      ctx.fillStyle = '#494D53'; ctx.font=`bold ${Math.round(16*S)}px sans-serif`;
      photoInfos[i].lines.forEach(line=>{ ctx.fillText(line, x, ly); ly+=Math.round(22*S); });
    }
    canvas.toBlob(b=>resolve(b), 'image/png');
  });
}
async function saveDetailComparison(){
  const ids = cmpSlots.filter(Boolean);
  if(ids.length<2){ toast('비교할 사진을 2장 이상 선택해주세요'); return; }
  const t = await idbGet('trials', currentTrialId);
  const c = await idbGet('crops', t.cropId);
  const [photoRecords, photoBlobs] = await Promise.all([
    Promise.all(ids.map(id=>idbGet('photos', id))),
    Promise.all(ids.map(id=>fetchPhotoBlob(id)))
  ]);
  const sharedHeader = [`${c.name} · ${t.seg} · ${trialTitle(t)}`];
  const dateBits = buildDateBitsLine(t);
  if(dateBits) sharedHeader.push(dateBits);
  const photoInfos = photoRecords.map((p,i)=>({ blob:photoBlobs[i], lines:[p.date] }));
  const blob = await buildComparisonCanvas({photoInfos, sharedHeader});
  try{
    await uploadComparison({image: blob, scope:'detail', trialId: currentTrialId});
    toast('비교를 저장했어요');
  }catch(e){ showStorageError(e); return; }
  renderSavedComparisons('detail', currentTrialId);
}
async function saveXComparison(){
  const slots = xCmpSlots.filter(Boolean);
  if(slots.length<2){ toast('비교할 시교를 2개 이상 선택해주세요'); return; }
  const photoInfos = [];
  for(const s of slots){
    const [t,p] = await Promise.all([idbGet('trials', s.trialId), idbGet('photos', s.photoId)]);
    if(!t || !p) continue;
    const [c, blob] = await Promise.all([idbGet('crops', t.cropId), fetchPhotoBlob(s.photoId)]);
    photoInfos.push({ blob, lines: buildTrialLabelLines(c,t,p) });
  }
  if(photoInfos.length<2){ toast('비교할 사진이 부족해요'); return; }
  const blob = await buildComparisonCanvas({photoInfos, sharedHeader: []});
  try{
    await uploadComparison({image: blob, scope:'xcompare'});
    toast('비교를 저장했어요');
  }catch(e){ showStorageError(e); return; }
  renderSavedComparisons('xcompare');
}
async function renderSavedComparisons(scope, trialId){
  const filtered = await listComparisons(scope, scope==='detail' ? trialId : null);
  const containerId = scope==='detail' ? 'savedCompareDetail' : 'savedCompareX';
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const container = document.getElementById(containerId);
  const row = document.getElementById(rowId);
  if(!container || !row) return;
  if(filtered.length===0){ container.classList.add('hidden'); row.innerHTML=''; return; }
  container.classList.remove('hidden');
  row.innerHTML = filtered.map(c=>`<div class="saved-cmp-thumb" data-cmp-id="${c.id}"><img draggable="false" oncontextmenu="return false;" src="${comparisonFileUrl(c.id)}"><div class="chk">${icon('check',12)}</div></div>`).join('');
  initSavedCmpLongPress(row, scope);
  updateSavedCmpSelectUI(scope);
}
let savedCmpSelectMode = {detail:false, xcompare:false};
let savedCmpSelectedIds = {detail:new Set(), xcompare:new Set()};
function initSavedCmpLongPress(row, scope){
  if(row.dataset.bound) return;
  row.dataset.bound = '1';
  let timer=null, fired=false;
  row.addEventListener('touchstart', (e)=>{
    const thumb = e.target.closest('.saved-cmp-thumb');
    if(!thumb) return;
    fired=false;
    timer = setTimeout(()=>{
      fired=true;
      timer=null;
      if(appSettings.feedback) vibrate(20);
      enterSavedCmpSelectMode(scope, thumb.dataset.cmpId);
    }, 500);
  }, {passive:true});
  row.addEventListener('touchend', ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  row.addEventListener('touchmove', ()=>{ if(timer){clearTimeout(timer);timer=null;} });
  row.addEventListener('click', (e)=>{
    if(fired){ fired=false; return; }
    const thumb = e.target.closest('.saved-cmp-thumb');
    if(!thumb) return;
    if(savedCmpSelectMode[scope]) toggleSavedCmpSelect(scope, thumb.dataset.cmpId);
    else viewSavedComparison(thumb.dataset.cmpId);
  });
}
function enterSavedCmpSelectMode(scope, id){
  savedCmpSelectMode[scope] = true;
  savedCmpSelectedIds[scope] = new Set([id]);
  updateSavedCmpSelectUI(scope);
}
function toggleSavedCmpSelect(scope, id){
  const set = savedCmpSelectedIds[scope];
  if(set.has(id)) set.delete(id); else set.add(id);
  if(set.size===0){ exitSavedCmpSelectMode(scope); return; }
  updateSavedCmpSelectUI(scope);
}
function updateSavedCmpSelectUI(scope){
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const row = document.getElementById(rowId);
  if(!row) return;
  row.classList.toggle('select-mode', savedCmpSelectMode[scope]);
  row.querySelectorAll('.saved-cmp-thumb').forEach(el=>{
    el.classList.toggle('selected', savedCmpSelectedIds[scope].has(el.dataset.cmpId));
  });
  if(savedCmpSelectMode[scope]) showSavedCmpSelectBar(scope);
}
function showSavedCmpSelectBar(scope){
  const barId = scope==='detail' ? 'savedCmpSelectBarDetail' : 'savedCmpSelectBarX';
  let bar = document.getElementById(barId);
  if(!bar){
    bar = document.createElement('div');
    bar.id = barId;
    bar.className = 'timeline-select-bar select-bar-simple';
    document.body.appendChild(bar);
  }
  const n = savedCmpSelectedIds[scope].size;
  bar.innerHTML = `
    <button class="btn btn-ghost" onclick="exitSavedCmpSelectMode('${scope}')">취소</button>
    <button class="btn btn-danger" onclick="deleteSavedCmpSelected('${scope}')">${n}개의 비교 삭제하기</button>`;
}
function exitSavedCmpSelectMode(scope){
  savedCmpSelectMode[scope] = false;
  savedCmpSelectedIds[scope] = new Set();
  const rowId = scope==='detail' ? 'savedCompareDetailRow' : 'savedCompareXRow';
  const row = document.getElementById(rowId);
  if(row){
    row.classList.remove('select-mode');
    row.querySelectorAll('.saved-cmp-thumb.selected').forEach(el=>el.classList.remove('selected'));
  }
  const barId = scope==='detail' ? 'savedCmpSelectBarDetail' : 'savedCmpSelectBarX';
  removeIfExists(barId);
}
async function deleteSavedCmpSelected(scope){
  const ids = Array.from(savedCmpSelectedIds[scope]);
  if(ids.length===0) return;
  const ok = await showConfirm({title:'비교 삭제', message:`선택한 비교 ${ids.length}개를 삭제할까요?\n되돌릴 수 없어요.`, confirmLabel:'삭제', danger:true});
  if(!ok) return;
  const pin = await promptPin({title:'비교 삭제', message:'본인이 저장한 비교만 삭제돼요. PIN을 입력해주세요.'});
  if(pin===null) return;
  let failCount = 0;
  await withPin(pin, async ()=>{
    for(const id of ids){
      try{ await idbDelete('comparisons', id); }
      catch(e){ failCount++; }
    }
  });
  toast(failCount===0 ? `비교 ${ids.length}개 삭제했어요` : `${ids.length-failCount}개 삭제, 본인이 저장 안 한 ${failCount}개는 건너뛰었어요`);
  exitSavedCmpSelectMode(scope);
  renderSavedComparisons(scope, scope==='detail' ? currentTrialId : null);
}
async function viewSavedComparison(id){
  const c = await idbGet('comparisons', id);
  if(!c) return;
  removeIfExists('savedCmpViewer');
  const overlay = document.createElement('div');
  overlay.className = 'landscape-overlay'; overlay.id='savedCmpViewer';
  overlay.style.flexDirection = 'column';
  overlay.style.alignItems = 'stretch';
  overlay.innerHTML = `
    <div class="lb-top" style="justify-content:flex-end;"><span onclick="animateModalClose(document.getElementById('savedCmpViewer'))">${icon('close',18)}</span></div>
    <div class="scv-wrap" id="scvWrap"><img id="scvImg" src="${comparisonFileUrl(c.id)}"></div>
    <div class="lb-actions">
      <a class="a primary" onclick="shareSavedComparison('${id}')">공유</a>
      <a class="a" style="background:rgba(226,61,61,0.4);" onclick="deleteSavedComparison('${id}','${c.scope}','${c.trialId||''}')">삭제</a>
    </div>`;
  document.body.appendChild(overlay);
  const wrap = document.getElementById('scvWrap');
  wrap.addEventListener('click', (e)=>{ if(e.target.id==='scvWrap') animateModalClose(document.getElementById('savedCmpViewer')); });
  attachSimpleZoomPan(wrap, document.getElementById('scvImg'));
}
function attachSimpleZoomPan(wrap, img){
  if(!wrap || !img) return;
  const overlay = wrap.closest('.landscape-overlay') || wrap.parentElement;
  img.style.transition = 'none';
  wrap.style.touchAction = 'none';
  let scale=1, panX=0, panY=0;
  let startDist=0, startScale=1, startPanX=0, startPanY=0, startTouchX=0, startTouchY=0;
  let mode=null, lastTap=0;
  let swipeStartX=0, swipeStartY=0;
  function getRenderSize(){
    const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1;
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const ir = iw/ih, cr = cw/ch;
    if(ir > cr) return { rw: cw, rh: cw/ir };
    return { rw: ch*ir, rh: ch };
  }
  function clampPan(){
    const {rw, rh} = getRenderSize();
    const cw = wrap.clientWidth, ch = wrap.clientHeight;
    const maxX = Math.max(0, (rw*scale - cw)/2);
    const maxY = Math.max(0, (rh*scale - ch)/2);
    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }
  function apply(smooth){
    clampPan();
    img.style.transition = smooth ? 'transform .12s ease' : 'none';
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${scale})`;
  }
  function dist(t){ const dx=t[0].clientX-t[1].clientX, dy=t[0].clientY-t[1].clientY; return Math.hypot(dx,dy); }
  function applyDismiss(dy, smooth){
    if(!overlay) return;
    overlay.style.transition = smooth ? 'transform .22s ease, opacity .22s ease' : 'none';
    overlay.style.transform = `translateY(${dy}px)`;
    overlay.style.opacity = String(Math.max(0.25, 1 - Math.abs(dy)/400));
  }
  wrap.addEventListener('touchstart', (e)=>{
    if(e.touches.length===2){ mode='pinch'; startDist=dist(e.touches); startScale=scale; }
    else if(e.touches.length===1){
      const t=e.touches[0];
      swipeStartX = t.clientX; swipeStartY = t.clientY;
      if(scale>1){ mode='pan'; startTouchX=t.clientX; startTouchY=t.clientY; startPanX=panX; startPanY=panY; }
      else { mode='tap'; }
    }
  }, {passive:true});
  wrap.addEventListener('touchmove', (e)=>{
    if(mode==='pinch' && e.touches.length===2){
      e.preventDefault();
      const d = dist(e.touches);
      if(startDist>0){ scale = Math.min(4, Math.max(1, startScale*(d/startDist))); apply(false); }
    } else if(mode==='pan' && e.touches.length===1){
      e.preventDefault();
      const t=e.touches[0];
      panX = startPanX + (t.clientX-startTouchX);
      panY = startPanY + (t.clientY-startTouchY);
      apply(false);
    } else if(mode==='tap' && e.touches.length===1){
      const t=e.touches[0];
      const dx=t.clientX-swipeStartX, dy=t.clientY-swipeStartY;
      if(Math.abs(dy)>10 && Math.abs(dy)>Math.abs(dx)*1.2) mode='dismiss';
      if(mode==='dismiss' && dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    } else if(mode==='dismiss' && e.touches.length===1){
      const t=e.touches[0]; const dy=t.clientY-swipeStartY;
      if(dy>0){ e.preventDefault(); applyDismiss(dy, false); }
    }
  }, {passive:false});
  wrap.addEventListener('touchend', (e)=>{
    if(mode==='dismiss'){
      const t=e.changedTouches[0]; const dy=t.clientY-swipeStartY;
      if(dy>110){ applyDismiss(window.innerHeight, true); setTimeout(()=>{ if(overlay) overlay.remove(); }, 220); }
      else { applyDismiss(0, true); }
    } else if(mode==='tap'){
      const now = Date.now();
      if(now-lastTap<300){ scale = scale>1 ? 1 : 2.2; panX=0; panY=0; apply(true); }
      lastTap = now;
    } else if(mode==='pinch' || mode==='pan'){
      if(scale<=1.02){ scale=1; panX=0; panY=0; apply(true); }
    }
    mode=null;
  });
}
async function shareSavedComparison(id){
  const blob = await fetchComparisonBlob(id);
  if(isNativeApp()){ await nativeShareBlob(blob, 'comparison.png', '비교 이미지'); return; }
  const file = new File([blob], 'comparison.png', {type:'image/png'});
  if(navigator.share && navigator.canShare && navigator.canShare({files:[file]})){
    try{ await navigator.share({files:[file], title:'비교 이미지'}); }catch(e){}
  } else {
    toast('이 브라우저는 공유가 지원되지 않아요. 이미지를 길게 눌러 저장해보세요.');
  }
}
async function deleteSavedComparison(id, scope, trialId){
  const ok = await showConfirm({title:'비교 삭제', message:'저장된 비교를 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  const pin = await promptPin({title:'비교 삭제', message:'본인이 저장한 비교만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> idbDelete('comparisons', id));
  }catch(e){ toast(e.message); return; }
  animateModalClose(document.getElementById('savedCmpViewer'));
  toast('삭제했어요');
  renderSavedComparisons(scope, trialId||null);
}

function openXComparePicker(which){
  removeIfExists('xTrialPickModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='xTrialPickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>비교할 시교 선택</h3>
      <div class="search-box" style="margin-bottom:10px;">
        ${icon('search',16)}
        <input type="text" id="xTrialSearch" placeholder="품목, SEG, 시교명으로 검색" oninput="renderXTrialList('${which}')">
      </div>
      <div id="xTrialList"></div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  renderXTrialList(which);
}
async function renderXTrialList(which){
  const q = (document.getElementById('xTrialSearch')?.value || '').trim().toLowerCase();
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');
  const filtered = trials.filter(t=>{
    if(!q) return true;
    const c = cropMap[t.cropId];
    return t.name.toLowerCase().includes(q) || t.seg.toLowerCase().includes(q) || (c && c.name.toLowerCase().includes(q));
  }).sort((a,b)=>b.createdAt-a.createdAt);
  const list = document.getElementById('xTrialList');
  if(filtered.length===0){
    list.innerHTML = '<p class="empty">일치하는 시교가 없어요.</p>';
    return;
  }
  list.innerHTML = filtered.map(t=>{
    const c = cropMap[t.cropId] || {name:'?',color:'#999'};
    return `<div class="list-item" onclick="openXPhotoPicker('${which}','${t.id}')">
      <div class="info">
        <div class="name"><span class="crop-dot" style="background:${c.color}"></span>${trialTitle(t)}</div>
        <div class="sub">${c.name} · ${t.seg}</div>
      </div>
      <div class="chev">${icon('chevRight',14)}</div>
    </div>`;
  }).join('');
}
async function openXPhotoPicker(which, trialId){
  const photos = (await idbGetAllByIndex('photos','trialId',trialId)).sort((a,b)=>a.date.localeCompare(b.date));
  const t = await idbGet('trials', trialId);
  removeIfExists('xTrialPickModal');
  removeIfExists('xPhotoPickModal');
  const grouped = {};
  photos.forEach(p=>{ (grouped[p.date]=grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='xPhotoPickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>${trialTitle(t)} · 사진 선택</h3>
      ${dateKeys.length===0 ? '<p class="empty">이 시교엔 아직 사진이 없어요.</p>' : dateKeys.map(d=>`
        <div class="date-group">
          <div class="date-head">${d}</div>
          <div class="photo-grid">
            ${grouped[d].map(p=>`<div class="photo-thumb" onclick="pickXComparePhoto('${which}','${trialId}','${p.id}')"><img loading="lazy" decoding="async" src="${getPhotoThumbUrl(p)}"></div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
function pickXComparePhoto(which, trialId, photoId){
  xCmpSlots[which] = {trialId, photoId};
  removeIfExists('xPhotoPickModal');
  renderXCompareSide(which);
}
/* ================= 메모 ================= */
let currentNotesCache = [];
async function renderNotes(trialId){
  const notes = (await idbGetAllByIndex('notes','trialId',trialId)).sort((a,b)=>b.date.localeCompare(a.date) || b.createdAt-a.createdAt);
  currentNotesCache = notes;
  const list = document.getElementById('noteList');
  if(notes.length===0){
    list.innerHTML = '<p class="empty">등록된 메모가 없어요. "+ 추가"로 남겨보세요.</p>';
  } else {
    list.innerHTML = notes.map(n=>`
      <div class="list-item" style="display:block;cursor:default;">
        <div class="sub" style="margin-bottom:3px;">${n.date}</div>
        <div class="name" style="font-weight:400;font-size:13px;line-height:1.5;white-space:pre-wrap;word-break:break-word;">${formatNoteText(escapeHtml(collapseBlankLines(n.text)))}</div>
        <div style="display:flex;gap:4px;justify-content:flex-end;margin-top:8px;">
          <button class="action" style="color:var(--muted);font-size:14px;" onclick="copyNoteText('${n.id}')" aria-label="메모 복사">${icon('copy',15)}</button>
          <button class="action" style="color:var(--muted);font-size:14px;" onclick="openNoteModal('${n.id}')">${icon('edit',15)}</button>
          <button class="action" style="color:var(--danger);font-size:14px;" onclick="deleteNote('${n.id}')">${icon('trash',16)}</button>
        </div>
      </div>`).join('');
  }
}
function copyNoteText(noteId){
  const n = currentNotesCache.find(x=>x.id===noteId);
  copyTextToClipboard(n && n.text, '메모를 복사했어요');
}
function escapeHtml(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
// white-space:pre-wrap로 메모를 그대로 보여주다 보니, 모바일에서 엔터를 두 번 눌러
// 생긴 빈 줄이 카드 안에 그대로 빈 칸으로 보이는 문제가 있었다 — 화면에 보여줄 때
// 연속된 빈 줄을 하나로 줄여서 표시한다(저장된 원본 텍스트 자체는 안 건드림).
function collapseBlankLines(s){ return (s||'').replace(/\n{2,}/g, '\n').trim(); }
// 간단한 마크다운식 서식 — **굵게**, __밑줄__. 저장은 그냥 텍스트라 서버는 안 건드리고,
// 보여줄 때만 이스케이프된 텍스트 위에 적용한다(이스케이프 먼저 → 태그 삽입 순서라 안전).
function formatNoteText(escaped){
  return escaped.replace(/\*\*([^\n*]+)\*\*/g, '<b>$1</b>').replace(/__([^\n_]+)__/g, '<u>$1</u>');
}
// 메모 입력창은 textarea가 아니라 contenteditable이다 — 작성 중에 마커가 글자로
// 그대로 보이는 게 어색하다는 피드백이라, 타이핑하는 그 순간부터 굵게/밑줄이 눈에
// 보이게 했다. 저장 형식은 예전 그대로 마커가 들어간 텍스트라서 서버나 이미 저장된
// 메모는 손댈 게 없고, 아래 두 함수가 화면(HTML) ↔ 저장 텍스트를 옮긴다.
function noteTextToHtml(text){
  return formatNoteText(escapeHtml(text||'')).replace(/\n/g, '<br>');
}
function isBoldEl(el){
  if(el.tagName==='B' || el.tagName==='STRONG') return true;
  const w = (el.style && el.style.fontWeight) || '';
  return w==='bold' || parseInt(w,10) >= 600;
}
function isUnderlineEl(el){
  if(el.tagName==='U') return true;
  return !!(el.style && (el.style.textDecoration||'').includes('underline'));
}
function noteHtmlToText(root){
  const runs = [];
  const walk = (node, bold, under)=>{
    node.childNodes.forEach(child=>{
      if(child.nodeType === 3){
        const t = child.nodeValue.replace(/\u00a0/g, ' ');
        if(t) runs.push({text:t, bold, under});
        return;
      }
      if(child.nodeType !== 1) return;
      if(child.tagName === 'BR'){ runs.push({br:true}); return; }
      const isBlock = child.tagName==='DIV' || child.tagName==='P';
      if(isBlock && runs.length) runs.push({br:true});
      walk(child, bold || isBoldEl(child), under || isUnderlineEl(child));
    });
  };
  walk(root, false, false);
  // 브라우저가 글자를 여러 조각으로 쪼개놓는 경우가 많다. 굵은 구간을 통째로 모은 뒤
  // 그 안에서 밑줄 구간만 따로 감싸야, 마커가 중간에 끊기지 않고 겹친 서식도
  // 깔끔한 한 덩어리로 저장된다.
  let out = '';
  for(let i=0; i<runs.length; ){
    if(runs[i].br){ out += '\n'; i++; continue; }
    const bold = runs[i].bold;
    let inner = '';
    while(i<runs.length && !runs[i].br && runs[i].bold===bold){
      const under = runs[i].under;
      let text = '';
      while(i<runs.length && !runs[i].br && runs[i].bold===bold && runs[i].under===under){
        text += runs[i].text; i++;
      }
      inner += under ? ('__'+text+'__') : text;
    }
    out += bold ? ('**'+inner+'**') : inner;
  }
  return out.replace(/\n+$/, '');
}
function noteEditorText(editorId){
  const el = document.getElementById(editorId);
  return el ? noteHtmlToText(el) : '';
}
function setNoteEditorText(editorId, text){
  const el = document.getElementById(editorId);
  if(el) el.innerHTML = noteTextToHtml(text);
}
/* 글자를 선택해두고 B를 누르면 그 부분이, 커서만 있으면 그다음 타이핑부터 굵어진다.
   버튼을 누를 때 입력창의 선택이 풀리면 안 되므로 호출부에서 mousedown을 막아둔다. */
function toggleNoteFormat(editorId, cmd, onChange){
  const el = document.getElementById(editorId);
  if(!el) return;
  el.focus();
  try{ document.execCommand('styleWithCSS', false, false); }catch(e){}
  document.execCommand(cmd, false, null);
  if(onChange) onChange();
}
/* 다른 앱에서 복사해온 색·크기가 딸려오지 않게 붙여넣기는 글자만 받는다. */
function attachNoteEditorPaste(editorId){
  const el = document.getElementById(editorId);
  if(!el) return;
  el.addEventListener('paste', (e)=>{
    e.preventDefault();
    const t = ((e.clipboardData || window.clipboardData) || {getData:()=>''}).getData('text/plain');
    document.execCommand('insertText', false, t);
  });
}
// 메모 작성 중 다른 곳으로 넘어가거나(뒤로가기 등) 실수로 닫히면 내용이 그냥
// 사라지던 문제 — 입력할 때마다 로컬에 초안을 저장해뒀다가 다시 열면 이어서 쓰게 한다.
function noteDraftKey(noteId){ return `cl_notedraft_t_${currentTrialId}_${noteId||'new'}`; }
function saveNoteDraft(noteId){
  try{ localStorage.setItem(noteDraftKey(noteId), JSON.stringify({
    date: document.getElementById('noteDate').value, text: noteEditorText('noteText')
  })); }catch(e){}
}
function clearNoteDraft(noteId){ try{ localStorage.removeItem(noteDraftKey(noteId)); }catch(e){} }
function loadNoteDraft(noteId){
  try{ const raw = localStorage.getItem(noteDraftKey(noteId)); return raw ? JSON.parse(raw) : null; }catch(e){ return null; }
}

function openNoteModal(noteId){
  removeIfExists('noteModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='noteModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>${noteId? '메모 수정':'메모 추가'}</h3>
      <div class="field">
        <label>날짜</label>
        <input type="date" id="noteDate" value="${todayStr()}" oninput="saveNoteDraft('${noteId||''}')">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;justify-content:space-between;">
          내용
          <span style="display:flex;gap:6px;">
            <button type="button" class="btn-mini" style="font-weight:800;" onmousedown="event.preventDefault()" onclick="toggleNoteFormat('noteText','bold',()=>saveNoteDraft('${noteId||''}'))">B</button>
            <button type="button" class="btn-mini" style="text-decoration:underline;" onmousedown="event.preventDefault()" onclick="toggleNoteFormat('noteText','underline',()=>saveNoteDraft('${noteId||''}'))">U</button>
          </span>
        </label>
        <div id="noteText" class="note-editor" contenteditable="true" data-placeholder="생육상태, 특이사항 등" oninput="saveNoteDraft('${noteId||''}')"></div>
      </div>
      <div class="btn-row">
        ${noteId? `<button class="btn btn-ghost" onclick="clearNoteDraft('${noteId}'); cancelAction(()=>closeModal('noteModal'))">취소</button>`:''}
        <button class="btn btn-primary" onclick="saveNote('${noteId||''}')">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  attachNoteEditorPaste('noteText');
  const draft = loadNoteDraft(noteId);
  if(noteId){
    idbGet('notes', noteId).then(n=>{
      if(n){ document.getElementById('noteDate').value = n.date; setNoteEditorText('noteText', n.text); }
      if(draft){ document.getElementById('noteDate').value = draft.date || todayStr(); setNoteEditorText('noteText', draft.text); toast('이어서 작성하던 메모를 불러왔어요'); }
    });
  } else if(draft){
    document.getElementById('noteDate').value = draft.date || todayStr();
    setNoteEditorText('noteText', draft.text);
    toast('이어서 작성하던 메모를 불러왔어요');
  }
}
async function saveNote(noteId){
  const date = document.getElementById('noteDate').value || todayStr();
  const text = collapseBlankLines(noteEditorText('noteText'));
  if(!text){ toast('메모 내용을 입력해주세요'); return; }
  const id = noteId || uid();
  try{
    if(noteId){
      const pin = await promptPin({title:'메모 수정', message:'본인이 작성한 메모만 수정할 수 있어요. PIN을 입력해주세요.'});
      if(pin===null) return;
      await withPin(pin, ()=> idbPut('notes', {id, trialId: currentTrialId, date, text}));
    } else {
      await idbPut('notes', {id, trialId: currentTrialId, date, text});
    }
  }catch(e){ toast(e.message); return; }
  clearNoteDraft(noteId);
  closeModal('noteModal');
  toast('메모를 저장했어요');
  renderNotes(currentTrialId);
}
async function deleteNote(noteId){
  const ok = await showConfirm({title:'메모 삭제', message:'이 메모를 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  const pin = await promptPin({title:'메모 삭제', message:'본인이 작성한 메모만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> idbDelete('notes', noteId));
  }catch(e){ toast(e.message); return; }
  toast('삭제했어요');
  renderNotes(currentTrialId);
}

let lightboxIndex = -1;
/* ================= 타임라인 롱프레스 다중 선택 ================= */
let timelineSelectMode = false;
let timelineSelectedIds = new Set();
let tlLongPressTimer = null;
let tlLongPressFired = false;
function tlTouchStart(e){
  const thumb = e.target.closest('.photo-thumb');
  if(!thumb) return;
  tlLongPressFired = false;
  tlLongPressTimer = setTimeout(()=>{
    tlLongPressTimer = null;
    tlLongPressFired = true;
    enterTimelineSelectMode(thumb.dataset.photoId);
    if(appSettings.feedback) vibrate(20);
  }, 500);
}
function tlTouchEnd(){
  if(tlLongPressTimer){ clearTimeout(tlLongPressTimer); tlLongPressTimer=null; }
}
function tlTouchMove(){
  if(tlLongPressTimer){ clearTimeout(tlLongPressTimer); tlLongPressTimer=null; }
}
function tlClick(e){
  const thumb = e.target.closest('.photo-thumb');
  if(!thumb) return;
  if(tlLongPressFired){ tlLongPressFired=false; return; }
  const photoId = thumb.dataset.photoId;
  if(timelineSelectMode){
    toggleTimelinePhotoSelect(photoId);
  } else {
    openLightbox(photoId);
  }
}
function initTimelineDelegation(){
  const c = document.getElementById('timelineAll');
  if(!c || c.dataset.bound) return;
  c.dataset.bound = '1';
  c.addEventListener('touchstart', tlTouchStart, {passive:true});
  c.addEventListener('touchend', tlTouchEnd, {passive:true});
  c.addEventListener('touchmove', tlTouchMove, {passive:true});
  c.addEventListener('click', tlClick);
}
function enterTimelineSelectMode(photoId){
  timelineSelectMode = true;
  timelineSelectedIds = new Set([photoId]);
  const c = document.getElementById('timelineAll');
  if(c) c.classList.add('select-mode');
  updateTimelineThumbUI(photoId);
  showTimelineSelectBar();
}
function toggleTimelinePhotoSelect(photoId){
  if(timelineSelectedIds.has(photoId)) timelineSelectedIds.delete(photoId);
  else timelineSelectedIds.add(photoId);
  updateTimelineThumbUI(photoId);
  if(timelineSelectedIds.size===0){ exitTimelineSelectMode(); return; }
  showTimelineSelectBar();
}
function updateTimelineThumbUI(photoId){
  const thumb = document.querySelector(`#timelineAll .photo-thumb[data-photo-id="${photoId}"]`);
  if(thumb) thumb.classList.toggle('selected', timelineSelectedIds.has(photoId));
}
function showTimelineSelectBar(){
  let bar = document.getElementById('timelineSelectBar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = 'timelineSelectBar';
    bar.className = 'timeline-select-bar';
    document.body.appendChild(bar);
  }
  const n = timelineSelectedIds.size;
  const onlyOne = n === 1;   // 마킹은 사진 한 장에만 하는 동작
  bar.innerHTML = `
    <div class="select-bar-head">
      <button class="select-bar-close" onclick="exitTimelineSelectMode()" aria-label="선택 취소">${icon('close',18)}</button>
      <span class="select-bar-count">${n}장 선택</span>
    </div>
    <div class="select-bar-actions">
      <button class="select-act" onclick="markTimelineSelected()" ${onlyOne?'':'disabled'}>
        ${icon('pen',22)}<span>마킹</span>
      </button>
      <button class="select-act" onclick="shareTimelineSelected()">
        ${icon('share',22)}<span>공유</span>
      </button>
      <button class="select-act" onclick="downloadTimelineSelected()">
        ${icon('download',22)}<span>내려받기</span>
      </button>
      <button class="select-act danger" onclick="deleteTimelineSelected()">
        ${icon('trash',22)}<span>삭제</span>
      </button>
    </div>`;
}
/* ---- 선택한 사진들에 대한 동작 ---- */
function markTimelineSelected(){
  const ids = Array.from(timelineSelectedIds);
  if(ids.length !== 1){ toast('마킹은 사진 한 장만 선택했을 때 할 수 있어요'); return; }
  const id = ids[0];
  exitTimelineSelectMode();
  openMarkingEditor(id);
}
async function downloadTimelineSelected(){
  const ids = Array.from(timelineSelectedIds);
  if(ids.length===0) return;
  if(ids.length > 1) toast(`사진 ${ids.length}장 저장 중...`);
  for(const id of ids){
    try{ await downloadBlob(id); }catch(e){ toast('일부 사진을 저장하지 못했어요'); }
  }
  exitTimelineSelectMode();
}
async function shareTimelineSelected(){
  const ids = Array.from(timelineSelectedIds);
  if(ids.length===0) return;
  if(ids.length === 1){ await shareBlob(ids[0]); exitTimelineSelectMode(); return; }
  // 여러 장은 한 번에 공유 시도 — 브라우저가 여러 파일 공유를 지원할 때만 가능
  try{
    const files = [];
    for(const id of ids){
      const p = await idbGet('photos', id);
      const blob = await fetchPhotoBlob(id);
      files.push(new File([blob], `${p.date}_${id.slice(-4)}.jpg`, {type: blob.type||'image/jpeg'}));
    }
    if(navigator.share && navigator.canShare && navigator.canShare({files})){
      await navigator.share({files, title:'작황 사진'});
      exitTimelineSelectMode();
    } else {
      toast('여러 장 한 번에 공유가 안 되는 기기예요. 내려받기로 저장한 뒤 공유해주세요.');
    }
  }catch(e){
    if(e && e.name === 'AbortError') return;   // 사용자가 공유 시트를 닫은 경우
    toast('공유하지 못했어요');
  }
}
function exitTimelineSelectMode(){
  timelineSelectMode = false;
  timelineSelectedIds = new Set();
  const c = document.getElementById('timelineAll');
  if(c){
    c.classList.remove('select-mode');
    c.querySelectorAll('.photo-thumb.selected').forEach(el=>el.classList.remove('selected'));
  }
  removeIfExists('timelineSelectBar');
}
async function deleteTimelineSelected(){
  const ids = Array.from(timelineSelectedIds);
  if(ids.length===0) return;
  const ok = await showConfirm({
    title:'사진 삭제',
    message:`선택한 사진 ${ids.length}장을 삭제할까요?\n되돌릴 수 없어요.`,
    confirmLabel:'삭제', danger:true
  });
  if(!ok) return;
  const pin = await promptPin({title:'사진 삭제', message:'본인이 올린 사진만 삭제돼요. PIN을 입력해주세요.'});
  if(pin===null) return;
  let failCount = 0;
  await withPin(pin, async ()=>{
    for(const id of ids){
      try{ await idbDelete('photos', id); }
      catch(e){ failCount++; }
    }
  });
  toast(failCount===0 ? `사진 ${ids.length}장 삭제했어요` : `${ids.length-failCount}장 삭제, 본인이 안 올린 사진 ${failCount}장은 건너뛰었어요`);
  exitTimelineSelectMode();
  if(currentTrialId) renderDetail(currentTrialId);
}


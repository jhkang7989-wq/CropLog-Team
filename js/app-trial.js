/* ================= 새 시교 등록 ================= */
let selectedCropId = null;
let useCustomCrop = false;

async function renderNewTrialForm(){
  await ensurePresetCrops();
  selectedCropId = null;
  useCustomCrop = false;
  document.getElementById('customCropBox').classList.add('hidden');
  document.getElementById('ntSeg').value='';
  document.getElementById('ntName').value='';
  initProductPicker('ntName', 'ntProductSuggest', () => selectedCropId);
  document.getElementById('ntRegion').value='';
  document.getElementById('ntGrowerName').value='';
  initGrowerPicker('ntGrowerName', 'ntGrowerSuggest');
  document.getElementById('ntSowDate').value='';
  document.getElementById('ntTransplantDate').value='';
  document.getElementById('ntSeason').value = new Date().getFullYear();
  document.getElementById('ntStatus').value = 'active';
  document.getElementById('ntReferenceVariety').value='';
  resetAddressFields('nt');
  document.getElementById('customCropName').value='';

  const cat = document.getElementById('colorCatalog');
  cat.innerHTML = COLOR_CATALOG.map((col,i)=>`<div class="color-dot ${i===4?'sel':''}" style="background:${col}" onclick="pickCustomColor('${col}', this)"></div>`).join('');
  window._customColor = ()=> COLOR_CATALOG[4];
  document.getElementById('customColorPicker').oninput = (e)=>{
    document.querySelectorAll('#colorCatalog .color-dot').forEach(d=>d.classList.remove('sel'));
    window._customColor = ()=> e.target.value;
  };

  const crops = await idbGetAll('crops');
  const tiles = document.getElementById('cropTiles');
  tiles.innerHTML = crops.map(c=>{
    return `<div class="crop-tile" data-id="${c.id}" onclick="selectCropTile('${c.id}', this)">
      <span class="swatch" style="background:${c.color};"></span>
      <span class="label">${escapeHtml(c.name)}</span>
    </div>`;
  }).join('') + `
    <div class="crop-tile add" onclick="selectCustomCrop(this)">
      <span class="label">+ 직접입력</span>
    </div>`;
}
function pickCustomColor(col, el){
  window._customColor = ()=>col;
  document.querySelectorAll('#colorCatalog .color-dot').forEach(d=>d.classList.remove('sel'));
  el.classList.add('sel');
}
function selectCropTile(cropId, el){
  selectedCropId = cropId; useCustomCrop = false;
  document.querySelectorAll('.crop-tile').forEach(t=>t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('customCropBox').classList.add('hidden');
}
function selectCustomCrop(el){
  selectedCropId = null; useCustomCrop = true;
  document.querySelectorAll('.crop-tile').forEach(t=>t.classList.remove('sel'));
  el.classList.add('sel');
  document.getElementById('customCropBox').classList.remove('hidden');
}
// 저장 버튼을 두 번 연달아 누르면(네트워크 응답 오기 전 화면이 안 바뀌어서 흔히 일어남)
// 시교가 똑같이 두 번 등록되던 문제 — 처리 중일 때 재진입을 막는다.
let _creatingTrial = false;
async function createTrial(){
  if(_creatingTrial) return;
  _creatingTrial = true;
  try{
    const seg = document.getElementById('ntSeg').value.trim();
    const name = document.getElementById('ntName').value.trim();
    const region = document.getElementById('ntRegion').value.trim();
    const sowDate = document.getElementById('ntSowDate').value;
    const transplantDate = document.getElementById('ntTransplantDate').value;
    const season = document.getElementById('ntSeason').value.trim();
    const status = document.getElementById('ntStatus').value;
    const referenceVariety = document.getElementById('ntReferenceVariety').value.trim();
    const fieldAddresses = getAddressValues('nt');
    if(!seg || !name){ toast('SEG·제품/시교명을 입력해주세요'); return; }

    let growerId = null, growerName = null;
    try{
      const resolved = await resolveGrowerPicker('ntGrowerName');
      growerId = resolved.growerId; growerName = resolved.growerName;
    }catch(e){ toast('농가 정보를 저장하지 못했어요. 다시 시도해주세요.'); return; }

    let cropId = selectedCropId;
    if(useCustomCrop){
      const cname = document.getElementById('customCropName').value.trim();
      if(!cname){ toast('품목명을 입력해주세요'); return; }
      const color = window._customColor ? window._customColor() : '#4a7c59';
      cropId = uid();
      await idbPut('crops', {id:cropId, name:cname, color});
    }
    if(!cropId){ toast('품목을 선택해주세요'); return; }

    let productId = null, productName = name;
    try{
      const resolvedProduct = await resolveProductPicker('ntName', () => cropId);
      productId = resolvedProduct.productId;
      productName = resolvedProduct.name || name;
    }catch(e){ toast('제품 정보를 저장하지 못했어요. 다시 시도해주세요.'); return; }

    const id = uid();
    const now = Date.now();
    await idbPut('trials', {id, cropId, seg, name: productName, productId, region, growerId, growerName, sowDate, transplantDate, season, status, referenceVariety, fieldAddresses, createdAt: now, updatedAt: now});
    await idbPut('meta', {key:'lastUsed', value:{cropId, seg, trialId:id}});
    toast('시교가 등록됐어요');
    go('upload', id);
  }finally{
    _creatingTrial = false;
  }
}

/* ================= 시교 상세 ================= */
async function openTrialEditModal(){
  removeIfExists('trialEditModal');
  const t = await idbGet('trials', currentTrialId);
  const crops = await idbGetAll('crops');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='trialEditModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>분류 수정</h3>
      <div class="field">
        <label>품목</label>
        <select id="editTrialCrop">
          ${crops.map(c=>`<option value="${c.id}" ${c.id===t.cropId?'selected':''}>${c.name}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label>SEG</label>
        <input type="text" id="editTrialSeg" value="${t.seg}">
      </div>
      <div class="field-row">
        <div class="field">
          <label>제품/시교명</label>
          <input type="text" id="editTrialName" value="${t.name}" autocomplete="off">
          <div id="editTrialProductSuggest" class="grower-suggest hidden"></div>
        </div>
        <div class="field">
          <label>지역</label>
          <input type="text" id="editTrialRegion" value="${t.region||''}" placeholder="예: 인제">
        </div>
        <div class="field">
          <label>성함</label>
          <input type="text" id="editTrialGrowerName" value="${t.growerName||''}" placeholder="예: 송재호" autocomplete="off">
          <div id="editTrialGrowerSuggest" class="grower-suggest hidden"></div>
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>파종일 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
          <input type="date" id="editTrialSowDate" value="${t.sowDate||''}">
        </div>
        <div class="field">
          <label>정식일 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
          <input type="date" id="editTrialTransplantDate" value="${t.transplantDate||''}">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>시즌</label>
          <input type="number" id="editTrialSeason" value="${t.season||''}" placeholder="예: 2026" inputmode="numeric">
        </div>
        <div class="field">
          <label>상태</label>
          <select id="editTrialStatus">
            <option value="active" ${t.status==='active'?'selected':''}>진행중</option>
            <option value="planned" ${t.status==='planned'?'selected':''}>예정</option>
            <option value="done" ${t.status==='done'?'selected':''}>완료</option>
            <option value="stopped" ${t.status==='stopped'?'selected':''}>중단</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label>대비품종 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span></label>
        <input type="text" id="editTrialReferenceVariety" value="${t.referenceVariety||''}" placeholder="예: 칼라탄">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;">밭 주소 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">선택</span> <span class="link" style="margin-left:auto;" onclick="addAddressField('editTrial')">+ 주소 추가</span></label>
        <div id="editTrialAddressList"></div>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="cancelAction(()=>closeModal('trialEditModal'))">취소</button>
        <button class="btn btn-primary" onclick="saveTrialEdit()">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  const existingAddresses = (t.fieldAddresses && t.fieldAddresses.length) ? t.fieldAddresses : (t.fieldAddress ? [t.fieldAddress] : []);
  resetAddressFields('editTrial', existingAddresses);
  initGrowerPicker('editTrialGrowerName', 'editTrialGrowerSuggest', t.growerId, t.growerName);
  initProductPicker('editTrialName', 'editTrialProductSuggest', () => document.getElementById('editTrialCrop').value, t.productId, t.name);
}
// createTrial과 같은 이유(연달아 두 번 누르면 그로워/제품 피커가 각각 새 항목을
// 중복 생성할 수 있음) — 처리 중일 때 재진입을 막는다.
let _savingTrialEdit = false;
async function saveTrialEdit(){
  if(_savingTrialEdit) return;
  _savingTrialEdit = true;
  try{
    const cropId = document.getElementById('editTrialCrop').value;
    const seg = document.getElementById('editTrialSeg').value.trim();
    const name = document.getElementById('editTrialName').value.trim();
    const region = document.getElementById('editTrialRegion').value.trim();
    const sowDate = document.getElementById('editTrialSowDate').value;
    const transplantDate = document.getElementById('editTrialTransplantDate').value;
    const season = document.getElementById('editTrialSeason').value.trim();
    const status = document.getElementById('editTrialStatus').value;
    const referenceVariety = document.getElementById('editTrialReferenceVariety').value.trim();
    const fieldAddresses = getAddressValues('editTrial');
    if(!seg || !name){ toast('SEG·제품/시교명을 입력해주세요'); return; }
    let growerId = null, growerName = null;
    try{
      const resolved = await resolveGrowerPicker('editTrialGrowerName');
      growerId = resolved.growerId; growerName = resolved.growerName;
    }catch(e){ toast('농가 정보를 저장하지 못했어요. 다시 시도해주세요.'); return; }
    let productId = null, productName = name;
    try{
      const resolvedProduct = await resolveProductPicker('editTrialName', () => cropId);
      productId = resolvedProduct.productId;
      productName = resolvedProduct.name || name;
    }catch(e){ toast('제품 정보를 저장하지 못했어요. 다시 시도해주세요.'); return; }
    const pin = await promptPin({title:'시교 수정', message:'본인이 등록한 시교만 수정할 수 있어요. PIN을 입력해주세요.'});
    if(pin===null) return;
    const t = await idbGet('trials', currentTrialId);
    t.cropId = cropId; t.seg = seg; t.name = productName; t.productId = productId; t.region = region; t.growerId = growerId; t.growerName = growerName; t.sowDate = sowDate; t.transplantDate = transplantDate; t.season = season; t.status = status; t.referenceVariety = referenceVariety; t.fieldAddresses = fieldAddresses;
    delete t.fieldAddress;
    try{
      await withPin(pin, ()=> idbPut('trials', t));
    }catch(e){ toast(e.message); return; }
    closeModal('trialEditModal');
    toast('수정했어요');
    renderDetail(currentTrialId);
  }finally{
    _savingTrialEdit = false;
  }
}

async function deleteTrialConfirm(){
  const t = await idbGet('trials', currentTrialId);
  const ok = await showConfirm({
    title:'시교 삭제',
    message:`"${trialTitle(t)}" 시교를 삭제할까요?\n등록된 사진과 메모도 함께 삭제되고 되돌릴 수 없어요.`,
    confirmLabel:'삭제', danger:true
  });
  if(!ok) return;
  const pin = await promptPin({title:'시교 삭제', message:'본인이 등록한 시교만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    // 서버가 사진/메모/비교뷰/일정까지 한 번에 정리해줌 (R2 파일 포함)
    await withPin(pin, ()=> idbDelete('trials', currentTrialId));
  }catch(e){ toast(e.message); return; }
  toast('삭제했어요');
  go('home');
}
let allPhotosCache = [];
let cmpSlots = [null, null]; // 2~4개 photoId (또는 null)
// 대비품종이 있는 시교만 "자사품종/대비품종" 탭으로 타임라인을 나눔 — 없는 시교는 사진이
// 원래 안 섞이니 탭 자체를 안 보여줌.
let timelineSubjectFilter = 'own';
let timelineAgeBase = null, timelineAgeLabel = '';
function setTimelineSubject(subject){
  timelineSubjectFilter = subject;
  document.getElementById('timelineSubjectOwn').classList.toggle('active', subject==='own');
  document.getElementById('timelineSubjectRef').classList.toggle('active', subject==='reference');
  renderTimelineList();
}
function renderTimelineList(){
  const photos = allPhotosCache.filter(p => (p.subject||'own') === timelineSubjectFilter);
  const grouped = {};
  photos.forEach(p=>{ (grouped[p.date] = grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const timelineAll = document.getElementById('timelineAll');
  if(dateKeys.length===0){
    timelineAll.innerHTML = '<p class="empty">아직 등록된 사진이 없어요.</p>';
  } else {
    timelineAll.innerHTML = dateKeys.map(d=>{
      const age = daysBetweenDates(timelineAgeBase, d);
      const ageBadge = (age !== null && age >= 0) ? `<span class="age">${timelineAgeLabel.replace(' 후','')} +${age}일</span>` : '';
      return `
      <div class="date-group">
        <div class="date-head">${d} ${ageBadge}<span class="cnt">${grouped[d].length}장</span></div>
        <div class="photo-grid">
          ${grouped[d].map(p=>`<div class="photo-thumb" data-photo-id="${p.id}"><img loading="lazy" decoding="async" draggable="false" oncontextmenu="return false;" src="${getPhotoThumbUrl(p)}">${p.isMarked?'<div class="mark-badge">'+icon('pen',11)+'</div>':''}<div class="chk">${icon('check',12)}</div></div>`).join('')}
        </div>
      </div>`;
    }).join('');
  }
  initTimelineDelegation();
}
function switchDetailTab(tab){
  if(tab!=='timeline') exitTimelineSelectMode();
  document.getElementById('detailTabTimeline').classList.toggle('active', tab==='timeline');
  document.getElementById('detailTabEval').classList.toggle('active', tab==='eval');
  document.getElementById('detailTabMemo').classList.toggle('active', tab==='memo');
  document.getElementById('detailTabCompare').classList.toggle('active', tab==='compare');
  document.getElementById('detailPanelTimeline').classList.toggle('hidden', tab!=='timeline');
  document.getElementById('detailPanelEval').classList.toggle('hidden', tab!=='eval');
  document.getElementById('detailPanelMemo').classList.toggle('hidden', tab!=='memo');
  document.getElementById('detailPanelCompare').classList.toggle('hidden', tab!=='compare');
}
async function renderDetail(trialId){
  switchDetailTab('timeline');
  exitTimelineSelectMode();
  // 다른 시교 상세로 넘어올 때, 데이터를 새로 불러오는 동안 이전 시교 내용이
  // 잠깐 그대로 보이던 문제 — 화면이 바뀌자마자(await 전에) 먼저 비운다.
  document.getElementById('detailTitle').textContent = '';
  document.getElementById('detailStats').classList.add('hidden');
  document.getElementById('detailDates').classList.add('hidden');
  document.getElementById('detailAddressList').innerHTML = '';
  document.getElementById('timelineSubjectTabs').classList.add('hidden');
  document.getElementById('timelineAll').innerHTML = '';
  document.getElementById('noteList').innerHTML = '';
  document.getElementById('evalHistoryList').innerHTML = '';
  allPhotosCache = [];

  const t = await idbGet('trials', trialId);
  if(!t){ go('home'); return; }
  const c = await idbGet('crops', t.cropId);
  document.getElementById('detailTitle').textContent = trialTitle(t);
  const dateParts = [];
  if(t.sowDate) dateParts.push(['파종일', t.sowDate]);
  if(t.transplantDate) dateParts.push(['정식일', t.transplantDate]);
  if(t.referenceVariety) dateParts.push(['대비품종', t.referenceVariety]);
  const detailDatesEl = document.getElementById('detailDates');
  if(dateParts.length){
    detailDatesEl.innerHTML = dateParts.map(([label,value])=>`<div class="dd-row">${label}<b>${escapeHtml(value)}</b></div>`).join('');
    detailDatesEl.classList.remove('hidden');
  } else { detailDatesEl.classList.add('hidden'); }
  currentFieldAddresses = (t.fieldAddresses && t.fieldAddresses.length) ? t.fieldAddresses : (t.fieldAddress ? [t.fieldAddress] : []);
  const addrListEl = document.getElementById('detailAddressList');
  if(currentFieldAddresses.length){
    addrListEl.innerHTML = currentFieldAddresses.map((addr,i)=>`
      <div class="detail-address">
        <div class="addr-text">${currentFieldAddresses.length>1?`밭주소 ${i+1} : `:''}${escapeHtml(addr)}</div>
        <button class="action" onclick="copyFieldAddress(${i})">${icon('copy',17)}</button>
        <button class="action" onclick="openFieldAddressInMaps(${i})">${icon('pin',17)}</button>
      </div>`).join('');
  } else {
    addrListEl.innerHTML = '';
  }
  const photos = (await idbGetAllByIndex('photos','trialId',trialId)).sort((a,b)=>a.date.localeCompare(b.date) || a.createdAt-b.createdAt);
  allPhotosCache = photos;

  // 상단 요약: 정식(없으면 파종) 후 며칠 · 누적 사진 · 마지막 기록
  const ageBase = t.transplantDate || t.sowDate;
  const ageLabel = t.transplantDate ? '정식 후' : '파종 후';
  const stats = [];
  const grownDays = daysBetweenDates(ageBase, todayStr());
  if(grownDays !== null && grownDays >= 0) stats.push({v:String(grownDays), unit:'일', k:ageLabel});
  stats.push({v:String(photos.length), unit:'장', k:'누적 사진'});
  const lastPhotoDate = photos.length ? photos[photos.length-1].date : null;
  const sinceLast = daysBetweenDates(lastPhotoDate, todayStr());
  if(sinceLast === null || sinceLast < 0) stats.push({v:'—', unit:'', k:'마지막 기록'});
  else if(sinceLast === 0) stats.push({v:'오늘', unit:'', k:'마지막 기록'});
  else if(sinceLast === 1) stats.push({v:'어제', unit:'', k:'마지막 기록'});
  else stats.push({v:String(sinceLast), unit:'일 전', k:'마지막 기록'});
  const statsEl = document.getElementById('detailStats');
  statsEl.innerHTML = stats.map(s=>`
    <div class="detail-stat">
      <div class="v">${s.v}${s.unit?`<em>${s.unit}</em>`:''}</div>
      <div class="k">${s.k}</div>
    </div>`).join('');
  statsEl.classList.remove('hidden');

  if(photos.length===0){
    cmpSlots = cmpSlots.map(()=>null);
  } else {
    cmpSlots = cmpSlots.map(id => (id && photos.find(p=>p.id===id)) ? id : null);
  }
  renderCompareCountTabs();
  renderCompare();

  timelineAgeBase = ageBase;
  timelineAgeLabel = ageLabel;
  const hasReference = !!(t.referenceVariety && t.referenceVariety.trim());
  document.getElementById('timelineSubjectTabs').classList.toggle('hidden', !hasReference);
  document.getElementById('timelineSubjectRef').textContent = hasReference ? `대비품종 (${t.referenceVariety})` : '대비품종';
  setTimelineSubject('own');

  await renderNotes(trialId);
  await renderEvalHistory(trialId);
  exitSavedCmpSelectMode('detail');
  await renderSavedComparisons('detail', trialId);
}
function renderCompareCountTabs(){
  [2,3,4].forEach(n=>{
    document.getElementById(`cmpCount${n}`).classList.toggle('active', cmpSlots.length===n);
  });
}
function setDetailCompareCount(n){
  const cur = cmpSlots.length;
  if(n>cur){
    while(cmpSlots.length<n) cmpSlots.push(null);
  } else if(n<cur){
    cmpSlots = cmpSlots.slice(0,n);
  }
  renderCompareCountTabs();
  renderCompare();
}
function renderCompare(){
  const row = document.getElementById('cmpSlotsRow');
  row.innerHTML = cmpSlots.map((pid,i)=>{
    const p = allPhotosCache.find(x=>x.id===pid);
    return `<div class="xcmp-col">
      <div class="imgbox cmp-tap" onclick="openComparePicker(${i})">${p? `<img src="${getPhotoThumbUrl(p)}">` : '<div class="cmp-placeholder">탭해서<br>사진 선택</div>'}</div>
      <div class="xcmp-label">${p? p.date : '-'}</div>
    </div>`;
  }).join('');
}
function openComparePicker(slotIndex){
  removeIfExists('comparePickModal');
  const grouped = {};
  allPhotosCache.forEach(p=>{ (grouped[p.date]=grouped[p.date]||[]).push(p); });
  const dateKeys = Object.keys(grouped).sort((a,b)=>b.localeCompare(a));
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='comparePickModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:75vh;">
      <h3>비교할 사진 선택</h3>
      ${dateKeys.length===0 ? '<p class="empty">등록된 사진이 없어요. 먼저 사진을 등록해주세요.</p>' : dateKeys.map(d=>`
        <div class="date-group">
          <div class="date-head">${d}</div>
          <div class="photo-grid">
            ${grouped[d].map(p=>`<div class="photo-thumb" onclick="pickComparePhoto(${slotIndex},'${p.id}')"><img loading="lazy" decoding="async" src="${getPhotoThumbUrl(p)}"></div>`).join('')}
          </div>
        </div>`).join('')}
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
}
function pickComparePhoto(slotIndex, photoId){
  cmpSlots[slotIndex] = photoId;
  removeIfExists('comparePickModal');
  renderCompare();
}
function resetDetailCompare(){
  cmpSlots = cmpSlots.map(()=>null);
  renderCompare();
  toast('비교를 초기화했어요');
}


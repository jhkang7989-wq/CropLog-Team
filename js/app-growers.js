/* ================= 농가 명단 =================
   Phase 1부터는 농가가 실제 서버 레코드(growers 테이블)다. 예전처럼 시교의 growerName
   문자열을 화면에서 묶어서 보여주던 방식은 오타 하나로 같은 사람이 갈라지는 문제가 있어서
   폐기했고, 이제는 /api/growers를 그대로 쓴다. */

let growersCache = [];
let currentGrowerAddresses = [];
let _growerListTimer = null;

async function renderGrowers(){
  const input = document.getElementById('growerSearchInput');
  if(input) input.value = '';
  growersCache = await idbGetAll('growers');
  renderGrowerListView(growersCache, '');
  renderDupBanner(growersCache);
}

function renderGrowerList(){
  const q = (document.getElementById('growerSearchInput').value || '').trim();
  clearTimeout(_growerListTimer);
  _growerListTimer = setTimeout(async () => {
    let list;
    try{ list = q ? await fetchGrowers(q) : await idbGetAll('growers'); }
    catch(e){ return; }
    if(!q) growersCache = list;
    renderGrowerListView(list, q);
  }, 200);
}

function renderGrowerListView(list, q){
  document.getElementById('growerCount').textContent = q
    ? `${list.length}농가 검색됨`
    : `총 ${list.length}농가`;

  const el = document.getElementById('growerList');
  if(list.length===0){
    el.innerHTML = q
      ? '<p class="empty">일치하는 농가가 없어요.</p>'
      : '<p class="empty">등록된 농가가 없어요. 오른쪽 위 + 버튼으로 새 농가를 등록해보세요.</p>';
    return;
  }
  el.innerHTML = list.map(g=>{
    const sub = [[g.regionSido, g.regionSigun].filter(Boolean).join(' '), g.phone||'']
      .filter(Boolean).join(' · ');
    return `<div class="farm-card" onclick="go('grower','${g.id}')">
      <div class="farm-body">
        <div class="farm-name">${escapeHtml(g.name)}</div>
        ${sub ? `<div class="farm-sub">${escapeHtml(sub)}</div>` : ''}
        ${(g.mainCrops && g.mainCrops.length) ? `<div class="crop-tags">${g.mainCrops.map(c=>`<span class="crop-chip">${escapeHtml(c)}</span>`).join('')}</div>` : ''}
      </div>
      <div class="farm-right">
        <span class="farm-count">${g.trialCount||0}건</span>
        <span class="chev">›</span>
      </div>
    </div>`;
  }).join('');
}

/* ================= 비슷한 이름 농가 합치기 =================
   마이그레이션 때 공백만 다른 이름("송재호"/"송 재호")은 자동으로 합치지 않고
   그대로 남겨뒀는데, 여기서 사람이 보고 합칠 수 있게 한다. 띄어쓰기를 다 지운
   이름이 같으면 같은 묶음으로 본다 — 완전히 다른 사람인데 이름이 우연히 같은
   경우도 있을 수 있어서, 자동으로 합치지 않고 항상 사람이 확인하고 눌러야 합쳐짐. */
function normalizeGrowerName(name){
  return (name||'').replace(/\s+/g,'');
}
function findDuplicateGroups(list){
  const map = new Map();
  list.forEach(g=>{
    const key = normalizeGrowerName(g.name);
    if(!key) return;
    if(!map.has(key)) map.set(key, []);
    map.get(key).push(g);
  });
  return [...map.values()].filter(arr=>arr.length>1);
}
function renderDupBanner(list){
  const banner = document.getElementById('growerDupBanner');
  const groups = findDuplicateGroups(list);
  if(!groups.length){ banner.classList.add('hidden'); return; }
  document.getElementById('growerDupBannerText').textContent = `이름이 비슷한 농가가 있어요 (${groups.length}건) · 확인하기`;
  banner.classList.remove('hidden');
}

async function openGrowerMergeModal(){
  let list;
  try{ list = await idbGetAll('growers'); }catch(e){ toast('농가 목록을 불러오지 못했어요'); return; }
  growersCache = list;
  renderDupBanner(list);
  const groups = findDuplicateGroups(list);
  if(!groups.length){ toast('합칠 만한 농가가 없어요'); return; }
  removeIfExists('growerMergeModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='growerMergeModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:80vh;">
      <h3>비슷한 이름 농가 합치기</h3>
      <p style="font-size:12px;color:var(--muted);margin:-8px 0 14px;line-height:1.6;">이름에서 띄어쓰기만 다른 농가들이에요. 기준으로 남길 농가를 고르면 나머지는 그 농가로 합쳐지고 삭제돼요.</p>
      <div id="growerMergeGroups"></div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  renderMergeGroups(groups);
}

function renderMergeGroups(groups){
  window._mergeGroups = groups;
  const el = document.getElementById('growerMergeGroups');
  if(!groups.length){
    el.innerHTML = '<p class="empty">합칠 농가가 더 없어요.</p>';
    setTimeout(()=> closeModal('growerMergeModal'), 900);
    return;
  }
  el.innerHTML = groups.map((group,gi)=>`
    <div class="settings-group" style="margin-bottom:16px;">
      ${group.map((g,i)=>{
        const region = [g.regionSido, g.regionSigun].filter(Boolean).join(' ');
        const sub = [`시교 ${g.trialCount||0}건`, region].filter(Boolean).join(' · ');
        return `<label class="settings-row" style="cursor:pointer;">
          <span style="display:flex;align-items:center;gap:9px;">
            <input type="radio" name="mergeGroup${gi}" value="${g.id}" ${i===0?'checked':''}>
            <span>${escapeHtml(g.name)}<br><span style="color:var(--muted);font-weight:400;font-size:11px;">${escapeHtml(sub)}</span></span>
          </span>
        </label>`;
      }).join('')}
      <div style="padding:11px 14px;">
        <button class="btn btn-primary" style="width:100%;" onclick="mergeGrowerGroup(${gi})">이 농가로 합치기</button>
      </div>
    </div>`).join('');
}

async function mergeGrowerGroup(gi){
  const groups = window._mergeGroups || [];
  const group = groups[gi];
  if(!group) return;
  const checked = document.querySelector(`input[name="mergeGroup${gi}"]:checked`);
  if(!checked){ toast('기준 농가를 선택해주세요'); return; }
  const primaryId = checked.value;
  const primary = group.find(g=>g.id===primaryId);
  const duplicateIds = group.filter(g=>g.id!==primaryId).map(g=>g.id);
  const ok = await showConfirm({
    title:'농가 합치기',
    message:`"${primary.name}" 농가로 나머지 ${duplicateIds.length}곳을 합칠까요?\n합쳐지는 농가는 삭제되고 되돌릴 수 없어요.`,
    confirmLabel:'합치기', danger:true
  });
  if(!ok) return;
  const pin = await promptPin({title:'농가 합치기', message:'본인 확인을 위해 PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> mergeGrowers(primaryId, duplicateIds));
  }catch(e){ toast(e.message); return; }
  toast('농가를 합쳤어요');
  let list;
  try{ list = await idbGetAll('growers'); }catch(e){ list = growersCache; }
  growersCache = list;
  renderGrowerListView(list, '');
  renderDupBanner(list);
  renderMergeGroups(findDuplicateGroups(list));
}

async function renderGrower(id){
  currentGrowerId = id;
  const g = await idbGet('growers', id);
  if(!g){ go('growers'); return; }
  document.getElementById('growerTitle').textContent = g.name;
  currentGrowerAddresses = g.addresses || [];

  const trials = await idbGetAllByIndex('trials', 'growerId', id);
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));

  const stats = [
    {v:String(trials.length), unit:'건', k:'진행 시교'},
    {v:String((g.mainCrops||[]).length), unit:'품목', k:'재배 품목'},
    {v:String(currentGrowerAddresses.length), unit:'곳', k:'밭'},
  ];
  document.getElementById('growerStats').innerHTML = stats.map(s=>`
    <div class="detail-stat">
      <div class="v">${s.v}<em>${s.unit}</em></div>
      <div class="k">${s.k}</div>
    </div>`).join('');

  const infoRows = [];
  if(g.phone) infoRows.push(['연락처', `<a href="tel:${escapeHtml(g.phone)}">${escapeHtml(g.phone)}</a>`]);
  const region = [g.regionSido, g.regionSigun].filter(Boolean).join(' ');
  if(region) infoRows.push(['지역', escapeHtml(region)]);
  if(g.farmSizeValue !== null && g.farmSizeValue !== undefined && g.farmSizeValue !== '') infoRows.push(['규모', `${escapeHtml(String(g.farmSizeValue))}${escapeHtml(g.farmSizeUnit||'')}`]);
  const infoCard = document.getElementById('growerInfoCard');
  if(infoRows.length){
    infoCard.innerHTML = infoRows.map(([label,html])=>`<div class="dd-row">${label}<b>${html}</b></div>`).join('');
    infoCard.classList.remove('hidden');
  } else {
    infoCard.innerHTML = '';
    infoCard.classList.add('hidden');
  }

  const memoSection = document.getElementById('growerMemoSection');
  if(g.memo && g.memo.trim()){
    document.getElementById('growerMemo').textContent = g.memo;
    memoSection.classList.remove('hidden');
  } else {
    memoSection.classList.add('hidden');
  }

  const addrSection = document.getElementById('growerAddrSection');
  if(currentGrowerAddresses.length){
    addrSection.classList.remove('hidden');
    document.getElementById('growerAddrList').innerHTML = currentGrowerAddresses.map((addr,i)=>`
      <div class="addr-card">
        <div class="addr-body">
          <div class="addr-text">${escapeHtml(addr)}</div>
        </div>
        <button class="action ib" onclick="copyGrowerAddress(${i})" aria-label="주소 복사">${icon('copy',15)}</button>
        <button class="action ib" onclick="openGrowerAddressInMaps(${i})" aria-label="네이버 지도로 열기">${icon('pin',15)}</button>
      </div>`).join('');
  } else {
    addrSection.classList.add('hidden');
    document.getElementById('growerAddrList').innerHTML = '';
  }

  const sortedTrials = trials.slice().sort((a,b)=> (b.updatedAt||b.createdAt) - (a.updatedAt||a.createdAt));
  document.getElementById('growerTrialsTitle').textContent = `이 농가의 시교 ${trials.length}건`;
  document.getElementById('growerTrialList').innerHTML = sortedTrials.length ? `
    <div class="home-crop-group"><div class="home-crop-body">
      ${sortedTrials.map(t=>{
        const c = cropMap[t.cropId] || {name:'?', color:'#999'};
        return `<div class="recent-item" onclick="go('detail','${t.id}')">
          <div class="bar" style="background:${c.color}"></div>
          <div class="info">
            <div class="name">${escapeHtml(t.name || trialTitle(t))}</div>
            <div class="sub">${escapeHtml(c.name)}${t.seg ? ' · '+escapeHtml(t.seg) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:6px;">
            <span class="when">${timeAgo(t.updatedAt||t.createdAt)}</span>
            <span class="chev">›</span>
          </div>
        </div>`;
      }).join('')}
    </div></div>` : '<p class="empty">아직 등록된 시교가 없어요.</p>';
}

function copyGrowerAddress(idx){
  copyTextToClipboard(currentGrowerAddresses[idx], '주소를 복사했어요');
}
function openGrowerAddressInMaps(idx){
  openAddressInNaverMap(currentGrowerAddresses[idx]);
}

/* ================= 농가 등록 · 수정 ================= */
async function openGrowerEditModal(growerId){
  removeIfExists('growerEditModal');
  const g = growerId ? await idbGet('growers', growerId) : null;
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='growerEditModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>${g ? '농가 정보 수정' : '새 농가 등록'}</h3>
      <div class="field">
        <label>성함</label>
        <input type="text" id="geName" value="${g ? escapeHtml(g.name) : ''}" placeholder="예: 송재호">
      </div>
      <div class="field">
        <label>연락처</label>
        <input type="tel" id="gePhone" value="${g ? escapeHtml(g.phone||'') : ''}" placeholder="010-0000-0000">
      </div>
      <div class="field-row">
        <div class="field">
          <label>지역(시도)</label>
          <input type="text" id="geRegionSido" value="${g ? escapeHtml(g.regionSido||'') : ''}" placeholder="예: 강원">
        </div>
        <div class="field">
          <label>지역(시군)</label>
          <input type="text" id="geRegionSigun" value="${g ? escapeHtml(g.regionSigun||'') : ''}" placeholder="예: 인제">
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>재배 규모</label>
          <input type="number" id="geFarmSizeValue" value="${(g && g.farmSizeValue!==null && g.farmSizeValue!==undefined) ? g.farmSizeValue : ''}" placeholder="예: 1200" inputmode="decimal">
        </div>
        <div class="field">
          <label>단위</label>
          <input type="text" id="geFarmSizeUnit" value="${g ? escapeHtml(g.farmSizeUnit||'평') : '평'}" placeholder="예: 평">
        </div>
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;">주요 재배 품목 <span class="autofill-tag" style="background:var(--cream);color:var(--muted);">쉼표로 구분</span></label>
        <input type="text" id="geMainCrops" value="${g && g.mainCrops ? escapeHtml(g.mainCrops.join(', ')) : ''}" placeholder="예: 고추, 토마토">
      </div>
      <div class="field">
        <label style="display:flex;align-items:center;">밭 주소 <span class="link" style="margin-left:auto;" onclick="addAddressField('geAddr')">+ 주소 추가</span></label>
        <div id="geAddrAddressList"></div>
      </div>
      <div class="field">
        <label>비고</label>
        <textarea id="geMemo" rows="3" placeholder="특이사항 등">${g ? escapeHtml(g.memo||'') : ''}</textarea>
      </div>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="cancelAction(()=>closeModal('growerEditModal'))">취소</button>
        <button class="btn btn-primary" onclick="saveGrowerEdit('${g ? g.id : ''}')">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  resetAddressFields('geAddr', g ? g.addresses : []);
}

async function saveGrowerEdit(growerId){
  const name = document.getElementById('geName').value.trim();
  if(!name){ toast('성함을 입력해주세요'); return; }
  const phone = document.getElementById('gePhone').value.trim();
  const regionSido = document.getElementById('geRegionSido').value.trim();
  const regionSigun = document.getElementById('geRegionSigun').value.trim();
  const farmSizeValueRaw = document.getElementById('geFarmSizeValue').value.trim();
  const farmSizeValue = farmSizeValueRaw ? Number(farmSizeValueRaw) : null;
  const farmSizeUnit = document.getElementById('geFarmSizeUnit').value.trim();
  const mainCrops = document.getElementById('geMainCrops').value.split(',').map(s=>s.trim()).filter(Boolean);
  const addresses = getAddressValues('geAddr');
  const memo = document.getElementById('geMemo').value.trim();
  const payload = {name, phone, regionSido, regionSigun, farmSizeValue, farmSizeUnit, mainCrops, addresses, memo};

  if(growerId){
    payload.id = growerId;
    const pin = await promptPin({title:'농가 정보 수정', message:'본인이 등록한 농가만 수정할 수 있어요. PIN을 입력해주세요.'});
    if(pin===null) return;
    try{
      await withPin(pin, ()=> idbPut('growers', payload));
    }catch(e){ toast(e.message); return; }
  } else {
    try{
      await idbPut('growers', payload);
    }catch(e){ toast(e.message); return; }
  }
  closeModal('growerEditModal');
  toast('저장했어요');
  if(growerId) renderGrower(growerId);
  else go('growers');
}

async function deleteGrowerConfirm(){
  const g = await idbGet('growers', currentGrowerId);
  if(!g) return;
  const ok = await showConfirm({
    title:'농가 삭제',
    message:`"${g.name}" 농가를 삭제할까요?\n연결된 시교가 있으면 삭제할 수 없어요.`,
    confirmLabel:'삭제', danger:true
  });
  if(!ok) return;
  const pin = await promptPin({title:'농가 삭제', message:'본인이 등록한 농가만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> idbDelete('growers', currentGrowerId));
  }catch(e){ toast(e.message); return; }
  toast('삭제했어요');
  go('growers');
}

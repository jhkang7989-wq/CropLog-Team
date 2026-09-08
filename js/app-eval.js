/* ================= 평가 =================
   기획서 결정: 공통 5축(생육/병해/수량/상품성/종합, 1~5점)은 모든 품목 공통이고,
   품목별 커스텀 항목(고추=신미·과장·착과 등)은 품목 관리 화면에서 직접 추가·삭제한다.
   방문마다 거의 매번 남기는 기능이라 사진 추가 화면 안에 이 UI를 그대로 붙여 쓴다
   (renderUpload에서 initEvalSection 호출). 지난 회차 값은 "흐리게"(ghost) 기본
   선택돼 있어서, 안 건드리고 그대로 저장해도 그 값이 오늘 값으로 저장된다 —
   달라진 항목만 다시 누르면 됨. */
const EVAL_AXES = [
  {key:'growth', label:'생육'},
  {key:'disease', label:'병해'},
  {key:'yield', label:'수량'},
  {key:'quality', label:'상품성'},
  {key:'overall', label:'종합'},
];
const EVAL_ITEM_TYPE_LABELS = {score:'점수', number:'숫자', choice:'선택', check:'체크', memo:'메모'};
const EVAL_CHOICE_PRESET = ['상','중','하'];

let evalCustomItems = [];
let evalState = {custom:{}};
let evalTouched = {custom:{}};

// exact=true면 "이 기록 자체를 수정"하는 것이라 있는 값은 확정(진하게) 표시,
// exact가 아니면(사진 추가 흐름의 기본 진입) 지난 값은 흐리게 표시만 하고
// 실제로 누르기 전까진 "안 건드림" 상태로 둔다(그래도 저장하면 그 값 그대로 나감).
async function initEvalSection(containerId, cropId, prefill, exact){
  // 상태를 먼저 초기화해서, 항목 목록을 못 가져와도(서버 아직 배포 전, 일시적 오류 등)
  // 이전 시교를 보던 evalState가 그대로 남아 엉뚱한 시교에 저장되는 일이 없게 한다.
  evalState = {custom:{}};
  evalTouched = {custom:{}};
  try{
    evalCustomItems = cropId ? await fetchEvalItems(cropId) : [];
  }catch(e){
    evalCustomItems = [];
  }
  EVAL_AXES.forEach(a=>{
    const v = prefill ? (prefill[a.key] ?? null) : null;
    evalState[a.key] = v;
    evalTouched[a.key] = !!exact && v!=null;
  });
  evalCustomItems.forEach(item=>{
    const v = (prefill && prefill.customValues) ? (prefill.customValues[item.id] ?? null) : null;
    evalState.custom[item.id] = v;
    evalTouched.custom[item.id] = !!exact && v!=null && v!=='';
  });
  renderEvalSection(containerId);
}
function renderEvalSection(containerId){
  const el = document.getElementById(containerId);
  if(!el) return;
  const axesHtml = EVAL_AXES.map(a=>`
    <div class="eval-row">
      <span class="eval-label">${a.label}</span>
      <div class="eval-scores">
        ${[1,2,3,4,5].map(v=>`<button type="button" class="eval-score-btn ${_evalBtnClass(evalState[a.key]===v, evalTouched[a.key])}" onclick="pickEvalAxis('${containerId}','${a.key}',${v})">${v}</button>`).join('')}
      </div>
    </div>`).join('');
  const customHtml = evalCustomItems.map(item=>{
    const val = evalState.custom[item.id];
    const touched = evalTouched.custom[item.id];
    if(item.type==='score'){
      return `<div class="eval-row">
        <span class="eval-label">${escapeHtml(item.name)}</span>
        <div class="eval-scores">
          ${[1,2,3,4,5].map(v=>`<button type="button" class="eval-score-btn ${_evalBtnClass(val===v, touched)}" onclick="pickEvalCustom('${containerId}','${item.id}',${v})">${v}</button>`).join('')}
        </div>
      </div>`;
    }
    if(item.type==='choice'){
      const choices = (item.choices && item.choices.length) ? item.choices : EVAL_CHOICE_PRESET;
      return `<div class="eval-row">
        <span class="eval-label">${escapeHtml(item.name)}</span>
        <div class="eval-scores">
          ${choices.map(c=>`<button type="button" class="eval-choice-btn ${_evalBtnClass(val===c, touched)}" onclick="pickEvalCustom('${containerId}','${item.id}','${escapeHtml(c)}')">${escapeHtml(c)}</button>`).join('')}
        </div>
      </div>`;
    }
    if(item.type==='check'){
      return `<div class="eval-row">
        <span class="eval-label">${escapeHtml(item.name)}</span>
        <div class="switch ${val?'on':''}" onclick="toggleEvalCheck('${containerId}','${item.id}')"><div class="knob"></div></div>
      </div>`;
    }
    // number / memo — 값 자체를 바로 채워서 보여줌(따로 흐리게 표시하지 않음)
    return `<div class="field" style="margin-bottom:10px;">
      <label>${escapeHtml(item.name)}</label>
      <input type="${item.type==='number'?'number':'text'}" value="${val!=null?escapeHtml(String(val)):''}" oninput="setEvalCustomText('${item.id}', this.value, '${item.type}')">
    </div>`;
  }).join('');
  el.innerHTML = `<div class="eval-axes">${axesHtml}</div>` + (customHtml ? `<div class="eval-custom">${customHtml}</div>` : '');
}
function _evalBtnClass(isSelected, touched){
  if(!isSelected) return '';
  return touched ? 'sel' : 'sel-ghost';
}
function pickEvalAxis(containerId, key, val){
  evalState[key] = (evalState[key]===val && evalTouched[key]) ? null : val;
  evalTouched[key] = true;
  renderEvalSection(containerId);
}
function pickEvalCustom(containerId, itemId, val){
  const cur = evalState.custom[itemId];
  evalState.custom[itemId] = (cur===val && evalTouched.custom[itemId]) ? null : val;
  evalTouched.custom[itemId] = true;
  renderEvalSection(containerId);
}
function toggleEvalCheck(containerId, itemId){
  evalState.custom[itemId] = !evalState.custom[itemId];
  evalTouched.custom[itemId] = true;
  renderEvalSection(containerId);
}
function setEvalCustomText(itemId, value, type){
  evalTouched.custom[itemId] = true;
  evalState.custom[itemId] = type==='number' ? (value===''? null : Number(value)) : (value || null);
}
// 값이 하나도 없으면 null — 사진만 저장하고 평가는 생략한 경우와 구분하기 위해서.
function collectEvalPayload(){
  const hasAxis = EVAL_AXES.some(a=> evalState[a.key]!=null);
  const hasCustom = Object.values(evalState.custom).some(v=> v!=null && v!=='');
  if(!hasAxis && !hasCustom) return null;
  const payload = {customValues:{}};
  EVAL_AXES.forEach(a=> payload[a.key] = evalState[a.key]);
  Object.entries(evalState.custom).forEach(([k,v])=> payload.customValues[k] = v);
  return payload;
}
async function getLatestEvaluation(trialId){
  // 사진 등록 화면(renderUpload)이 이 값을 기다렸다가 쓰기 때문에, 여기서 실패하면
  // 사진 등록 자체가 막혀버린다 — 평가 이력을 못 가져와도 사진 업로드는 살아있어야 하니
  // 예외를 삼키고 "지난 평가 없음"으로 취급한다.
  try{
    const list = await idbGetAllByIndex('evaluations', 'trialId', trialId);
    return (list && list.length) ? list[0] : null;
  }catch(e){
    return null;
  }
}
function saveEvaluationEntry(trialId, date, payload, existingId){
  return idbPut('evaluations', Object.assign({trialId, date}, payload, existingId ? {id:existingId} : {}));
}

/* ================= 시교 상세 - 평가 이력 탭 ================= */
// renderDetail()의 await 체인 중간에 있어서, 여기서 실패하면(서버 아직 배포 전, 일시
// 오류 등) 뒤에 있는 성장비교 탭까지 렌더가 안 되는 문제가 생긴다 — 그래서 이 탭 자체를
// 못 불러온 상태로만 표시하고 예외를 밖으로 던지지 않는다.
async function renderEvalHistory(trialId){
  const el = document.getElementById('evalHistoryList');
  let list, items;
  try{
    const t = await idbGet('trials', trialId);
    [list, items] = await Promise.all([
      idbGetAllByIndex('evaluations', 'trialId', trialId),
      t ? fetchEvalItems(t.cropId) : Promise.resolve([])
    ]);
  }catch(e){
    el.innerHTML = '<p class="empty">평가를 불러오지 못했어요. 잠시 후 다시 시도해주세요.</p>';
    return;
  }
  const itemMap = Object.fromEntries(items.map(i=>[i.id,i]));
  if(!list.length){
    el.innerHTML = '<p class="empty">등록된 평가가 없어요. "+ 추가"로 남기거나 사진 추가할 때 같이 남겨보세요.</p>';
    return;
  }
  el.innerHTML = list.map(e=>{
    const axisParts = EVAL_AXES.filter(a=> e[a.key]!=null).map(a=> `${a.label} ${e[a.key]}`);
    const customParts = Object.entries(e.customValues||{})
      .filter(([,v])=> v!=null && v!=='')
      .map(([k,v])=> `${escapeHtml((itemMap[k]||{name:'?'}).name)} ${escapeHtml(String(v))}`);
    const parts = [...axisParts, ...customParts];
    return `<div class="list-item" style="align-items:flex-start;cursor:default;">
      <div class="info" style="flex:1;">
        <div class="sub" style="margin-bottom:3px;">${e.date}</div>
        <div class="name" style="font-weight:400;font-size:13px;line-height:1.6;">${parts.length ? parts.join(' · ') : '<span style="color:var(--muted);">입력된 값 없음</span>'}</div>
      </div>
      <div style="display:flex;gap:4px;flex:0 0 auto;">
        <button class="action" style="color:var(--muted);font-size:14px;" onclick="openEvalEntryModal('${e.id}')">${icon('edit',15)}</button>
        <button class="action" style="color:var(--danger);font-size:14px;" onclick="deleteEvalEntry('${e.id}')">${icon('trash',16)}</button>
      </div>
    </div>`;
  }).join('');
}
async function openEvalEntryModal(evalId){
  removeIfExists('evalEntryModal');
  const t = await idbGet('trials', currentTrialId);
  let existing = null, prefill = null;
  if(evalId){
    const list = await idbGetAllByIndex('evaluations', 'trialId', currentTrialId);
    existing = list.find(e=>e.id===evalId);
    prefill = existing;
  } else {
    prefill = await getLatestEvaluation(currentTrialId);
  }
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='evalEntryModal';
  backdrop.innerHTML = `
    <div class="modal-sheet" style="max-height:85vh;">
      <h3>${evalId ? '평가 수정' : '평가 추가'}</h3>
      <div class="field">
        <label>날짜</label>
        <input type="date" id="evalEntryDate" value="${existing ? existing.date : todayStr()}">
      </div>
      <div id="evalEntryInputs"></div>
      <div class="btn-row" style="margin-top:14px;">
        <button class="btn btn-ghost" onclick="cancelAction(()=>closeModal('evalEntryModal'))">취소</button>
        <button class="btn btn-primary" onclick="saveEvalEntryModal('${evalId||''}')">저장</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  await initEvalSection('evalEntryInputs', t ? t.cropId : null, prefill, !!existing);
}
async function saveEvalEntryModal(evalId){
  const payload = collectEvalPayload();
  if(!payload){ toast('평가 값을 하나 이상 입력해주세요'); return; }
  const date = document.getElementById('evalEntryDate').value || todayStr();
  try{
    if(evalId){
      const pin = await promptPin({title:'평가 수정', message:'본인이 등록한 평가만 수정할 수 있어요. PIN을 입력해주세요.'});
      if(pin===null) return;
      await withPin(pin, ()=> saveEvaluationEntry(currentTrialId, date, payload, evalId));
    } else {
      await saveEvaluationEntry(currentTrialId, date, payload);
    }
  }catch(e){ toast(e.message); return; }
  closeModal('evalEntryModal');
  toast('평가를 저장했어요');
  renderEvalHistory(currentTrialId);
}
async function deleteEvalEntry(evalId){
  const ok = await showConfirm({title:'평가 삭제', message:'이 평가 기록을 삭제할까요?', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  const pin = await promptPin({title:'평가 삭제', message:'본인이 등록한 평가만 삭제할 수 있어요. PIN을 입력해주세요.'});
  if(pin===null) return;
  try{
    await withPin(pin, ()=> idbDelete('evaluations', evalId));
  }catch(e){ toast(e.message); return; }
  toast('삭제했어요');
  renderEvalHistory(currentTrialId);
}

/* ================= 품목 관리 - 평가 항목(품목별 커스텀) ================= */
async function renderCropEvalItems(cropId){
  const el = document.getElementById('cropEvalItemList');
  if(!el) return;
  let items;
  try{
    items = await fetchEvalItems(cropId);
  }catch(e){
    el.innerHTML = '<p class="empty" style="padding:8px 0;">평가 항목을 불러오지 못했어요.</p>';
    return;
  }
  if(!items.length){
    el.innerHTML = '<p class="empty" style="padding:8px 0;">아직 등록된 평가 항목이 없어요.</p>';
    return;
  }
  el.innerHTML = items.map(i=>`
    <div class="list-item" style="cursor:default;">
      <div class="info"><div class="name" style="font-weight:600;font-size:13px;">${escapeHtml(i.name)}</div><div class="sub">${EVAL_ITEM_TYPE_LABELS[i.type]||i.type}</div></div>
      <button class="action" style="color:var(--danger);" onclick="deleteEvalItem('${cropId}','${i.id}')">${icon('trash',15)}</button>
    </div>`).join('');
}
async function addEvalItem(cropId){
  const nameEl = document.getElementById('newEvalItemName');
  const name = nameEl.value.trim();
  if(!name){ toast('항목명을 입력해주세요'); return; }
  const type = document.getElementById('newEvalItemType').value;
  try{
    await idbPut('evalItems', {cropId, name, type});
  }catch(e){ toast(e.message); return; }
  nameEl.value = '';
  toast('평가 항목을 추가했어요');
  renderCropEvalItems(cropId);
}
async function deleteEvalItem(cropId, itemId){
  const ok = await showConfirm({title:'평가 항목 삭제', message:'이 평가 항목을 삭제할까요? 이미 기록된 평가의 값은 화면에서 안 보이게 될 수 있어요.', confirmLabel:'삭제', danger:true});
  if(!ok) return;
  try{
    await idbDelete('evalItems', itemId);
  }catch(e){ toast(e.message); return; }
  toast('삭제했어요');
  renderCropEvalItems(cropId);
}

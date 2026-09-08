/* ================= 앱 버전 ================= */
const APP_VERSION = 59;
document.getElementById('appVersionText').textContent = `CropLog v${APP_VERSION} · 팀 서버 모드`;

/* ================= 서버 API 레이어 =================
   기존 IndexedDB 버전과 함수 이름/모양(idbGet, idbPut, idbGetAll...)을 그대로 유지해서
   이 파일 밖의 화면 코드(app-home.js 등)는 대부분 안 건드려도 되게 만듦. 내부만 fetch로 교체.
   store별 upsert 규칙: crops/trials/schedules/notes는 "id가 이미 존재하면 수정, 아니면 생성"을
   서버가 판단(POST 하나로 통일) — 클라이언트가 uid()로 새 id를 만들어 idbPut 하던 기존 패턴과
   그대로 맞음. photos/comparisons는 실제 파일 업로드가 껴 있어서 별도 처리(아래 참고). */
const API_BASE = 'https://croplog-server.jhkang7989.workers.dev';

function getAppPassword(){ return localStorage.getItem('cl_pw') || ''; }
function setAppPassword(pw){ localStorage.setItem('cl_pw', pw); }
function getCurrentUser(){ try{ return JSON.parse(localStorage.getItem('cl_user')||'null'); }catch(e){ return null; } }
function setCurrentUser(u){ localStorage.setItem('cl_user', JSON.stringify(u)); }
function clearCurrentUser(){ localStorage.removeItem('cl_user'); }

// 수정/삭제처럼 PIN 증명이 필요한 요청 바로 직전에만 짧게 채워지는 값.
// 함수 시그니처를 안 바꾸려고(idbDelete('trials', id) 그대로 쓰기 위해) 전역에 잠깐 담아 씀.
let _pendingPin = null;
function withPin(pin, fn){
  _pendingPin = pin;
  return Promise.resolve().then(fn).finally(()=>{ _pendingPin = null; });
}

async function apiFetch(path, options){
  options = options || {};
  const headers = Object.assign({}, options.headers, { 'X-App-Password': getAppPassword() });
  const user = getCurrentUser();
  if(user) headers['X-User-Id'] = user.id;
  if(_pendingPin) headers['X-User-Pin'] = _pendingPin;
  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  if(res.status === 204) return null;
  let body = null;
  try{ body = await res.json(); }catch(e){}
  if(!res.ok){
    const err = new Error((body && body.error) || `요청 실패 (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return body;
}
function apiJson(path, method, data){
  return apiFetch(path, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(data) });
}

// 실제 등록된 팀원 이름과 최근 시교 목록은 자주 쓰이니 메모리에 살짝 캐싱(새로고침하면 초기화됨).
let _cropsCache = null;
async function fetchCropsCached(force){
  if(!_cropsCache || force) _cropsCache = await apiFetch('/api/crops');
  return _cropsCache;
}

function idbGetAllByIndex(store, indexName, value){
  if(store==='photos' && indexName==='trialId') return apiFetch(`/api/trials/${value}/photos`);
  if(store==='notes' && indexName==='trialId') return apiFetch(`/api/trials/${value}/notes`);
  if(store==='trials' && indexName==='growerId') return apiFetch(`/api/growers/${value}/trials`);
  return Promise.resolve([]);
}
// schedules/date에 IDBKeyRange를 쓰던 걸 from/to/date 쿼리로 변환
function idbGetAllByRange(store, indexName, range){
  if(store==='schedules' && indexName==='date'){
    const q = new URLSearchParams();
    if(range.lower===range.upper) q.set('date', range.lower);
    else if(range.upper===undefined || range.upper===null) { q.set('from', range.lower); q.set('to', '9999-12-31'); }
    else { q.set('from', range.lower); q.set('to', range.upper); }
    return apiFetch(`/api/schedules?${q.toString()}`);
  }
  return Promise.resolve([]);
}
function idbGetAll(store){
  if(store==='crops') return fetchCropsCached();
  if(store==='trials') return apiFetch('/api/trials?limit=200').then(r=>r.items);
  if(store==='growers') return apiFetch('/api/growers');
  return Promise.resolve([]);
}
async function idbGet(store, key){
  if(!key) return undefined;
  if(store==='trials') return apiFetch(`/api/trials/${key}`).catch(()=>undefined);
  if(store==='crops') return (await fetchCropsCached()).find(c=>c.id===key);
  if(store==='photos') return apiFetch(`/api/photos/${key}`).catch(()=>undefined);
  if(store==='notes') return apiFetch(`/api/notes/${key}`).catch(()=>undefined);
  if(store==='comparisons') return apiFetch(`/api/comparisons/${key}`).catch(()=>undefined);
  if(store==='schedules') return apiFetch(`/api/schedules/${key}`).catch(()=>undefined);
  if(store==='growers') return apiFetch(`/api/growers/${key}`).catch(()=>undefined);
  if(store==='meta') return getLocalMeta(key);
  return undefined;
}
function idbPut(store, val){
  if(store==='crops') return apiJson('/api/crops', 'POST', val).then(r=>{ _cropsCache=null; return r; });
  if(store==='trials') return apiJson('/api/trials', 'POST', val);
  if(store==='schedules') return apiJson('/api/schedules', 'POST', val);
  if(store==='notes') return apiJson(`/api/trials/${val.trialId}/notes`, 'POST', val);
  if(store==='growers') return apiJson('/api/growers', 'POST', val);
  if(store==='meta') return Promise.resolve(setLocalMeta(val));
  // photos/comparisons는 파일 업로드가 껴서 각자 전용 함수(uploadPhoto 등)로 처리 — 여기로 오면 안 됨
  console.error('idbPut: 지원 안 하는 store', store, val);
  return Promise.resolve(false);
}
function idbDelete(store, key){
  if(store==='trials') return apiFetch(`/api/trials/${key}`, { method:'DELETE' });
  if(store==='photos') return apiFetch(`/api/photos/${key}`, { method:'DELETE' });
  if(store==='notes') return apiFetch(`/api/notes/${key}`, { method:'DELETE' });
  if(store==='comparisons') return apiFetch(`/api/comparisons/${key}`, { method:'DELETE' });
  if(store==='schedules') return apiFetch(`/api/schedules/${key}`, { method:'DELETE' });
  if(store==='crops') return apiFetch(`/api/crops/${key}`, { method:'DELETE' }).then(r=>{ _cropsCache=null; return r; });
  if(store==='growers') return apiFetch(`/api/growers/${key}`, { method:'DELETE' });
  return Promise.resolve(true);
}
// 농가 검색 — growers 목록 화면과 성함 자동완성(아래 그로워 피커)이 함께 씀.
function fetchGrowers(q){
  const query = q ? `?q=${encodeURIComponent(q)}` : '';
  return apiFetch(`/api/growers${query}`);
}
// 비슷한 이름 농가 합치기 — duplicateIds에 연결된 시교를 primaryId로 옮기고 duplicateIds를 지움.
function mergeGrowers(primaryId, duplicateIds){
  return apiJson('/api/growers/merge', 'POST', {primaryId, duplicateIds});
}
// 시교 삭제 시 서버가 사진/메모/비교뷰/일정까지 한 번에 정리(R2 파일 포함)해주므로
// 예전처럼 idbDeleteWhere로 미리 하나씩 지울 필요가 없어짐 — 호출부에서 idbDelete('trials', id)만 하면 됨.

/* ---- 로컬 전용 상태(meta) — 즐겨찾기/최근사용/설정처럼 "이 기기만의" 값은 서버로 안 보내고 localStorage에 ---- */
function getLocalMeta(key){
  try{ const v = localStorage.getItem('cl_meta_'+key); return v ? {key, value: JSON.parse(v)} : undefined; }
  catch(e){ return undefined; }
}
function setLocalMeta(val){
  localStorage.setItem('cl_meta_'+val.key, JSON.stringify(val.value));
  return true;
}

/* ---- 사진: 실제 파일 업로드가 껴 있어서 idbPut과 별도 함수로 ---- */
async function uploadPhoto(trialId, {full, thumb, date, isMarked, originalPhotoId, markNote}){
  const form = new FormData();
  form.append('full', full, 'full.jpg');
  form.append('thumb', thumb, 'thumb.jpg');
  form.append('date', date);
  if(isMarked) form.append('isMarked', '1');
  if(originalPhotoId) form.append('originalPhotoId', originalPhotoId);
  if(markNote) form.append('markNote', markNote);
  return apiFetch(`/api/trials/${trialId}/photos`, { method:'POST', body: form });
}
async function rotatePhotoOnServer(photoId, full, thumb){
  const form = new FormData();
  form.append('full', full, 'full.jpg');
  form.append('thumb', thumb, 'thumb.jpg');
  return apiFetch(`/api/photos/${photoId}`, { method:'PUT', body: form });
}
async function fetchPhotoBlob(photoId){
  const res = await fetch(photoFileUrl(photoId));
  if(!res.ok) throw new Error('사진을 불러오지 못했어요');
  return res.blob();
}
async function fetchComparisonBlob(comparisonId){
  const res = await fetch(comparisonFileUrl(comparisonId));
  if(!res.ok) throw new Error('비교 이미지를 불러오지 못했어요');
  return res.blob();
}
function listComparisons(scope, trialId){
  const q = new URLSearchParams({scope});
  if(trialId) q.set('trialId', trialId);
  return apiFetch(`/api/comparisons?${q.toString()}`);
}
async function uploadComparison({image, scope, trialId}){
  const form = new FormData();
  form.append('image', image, 'compare.jpg');
  form.append('scope', scope);
  if(trialId) form.append('trialId', trialId);
  return apiFetch('/api/comparisons', { method:'POST', body: form });
}

function uid(){ return Date.now().toString(36)+Math.random().toString(36).slice(2,8); }
async function touchTrialUpdatedAt(trialId){
  try{ await apiFetch(`/api/trials/${trialId}/touch`, { method:'POST' }); }catch(e){}
}
function photoFileUrl(id){ return `${API_BASE}/api/photos/${id}/file?pw=${encodeURIComponent(getAppPassword())}`; }
function photoThumbUrl(id){ return `${API_BASE}/api/photos/${id}/thumb?pw=${encodeURIComponent(getAppPassword())}`; }
function comparisonFileUrl(id){ return `${API_BASE}/api/comparisons/${id}/file?pw=${encodeURIComponent(getAppPassword())}`; }
function getPhotoUrl(p){ return photoFileUrl(p.id); }
function getPhotoThumbUrl(p){ return photoThumbUrl(p.id); }
function todayStr(){
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
// 'YYYY-MM-DD' 두 개 사이의 일수. 파종/정식 후 며칠인지 세는 데 씀.
function daysBetweenDates(fromStr, toStr){
  if(!fromStr || !toStr) return null;
  const from = Date.parse(fromStr + 'T00:00:00');
  const to = Date.parse(toStr + 'T00:00:00');
  if(isNaN(from) || isNaN(to)) return null;
  return Math.round((to - from) / 86400000);
}
function timeAgo(ts){
  const diffMs = Date.now()-ts;
  const day = Math.floor(diffMs/86400000);
  if(day<=0) return '오늘';
  if(day===1) return '어제';
  return `${day}일 전`;
}

/* ================= 미니멀 라인 아이콘 ================= */
function icon(name, size){
  size = size || 18;
  const c = `width="${size}" height="${size}" viewBox="0 0 24 24" style="vertical-align:-3px;flex:0 0 auto;"`;
  const s = `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const icons = {
    leaf:   `<svg ${c} ${s}><path d="M12 21V9"/><path d="M12 9c0-3.3 2.2-5.5 5.5-5.5 0 3.3-2.2 5.5-5.5 5.5Z"/><path d="M12 9c0-3.3-2.2-5.5-5.5-5.5 0 3.3 2.2 5.5 5.5 5.5Z"/></svg>`,
    settings: `<svg ${c} ${s}><line x1="4" y1="7" x2="20" y2="7"/><circle cx="9" cy="7" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="12" x2="20" y2="12"/><circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/><line x1="4" y1="17" x2="20" y2="17"/><circle cx="11" cy="17" r="2" fill="currentColor" stroke="none"/></svg>`,
    search: `<svg ${c} ${s}><circle cx="11" cy="11" r="6"/><line x1="20" y1="20" x2="15.5" y2="15.5"/></svg>`,
    star:   `<svg ${c} fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><polygon points="12,3 14.7,9.3 21.5,9.9 16.3,14.4 17.9,21 12,17.3 6.1,21 7.7,14.4 2.5,9.9 9.3,9.3"/></svg>`,
    starFilled: `<svg ${c} fill="currentColor" stroke="currentColor" stroke-width="1" stroke-linejoin="round"><polygon points="12,3 14.7,9.3 21.5,9.9 16.3,14.4 17.9,21 12,17.3 6.1,21 7.7,14.4 2.5,9.9 9.3,9.3"/></svg>`,
    clock:  `<svg ${c} ${s}><circle cx="12" cy="12" r="8"/><polyline points="12,8 12,12 15,14"/></svg>`,
    edit:   `<svg ${c} ${s}><path d="M4 20h4l10.5-10.5a2 2 0 0 0 0-2.8l-1.2-1.2a2 2 0 0 0-2.8 0L4 16v4Z"/><line x1="13" y1="6" x2="18" y2="11"/></svg>`,
    trash:  `<svg ${c} ${s}><line x1="4" y1="7" x2="20" y2="7"/><path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/><path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>`,
    camera: `<svg ${c} ${s}><path d="M4 8h3l2-2h6l2 2h3v11H4Z"/><circle cx="12" cy="13.5" r="3.5"/></svg>`,
    image:  `<svg ${c} ${s}><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" stroke="none"/><polyline points="21,16 15,10 6,20"/></svg>`,
    share:  `<svg ${c} ${s}><circle cx="18" cy="5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="19" r="2.5"/><line x1="8.2" y1="10.8" x2="15.8" y2="6.2"/><line x1="8.2" y1="13.2" x2="15.8" y2="17.8"/></svg>`,
    note:   `<svg ${c} ${s}><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="8"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="8" y1="16" x2="12" y2="16"/></svg>`,
    close:  `<svg ${c} ${s}><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>`,
    check:  `<svg ${c} ${s}><polyline points="4,12 9,17 20,6"/></svg>`,
    plus:   `<svg ${c} ${s}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    chevLeft: `<svg ${c} ${s}><polyline points="15,4 7,12 15,20"/></svg>`,
    chevRight: `<svg ${c} ${s}><polyline points="9,4 17,12 9,20"/></svg>`,
    home: `<svg ${c} ${s}><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/></svg>`,
    compare: `<svg ${c} ${s}><rect x="3" y="4" width="8" height="16" rx="1.5"/><rect x="13" y="4" width="8" height="16" rx="1.5"/><line x1="7" y1="9" x2="7" y2="9"/></svg>`,
    pen: `<svg ${c} ${s}><path d="M4 20l4-1 11-11a2 2 0 0 0-3-3L5 16l-1 4Z"/></svg>`,
    circleTool: `<svg ${c} ${s}><circle cx="12" cy="12" r="8"/></svg>`,
    arrowTool: `<svg ${c} ${s}><line x1="5" y1="19" x2="19" y2="5"/><polyline points="9,5 19,5 19,15"/></svg>`,
    textTool: `<svg ${c} ${s}><line x1="5" y1="6" x2="19" y2="6"/><line x1="12" y1="6" x2="12" y2="19"/></svg>`,
    undo: `<svg ${c} ${s}><path d="M4 8h9a5 5 0 0 1 0 10h-2"/><polyline points="8,4 4,8 8,12"/></svg>`,
    copy: `<svg ${c} ${s}><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>`,
    pin: `<svg ${c} ${s}><path d="M12 21s7-6.6 7-11.5A7 7 0 0 0 5 9.5C5 14.4 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/></svg>`,
    calendarPlus: `<svg ${c} ${s}><rect x="3" y="5" width="18" height="16" rx="2"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="7"/><line x1="16" y1="3" x2="16" y2="7"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/></svg>`,
    rotate: `<svg ${c} ${s}><path d="M3 12a9 9 0 1 0 3-6.7"/><polyline points="3,4 3,9 8,9"/></svg>`,
    growers: `<svg ${c} ${s}><circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5"/><path d="M16 5.5a3 3 0 0 1 0 5.4"/><path d="M17.5 19c0-2.4-1-4-2.5-4.6"/></svg>`,
    download: `<svg ${c} ${s}><path d="M12 4v11"/><polyline points="7,10 12,15 17,10"/><path d="M4 19h16"/></svg>`,
    phone: `<svg ${c} ${s}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a1 1 0 0 1-1.1 1A16 16 0 0 1 4 5.1 1 1 0 0 1 5 4Z"/></svg>`
  };
  return icons[name] || '';
}

/* ================= 프리셋 품목 ================= */
const PRESET_CROPS = [
  {name:'고추', color:'#c0453b'},
  {name:'무',   color:'#ffffff'},
  {name:'배추', color:'#4a7c59'},
  {name:'토마토', color:'#e0729a'},
  {name:'수박', color:'#232323'},
  {name:'오이', color:'#7a548f'},
  {name:'멜론', color:'#e8c547'},
];
const COLOR_CATALOG = ['#c0453b','#e0729a','#d99a3c','#e8c547','#4a7c59','#8fb996','#3c6e8f','#5da8c9','#7a548f','#b384c9','#5f6b3f','#b5754f','#232323','#8a8275','#ffffff','#365c42'];

async function ensurePresetCrops(){
  const existing = await idbGetAll('crops');
  const names = new Set(existing.map(c=>c.name));
  for(const p of PRESET_CROPS){
    if(!names.has(p.name)){
      await idbPut('crops', {id:'preset-'+p.name, name:p.name, color:p.color});
    }
  }
}
function textColorFor(bgHex){
  // 밝은 배경(흰색, 노란색 등)엔 어두운 글씨, 아니면 흰 글씨
  const c = bgHex.replace('#','');
  const r=parseInt(c.substr(0,2),16), g=parseInt(c.substr(2,2),16), b=parseInt(c.substr(4,2),16);
  const brightness = (r*299+g*587+b*114)/1000;
  return brightness > 175 ? '#14171A' : '#ffffff';
}

/* ================= 라우팅 ================= */
let currentTrialId = null;
let currentGrowerId = null;
let currentFieldAddresses = [];
const MAX_ADDRESSES = 5;
function addAddressField(prefix, value){
  const list = document.getElementById(`${prefix}AddressList`);
  const count = list.children.length;
  if(count >= MAX_ADDRESSES){ toast(`주소는 최대 ${MAX_ADDRESSES}개까지 등록할 수 있어요`); return; }
  const idx = count+1;
  const row = document.createElement('div');
  row.className = 'addr-input-row';
  row.innerHTML = `
    <input type="text" placeholder="밭주소 ${idx}" value="${escapeHtml(value||'')}">
    ${count>0 ? `<span class="link addr-remove" onclick="this.parentElement.remove(); renumberAddressFields('${prefix}')">삭제</span>` : ''}
  `;
  list.appendChild(row);
}
function renumberAddressFields(prefix){
  const list = document.getElementById(`${prefix}AddressList`);
  Array.from(list.children).forEach((row,i)=>{
    row.querySelector('input').placeholder = `밭주소 ${i+1}`;
  });
}
function resetAddressFields(prefix, values){
  const list = document.getElementById(`${prefix}AddressList`);
  list.innerHTML = '';
  const vals = (values && values.length) ? values : [''];
  vals.forEach(v=> addAddressField(prefix, v));
}
function getAddressValues(prefix){
  const list = document.getElementById(`${prefix}AddressList`);
  return Array.from(list.querySelectorAll('input')).map(i=>i.value.trim()).filter(Boolean);
}

/* ================= 농가 검색형 선택(그로워 피커) =================
   시교 등록/수정의 "성함" 입력칸에서 씀. 품종이 다양해 탭 나열이 안 되는 것처럼
   농가도 수가 늘면 목록 선택이 안 되므로, 타이핑하면 기존 농가를 검색해 보여주고
   고르면 그 농가로 연결한다. 새 이름을 그대로 저장하면(주소 등록 없이도) 오타로
   같은 사람이 갈라지지 않도록, 저장 시점에 정확히 같은 이름의 농가가 있으면 그걸
   재사용하고 없을 때만 새 농가를 만든다(resolveGrowerPicker). */
const _growerPicker = {};
function initGrowerPicker(inputId, boxId, initialId, initialName){
  _growerPicker[inputId] = { selectedId: initialId || null, selectedName: initialName || '', matches: [] };
  const input = document.getElementById(inputId);
  const box = document.getElementById(boxId);
  if(!input || !box) return;
  let debounceTimer = null;
  input.oninput = () => {
    const val = input.value;
    // 선택해뒀던 이름과 달라지면 그 선택은 무효(다시 새 이름 취급)
    if(_growerPicker[inputId].selectedName !== val) _growerPicker[inputId].selectedId = null;
    clearTimeout(debounceTimer);
    const q = val.trim();
    if(!q){ box.classList.add('hidden'); box.innerHTML=''; return; }
    debounceTimer = setTimeout(async () => {
      let matches = [];
      try{ matches = await fetchGrowers(q); }catch(e){ return; }
      matches = matches.slice(0,5);
      _growerPicker[inputId].matches = matches;
      if(!matches.length){ box.classList.add('hidden'); box.innerHTML=''; return; }
      box.innerHTML = matches.map((g,i)=>`
        <div class="grower-suggest-row" onmousedown="pickGrowerSuggestion('${inputId}','${boxId}',${i})">
          <span class="gs-name">${escapeHtml(g.name)}</span>
          <span class="gs-sub">${escapeHtml([g.regionSigun, g.trialCount?`시교 ${g.trialCount}건`:''].filter(Boolean).join(' · '))}</span>
        </div>`).join('');
      box.classList.remove('hidden');
    }, 200);
  };
  // onmousedown(위)으로 클릭을 먼저 처리하고, blur는 그 다음이라 목록이 안 사라진 채로 클릭됨
  input.onblur = () => { box.classList.add('hidden'); };
}
function pickGrowerSuggestion(inputId, boxId, idx){
  const g = _growerPicker[inputId].matches[idx];
  if(!g) return;
  document.getElementById(inputId).value = g.name;
  _growerPicker[inputId].selectedId = g.id;
  _growerPicker[inputId].selectedName = g.name;
  document.getElementById(boxId).classList.add('hidden');
}
// 시교 저장 시점에 호출: 골라둔 농가가 있으면 그 id를, 없으면 정확히 같은 이름의
// 기존 농가를 재사용하거나 새로 만들어서 id를 돌려준다. 입력이 비어있으면 null.
async function resolveGrowerPicker(inputId){
  const input = document.getElementById(inputId);
  const name = (input.value || '').trim();
  if(!name) return { growerId: null, growerName: null };
  const state = _growerPicker[inputId];
  if(state && state.selectedId && state.selectedName === name){
    return { growerId: state.selectedId, growerName: name };
  }
  const matches = await fetchGrowers(name);
  const exact = matches.find(g=>g.name===name);
  if(exact) return { growerId: exact.id, growerName: exact.name };
  const created = await idbPut('growers', {name});
  return { growerId: created.id, growerName: created.name };
}
function copyFieldAddress(idx){
  const addr = currentFieldAddresses[idx];
  if(!addr){ toast('등록된 주소가 없어요'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(addr).then(()=>{
      toast('주소를 복사했어요');
    }).catch(()=>{ toast('복사에 실패했어요'); });
  } else {
    toast('이 브라우저는 복사가 지원되지 않아요');
  }
}
function openFieldAddressInMaps(idx){
  openAddressInNaverMap(currentFieldAddresses[idx]);
}
/* 네이버 지도로 열기 — 폰에서는 앱 우선, 앱이 없거나 PC면 웹 지도로 넘어감.
   (예전 geo: 방식은 iOS에서 아무 반응이 없는 경우가 있었음) */
function openAddressInNaverMap(addr){
  addr = (addr||'').trim();
  if(!addr){ toast('등록된 주소가 없어요'); return; }
  const q = encodeURIComponent(addr);
  const webUrl = `https://map.naver.com/p/search/${q}`;
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isMobile){ window.open(webUrl, '_blank', 'noopener'); return; }
  // 앱으로 전환되면 페이지가 가려지므로, 그때는 웹으로 다시 안 보냄
  let switched = false;
  const onHide = ()=>{ switched = true; };
  document.addEventListener('visibilitychange', onHide, {once:true});
  window.location.href = `nmap://search?query=${q}&appname=croplog`;
  setTimeout(()=>{
    document.removeEventListener('visibilitychange', onHide);
    if(!switched && !document.hidden) window.location.href = webUrl;
  }, 1200);
}
function copyTextToClipboard(text, okMsg){
  text = (text||'').trim();
  if(!text){ toast('복사할 내용이 없어요'); return; }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(text)
      .then(()=> toast(okMsg || '복사했어요'))
      .catch(()=> toast('복사에 실패했어요'));
  } else {
    toast('이 브라우저는 복사가 지원되지 않아요');
  }
}
const views = ['home','settings','crops','newtrial','detail','upload','xcompare','help','calendar','alllist','growers','grower','more'];
const topLevelViews = ['home','alllist','growers','more'];
/* 화면이 서로에 대해 "부모"인 관계 — 뒤로가기 방향(왼쪽에서) 전환 애니메이션을 판단하는 데만 씀 */
const VIEW_PARENT = {
  settings:'more', calendar:'more', crops:'settings', help:'settings',
  detail:'home', newtrial:'home', upload:'detail',
  grower:'growers', xcompare:'settings'
};
let navStack = [];
async function go(view, arg, fromPopstate){
  const prevView = views.find(v=> !document.getElementById('view-'+v).classList.contains('hidden'));
  const isBack = fromPopstate || VIEW_PARENT[prevView]===view;
  views.forEach(v=> document.getElementById('view-'+v).classList.add('hidden'));
  const targetSection = document.getElementById('view-'+view);
  targetSection.classList.remove('nav-forward','nav-back');
  targetSection.classList.add(isBack ? 'nav-back' : 'nav-forward');
  targetSection.classList.remove('hidden');

  /* 탭바·플로팅 버튼·히스토리는 화면 내용을 불러오기 "전에" 맞춘다.
     예전에는 이 처리가 렌더 뒤에 있어서, 신호가 끊겨 렌더가 실패하면
     화면만 바뀌고 하단 탭바가 사라진 채로 남는 문제가 있었다. */
  const tabbar = document.getElementById('bottomTabbar');
  if(tabbar) tabbar.classList.toggle('hidden', !topLevelViews.includes(view));
  setTabActive('tabHome', view==='home');
  setTabActive('tabAlllist', view==='alllist');
  setTabActive('tabGrowers', view==='growers' || view==='grower');
  setTabActive('tabMore', view==='more');
  bindScrollFloaters(view); // 화면별 스크롤 초기화는 여기서 main.scrollTop=0으로 처리
  if(!fromPopstate){
    navStack.push({view, arg});
    history.pushState({navIndex: navStack.length-1}, '');
  }

  try{
    if(view==='home'){ await renderHome(); }
    if(view==='crops'){ await renderCrops(); }
    if(view==='settings'){
      document.getElementById('feedbackSwitch').classList.toggle('on', appSettings.feedback);
      document.getElementById('scheduleReminderSwitch').classList.toggle('on', appSettings.scheduleReminders);
      const user = getCurrentUser();
      const nameEl = document.getElementById('settingsUserName');
      if(nameEl) nameEl.textContent = user ? user.name : '';
    }
    if(view==='newtrial'){ await renderNewTrialForm(); }
    if(view==='detail'){ currentTrialId = arg; await renderDetail(arg); }
    if(view==='upload'){ currentTrialId = arg; await renderUpload(arg); }
    if(view==='xcompare'){ renderXCompare(); }
    if(view==='calendar'){ await renderCalendar(); }
    if(view==='alllist'){ await renderAllList('recent'); }
    if(view==='growers'){ await renderGrowers(); }
    if(view==='grower'){ await renderGrower(arg); }
  }catch(e){
    // 화면을 못 불러와도 탭바는 살아 있으니 다른 화면으로 빠져나갈 수 있다.
    toast((e && e.message) ? e.message : '화면을 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
  }
}
function setTabActive(id, on){
  const el = document.getElementById(id);
  if(el) el.classList.toggle('active', on);
}
function bindScrollFloaters(view){
  const section = document.getElementById('view-'+view);
  const m = section.querySelector('main');
  const floatBack = document.getElementById('floatBack');
  const floatTop = document.getElementById('floatTop');
  const hasBack = !!section.querySelector('header .back');
  floatBack.classList.toggle('hidden', !hasBack);
  if(!m){ floatTop.classList.add('hidden'); return; }
  m.scrollTop = 0;
  floatTop.classList.add('hidden');
  m.onscroll = ()=>{
    floatTop.classList.toggle('hidden', m.scrollTop <= 260);
  };
}
function floatBackClick(){
  // history.back()은 브라우저/WebView의 실제 이전 히스토리로 갈 수 있어 예측이 안 됨.
  // 현재 화면의 헤더 뒤로가기 버튼을 그대로 눌러서, 항상 그 버튼과 동일하게(항상 정해진 이전 화면으로) 동작하게 함.
  const backBtn = document.querySelector('#app > section:not(.hidden) header .back');
  if(backBtn) backBtn.click();
}
function scrollActiveMainTop(){
  const active = document.querySelector('#app > section:not(.hidden) > main');
  if(active) active.scrollTo({top:0, behavior:'smooth'});
}
window.addEventListener('popstate', ()=>{
  // 모달이 열려있으면 뒤로가기로 모달만 닫기
  const openModal = document.querySelector('.modal-backdrop');
  if(openModal){ openModal.remove(); history.pushState({navIndex: navStack.length-1}, ''); return; }
  const lightbox = document.getElementById('lightboxEl');
  if(lightbox){ lightbox.remove(); history.pushState({navIndex: navStack.length-1}, ''); return; }

  if(navStack.length > 1){
    navStack.pop();
    const prev = navStack[navStack.length-1];
    go(prev.view, prev.arg, true);
  } else {
    // 홈 화면에서는 앱이 그냥 꺼지지 않도록 현재 상태 유지
    history.pushState({navIndex:0}, '');
  }
});
let appSettings = {feedback:true, syncEnabled:false, scheduleReminders:true};
async function loadSettings(){
  const s = await idbGet('meta','settings');
  if(s && s.value) appSettings = Object.assign(appSettings, s.value);
}
async function saveSettings(){
  await idbPut('meta', {key:'settings', value:appSettings});
}
function vibrate(pattern){
  if(navigator.vibrate){
    try{ navigator.vibrate(pattern); }catch(e){}
  }
}
function rawToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(()=>t.classList.remove('show'), 1800);
  vibrate(15);
}
function toast(msg){
  if(!appSettings.feedback) return;
  rawToast(msg);
}
function showStorageError(e){
  console.error(e);
  if(e && (e.name==='QuotaExceededError' || (e.message||'').includes('Quota'))){
    rawToast('저장공간이 부족해요. 기기 용량을 확인해주세요.');
  } else {
    rawToast('저장에 실패했어요. 다시 시도해주세요.');
  }
}


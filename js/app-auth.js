/* ================= 로그인 흐름 (비밀번호 → 이름 선택 → 최초 PIN 설정) =================
   전용 뷰 섹션을 따로 안 만들고, 기존 마킹 오버레이/라이트박스처럼 전체 화면 오버레이를
   JS로 만들어서 붙였다 뗀다 — index.html 구조를 거의 안 건드리기 위함. */

function authOverlay(html){
  removeIfExists('authOverlay');
  const el = document.createElement('div');
  el.id = 'authOverlay';
  el.style.cssText = 'position:fixed;inset:0;z-index:200;background:var(--cream,#ECEFE4);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;';
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}

async function startAuthFlow(){
  if(!getAppPassword()){ renderPasswordGate(); return; }
  const ok = await verifyAppPassword(getAppPassword());
  if(!ok){ setAppPassword(''); renderPasswordGate(); return; }
  const user = getCurrentUser();
  if(!user){ renderNameSelect(); return; }
  bootApp();
}

async function verifyAppPassword(pw){
  const prevPw = getAppPassword();
  setAppPassword(pw);
  try{
    await apiFetch('/api/users');
    return true;
  }catch(e){
    setAppPassword(prevPw);
    return false;
  }
}

function renderPasswordGate(){
  const el = authOverlay(`
    <div style="max-width:280px;width:100%;">
      <div style="font-size:22px;font-weight:700;margin-bottom:6px;">🌱 CropLog</div>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 20px;">팀 공유 비밀번호를 입력해주세요</p>
      <div class="field"><input type="password" id="gatePwInput" placeholder="비밀번호" inputmode="numeric"></div>
      <p id="gatePwErr" style="font-size:12px;color:var(--danger,#b5543f);min-height:16px;margin:6px 0 12px;"></p>
      <button class="btn btn-primary" id="gatePwBtn" style="width:100%;">입장하기</button>
    </div>`);
  const submit = async ()=>{
    const pw = document.getElementById('gatePwInput').value.trim();
    if(!pw) return;
    document.getElementById('gatePwErr').textContent = '';
    const ok = await verifyAppPassword(pw);
    if(!ok){ document.getElementById('gatePwErr').textContent = '비밀번호가 맞지 않아요'; return; }
    renderNameSelect();
  };
  el.querySelector('#gatePwBtn').onclick = submit;
  el.querySelector('#gatePwInput').addEventListener('keydown', e=>{ if(e.key==='Enter') submit(); });
  setTimeout(()=> el.querySelector('#gatePwInput').focus(), 100);
}

async function renderNameSelect(){
  const el = authOverlay(`<div style="max-width:320px;width:100%;">불러오는 중...</div>`);
  let users;
  try{ users = await apiFetch('/api/users'); }
  catch(e){ setAppPassword(''); renderPasswordGate(); return; }
  el.innerHTML = `
    <div style="max-width:320px;width:100%;">
      <div style="font-size:22px;font-weight:700;margin-bottom:6px;">🌱 CropLog</div>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 20px;">본인 이름을 선택해주세요</p>
      <div id="nameGrid" style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;">
        ${users.map(u=>`<div class="crop-tile" data-id="${u.id}" style="cursor:pointer;">
          <span class="label">${escapeHtml(u.name)}</span>
        </div>`).join('')}
      </div>
    </div>`;
  el.querySelectorAll('#nameGrid .crop-tile').forEach(tile=>{
    tile.onclick = ()=> selectUser(users.find(u=>u.id===tile.dataset.id));
  });
}

async function selectUser(user){
  if(!user.hasPin){ renderPinSetup(user); return; }
  setCurrentUser({id:user.id, name:user.name});
  bootApp();
}

function renderPinSetup(user){
  const el = authOverlay(`
    <div style="max-width:280px;width:100%;">
      <div style="font-size:18px;font-weight:700;margin-bottom:6px;">${escapeHtml(user.name)}님, 처음이시네요</div>
      <p style="font-size:12.5px;color:var(--muted);margin:0 0 20px;">앞으로 수정·삭제할 때 확인할 4자리 PIN을 정해주세요</p>
      <div class="field"><input type="password" id="pinSetupInput" maxlength="4" inputmode="numeric" placeholder="4자리 숫자"></div>
      <div class="field"><input type="password" id="pinSetupInput2" maxlength="4" inputmode="numeric" placeholder="한 번 더 입력"></div>
      <p id="pinSetupErr" style="font-size:12px;color:var(--danger,#b5543f);min-height:16px;margin:6px 0 12px;"></p>
      <button class="btn btn-primary" id="pinSetupBtn" style="width:100%;">설정 완료</button>
    </div>`);
  const submit = async ()=>{
    const p1 = el.querySelector('#pinSetupInput').value.trim();
    const p2 = el.querySelector('#pinSetupInput2').value.trim();
    const errEl = el.querySelector('#pinSetupErr');
    if(!/^\d{4}$/.test(p1)){ errEl.textContent = '4자리 숫자로 입력해주세요'; return; }
    if(p1!==p2){ errEl.textContent = '두 번 입력한 PIN이 달라요'; return; }
    try{
      await apiJson(`/api/users/${user.id}/pin`, 'POST', {pin:p1});
      setCurrentUser({id:user.id, name:user.name});
      bootApp();
    }catch(e){ errEl.textContent = e.message; }
  };
  el.querySelector('#pinSetupBtn').onclick = submit;
}

function switchUser(){
  clearCurrentUser();
  renderNameSelect();
}

function openPinChangeModal(){
  removeIfExists('pinChangeModal');
  const backdrop = document.createElement('div');
  backdrop.className='modal-backdrop'; backdrop.id='pinChangeModal';
  backdrop.innerHTML = `
    <div class="modal-sheet">
      <h3>PIN 변경</h3>
      <div class="field"><input type="password" id="pinChangeOld" maxlength="4" inputmode="numeric" placeholder="기존 PIN"></div>
      <div class="field"><input type="password" id="pinChangeNew" maxlength="4" inputmode="numeric" placeholder="새 PIN (4자리)"></div>
      <p id="pinChangeErr" style="font-size:12px;color:var(--danger,#b5543f);min-height:16px;margin:6px 0 0;"></p>
      <div class="btn-row">
        <button class="btn btn-ghost" onclick="closeModal('pinChangeModal')">취소</button>
        <button class="btn btn-primary" id="pinChangeBtn">변경</button>
      </div>
    </div>`;
  document.body.appendChild(backdrop);
  attachBackdropDismiss(backdrop);
  document.getElementById('pinChangeBtn').onclick = async ()=>{
    const oldPin = document.getElementById('pinChangeOld').value.trim();
    const newPin = document.getElementById('pinChangeNew').value.trim();
    const errEl = document.getElementById('pinChangeErr');
    const user = getCurrentUser();
    try{
      await apiJson(`/api/users/${user.id}/pin`, 'PUT', {oldPin, newPin});
      closeModal('pinChangeModal');
      toast('PIN을 변경했어요');
    }catch(e){ errEl.textContent = e.message; }
  };
}

/* ---- 수정/삭제 직전에 PIN 확인받는 공용 모달. 취소하면 null ---- */
function promptPin({title='PIN 확인', message='본인 확인을 위해 PIN을 입력해주세요'}={}){
  return new Promise(resolve=>{
    removeIfExists('pinPromptModal');
    const backdrop = document.createElement('div');
    backdrop.className='modal-backdrop'; backdrop.id='pinPromptModal';
    backdrop.innerHTML = `
      <div class="modal-sheet">
        <h3>${title}</h3>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.6;margin:-8px 0 12px;">${message}</p>
        <div class="field"><input type="password" id="pinPromptInput" maxlength="4" inputmode="numeric" placeholder="4자리 PIN"></div>
        <div class="btn-row">
          <button class="btn btn-ghost" id="pinPromptCancel">취소</button>
          <button class="btn btn-primary" id="pinPromptOk">확인</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    attachBackdropDismiss(backdrop, ()=>resolve(null));
    document.getElementById('pinPromptCancel').onclick = ()=>{ removeIfExists('pinPromptModal'); resolve(null); };
    document.getElementById('pinPromptOk').onclick = ()=>{
      const v = document.getElementById('pinPromptInput').value.trim();
      removeIfExists('pinPromptModal');
      resolve(v || null);
    };
    setTimeout(()=>{ const i=document.getElementById('pinPromptInput'); if(i) i.focus(); }, 150);
  });
}

/* ================= 부팅 (IndexedDB 시절의 openDB().then(...) 대체) ================= */
async function bootApp(){
  await loadSettings();
  await ensurePresetCrops();
  removeIfExists('authOverlay');
  go('home');
  window.addEventListener('load', ()=>{
    setTimeout(()=>{ checkTodaySchedules(); }, 1200);
  });
}

startAuthFlow();

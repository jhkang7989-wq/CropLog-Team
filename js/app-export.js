/* ================= 업로드 ================= */
let pendingFiles = [];
let pendingRotations = [];
// 대비품종이 있는 시교만 "자사품종/대비품종" 구분을 보여줌 — 없는 시교엔 애초에 헷갈릴
// 사진이 안 섞이니 화면만 복잡해짐.
let uploadSubject = 'own';
function setUploadSubject(subject){
  uploadSubject = subject;
  document.getElementById('uploadSubjectOwn').classList.toggle('active', subject==='own');
  document.getElementById('uploadSubjectRef').classList.toggle('active', subject==='reference');
}
async function renderUpload(trialId){
  pendingFiles = [];
  pendingRotations = [];
  document.getElementById('previewStrip').innerHTML='';
  document.getElementById('uploadDate').value = todayStr();
  // 다른 시교의 업로드 화면에서 넘어왔을 때, 분류 정보 줄이 이전 시교 것을 잠깐
  // 보여주다 바뀌던 것과 같은 문제 — 불러오기 전에 먼저 비운다.
  document.getElementById('uploadClassifyInfo').textContent = '';
  document.getElementById('uploadSubjectField').classList.add('hidden');
  const t = await idbGet('trials', trialId);
  const c = await idbGet('crops', t.cropId);
  document.getElementById('uploadClassifyInfo').textContent = `${c.name} / ${t.seg} / ${trialTitle(t)}`;
  setUploadSubject('own');
  const subjectField = document.getElementById('uploadSubjectField');
  const hasReference = !!(t.referenceVariety && t.referenceVariety.trim());
  subjectField.classList.toggle('hidden', !hasReference);
  document.getElementById('uploadSubjectRef').textContent = hasReference ? `대비품종 (${t.referenceVariety})` : '대비품종';
}
function handlePhotoSelect(e){
  const files = Array.from(e.target.files);
  files.forEach(f=> { pendingFiles.push(f); pendingRotations.push(0); });
  renderPreview();
  e.target.value='';
}
function renderPreview(){
  const strip = document.getElementById('previewStrip');
  strip.innerHTML = pendingFiles.map((f,i)=>`
    <div class="pv">
      <img src="${URL.createObjectURL(f)}" style="transform:rotate(${pendingRotations[i]||0}deg);">
      <div class="rt" onclick="rotatePendingFile(${i})">${icon('rotate',11)}</div>
      <div class="rm" onclick="removePending(${i})">${icon('close',11)}</div>
    </div>`).join('');
}
function rotatePendingFile(i){
  pendingRotations[i] = ((pendingRotations[i]||0) + 90) % 360;
  renderPreview();
}
function removePending(i){
  pendingFiles.splice(i,1);
  pendingRotations.splice(i,1);
  renderPreview();
}
/* ---- 백그라운드(Worker) 처리: 화면 스레드를 안 막기 위해, 되면 워커에서 리사이즈/압축 ---- */
let _photoWorker;
let _photoWorkerReqId = 0;
const _photoWorkerPending = new Map();
function getPhotoWorker(){
  if(_photoWorker !== undefined) return _photoWorker;
  if(typeof Worker==='undefined' || typeof OffscreenCanvas==='undefined'){ _photoWorker = null; return null; }
  try{
    const w = new Worker(`js/photo-worker.js?v=${APP_VERSION}`);
    w.onmessage = (e)=>{
      const {id, ok, blob, thumbBlob, error} = e.data;
      const p = _photoWorkerPending.get(id);
      if(!p) return;
      _photoWorkerPending.delete(id);
      if(ok) p.resolve({blob, thumbBlob}); else p.reject(new Error(error));
    };
    w.onerror = ()=>{ _photoWorker = null; };
    _photoWorker = w;
  }catch(e){ _photoWorker = null; }
  return _photoWorker;
}
async function processUploadFile(file, rotationDeg){
  const worker = getPhotoWorker();
  if(worker){
    try{
      return await new Promise((resolve, reject)=>{
        const id = ++_photoWorkerReqId;
        _photoWorkerPending.set(id, {resolve, reject});
        worker.postMessage({id, file, rotationDeg});
      });
    }catch(e){ /* 워커 실패 시 메인 스레드 방식으로 폴백 */ }
  }
  return processUploadFileMainThread(file, rotationDeg);
}
/* ---- 폴백: 워커/OffscreenCanvas 미지원 브라우저용, 기존 메인 스레드 처리 ---- */
async function processUploadFileMainThread(file, rotationDeg){
  rotationDeg = ((rotationDeg||0) % 360 + 360) % 360;
  try{
    const bitmap = await createImageBitmap(file, {imageOrientation:'from-image'});
    const swap = rotationDeg===90 || rotationDeg===270;
    const MAX_FULL = 2000;
    let fw = bitmap.width, fh = bitmap.height;
    if(Math.max(fw,fh) > MAX_FULL){
      const scale = MAX_FULL/Math.max(fw,fh);
      fw = Math.round(fw*scale); fh = Math.round(fh*scale);
    }
    const outW = swap ? fh : fw, outH = swap ? fw : fh;
    const fullCanvas = document.createElement('canvas');
    fullCanvas.width = outW; fullCanvas.height = outH;
    const fctx = fullCanvas.getContext('2d');
    fctx.translate(outW/2, outH/2);
    fctx.rotate(rotationDeg*Math.PI/180);
    fctx.drawImage(bitmap, -fw/2, -fh/2, fw, fh);
    const fullBlob = await new Promise(res=> fullCanvas.toBlob(res, 'image/jpeg', 0.88));

    const MAX_THUMB = 380;
    const tscale = MAX_THUMB/Math.max(outW, outH);
    const tw = Math.round(outW*tscale), th = Math.round(outH*tscale);
    const thumbCanvas = document.createElement('canvas');
    thumbCanvas.width = tw; thumbCanvas.height = th;
    thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, tw, th);
    const thumbBlob = await new Promise(res=> thumbCanvas.toBlob(res, 'image/jpeg', 0.75));

    if(bitmap.close) bitmap.close();
    return { blob: fullBlob || file, thumbBlob: thumbBlob || null };
  }catch(e){
    // 브라우저가 지원 안 하면 원본 그대로 사용 (회전 보정/썸네일만 생략)
    return { blob: file, thumbBlob: null };
  }
}
// 평가는 사진 저장에 묶어두면 사진을 여러 번 나눠 올릴 때마다 값을 안 건드려도
// 매번 새 평가 이력으로 쌓여서 중복이 계속 생기는 문제가 있었다 — 평가는 이제
// 상세화면의 "평가" 탭 "+ 추가"에서 필요할 때만 따로 남기게 분리했다.
async function savePhotos(){
  await runUploadSave();
}
// createTrial과 같은 이유 — 저장 버튼을 두 번 누르면 사진이 중복 업로드되던 문제라,
// 처리 중일 때 재진입을 막는다.
let _savingUpload = false;
async function runUploadSave(){
  if(_savingUpload) return;
  if(pendingFiles.length===0){ toast('사진을 선택해주세요'); return; }
  const date = document.getElementById('uploadDate').value || todayStr();
  _savingUpload = true;
  toast('저장하고 있어요...');
  try{
    let queuedCount = 0;
    const processed = await Promise.all(pendingFiles.map((f,i)=>processUploadFile(f, pendingRotations[i])));
    const trialId = currentTrialId, subject = uploadSubject;
    const results = await Promise.allSettled(processed.map(({blob, thumbBlob})=>
      uploadPhoto(trialId, {full: blob, thumb: thumbBlob, date, subject})
    ));
    for(let i=0;i<results.length;i++){
      if(results[i].status !== 'rejected') continue;
      const err = results[i].reason;
      // 진짜 네트워크 두절(현장 신호 없음)만 큐에 담고, 서버가 거부한 진짜 오류는
      // 재시도해도 소용없으니 그대로 실패 처리한다.
      if(!isNetworkError(err)) throw err;
      await queueOfflineUpload({
        id: uid(), trialId, subject, date,
        full: processed[i].blob, thumb: processed[i].thumbBlob, createdAt: Date.now()
      });
      queuedCount++;
    }
    await touchTrialUpdatedAt(currentTrialId);
    if(queuedCount > 0){
      toast(`오프라인이라 사진 ${queuedCount}장을 기기에 저장해뒀어요. 연결되면 자동으로 올라가요.`);
    } else {
      toast(`사진 ${pendingFiles.length}장 저장됐어요`);
    }
    updateOfflineQueueBadge();
    go('detail', currentTrialId);
  }catch(e){
    showStorageError(e);
  }finally{
    _savingUpload = false;
  }
}

/* 시교 제목·날짜 문자열은 다른 화면(홈·농가·비교·캘린더)에서도 쓰는 공용 함수 */
function trialTitle(t){
  return [t.name, t.region, t.growerName].filter(Boolean).join(' ');
}
function buildDateBitsLine(t){
  const bits = [];
  if(t.sowDate) bits.push(`파종일 ${t.sowDate}`);
  if(t.transplantDate) bits.push(`정식일 ${t.transplantDate}`);
  return bits.join(' · ');
}

/* ================= 전체 시교 목록 CSV 내보내기 ================= */
function csvEscape(v){
  const s = (v===null || v===undefined) ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s;
}
async function exportTrialsCsv(){
  let trials, crops;
  try{
    [trials, crops] = await Promise.all([idbGetAll('trials'), idbGetAll('crops')]);
  }catch(e){ toast('시교 목록을 불러오지 못했어요'); return; }
  if(trials.length===0){ toast('내보낼 시교가 없어요'); return; }
  const cropMap = Object.fromEntries(crops.map(c=>[c.id, c.name]));
  const headers = ['품목','SEG','제품/시교명','지역','성함','대비품종','파종일','정식일','시즌','상태','등록일'];
  const rows = trials.map(t => [
    cropMap[t.cropId] || '',
    t.seg || '',
    t.name || '',
    t.region || '',
    t.growerName || '',
    t.referenceVariety || '',
    t.sowDate || '',
    t.transplantDate || '',
    t.season || '',
    STATUS_LABELS[t.status] || t.status || '',
    t.createdAt ? new Date(t.createdAt).toISOString().slice(0,10) : ''
  ]);
  // 엑셀에서 한글이 안 깨지고 열리도록 UTF-8 BOM을 앞에 붙인다.
  const csv = '\uFEFF' + [headers, ...rows].map(r=>r.map(csvEscape).join(',')).join('\r\n');
  const blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // 파일명에 한글이 들어가면 일부 브라우저가 확장자 없는 "download"로 저장해버려서
  // 엑셀이 못 여는 경우가 있었다 — 파일명은 영문/숫자만 쓰고, 내용(CSV 본문)은 그대로 한글.
  a.download = `croplog_trials_${todayStr()}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 2000);
  toast('CSV 파일을 내보냈어요');
}

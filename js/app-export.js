/* ================= 업로드 ================= */
let pendingFiles = [];
let pendingRotations = [];
async function renderUpload(trialId){
  pendingFiles = [];
  pendingRotations = [];
  document.getElementById('previewStrip').innerHTML='';
  document.getElementById('uploadDate').value = todayStr();
  const t = await idbGet('trials', trialId);
  const c = await idbGet('crops', t.cropId);
  document.getElementById('uploadClassifyInfo').textContent = `${c.name} / ${t.seg} / ${trialTitle(t)}`;
  const prevEval = await getLatestEvaluation(trialId);
  await initEvalSection('uploadEvalSection', t.cropId, prevEval, false);
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
async function savePhotos(){
  await runUploadSave({requireSomething:true});
}
// "사진 없이 나중에 추가할게요" — 평가만 입력하고 사진 없이 방문 기록만 남기는 경우도
// 있어서(기획서: "종합 점수 하나만 찍고 나가도 저장됩니다"), 평가 값이 있으면 그것만
// 저장하고, 아무것도 안 건드렸으면 예전처럼 그냥 취소하고 나간다.
async function skipPhotosLink(){
  await runUploadSave({requireSomething:false});
}
async function runUploadSave({requireSomething}){
  const date = document.getElementById('uploadDate').value || todayStr();
  const evalPayload = collectEvalPayload();
  if(pendingFiles.length===0 && !evalPayload){
    if(requireSomething){ toast('사진을 선택하거나 평가를 입력해주세요'); return; }
    cancelAction(()=>go('detail', currentTrialId), '사진 없이 넘어갔어요');
    return;
  }
  toast('저장하고 있어요...');
  try{
    if(pendingFiles.length){
      const processed = await Promise.all(pendingFiles.map((f,i)=>processUploadFile(f, pendingRotations[i])));
      await Promise.all(processed.map(({blob, thumbBlob})=>
        uploadPhoto(currentTrialId, {full: blob, thumb: thumbBlob, date})
      ));
    }
    if(evalPayload){
      await saveEvaluationEntry(currentTrialId, date, evalPayload);
    }
    await touchTrialUpdatedAt(currentTrialId);
    toast(pendingFiles.length ? `사진 ${pendingFiles.length}장 저장됐어요` : '평가를 저장했어요');
    go('detail', currentTrialId);
  }catch(e){
    showStorageError(e);
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

/* 사진 회전 보정 + 리사이즈 + 압축을 메인(화면) 스레드가 아닌 별도 스레드에서 처리.
   savePhotos() 중에도 화면 터치/스크롤이 안 막히게 하기 위함. */
self.onmessage = async (e) => {
  const { id, file, rotationDeg } = e.data;
  try {
    const result = await processFile(file, rotationDeg);
    self.postMessage({ id, ok: true, blob: result.blob, thumbBlob: result.thumbBlob });
  } catch (err) {
    self.postMessage({ id, ok: false, error: String(err && err.message || err) });
  }
};

async function processFile(file, rotationDeg) {
  rotationDeg = ((rotationDeg || 0) % 360 + 360) % 360;
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const swap = rotationDeg === 90 || rotationDeg === 270;
  const MAX_FULL = 2000;
  let fw = bitmap.width, fh = bitmap.height;
  if (Math.max(fw, fh) > MAX_FULL) {
    const scale = MAX_FULL / Math.max(fw, fh);
    fw = Math.round(fw * scale); fh = Math.round(fh * scale);
  }
  const outW = swap ? fh : fw, outH = swap ? fw : fh;

  const fullCanvas = new OffscreenCanvas(outW, outH);
  const fctx = fullCanvas.getContext('2d');
  fctx.translate(outW / 2, outH / 2);
  fctx.rotate(rotationDeg * Math.PI / 180);
  fctx.drawImage(bitmap, -fw / 2, -fh / 2, fw, fh);
  const fullBlob = await fullCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.88 });

  const MAX_THUMB = 380;
  const tscale = MAX_THUMB / Math.max(outW, outH);
  const tw = Math.round(outW * tscale), th = Math.round(outH * tscale);
  const thumbCanvas = new OffscreenCanvas(tw, th);
  thumbCanvas.getContext('2d').drawImage(fullCanvas, 0, 0, tw, th);
  const thumbBlob = await thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.75 });

  if (bitmap.close) bitmap.close();
  return { blob: fullBlob, thumbBlob };
}

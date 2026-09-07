/* ================= 농가 명단 =================
   따로 등록하는 게 아니라, 이미 저장된 시교의 성함(growerName)을 기준으로 묶어서 보여준다.
   한 농가가 여러 품목/여러 시교를 갖고 있어도 한 화면에 모인다. 서버 수정 없이 동작. */

let growersCache = [];
let currentGrowerAddresses = [];
const NO_NAME_LABEL = '(성함 미입력)';

async function buildGrowerList(){
  const crops = await idbGetAll('crops');
  const cropMap = Object.fromEntries(crops.map(c=>[c.id,c]));
  const trials = await idbGetAll('trials');

  const map = new Map();
  trials.forEach(t=>{
    const key = (t.growerName||'').trim() || NO_NAME_LABEL;
    if(!map.has(key)) map.set(key, {name:key, trials:[], regions:[], crops:new Map(), addresses:[]});
    const g = map.get(key);
    g.trials.push(t);
    const region = (t.region||'').trim();
    if(region && !g.regions.includes(region)) g.regions.push(region);
    const c = cropMap[t.cropId] || {name:'?', color:'#999'};
    const seen = g.crops.get(c.name) || {name:c.name, color:c.color, count:0};
    seen.count++;
    g.crops.set(c.name, seen);
    t._crop = {name:c.name, color:c.color};   // 목록에서 품목명/색을 다시 찾지 않도록 붙여둠
    const addrs = (t.fieldAddresses && t.fieldAddresses.length) ? t.fieldAddresses
                : (t.fieldAddress ? [t.fieldAddress] : []);
    addrs.forEach(a=>{
      const addr = (a||'').trim();
      if(addr && !g.addresses.some(x=>x.address===addr)){
        g.addresses.push({address:addr, cropName:c.name, cropColor:c.color});
      }
    });
  });

  growersCache = [...map.values()].map(g=>({
    name: g.name,
    regions: g.regions,
    addresses: g.addresses,
    crops: [...g.crops.values()].sort((a,b)=> b.count-a.count || a.name.localeCompare(b.name,'ko')),
    trials: g.trials.sort((a,b)=> (b.updatedAt||b.createdAt) - (a.updatedAt||a.createdAt)),
  })).sort((a,b)=>{
    if(a.name===NO_NAME_LABEL) return 1;
    if(b.name===NO_NAME_LABEL) return -1;
    return a.name.localeCompare(b.name,'ko');
  });
  return growersCache;
}

async function renderGrowers(){
  await buildGrowerList();
  const input = document.getElementById('growerSearchInput');
  if(input) input.value = '';
  renderGrowerList();
}

function renderGrowerList(){
  const q = (document.getElementById('growerSearchInput').value || '').trim().toLowerCase();
  const list = !q ? growersCache : growersCache.filter(g=>
    g.name.toLowerCase().includes(q)
    || g.regions.some(r=> r.toLowerCase().includes(q))
    || g.crops.some(c=> c.name.toLowerCase().includes(q))
    || g.trials.some(t=> (t.seg||'').toLowerCase().includes(q) || (t.name||'').toLowerCase().includes(q))
  );

  const totalTrials = growersCache.reduce((n,g)=> n + g.trials.length, 0);
  document.getElementById('growerCount').textContent = q
    ? `${list.length}농가 검색됨`
    : `총 ${growersCache.length}농가 · 시교 ${totalTrials}건`;

  const el = document.getElementById('growerList');
  if(list.length===0){
    el.innerHTML = q
      ? '<p class="empty">일치하는 농가가 없어요.</p>'
      : '<p class="empty">아직 등록된 시교가 없어요. 시교를 등록하면 성함 기준으로 농가가 자동으로 모여요.</p>';
    return;
  }
  el.innerHTML = list.map(g=>{
    const sub = [g.regions.join(' · '), g.addresses.length ? `밭 ${g.addresses.length}곳` : '']
      .filter(Boolean).join(' · ');
    return `<div class="farm-card" onclick="go('grower','${encodeURIComponent(g.name)}')">
      <div class="farm-body">
        <div class="farm-name">${escapeHtml(g.name)}</div>
        ${sub ? `<div class="farm-sub">${escapeHtml(sub)}</div>` : ''}
        <div class="crop-tags">
          ${g.crops.map(c=>`<span class="crop-chip"><span class="crop-dot" style="background:${c.color}"></span>${escapeHtml(c.name)} ${c.count}</span>`).join('')}
        </div>
      </div>
      <div class="farm-right">
        <span class="farm-count">${g.trials.length}건</span>
        <span class="chev">›</span>
      </div>
    </div>`;
  }).join('');
}

async function renderGrower(nameArg){
  const name = decodeURIComponent(nameArg || '');
  if(!growersCache.length) await buildGrowerList();
  const g = growersCache.find(x=> x.name===name);
  if(!g){ go('growers'); return; }

  document.getElementById('growerTitle').textContent = g.name;
  currentGrowerAddresses = g.addresses;

  const stats = [
    {v:String(g.trials.length), unit:'건', k:'진행 시교'},
    {v:String(g.crops.length), unit:'품목', k:'재배 품목'},
    {v:String(g.addresses.length), unit:'곳', k:'밭'},
  ];
  document.getElementById('growerStats').innerHTML = stats.map(s=>`
    <div class="detail-stat">
      <div class="v">${s.v}<em>${s.unit}</em></div>
      <div class="k">${s.k}</div>
    </div>`).join('');

  const addrSection = document.getElementById('growerAddrSection');
  if(g.addresses.length){
    addrSection.classList.remove('hidden');
    document.getElementById('growerAddrList').innerHTML = g.addresses.map((a,i)=>`
      <div class="addr-card">
        <span class="addr-bar" style="background:${a.cropColor}"></span>
        <div class="addr-body">
          <div class="addr-crop">${escapeHtml(a.cropName)}</div>
          <div class="addr-text">${escapeHtml(a.address)}</div>
        </div>
        <button class="action ib" onclick="copyGrowerAddress(${i})" aria-label="주소 복사">${icon('copy',15)}</button>
        <button class="action ib" onclick="openGrowerAddressInMaps(${i})" aria-label="네이버 지도로 열기">${icon('pin',15)}</button>
      </div>`).join('');
  } else {
    addrSection.classList.add('hidden');
    document.getElementById('growerAddrList').innerHTML = '';
  }

  document.getElementById('growerTrialsTitle').textContent = `이 농가의 시교 ${g.trials.length}건`;
  document.getElementById('growerTrialList').innerHTML = `
    <div class="home-crop-group"><div class="home-crop-body">
      ${g.trials.map(t=>{
        const c = t._crop || {name:'?', color:'#999'};
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
    </div></div>`;
}

function copyGrowerAddress(idx){
  const a = currentGrowerAddresses[idx];
  copyTextToClipboard(a && a.address, '주소를 복사했어요');
}
function openGrowerAddressInMaps(idx){
  const a = currentGrowerAddresses[idx];
  openAddressInNaverMap(a && a.address);
}

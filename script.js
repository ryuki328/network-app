/* 実験ネットワーク可視化・L1/L2/L3原因分析シミュレータ */
// document.querySelector(q)の省略
const $ = (q) => document.querySelector(q);
// ネットワーク図を表示するエリアを取得
const workspace = $('#workspace');
// 機器同士を結ぶ線（ケーブル）を描画するためのSVGを取得
const linkLayer = $('#linkLayer');
// Ping実行時に動く「パケット」のオブジェクト
const packet = $('#packet');
// RouterやSwitchなどを作るためのテンプレート
const template = $('#deviceTemplate');

// 現在のネットワーク全体の状態を保存する
let state = { devices: [], links: [], selectedId: null, connectMode: false, connectSource: null, protocol: 'OSPF', nextId: 1 };
// VLAN番号ごとに表示色を決める
const vlanColors = {10:'v10',20:'v20',30:'v30',40:'v40'};
// 機器ごとの画像ファイルを指定する
const img = {router:'assets/router.svg', switch:'assets/switch.svg', pc:'assets/pc.svg'};


function uid(prefix){ return `${prefix}${state.nextId++}`; }
function deviceById(id){ return state.devices.find(d => d.id === id); }
function connectedLinks(id){ return state.links.filter(l => (l.a===id || l.b===id) && !l.down); }
function other(link, id){ return link.a === id ? link.b : link.a; }
function center(d){ return {x:d.x+55, y:d.y+48}; }
function ipToInt(ip){ return ip.split('.').reduce((a,b)=>((a<<8)+Number(b))>>>0,0); }
function maskToInt(mask){ return mask.split('.').reduce((a,b)=>((a<<8)+Number(b))>>>0,0); }
function sameSubnet(a,b,mask){ if(!a||!b||!mask) return false; const m = maskToInt(mask); return (ipToInt(a)&m)===(ipToInt(b)&m); }
function siteOfPc(pc){ return pc.name <= 'PC-D' ? 'left':'right'; }
function routerForSite(site){ return state.devices.find(d=>d.type==='router' && ((site==='left' && d.name==='R1') || (site==='right' && d.name==='R2'))); }
function gatewayFor(pc){ const r = routerForSite(siteOfPc(pc)); return r?.subinterfaces?.[pc.vlan]; }
function classForVlan(vlan){ return vlanColors[vlan] || 'v10'; }

function createDeviceName(type) {
  let number = 1;

  while (true) {
    let name;

    if (type === 'pc') {
      name = `PC-${String.fromCharCode(64 + number)}`;
    } else if (type === 'switch') {
      name = `SW${number}`;
    } else if (type === 'router') {
      name = `R${number}`;
    } else {
      name = type.toUpperCase();
    }

    const exists = state.devices.some(device => device.name === name);

    if (!exists) {
      return name;
    }

    number++;
  }
}

// 機器を作成する関数
function createDevice(type, name, x = 160, y = 120, opts = {}) {
  const device = {
    id: uid(type[0]),
    type: type,
    name: name || createDeviceName(type),
    x: x,
    y: y,
    ports: {},
    ...opts
  };

  if (type === 'pc') {
    Object.assign(device, {
      ip: '',
      mask: '255.255.255.0',
      gateway: '',
      vlan: 10
    }, opts);
  }

  if (type === 'switch') {
    Object.assign(device, {
      vlans: [10, 20, 30, 40],
      ports: {},
      trunkAllowed: [10, 20, 30, 40]
    }, opts);
  }

  if (type === 'router') {
    Object.assign(device, {
      ip: '',
      mask: '255.255.255.252',
      subinterfaces: {},
      routes: true
    }, opts);
  }

  state.devices.push(device);
  render();

  return device;
}

// ケーブルを接続する関数
function createLink(a,b,type='access',vlan=null,label=''){
  const exists = state.links.find(l => (l.a===a && l.b===b)||(l.a===b && l.b===a));
  if(exists) return exists;
  const l = {id:uid('lnk'), a,b,type,vlan,label,down:false,allowed:[10,20,30,40]};
  state.links.push(l);
  render();
  return l;
}

//サンプルネットワークを作成する
function loadSample(){
  state = { devices: [], links: [], selectedId: null, connectMode: false, connectSource: null, protocol: 'OSPF', nextId: 1 };

  createDevice('router','R1',360,105,{
    ip:'10.0.0.1',
    mask:'255.255.255.252',
    subinterfaces:{10:'192.168.10.1',20:'192.168.20.1',30:'192.168.30.1',40:'192.168.40.1'},
    routes:true
  });

  createDevice('router','R2',690,105,{
    ip:'10.0.0.2',
    mask:'255.255.255.252',
    subinterfaces:{10:'192.168.110.1',20:'192.168.120.1',30:'192.168.130.1',40:'192.168.140.1'},
    routes:true
  });

  createDevice('switch','SW1',125,270);
  createDevice('switch','SW2',360,270);
  createDevice('switch','SW3',690,270);
  createDevice('switch','SW4',925,270);

  const pcs = [
    ['PC-A',60,460,10,'192.168.10.10','192.168.10.1'],
    ['PC-B',180,460,20,'192.168.20.10','192.168.20.1'],
    ['PC-C',300,460,10,'192.168.10.20','192.168.10.1'],
    ['PC-D',420,460,20,'192.168.20.20','192.168.20.1'],
    ['PC-E',620,460,30,'192.168.130.10','192.168.130.1'],
    ['PC-F',740,460,40,'192.168.140.10','192.168.140.1'],
    ['PC-G',860,460,30,'192.168.130.20','192.168.130.1'],
    ['PC-H',980,460,40,'192.168.140.20','192.168.140.1']
  ];


  pcs.forEach(([n,x,y,v,ip,gw])=>createDevice('pc',n,x,y,{vlan:v,ip,mask:'255.255.255.0',gateway:gw}));

  const id = n => state.devices.find(d=>d.name===n).id;

  createLink(id('R1'),id('R2'),'l3',null,'10.0.0.0/30');
  createLink(id('SW1'),id('SW2'),'trunk',null,'trunk');
  createLink(id('SW3'),id('SW4'),'trunk',null,'trunk');
  createLink(id('SW2'),id('R1'),'trunk',null,'router-on-a-stick');
  createLink(id('SW4'),id('R2'),'trunk',null,'router-on-a-stick');

  ['PC-A','PC-B'].forEach(n=>createLink(id(n),id('SW1'),'access',deviceById(id(n)).vlan,`VLAN${deviceById(id(n)).vlan}`));
  ['PC-C','PC-D'].forEach(n=>createLink(id(n),id('SW2'),'access',deviceById(id(n)).vlan,`VLAN${deviceById(id(n)).vlan}`));
  ['PC-E','PC-F'].forEach(n=>createLink(id(n),id('SW3'),'access',deviceById(id(n)).vlan,`VLAN${deviceById(id(n)).vlan}`));
  ['PC-G','PC-H'].forEach(n=>createLink(id(n),id('SW4'),'access',deviceById(id(n)).vlan,`VLAN${deviceById(id(n)).vlan}`));

  render();
}

// 画面の更新を行う関数
function render(){
  $('#protocolChip').textContent = `Routing: ${state.protocol}${state.protocol==='OFF'?'（停止中）':''}`;
  //「state.protocol==='OFF'?'（停止中）':''」三項演算子: もしOFFなら "(停止中)" そうでなければ ""
  linkLayer.innerHTML = '';
  workspace.querySelectorAll('.device').forEach(e=>e.remove());
  renderLinks();
  state.devices.forEach(renderDevice);
  updateSelectors();
  renderEditor();
  renderTables();
  $('#connectModeBtn').classList.toggle('active', state.connectMode);
  // $('#modeHint').textContent = state.connectMode
  //   ? '配線モード：2つの機器を順番にクリックするとケーブルを接続します。'
  //   : '通常モード：機器をドラッグできます。機器をクリックすると設定を編集します。';
}

function renderDevice(d){
  const el = template.content.firstElementChild.cloneNode(true);
  el.dataset.id = d.id;
  el.style.left = `${d.x}px`;
  el.style.top = `${d.y}px`;

  if(d.id===state.selectedId) el.classList.add('selected');
  if(d.id===state.connectSource) el.classList.add('connect-source');

  el.querySelector('img').src = img[d.type];
  el.querySelector('.device-name').textContent = d.name;

  const meta = el.querySelector('.device-meta');
  if(d.type==='pc') meta.innerHTML = `<span class="vlan-pill ${classForVlan(d.vlan)}">VLAN ${d.vlan}</span><br>${d.ip || 'IP未設定'}`;
  if(d.type==='switch') meta.textContent = `VLAN ${d.vlans.join('/')}`;
  if(d.type==='router') meta.textContent = `${d.ip || 'IP未設定'} / ${Object.keys(d.subinterfaces||{}).length} SubIF`;

  el.addEventListener('mousedown', startDrag);
  el.addEventListener('click', (ev)=>{
    ev.stopPropagation();
    handleDeviceClick(d.id);
  });

  workspace.appendChild(el);
}

function renderLinks(){
  state.links.forEach(l=>{
    const a = deviceById(l.a);
    const b = deviceById(l.b);
    if(!a||!b) return;

    const ca=center(a);
    const cb=center(b);

    const line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1',ca.x);
    line.setAttribute('y1',ca.y);
    line.setAttribute('x2',cb.x);
    line.setAttribute('y2',cb.y);
    line.setAttribute(
      'class',
      `link ${l.type === 'trunk' ? 'trunk-link' : ''} ${l.type === 'l3' ? 'l3-link' : ''} ${l.down ? 'down' : ''}`
    );

    line.dataset.linkId = l.id;

    // 配線をクリックしたときに削除する
    line.addEventListener('click', (event) => {
      event.stopPropagation();

      const deviceA = deviceById(l.a);
      const deviceB = deviceById(l.b);

      const ok = confirm(
        `${deviceA?.name} と ${deviceB?.name} の配線を削除しますか？`
      );

      if (ok) {
        state.links = state.links.filter(link => link.id !== l.id);
        render();
      }
    });

    linkLayer.appendChild(line);

    const text = document.createElementNS('http://www.w3.org/2000/svg','text');
    text.setAttribute('x',(ca.x+cb.x)/2);
    text.setAttribute('y',(ca.y+cb.y)/2-8);
    text.setAttribute('class','link-label');
    text.textContent = l.down ? 'DOWN' : (l.label || l.type);
    linkLayer.appendChild(text);
  });
}

function handleDeviceClick(id){
  if(state.connectMode){
    if(!state.connectSource){
      state.connectSource=id;
      render();
      return;
    }
    if(state.connectSource!==id){
      createLink(state.connectSource,id,'access',10,'new link');
      state.connectSource=null;
      state.connectMode=false;
    }
  } else {
    state.selectedId=id;
  }
  render();
}
// ドラッグをできるようにする設定---------------------------------------------
let drag = null;
function startDrag(e){
  if(state.connectMode) return;
  const id = e.currentTarget.dataset.id;
  const d = deviceById(id);
  drag = {id, dx:e.clientX-d.x, dy:e.clientY-d.y};
  document.addEventListener('mousemove', onDrag);
  document.addEventListener('mouseup', endDrag);
}

function onDrag(e){
  if(!drag) return;
  const d = deviceById(drag.id);
  const rect = workspace.getBoundingClientRect();
  d.x = Math.max(0, Math.min(rect.width-120, e.clientX - drag.dx));
  d.y = Math.max(0, Math.min(rect.height-105, e.clientY - drag.dy));
  render();
}

function endDrag(){
  drag=null;
  document.removeEventListener('mousemove', onDrag);
  document.removeEventListener('mouseup', endDrag);
}
//----------------------------------------------------------------------


workspace.addEventListener('click',()=>{
  state.selectedId=null;
  render();
});

// 画面左のサイドバーを設定・編集する
function renderEditor(){
  const box = $('#deviceEditor');
  const d = deviceById(state.selectedId);

  if(!d){
    box.innerHTML = '<div class="editor-empty">機器を選択してください。</div>';
    return;
  }

  let html = `<div class="editor-row"><span>名前</span><input id="editName" value="${d.name}"></div>`;

  if(d.type==='pc'){
    html += `<div class="editor-row"><span>VLAN</span><select id="editVlan">${[10,20,30,40].map(v=>`<option ${d.vlan==v?'selected':''}>${v}</option>`).join('')}</select></div>`;
    html += `<div class="editor-row"><span>IP</span><input id="editIp" value="${d.ip}"></div>`;
    html += `<div class="editor-row"><span>Mask</span><input id="editMask" value="${d.mask}"></div>`;
    html += `<div class="editor-row"><span>Gateway</span><input id="editGw" value="${d.gateway}"></div>`;
  }

  if(d.type==='router'){
    html += `<div class="editor-row"><span>R1-R2 IP</span><input id="editIp" value="${d.ip}"></div>`;
    html += `<div class="editor-row"><span>Mask</span><input id="editMask" value="${d.mask}"></div>`;
    html += [10,20,30,40].map(v=>`<div class="editor-row"><span>SubIF .${v}</span><input class="editSub" data-v="${v}" value="${d.subinterfaces?.[v]||''}"></div>`).join('');
  }

  if(d.type==='switch'){
    html += `<p class="editor-empty">Switchはlink側で access / trunk を区別します。VLAN: ${d.vlans.join(', ')}</p>`;
  }

  html += `<button id="saveDevice" class="primary">保存</button><button id="deleteDevice" class="danger">削除</button>`;
  box.innerHTML = html;

  $('#saveDevice').onclick = ()=>{
    d.name = $('#editName').value.trim() || d.name;

    if(d.type==='pc'){
      d.vlan = Number($('#editVlan').value);
      d.ip=$('#editIp').value.trim();
      d.mask=$('#editMask').value.trim();
      d.gateway=$('#editGw').value.trim();

      connectedLinks(d.id).filter(l=>l.type==='access').forEach(l=>{
        l.vlan=d.vlan;
        l.label=`VLAN${d.vlan}`;
      });
    }

    if(d.type==='router'){
      d.ip=$('#editIp').value.trim();
      d.mask=$('#editMask').value.trim();
      d.subinterfaces = {};
      document.querySelectorAll('.editSub').forEach(i=>{
        if(i.value.trim()) d.subinterfaces[i.dataset.v]=i.value.trim();
      });
    }

    render();
  };

  $('#deleteDevice').onclick = ()=>{
    state.links=state.links.filter(l=>l.a!==d.id && l.b!==d.id);
    state.devices=state.devices.filter(x=>x.id!==d.id);
    state.selectedId=null;
    render();
  };
}

function updateSelectors(){
  const srcSelect = $('#srcPc');
  const dstSelect = $('#dstPc');

  // 現在選択されている値を保存
  const currentSrc = srcSelect.value;
  const currentDst = dstSelect.value;

  const pcs = state.devices
    .filter(d => d.type === 'pc')
    .sort((a, b) => a.name.localeCompare(b.name));

  const opts = pcs
    .map(d => `<option value="${d.id}">${d.name} (${d.ip})</option>`)
    .join('');

  srcSelect.innerHTML = opts;
  dstSelect.innerHTML = opts;

  // 以前選択していたPCが残っていれば、その選択を維持
  if (pcs.some(pc => pc.id === currentSrc)) {
    srcSelect.value = currentSrc;
  } else if (pcs[0]) {
    srcSelect.value = pcs[0].id;
  }

  if (pcs.some(pc => pc.id === currentDst)) {
    dstSelect.value = currentDst;
  } else if (pcs[1]) {
    dstSelect.value = pcs[1].id;
  } else if (pcs[0]) {
    dstSelect.value = pcs[0].id;
  }
}

function renderTables(){
  const pcs = state.devices.filter(d=>d.type==='pc').sort((a,b)=>a.name.localeCompare(b.name));

  $('#ipTable').innerHTML = `<table>
    <thead><tr><th>PC</th><th>VLAN</th><th>IP</th><th>GW</th></tr></thead>
    <tbody>${pcs.map(p=>`<tr><td>${p.name}</td><td><span class="vlan-pill ${classForVlan(p.vlan)}">${p.vlan}</span></td><td>${p.ip}</td><td>${p.gateway}</td></tr>`).join('')}</tbody>
  </table>`;

  const rows = state.links.map(l=>{
    const a=deviceById(l.a);
    const b=deviceById(l.b);
    return `<tr><td>${a?.name}-${b?.name}</td><td>${l.type}</td><td>${l.type==='access'?'VLAN '+l.vlan:(l.type==='trunk'?'10/20/30/40':'10.0.0.0/30')}</td><td>${l.down?'DOWN':'UP'}</td></tr>`;
  }).join('');

  $('#portTable').innerHTML = `<table>
    <thead><tr><th>接続</th><th>種類</th><th>範囲</th><th>状態</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>`;

  $('#routeTable').textContent = makeRouteTable();
}

function makeRouteTable(){
  if(state.protocol==='OFF'){
    return 'Routing Protocol: OFF\nR1/R2間の経路交換なし\n→ 遠隔サイトへの経路がありません。';
  }

  const mark = state.protocol==='RIP'?'R':state.protocol==='OSPF'?'O':'B';

  return `Routing Protocol: ${state.protocol}
${mark} 192.168.110.0/24 via 10.0.0.2
${mark} 192.168.120.0/24 via 10.0.0.2
${mark} 192.168.130.0/24 via 10.0.0.2
${mark} 192.168.140.0/24 via 10.0.0.2
${mark} 192.168.10.0/24 via 10.0.0.1
${mark} 192.168.20.0/24 via 10.0.0.1
${mark} 192.168.30.0/24 via 10.0.0.1
${mark} 192.168.40.0/24 via 10.0.0.1`;
}

// L2通信できるか(VLANを考慮しながら通信可能か)を調べる関数
// ケーブルがあるか→VLANが一致しているか→目的地まで行けるか
function l2Reachable(startId, endId, vlan, visited=new Set()){
  if(startId===endId) return true;
  visited.add(startId);

  for(const l of connectedLinks(startId)){
    if(l.type==='l3') continue;
    if(l.type==='access' && l.vlan!==vlan) continue;
    if(l.type==='trunk' && !(l.allowed||[]).includes(vlan)) continue;

    const nxt = other(l,startId);
    const nd = deviceById(nxt);

    if(!nd || visited.has(nxt)) continue;
    if(nd.type==='pc' && nxt!==endId) continue;

    if(l2Reachable(nxt,endId,vlan,visited)) return true;
  }

  return false;
}

function findL2Problem(src,dst,vlan){
  const allLinks = state.links.filter(l=>l.a===src.id||l.b===src.id||l.a===dst.id||l.b===dst.id);

  if(allLinks.some(l=>l.down)){
    return {layer:'L1', reason:'ケーブルまたはリンクがDOWNです。'};
  }

  return {
    layer:'L2',
    reason:`VLAN ${vlan} がaccess/trunkで正しく通っていません。VLAN割当またはtrunk allowed VLANを確認してください。`
  };
}

function routeReachable(){
  return state.protocol !== 'OFF' && state.devices.filter(d=>d.type==='router').every(r=>r.routes!==false);
}

//ping通信の判定
//コードの流れ：IP設定されている？→同じネットワーク？→VLANは正しい？→Gatewayは正しい？→
//→Routerまで届く？→R1-R2間は接続されている？→Routingできる？→通信成功
function validatePing(src,dst){
  if(!src||!dst){
    return {ok:false,layer:'-',reason:'送信元または宛先PCが選択されていません。'};
  }

  if(src.id===dst.id){
    return {ok:false,layer:'-',reason:'同じPC同士は選択できません。'};
  }

   // IPアドレスとサブネットマスクは、どの通信でも必要
  for (const pc of [src, dst]) {
    if (!pc.ip || !pc.mask) {
      return {
        ok: false,
        layer: 'L3',
        reason: `${pc.name} のIPアドレスまたはサブネットマスクが未設定です。`
      };
    }
  }

  //同一サブネットかどうかを判定する
  //同一サブネットならL2通信を試す
  if(sameSubnet(src.ip,dst.ip,src.mask)){
    if(src.vlan!==dst.vlan){
      return {ok:false,layer:'L2',reason:'同一サブネットなのに所属VLANが異なっています。'};
    }

    if(l2Reachable(src.id,dst.id,src.vlan)){
      return {
        ok:true,
        path:[src.id,...pathBetween(src.id,dst.id,src.vlan)],
        reason:'同一VLAN内でL2通信が成功しました。'
      };
    }

    const p = findL2Problem(src,dst,src.vlan);
    return {ok:false,...p};
  }

  // 異なるサブネットの場合は、L3通信を試す
  // Default Gatewayが設定されているかを確認する
  for (const pc of [src, dst]) {
    if (!pc.gateway) {
      return {
        ok: false,
        layer: 'L3',
        reason: `${pc.name} のDefault Gatewayが未設定です。`
      };
    }
  }

  const srcGw = gatewayFor(src);
  const dstGw = gatewayFor(dst);

  if(src.gateway!==srcGw){
    return {ok:false,layer:'L3',reason:`${src.name} のDefault Gatewayが誤っています。正: ${srcGw}`};
  }

  if(dst.gateway!==dstGw){
    return {ok:false,layer:'L3',reason:`${dst.name} のDefault Gatewayが誤っています。正: ${dstGw}`};
  }

  const rSrc = routerForSite(siteOfPc(src));
  const rDst = routerForSite(siteOfPc(dst));

  if(!rSrc || !rDst){
    return {ok:false,layer:'L3',reason:'送信元または宛先サイトのRouterが見つかりません。'};
  }

  if(!l2Reachable(src.id,rSrc.id,src.vlan)){
    return {ok:false,...findL2Problem(src,rSrc,src.vlan)};
  }

  if(!l2Reachable(dst.id,rDst.id,dst.vlan)){
    return {ok:false,...findL2Problem(dst,rDst,dst.vlan)};
  }

  if(rSrc.id===rDst.id){
    const toRouter = pathBetween(src.id,rSrc.id,src.vlan);
    const fromRouter = pathBetween(rSrc.id,dst.id,dst.vlan);

    return {
      ok:true,
      path:[src.id,...toRouter,...fromRouter],
      reason:'同一サイト内でRouter-on-a-StickによるVLAN間通信に成功しました。'
    };
  }

  const inter = state.links.find(l=>((l.a===rSrc.id&&l.b===rDst.id)||(l.a===rDst.id&&l.b===rSrc.id)) && l.type==='l3');

  if(!inter || inter.down){
    return {ok:false,layer:'L1',reason:'R1-R2間のL3 linkが未接続またはDOWNです。'};
  }

  if(!routeReachable()){
    return {ok:false,layer:'L3',reason:'RIP/OSPF/BGPなどの経路交換が停止しており、遠隔ネットワークへの経路がありません。'};
  }

  const toSourceRouter = pathBetween(src.id,rSrc.id,src.vlan);
  const fromDestinationRouter = pathBetween(rDst.id,dst.id,dst.vlan);

  return {
    ok:true,
    path:[src.id,...toSourceRouter,rDst.id,...fromDestinationRouter],
    reason:`${state.protocol} による経路交換が有効で、遠隔サイト通信に成功しました。`
  };
}

// 通信経路を探す
function pathBetween(s,t,vlan){
  const queue = [[s,[s]]];
  const visited = new Set([s]);

  while(queue.length){
    const [cur,path] = queue.shift();

    if(cur===t) return path.slice(1);

    for(const l of connectedLinks(cur)){
      if(l.type==='l3') continue;
      if(l.type==='access' && l.vlan!==vlan) continue;
      if(l.type==='trunk' && !(l.allowed||[]).includes(vlan)) continue;

      const nxt = other(l,cur);
      const nd = deviceById(nxt);

      if(!nd || visited.has(nxt)) continue;
      if(nd.type==='pc' && nxt!==t) continue;

      visited.add(nxt);
      queue.push([nxt,[...path,nxt]]);
    }
  }

  return [];
}

function linkBetween(aId,bId){
  return state.links.find(l=>
    !l.down &&
    (
      (l.a===aId && l.b===bId) ||
      (l.a===bId && l.b===aId)
    )
  );
}

// パケットアニメーション
async function animatePath(ids){
  if(!ids || ids.length<2) return;

  packet.classList.remove('hidden');

  for(let i=0;i<ids.length-1;i++){
    const from = deviceById(ids[i]);
    const to = deviceById(ids[i+1]);

    if(!from || !to) continue;

    const activeLink = linkBetween(from.id,to.id);

    const line = activeLink
      ? linkLayer.querySelector(`[data-link-id="${activeLink.id}"]`)
      : null;

    const fromElement = workspace.querySelector(
      `.device[data-id="${from.id}"]`
    );

    const toElement = workspace.querySelector(
      `.device[data-id="${to.id}"]`
    );

    line?.classList.add('packet-active');
    fromElement?.classList.add('packet-hop');
    toElement?.classList.add('packet-hop');

    await animateSegment(center(from),center(to));

    line?.classList.remove('packet-active');
    fromElement?.classList.remove('packet-hop');
    toElement?.classList.remove('packet-hop');
  }

  packet.classList.add('hidden');
}

function animateSegment(a,b){
  return new Promise(res=>{
    const start = performance.now();
    const dur=500;

    function step(now){
      const t = Math.min(1,(now-start)/dur);
      const e=t<.5?2*t*t:1-Math.pow(-2*t+2,2)/2;

      packet.style.left = `${a.x + (b.x-a.x)*e - 9}px`;
      packet.style.top = `${a.y + (b.y-a.y)*e - 9}px`;

      if(t<1) requestAnimationFrame(step);
      else res();
    }

    requestAnimationFrame(step);
  });
}

async function runPing(){
  const src = deviceById($('#srcPc').value);
  const dst = deviceById($('#dstPc').value);
  const r = validatePing(src,dst);
  const box = $('#resultBox');

  if(r.ok){
    const routeNames = r.path
      .map(id => deviceById(id)?.name)
      .filter(Boolean)
      .join(' → ');

    box.className='result-box success';
    box.innerHTML = `<b>Ping成功</b><br>${src.name} → ${dst.name}<br>${r.reason}<br><b>通過経路:</b> ${routeNames}<br>判断: L1/L2/L3 の設定が正常です。`;
    await animatePath(r.path);
  } else {
    box.className='result-box fail';
    box.innerHTML = `<b>Ping失敗</b><br>${src?.name||''} → ${dst?.name||''}<br><b>推定原因: ${r.layer}</b><br>${r.reason}`;
  }
}

// JSON出力
function exportJson(){
  const blob = new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download='network_config.json';
  a.click();
}

// JSON出力
function importJson(file){
  const fr = new FileReader();
  fr.onload = () => {
    try{
      state = JSON.parse(fr.result);
      render();
    } catch(e){
      alert('JSONの読み込みに失敗しました。');
    }
  };
  fr.readAsText(file);
}

$('#loadSampleBtn').onclick = loadSample;

$('#clearBtn').onclick = ()=>{
  if(confirm('すべて削除しますか？')){
    state.devices=[];
    state.links=[];
    render();
  }
};

$('#connectModeBtn').onclick = ()=>{
  state.connectMode=!state.connectMode;
  state.connectSource=null;
  render();
};

document.querySelectorAll('[data-add]').forEach(btn => {
  btn.onclick = () => {
    const type = btn.dataset.add;
    const name = createDeviceName(type);

    createDevice(type, name, 180, 180);
  };
});

$('#pingBtn').onclick = runPing;
$('#exportBtn').onclick = exportJson;
$('#importInput').onchange = e=> e.target.files[0] && importJson(e.target.files[0]);

loadSample();

// 全体の流れ
// ページ起動
//       │
//       ▼
// loadSample()
//       │
//       ▼
// Router・Switch・PCを作成
//       │
//       ▼
// render()
//       │
//       ▼
// 画面表示
//       │
//       ▼
// ユーザーが編集
//       │
//       ▼
// stateを更新
//       │
//       ▼
// render()
//       │
//       ▼
// Ping実行
//       │
//       ▼
// validatePing()
//       │
//       ├── L1確認
//       ├── L2確認
//       ├── L3確認
//       └── Routing確認
//       │
//       ▼
// 成功ならパケットアニメーション
// 失敗なら原因を表示
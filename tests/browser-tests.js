'use strict';
document.getElementById('run').addEventListener('click',async()=>{
  const output=document.getElementById('results'),button=document.getElementById('run');button.disabled=true;output.textContent='';let passed=0,failed=0;
  const app=document.getElementById('app').contentWindow,doc=app.document;
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const test=async(name,fn)=>{try{await fn();passed++;output.textContent+='PASS '+name+'\n';}catch(e){failed++;output.textContent+='FAIL '+name+': '+e.message+'\n';}};
  let rows,players,normalized;
  await test('Varsayılan kadro boş; başlangıç verisi ve örnek kadro düğmesi yok',()=>{
    assert(app.defaultState().players.length===0,'Boş başlangıç');assert(!app.SEED_ROSTER,'Gömülü kadro olmamalı');assert(!doc.getElementById('exampleBtn'),'Örnek gerçek kadro düğmesi olmamalı');
  });
  await test('Yapay XLSX ZIP ve XML ayrıştırma',async()=>{
    const file=new File([await(await fetch('./fixtures/synthetic-roster.xlsx')).arrayBuffer()],'synthetic-roster.xlsx');rows=await app.readXLSX(file);players=app.parseRosterRows(rows);
    assert(players.length===42,'42 oyuncu gerekli');assert(players.filter(p=>p.status==='main').length===30,'30 asil');assert(players.filter(p=>p.status==='reserve').length===10,'10 yedek');assert(players.filter(p=>p.status==='pool').length===2,'2 havuz');
    assert(players[0].name==='Test Oyuncusu 01'&&players[0].power===196.75,'İlk oyuncu');assert(players.some(p=>p.name==='اختبار 27'),'Unicode ad');assert(players[0].contacted,'Contacted');assert(players[0].excelPhase2Role==='Support','İkinci Mission');
    normalized=app.normalizeState({players});
    await app.importFile(file);assert(!doc.getElementById('importPreview').hidden,'Excel önizleme');doc.getElementById('confirmImport').click();
  });
  await test('Excel verisi 3/5/6 takım ve beş stratejide geçerli plan verir',()=>{
    for(const teams of [3,5,6])for(const mode of ['balanced','aggressive','defensive','fast','water']){normalized.config.teams=teams;const plan=app.generatePlan(mode,normalized);assert(app.planErrors(normalized,plan).length===0,teams+'/'+mode);assert(Object.values(plan.assign).filter(a=>a.role==='killer').length===2,'Killer');}
  });
  await test('Gerçek DOM içinde tüm sekmeler ve kontroller çizilir',()=>{
    for(const tab of ['dashboard','roster','teams','battlefield','simulator','compare','settings','battle']){app.switchTab(tab);assert(!doc.getElementById('view-'+tab).hidden,tab);assert(doc.getElementById('view-'+tab).textContent.trim().length>10,tab+' içerik');}
    assert(doc.querySelectorAll('[data-target-lock]').length===12,'Hedef kilitleri');assert(doc.querySelectorAll('[data-field="teamLock"]').length===42,'Takım kilitleri');assert(doc.querySelectorAll('.scenario-card').length===5,'Beş strateji');
  });
  await test('Simülasyon kesirli aralıklar ve tek FTC hesaplar',()=>{
    const d=app.evaluateScenario({buildings:{test:{events:'1.5:us; 10:them; 27:us'}},waterUnit:500},{duration:60,phase2:12,waterStart:20,captureDelay:1},[{id:'test',phase:1,rate:600,ftc:3000}]);assert(d.us===(8.5+33)*600+3000,'Su hesabı');assert(d.them===17*600,'Rakip hesabı');
  });
  await test('İçe aktarma önizlemesi uygulamadan vazgeçilebilir',async()=>{
    app.switchTab('roster');await app.importFile(new File([JSON.stringify(players)],'roster.json',{type:'application/json'}));assert(!doc.getElementById('importPreview').hidden,'Önizleme');doc.getElementById('cancelImport').click();assert(doc.getElementById('importPreview').hidden,'Vazgeç');
  });
  await test('Kadro sıralama kontrolleri Power, kadro, rol ve takım sıralar',()=>{
    app.switchTab('roster');
    const set=(id,value)=>{doc.getElementById(id).value=value;doc.getElementById(id).dispatchEvent(new app.Event('change',{bubbles:true}));};
    set('rosterSort','power');let powers=[...doc.querySelectorAll('#rosterTable [data-field="power"]')].map(el=>Number(el.value.replaceAll('.','').replace(',','.')));assert(powers.every((v,i)=>!i||powers[i-1]>=v),'Power azalan');
    set('rosterSortDirection','asc');powers=[...doc.querySelectorAll('#rosterTable [data-field="power"]')].map(el=>Number(el.value.replaceAll('.','').replace(',','.')));assert(powers.every((v,i)=>!i||powers[i-1]<=v),'Power artan');
    set('rosterSort','status');assert(doc.querySelector('#rosterTable [data-field="status"]').value==='main','Asiller önce');
    set('rosterSort','role');assert(doc.querySelector('#rosterTable [data-field="role"]').value==='killer','Killer önce');
    set('rosterSort','team');assert(doc.querySelector('#rosterTable [data-field="team"]').value==='T1','Takım sırası');
    set('rosterSort','original');
  });
  await test('Alan değişikliği tabloyu, odaklanan alanı ve kaydırma konumunu korur',()=>{
    const viewport=doc.querySelector('#rosterTable .tablewrap'),row=viewport.querySelectorAll('tbody tr')[20],input=row.querySelector('[data-field="name"]');
    viewport.scrollTop=500;viewport.scrollLeft=350;app.scrollTo({top:500,behavior:'instant'});input.focus({preventScroll:true});
    const before={top:viewport.scrollTop,left:viewport.scrollLeft,y:app.scrollY};
    input.value='Test oyuncusu düzenlendi';input.dispatchEvent(new app.Event('change',{bubbles:true}));
    assert(doc.querySelector('#rosterTable .tablewrap')===viewport,'Kaydırma alanı yeniden oluşturulmamalı');assert(input.isConnected,'Düzenlenen alan korunmalı');assert(doc.activeElement===input,'Odak korunmalı');
    assert(viewport.scrollTop===before.top&&viewport.scrollLeft===before.left&&app.scrollY===before.y,'Kaydırma konumu değişmemeli');
  });
  await test('Yeni oyuncu ekledikten sonra alan dışına çıkmak konumu kaybettirmez',()=>{
    doc.getElementById('addPlayer').click();const input=doc.activeElement,viewport=doc.querySelector('#rosterTable .tablewrap');
    assert(input.dataset.field==='name','Yeni oyuncunun adı odaklanmalı');const before={top:viewport.scrollTop,left:viewport.scrollLeft,y:app.scrollY};
    input.value='Yeni yapay oyuncu';input.dispatchEvent(new app.Event('change',{bubbles:true}));input.blur();
    assert(input.isConnected,'Yeni oyuncu alanı korunmalı');assert(viewport.scrollTop===before.top&&viewport.scrollLeft===before.left&&app.scrollY===before.y,'Yeni oyuncuyu düzenlerken başa dönülmemeli');
  });
  await test('Kadro ekranının JSON düğmesi tam yedek formatını dışa aktarır',()=>{
    const original=app.download;let result;
    try{app.download=(name,body,type)=>{result={name,data:JSON.parse(body),type};};doc.getElementById('rosterJsonExport').click();assert(result?.type==='application/json','JSON indirme');assert(result.data.players.length===doc.querySelectorAll('#rosterTable tbody tr').length,'Tüm oyuncular');assert(result.data.config&&result.data.assign,'Ayarlar ve kilitli atamalar');}finally{app.download=original;}
  });
  await test('Bina adları tam referans adlarıyla hedef listesi, harita ve simülatörde gösterilir',async()=>{
    const reference=await(await fetch('./fixtures/calculator-reference.json')).json();
    app.switchTab('teams');doc.querySelector('[data-phase="2"]').click();
    const options=[...doc.querySelectorAll('select[data-target-key="p2"] option')].map(o=>o.textContent);
    for(const b of reference.buildings)assert(options.includes(b.name),'Tam hedef adı: '+b.name);
    app.switchTab('battlefield');for(const b of reference.buildings){const node=doc.querySelector(`[data-map-site="${b.id}"]`);assert(node.querySelector('title').textContent.includes(b.name),'Harita adı: '+b.name);assert(node.querySelector('.node-title').textContent.replace(/\s+/g,' ').trim()===b.name,'Görünür harita etiketi: '+b.name);}
    app.switchTab('simulator');for(const b of reference.buildings)assert(doc.getElementById('simTable').textContent.includes(b.name),'Simülatör adı: '+b.name);
  });
  await test('Referans zamanlaması ve tüm binalar senaryosu arayüzde 457200 su verir',async()=>{
    const reference=await(await fetch('./fixtures/calculator-reference.json')).json();app.switchTab('settings');doc.getElementById('referenceTiming').click();
    assert(doc.getElementById('setPhase2').value==='15','Phase II 15');assert(doc.getElementById('setCaptureDelay').value==='0','Gecikme sıfır');app.switchTab('simulator');
    for(const b of reference.buildings){for(const phase of (b.phase===1?['p1','p2']:['p2'])){const el=doc.querySelector(`[data-sim-site="${b.id}"][data-sim-field="${phase}"]`);el.value='us';el.dispatchEvent(new app.Event('change',{bubbles:true}));}}
    assert(doc.querySelector('#simKpis .num').textContent==='457.200','Referans 60. dakika sonucu');assert(doc.getElementById('phaseWaterSummary').textContent.includes('105.600'),'Phase I sınırında yeni faz bonusu sayılmaz');
    assert(doc.getElementById('simBonuses').textContent.includes('Dev Compound'),'Aktif özel etkiler');
  });
  let commanderId;
  const snapshot=()=>{const original=app.download;let data;try{app.download=(name,text)=>{data=JSON.parse(text);};app.exportJSON();return data;}finally{app.download=original;}};
  await test('Commander tek kişiyle sınırlıdır ve iki fazda da takım dışında kalır',()=>{
    app.switchTab('roster');const initial=snapshot();commanderId=initial.players.find(p=>p.status==='main').id;const role=doc.querySelector(`[data-player="${commanderId}"][data-field="role"]`);assert(role,'İlk oyuncu satırı');role.value='commander';role.dispatchEvent(new app.Event('change',{bubbles:true}));
    assert(doc.querySelector(`[data-player="${commanderId}"][data-field="team"]`).disabled,'Commander takım seçemez');
    const other=doc.querySelector(`[data-player="${initial.players.filter(p=>p.status==='main')[1].id}"][data-field="role"]`),before=other.value;other.value='commander';other.dispatchEvent(new app.Event('change',{bubbles:true}));assert(other.value===before,'İkinci Commander atomik reddedilir');
    doc.getElementById('generateBtn').click();const s=snapshot();assert(s.assign[commanderId].role==='commander'&&s.assign[commanderId].team==='','Faz I Commander');assert(s.assignP2[commanderId].role==='commander'&&s.assignP2[commanderId].team==='','Faz II Commander');assert(app.planErrors(s).length===0,'Geçerli plan');
    assert(!doc.getElementById('commanderSummary').textContent.includes('seçilmedi'),'Komuta özeti');
  });
  await test('Faz II kartları yeniden kurulan kadroyu ve en güçlü üç oyuncuyu Central Reservoir’da gösterir',()=>{
    const s=snapshot(),field=s.players.filter(p=>p.status==='main'&&!['commander','killer'].includes(s.assign[p.id].role)).sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id)),top=field.slice(0,3);
    app.switchTab('teams');doc.querySelector('[data-phase="1"]').click();const first=[...doc.querySelectorAll('.team-card')].map(card=>[...card.querySelectorAll('.member-name')].map(e=>e.textContent).join('|')).join('/');
    doc.querySelector('[data-phase="2"]').click();const second=[...doc.querySelectorAll('.team-card')].map(card=>[...card.querySelectorAll('.member-name')].map(e=>e.textContent).join('|')).join('/');assert(first!==second,'Oyuncular fazlar arasında takım değiştirir');
    for(const p of top){const team=s.assignP2[p.id].team,card=doc.querySelector(`[aria-label="${team} takım planı"]`);assert(card.querySelector('[data-target-key="p2"]').value==='central','Central hedefi');assert([...card.querySelectorAll('.member-name')].some(e=>e.textContent===p.name),'Güçlü oyuncu doğru kartta');}
    for(const card of doc.querySelectorAll('.team-card'))assert(![...card.querySelectorAll('.member-name')].some(e=>e.textContent===s.players.find(p=>p.id===commanderId).name),'Commander kart dışında');
  });
  await test('Kadro tablosu iki fazı gösterir ve JSON iki kadroyu ayrı korur',()=>{
    const s=snapshot();app.switchTab('roster');const moved=s.players.find(p=>p.status==='main'&&s.assign[p.id].team!==s.assignP2[p.id].team);assert(moved,'Yer değiştiren oyuncu');const row=doc.querySelector(`[data-roster-row="${moved.id}"]`);
    assert(row.querySelector('[data-field="team"]').value===s.assign[moved.id].team,'Faz I takımı');assert(row.querySelector('[data-phase-two-team]').textContent===s.assignP2[moved.id].team,'Faz II takımı');assert(s.version===3&&Object.keys(s.assignP2).length===30,'JSON v3 ayrı faz kadrosu');
  });
  output.textContent+=`\n${passed} passed, ${failed} failed`;button.disabled=false;
});

const testFrame=document.getElementById('app');
if(testFrame.contentDocument?.readyState==='complete')document.getElementById('run').disabled=false;
else testFrame.addEventListener('load',()=>{document.getElementById('run').disabled=false;},{once:true});

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
  output.textContent+=`\n${passed} passed, ${failed} failed`;button.disabled=false;
});

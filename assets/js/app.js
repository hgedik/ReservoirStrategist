'use strict';
function commitEdit(candidate){candidate.explanations={};if(candidate.battle)candidate.battle.disabled=candidate.battle.disabled.filter(id=>candidate.players.some(p=>p.id===id&&p.status==='main'));state=normalizeState(candidate);autosave();renderAll();}
function handlePlayerChange(el){
  const before=state,candidate=deepcopy(state),p=candidate.players.find(p=>p.id===el.dataset.player);if(!p)return;
  const f=el.dataset.field,v=el.type==='checkbox'?el.checked:el.value,a=candidate.assign[p.id]||{role:'support',team:''};
  try{
    if(f==='name')p.name=String(v).trim();
    else if(f==='power')p.power=finiteValue(v,'Güç',0.000001,1e9);
    else if(f==='killerSuitability')p.killerSuitability=finiteValue(v,'Killer uygunluğu',0,5);
    else if(f==='notes')p.notes=v;
    else if(f==='rolePref'){if(p.roleLock)fail('Tercihi değiştirmeden önce rol kilidini kaldırın.');p.rolePref=v;}
    else if(f==='status'){if(p.roleLock||p.teamLock)fail('Kadro durumunu değiştirmeden önce kilitleri kaldırın.');p.status=v;if(v==='main'){if(candidate.players.filter(p=>p.status==='main').length>candidate.config.mainLimit)fail('Asil sınırı dolu. Yedek değişimi kullanın.');candidate.assign[p.id]={role:'support',team:'T1'};}else delete candidate.assign[p.id];}
    else if(['coming','joined','contacted','roleLock','teamLock'].includes(f)){
      if(f==='teamLock'&&v&&(!a.team||a.role==='killer'||p.status!=='main'))fail('Yalnızca takımdaki aktif oyuncu kilitlenebilir.');
      if(f==='roleLock'&&v&&p.status!=='main')fail('Yalnızca asil oyuncu rolü kilitlenebilir.');p[f]=v;if(f==='roleLock'&&v)p.rolePref=a.role;
    }else if(f==='role'){
      if(!ROLES.includes(v))fail('Geçersiz rol.');if(v==='killer'&&p.teamLock)fail('Killer seçmeden önce takım kilidini kaldırın.');
      a.role=v;p.rolePref=v;p.roleLock=true;if(v==='killer')a.team='';else if(!a.team)a.team=teamsFrom().sort((x,y)=>x.players.length-y.players.length)[0]?.id||'T1';candidate.assign[p.id]=a;
    }else if(f==='team'){if(a.role==='killer')fail('Killer takıma atanamaz.');a.team=v;p.teamLock=true;candidate.assign[p.id]=a;}
    for(const [team,id] of Object.entries(candidate.leaders))if(candidate.assign[id]?.team!==team||candidate.assign[id]?.role!=='holder')delete candidate.leaders[team];
    commitEdit(candidate);
  }catch(e){state=before;toast(e.message,true);renderAll();}
}
function updateSettings(changes){
  try{const candidate=deepcopy(state);candidate.config={...candidate.config,...changes,weights:{...candidate.config.weights,...changes.weights}};validateConfig(candidate.config);
    for(const key of TARGET_KEYS)for(const team of Object.keys(candidate.targets[key]))if(Number(team.slice(1))>candidate.config.teams){if(candidate.targetLocks[key][team])fail(team+': hedef kilidini kaldırmadan takım sayısı azaltılamaz.');delete candidate.targets[key][team];delete candidate.targetLocks[key][team];}
    if(!candidate.players.length){state=normalizeState(candidate);autosave();renderAll();toast('Ayarlar kaydedildi; şimdi kadronuzu içe aktarabilirsiniz.');return;}
    const plan=generatePlan(candidate.config.mode,candidate);candidate.assign=plan.assign;candidate.targets=plan.targets;candidate.explanations=plan.explanations;candidate.lastGenerated=new Date().toISOString();
    for(const [team,id] of Object.entries(candidate.leaders))if(candidate.assign[id]?.team!==team||candidate.assign[id]?.role!=='holder')delete candidate.leaders[team];
    state=normalizeState(candidate);autosave();renderAll();toast('Ayarlar ve plan kilitler korunarak güncellendi.');
  }catch(e){toast(e.message,true);renderAll();}
}
function handleSettings(){const changes={};try{
  for(const [el,key] of [['setPhase2','phase2'],['setDuration','duration'],['setTeams','teams'],['setKillers','killers'],['setMainLimit','mainLimit'],['setReserveLimit','reserveLimit'],['setHolderMin','holderMin'],['setCaptureDelay','captureDelay'],['setWaterStart','waterStart']]){const v=$(el).value;if(!String(v).trim()||!Number.isFinite(Number(v)))fail(key+': sayı gerekli.');changes[key]=Number(v);}
  changes.unassigned=$('setOpponent').value;changes.weights={};for(const key of Object.keys(BASE_CONFIG.weights))changes.weights[key]=Number($('weight-'+key).value);updateSettings(changes);
 }catch(e){toast(e.message,true);}}
function clearLocalRoster(){if(!confirm('Bu tarayıcıdaki kadro ve plan temizlensin mi? Gerekliyse önce JSON yedeği alın.'))return;startupError='';pendingImport=null;state=defaultState();renderImportPreview();autosave();renderAll();toast('Yerel kadro temizlendi.');}
function replacePlayer(){try{
  const c=deepcopy(state),old=c.players.find(p=>p.id===$('replaceOut').value),next=c.players.find(p=>p.id===$('replaceIn').value);
  if(!old||old.status!=='main'||!next||next.status!=='reserve')fail('Bir asil ve bir yedek seçin.');
  const a=c.assign[old.id];c.battle.disabled=c.battle.disabled.filter(id=>id!==old.id);next.status='main';old.status='reserve';next.rolePref=a?.role||'support';next.roleLock=old.roleLock;next.teamLock=old.teamLock;old.roleLock=false;old.teamLock=false;
  delete c.assign[old.id];if(a)c.assign[next.id]=a;for(const team of Object.keys(c.leaders))if(c.leaders[team]===old.id)c.leaders[team]=next.id;
  const errors=planErrors(c);if(errors.length)fail(errors.join('\n'));commitEdit(c);toast('Yedek oyuncu asil oyuncunun görevini devraldı.');
 }catch(e){toast(e.message,true);}}
function resetLocks(){if(!confirm('Tüm rol, takım, lider ve hedef kilitleri kaldırılsın mı?'))return;for(const p of state.players){p.roleLock=false;p.teamLock=false;}state.targetLocks=Object.fromEntries(TARGET_KEYS.map(k=>[k,{}]));state.leaders={};autosave();renderAll();toast('Kilitler kaldırıldı; mevcut atamalar korundu.');}
function bindEvents(){
  document.addEventListener('click',ev=>{const target=ev.target.closest('button,[data-map-site]');if(!target)return;const tab=target.dataset.tab||target.dataset.jumptab;if(tab){switchTab(tab);return;}
    if(target.dataset.mapSite){selectedSite=target.dataset.mapSite;renderBattlefield();return;}
    if(target.dataset.removePlayer){const p=state.players.find(p=>p.id===target.dataset.removePlayer);if(p.roleLock||p.teamLock){toast('Silmeden önce oyuncunun kilitlerini kaldırın.',true);return;}if(!confirm('Bu oyuncu silinsin mi?'))return;const c=deepcopy(state);c.players=c.players.filter(p=>p.id!==target.dataset.removePlayer);delete c.assign[target.dataset.removePlayer];for(const team of Object.keys(c.leaders))if(c.leaders[team]===p.id)delete c.leaders[team];commitEdit(c);return;}
    if(target.dataset.compareUse){if(recomputePlan(target.dataset.compareUse)){resetSimulationFromPlan(false);autosave();switchTab('teams');}return;}
    if(target.dataset.phase){currentPhase=Number(target.dataset.phase);renderTeams();return;}
    switch(target.id){
      case'generateBtn':case'quickGenerate':recomputePlan();break;
      case'saveBtn':store();break;case'jsonBtn':exportJSON();break;
      case'addPlayer':{const c=deepcopy(state);c.players.push(normalizePlayer({id:'new'+crypto.randomUUID(),name:'Yeni oyuncu',power:50,status:'pool'},c.players.length));commitEdit(c);break;}
      case'importBtn':$('fileInput').click();break;case'jsonImport':$('jsonFileInput').click();break;
      case'confirmImport':confirmImport();break;case'cancelImport':pendingImport=null;renderImportPreview();break;
      case'replaceBtn':replacePlayer();break;case'resetLocks':resetLocks();break;
      case'csvExport':exportCSV();break;case'ordersExport':if(planErrors(state).length){toast('Önce plan hatalarını düzeltin: '+planErrors(state).join(' '),true);}else exportOrders();break;
      case'printBtn':window.print();break;case'simFromPlan':resetSimulationFromPlan();break;
      case'simReset':state.sim.buildings=Object.fromEntries(state.buildings.map(b=>[b.id,emptySimRow()]));autosave();renderSimulator();break;
      case'compareReload':renderCompare();break;case'applySettings':handleSettings();break;
      case'resetBuildings':state.buildings=BASE_BUILDINGS.map(b=>({...b,priority:1,resistance:0}));autosave();renderAll();break;
      case'clearStorage':clearLocalRoster();break;
    }
  });
  document.addEventListener('change',ev=>{const el=ev.target;try{
    if(el.dataset.liveSite||el.dataset.liveRisk||el.dataset.livePlayer||['battleMinute','battleUs','battleThem'].includes(el.id)){handleBattleChange(el);return;}
    if(el.dataset.player){handlePlayerChange(el);return;}
    if(el.dataset.targetTeam){const c=deepcopy(state),team=el.dataset.targetTeam,key=el.dataset.targetKey;if(!validTarget(c,team,key,el.value))fail('Bu faz için geçersiz hedef.');c.targets[key][team]=el.value;c.targetLocks[key][team]=true;commitEdit(c);return;}
    if(el.dataset.targetLock){state.targetLocks[el.dataset.targetKey][el.dataset.targetLock]=el.checked;autosave();return;}
    if(el.dataset.leader){const c=deepcopy(state),id=el.value,team=el.dataset.leader;c.leaders[team]=id;if(id){const p=c.players.find(p=>p.id===id);p.teamLock=true;p.roleLock=true;p.rolePref='holder';}commitEdit(c);return;}
    if(el.dataset.simSite||el.id==='tankEvents'){
      const c=deepcopy(state);if(el.dataset.simSite){c.sim.buildings[el.dataset.simSite]||=emptySimRow();c.sim.buildings[el.dataset.simSite][el.dataset.simField]=el.value;}else c.sim.tankEvents=el.value;
      evaluateScenario(c.sim,c.config,c.buildings);state=c;autosave();renderSimulator();return;
    }
    if(el.dataset.buildingId){const c=deepcopy(state);c.buildings.find(b=>b.id===el.dataset.buildingId)[el.dataset.buildingField]=finiteValue(el.value,'Bina değeri',0,el.dataset.buildingField==='priority'?5:1e8);commitEdit(c);return;}
    switch(el.id){
      case'quickTeams':updateSettings({teams:Number(el.value)});break;case'quickKillers':updateSettings({killers:Number(el.value)});break;case'quickMode':updateSettings({mode:el.value});break;
      case'rosterFilter':rosterFilter=el.value;renderRoster();break;case'mapPhase':mapPhase=Number(el.value);renderBattlefield();break;
      case'waterUs':case'waterThem':case'waterUnit':{const c=deepcopy(state);c.sim[el.id]=finiteValue(el.value,'Tank değeri',0,1e9,true);evaluateScenario(c.sim,c.config,c.buildings);state=c;autosave();renderSimulator();break;}
      case'waterStart':updateSettings({waterStart:Number(el.value)});break;
    }
  }catch(e){toast(e.message,true);renderAll();}});
  document.addEventListener('input',ev=>{if(ev.target.id==='rosterSearch'){rosterTerm=ev.target.value;renderRoster();}});
  $('fileInput').addEventListener('change',ev=>importFile(ev.target.files[0]));$('jsonFileInput').addEventListener('change',ev=>importFile(ev.target.files[0]));
  window.addEventListener('keydown',ev=>{if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='s'){ev.preventDefault();store();}});
}
loadState();bindEvents();renderAll();

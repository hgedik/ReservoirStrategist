'use strict';
const DATA_VERSION = 3;
const TARGET_KEYS = ['p1', 'p1sub', 'p2', 'p2sub'];
const ROLES = ['commander', 'killer', 'holder', 'support'];
const isRecord = x => !!x && typeof x === 'object' && !Array.isArray(x);
const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);
function fail(message) { throw Error(message); }
function finiteValue(value, name, lo, hi, integer=false) {
  if(typeof value!=='number'&&(typeof value!=='string'||!value.trim()||!/^[+-]?[\d.,]+(?:m|million)?$/i.test(value.replace(/\s/g,''))))fail(name+': geçerli sayı gerekli.');
  const n = typeof value === 'number' ? value : num(value);
  if(n===0&&typeof value==='string'&&/[1-9]/.test(value))fail(name+': sayı biçimi geçersiz.');
  if (!Number.isFinite(n) || n < lo || n > hi || (integer && !Number.isInteger(n))) fail(`${name}: ${lo}–${hi} aralığında ${integer?'tam ':''}sayı gerekli.`);
  return n;
}
function validateConfig(c) {
  for (const [key,lo,hi] of [['teams',3,8],['killers',0,6],['duration',15,180],['phase2',1,179],['waterStart',0,180],['mainLimit',1,50],['reserveLimit',0,30],['holderMin',2,5]]) finiteValue(c[key],key,lo,hi,true);
  finiteValue(c.captureDelay,'Ele geçirme gecikmesi',0,10);
  if(c.phase2>=c.duration) fail('Phase II maç bitiminden önce başlamalı.');
  if(c.waterStart>c.duration) fail('Tank başlangıcı maç süresini aşamaz.');
  if(!own(TACTICS,c.mode)) fail('Geçersiz strateji.');
  if(!['neutral','enemy'].includes(c.unassigned)) fail('Geçersiz rakip kontrol varsayımı.');
  for(const key of ['water','ftc','special','defense','transition','preference']) finiteValue(c.weights[key],key,0,5);
}
function normalizePlayer(raw,index) {
  if(!isRecord(raw)) fail(`Oyuncu ${index+1}: nesne gerekli.`);
  const p={...raw};p.id=String(p.id??`i${index+1}`).trim();p.name=String(p.name??'').trim();
  if(!p.id||['__proto__','constructor','prototype'].includes(p.id)) fail(`Oyuncu ${index+1}: geçersiz ID.`);
  if(!p.name) fail(`Oyuncu ${index+1}: isim boş.`);
  if(typeof p.power==='string'&&!p.power.trim()) fail(`${p.name}: güç boş.`);
  p.power=finiteValue(typeof p.power==='number'?p.power:num(p.power),`${p.name} güç`,0.000001,1e9);
  p.status=p.status??'pool';if(!['main','reserve','pool'].includes(p.status))fail(`${p.name}: geçersiz kadro durumu.`);
  for(const key of ['coming','joined','contacted','roleLock','teamLock']) {if(p[key]!==undefined&&typeof p[key]!=='boolean')fail(`${p.name}: ${key} boolean olmalı.`);p[key]=p[key]??false;}
  p.rolePref=p.rolePref??(/commander/i.test(p.excelRole||'')?'commander':/killer/i.test(p.excelRole||'')?'killer':/holder/i.test(p.excelRole||'')?'holder':'');
  if(p.rolePref&&!ROLES.includes(p.rolePref))fail(`${p.name}: geçersiz rol tercihi.`);
  p.team=String(p.team||'');p.phase1=String(p.phase1||'');p.phase2=String(p.phase2||'');p.notes=String(p.notes||'');
  p.killerSuitability=finiteValue(p.killerSuitability??0,'Killer uygunluğu',0,5);return p;
}
function normalizeState(raw) {
  if(!isRecord(raw)||!Array.isArray(raw.players))fail('Geçerli bir strateji/kadro gerekli.');
  if((raw.version??1)>DATA_VERSION)fail('Bu yedek daha yeni bir uygulama sürümü gerektiriyor.');
  if(raw.config!==undefined&&!isRecord(raw.config))fail('Ayarlar nesne olmalı.');
  if(raw.buildings!==undefined&&!Array.isArray(raw.buildings))fail('Bina verileri liste olmalı.');
  if(raw.version!==undefined&&(!Number.isInteger(raw.version)||raw.version<1))fail('Geçersiz veri sürümü.');
  const s=deepcopy(raw);s.version=DATA_VERSION;
  s.config={...deepcopy(BASE_CONFIG),...(s.config||{}),weights:{...BASE_CONFIG.weights,...s.config?.weights}};validateConfig(s.config);
  s.players=s.players.map(normalizePlayer);const ids=new Set();for(const p of s.players){if(ids.has(p.id))fail(`Tekrarlanan oyuncu ID: ${p.id}`);ids.add(p.id);}
  s.buildings=BASE_BUILDINGS.map(b=>{
    const override=(Array.isArray(s.buildings)?s.buildings:[]).find(x=>x.id===b.id)||{};
    return {...b,rate:finiteValue(override.rate??b.rate,b.name+' üretim',0,1e7),ftc:finiteValue(override.ftc??b.ftc,b.name+' FTC',0,1e8),priority:finiteValue(override.priority??1,b.name+' öncelik',0,5),resistance:finiteValue(override.resistance??0,b.name+' rakip güç',0,1e9)};
  });
  s.explanations=isRecord(s.explanations)?s.explanations:{};
  const legacyNamePattern=/\b(?:WTC\s+(?:II|I|[12])|WPP\s+(?:IV|III|II|I|[1-4])|SOLAR|HELIPAD|MUNITIONS|CENTRAL|DEV)\b/g;
  for(const key of Object.keys(s.explanations))s.explanations[key]=String(s.explanations[key]).replace(legacyNamePattern,label=>{const id=resolveSite(label,s);return s.buildings.find(b=>b.id===id)?.name||label;});
  for(const p of s.players)for(const key of ['phase1','phase2'])p[key]=displaySitePreference(p[key],s);
  s.assign=s.assign??{};if(!isRecord(s.assign))fail('Atamalar nesne olmalı.');
  s.assignP2=s.assignP2??deepcopy(s.assign);
  for(const [phase,assign] of [[1,s.assign],[2,s.assignP2]]){
    if(!isRecord(assign))fail('Faz '+phase+': atamalar nesne olmalı.');
    for(const [id,a] of Object.entries(assign)){
      if(!ids.has(id)||!isRecord(a)||!ROLES.includes(a.role)||typeof a.team!=='string')fail('Geçersiz oyuncu ataması: '+id);
      if(independentRole(a.role)&&a.team)fail(ROLE_LABEL[a.role]+' bağımsız olmalı: '+id);
      if(a.team&&!new RegExp(`^T[1-${s.config.teams}]$`).test(a.team))fail('Geçersiz takım: '+a.team);
      if(s.players.find(p=>p.id===id).status!=='main')fail('Asil olmayan oyuncuya aktif görev atanamaz: '+id);
    }
    if(s.players.filter(p=>p.status==='main'&&assign[p.id]?.role==='commander').length>1)fail('En fazla bir Commander olabilir.');
  }
  if(new Set([...Object.entries(s.assign),...Object.entries(s.assignP2)].filter(([,a])=>a.role==='commander').map(([id])=>id)).size>1)fail('En fazla bir Commander olabilir.');
  s.targets=s.targets??{};s.targetLocks=s.targetLocks??{};
  if(!isRecord(s.targets)||!isRecord(s.targetLocks))fail('Geçersiz hedef yapısı.');
  for(const key of TARGET_KEYS){s.targets[key]=s.targets[key]??{};s.targetLocks[key]=s.targetLocks[key]??{};
    if(!isRecord(s.targets[key])||!isRecord(s.targetLocks[key]))fail('Geçersiz hedef listesi.');
    for(const [team,target] of Object.entries(s.targets[key]))if(!validTarget(s,team,key,target))fail(`Geçersiz ${key} hedefi: ${team}/${target}`);
    for(const [team,locked] of Object.entries(s.targetLocks[key]))if(typeof locked!=='boolean'||!new RegExp(`^T[1-${s.config.teams}]$`).test(team))fail('Geçersiz hedef kilidi.');
  }
  s.leaders=s.leaders??{};s.leadersP2=s.leadersP2??deepcopy(s.leaders);
  for(const phase of [1,2]){const leaders=phaseLeaders(s,phase),assign=phaseAssignment(s,phase);if(!isRecord(leaders))fail('Geçersiz lider listesi.');
    for(const [team,id] of Object.entries(leaders))if(id&&(!ids.has(id)||assign[id]?.team!==team||assign[id]?.role!=='holder'))fail('Lider kendi takımındaki bir Holder olmalı.');
  }
  s.sim={buildings:{},waterUs:0,waterThem:0,waterUnit:500,tankEvents:'',...(s.sim||{})};
  if(!isRecord(s.sim.buildings))fail('Geçersiz simülasyon.');
  for(const key of ['waterUs','waterThem','waterUnit'])s.sim[key]=finiteValue(s.sim[key],key,0,1e9);
  for(const b of s.buildings)if(s.sim.buildings[b.id]){
    const r=s.sim.buildings[b.id];for(const key of ['p1','p2'])if(!['us','them','none'].includes(r[key]))fail('Geçersiz bina sahibi.');
    if(!['auto','none','us','them'].includes(r.ftc))fail('Geçersiz FTC sahibi.');
    r.delay1=finiteValue(r.delay1??s.config.captureDelay,'Gecikme',0,s.config.duration);r.delay2=finiteValue(r.delay2??s.config.captureDelay,'Gecikme',0,s.config.duration);
    controlEvents(b,r,s.config);
  }
  evaluateScenario(s.sim,s.config,s.buildings);s.battle=normalizeBattle(s.battle,s.config,s.buildings,s.players);s.lastGenerated=s.lastGenerated??null;return s;
}
function validTarget(s,team,key,target) {
  if(typeof target!=='string'&&target!==undefined)return false;
  if(!new RegExp(`^T[1-${s.config.teams}]$`).test(team))return false;
  if(!target)return true;
  if(key.endsWith('sub')&&target==='reinforce')return true;
  if(key.endsWith('sub')&&target==='water')return !key.startsWith('p1')||s.config.waterStart<s.config.phase2;
  return s.buildings.some(b=>b.id===target&&(!key.startsWith('p1')||b.phase===1));
}
function planErrors(s,plan={assign:s.assign,assignP2:s.assignP2,targets:s.targets}) {
  const errors=[],main=s.players.filter(p=>p.status==='main'),teams=Array.from({length:s.config.teams},(_,i)=>teamId(i));
  if(main.length>s.config.mainLimit)errors.push(`Asil sınırı ${s.config.mainLimit}; ${main.length} oyuncu seçili.`);
  for(const phase of [1,2]){const assign=phaseAssignment(plan,phase),prefix=`Faz ${phase}: `;
    if(main.filter(p=>assign[p.id]?.role==='commander').length>1)errors.push(prefix+'En fazla bir Commander olabilir.');
    const killers=main.filter(p=>assign[p.id]?.role==='killer');if(killers.length!==s.config.killers)errors.push(prefix+`Tam ${s.config.killers} bağımsız Killer gerekli; mevcut ${killers.length}.`);
    for(const p of main){const a=assign[p.id];if(!a||!ROLES.includes(a.role)){errors.push(prefix+p.name+': rol atanmamış.');continue;}
      if(independentRole(a.role)?!!a.team:!teams.includes(a.team))errors.push(prefix+p.name+': geçersiz takım/rol.');
      if(p.roleLock&&a.role!==p.rolePref)errors.push(prefix+p.name+': rol kilidi ihlal edildi.');
      const lockedTeam=s.assign[p.id]?.team||p.team;if(p.teamLock&&a.team!==lockedTeam)errors.push(prefix+p.name+': takım kilidi ihlal edildi.');
      if(phase===2&&(independentRole(a.role)||independentRole(plan.assign[p.id]?.role))&&a.role!==plan.assign[p.id]?.role)errors.push(p.name+': Commander ve Killer görevi iki fazda da aynı kalmalı.');
    }
    for(const team of teams){const members=main.filter(p=>assign[p.id]?.team===team);if(members.filter(p=>assign[p.id].role==='holder').length<s.config.holderMin)errors.push(prefix+`${team}: en az ${s.config.holderMin} Holder gerekli.`);
      for(const key of phase===1?['p1','p1sub']:['p2','p2sub']){const v=plan.targets[key]?.[team];if(!validTarget(s,team,key,v)||(!key.endsWith('sub')&&!v))errors.push(`${team}: geçersiz/eksik ${key} hedefi.`);if(s.targetLocks?.[key]?.[team]&&v!==s.targets[key]?.[team])errors.push(`${team}: hedef kilidi ihlal edildi.`);}
    }
  }
  const field=main.filter(p=>plan.assign[p.id]&&!independentRole(plan.assign[p.id].role)).slice().sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id)),assign2=phaseAssignment(plan,2);
  for(const p of field.slice(0,3))if(plan.targets.p2?.[assign2[p.id]?.team]!=='central')errors.push(`${p.name}: Faz II en güçlü üç takım oyuncusundan biri; Central Reservoir ekibine atanmalı. Planı yeniden üretin veya kilitleri kontrol edin.`);
  return errors;
}

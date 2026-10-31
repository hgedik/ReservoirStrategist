'use strict';
// All scores are commander heuristics in water-equivalent units, never win odds.
const STRATEGY_WEIGHTS={
  water:{water:1,ftc:1,special:0,defense:1,transition:0},
  balanced:{water:1,ftc:1,special:2,defense:1,transition:1},
  aggressive:{water:1,ftc:1,special:1,defense:0.5,transition:0.25},
  defensive:{water:1,ftc:0.5,special:0.5,defense:2,transition:2},
  fast:{water:0.6,ftc:3,special:3,defense:0.5,transition:0.5}
};
function buildingUtility(b,phase,mode,s=state) {
  const w=s.config.weights,m=STRATEGY_WEIGHTS[mode],minutes=phase===1?s.config.phase2:s.config.duration-s.config.phase2;
  const production=b.rate*Math.max(0,minutes-s.config.captureDelay);
  // Special effects are informational; 6000 is an editable-equivalent heuristic via special weight.
  const special=['solar','helipad','munitions','dev'].includes(b.id)?6000:0;
  const firstCapture=phase===2&&Object.values(s.targets?.p1||{}).includes(b.id)?0:b.ftc;
  return (production*w.water*m.water+firstCapture*w.ftc*m.ftc+special*w.special*m.special)*(b.priority??1);
}
function targetScore(team,b,phase,mode,s,previous) {
  const utility=buildingUtility(b,phase,mode,s),m=STRATEGY_WEIGHTS[mode],w=s.config.weights;
  const mean=teamPower(s.players.filter(p=>p.status==='main'))/s.config.teams;
  const shortfall=Math.max(0,(b.resistance??0)-team.power)/Math.max(mean,1);
  const preferences=team.players.filter(p=>resolveSite(p[phase===1?'phase1':'phase2'],s)===b.id).length/Math.max(1,team.players.length);
  const retention=phase===2&&previous===b.id?b.rate*s.config.captureDelay:0;
  // Strength affects allocation, not simulated success or capture probabilities.
  return utility-utility*shortfall*w.defense*m.defense+retention*w.transition*m.transition+utility*preferences*w.preference/10;
}
function resolveSite(value,s=state) {
  const v=String(value||'').trim().toLocaleLowerCase('en-US').replace(/[ #_-]+/g,'');
  const aliases={central:'central',solarplant:'solar',solarpowerstation:'solar',helipad:'helipad',abandonedhelipad:'helipad',munitionsfactory:'munitions',devcompound:'dev'};
  return aliases[v]||s.buildings.find(b=>[b.id,b.short,b.name].some(x=>x.toLowerCase().replace(/[ #_-]+/g,'')===v))?.id||'';
}
function assignTargets(teams,mode,s) {
  const targets=Object.fromEntries(TARGET_KEYS.map(k=>[k,{}])),explanations={},context={...s,targets};
  for(const phase of [1,2]){
    const key=phase===1?'p1':'p2',sub=key+'sub',available=s.buildings.filter(b=>phase===2||b.phase===1);let covered=new Set();
    const locked=s.targetLocks?.[key]||{};
    for(const t of teams)if(locked[t.id]){const id=s.targets[key]?.[t.id];if(!id||!validTarget(s,t.id,key,id))fail(`${t.id}: kilitli ${key} hedefi geçersiz.`);targets[key][t.id]=id;covered.add(id);}
    // Match the best-valued remaining objective to the team best able to cover its stated resistance.
    for(const b of [...available].sort((a,b)=>buildingUtility(b,phase,mode,context)-buildingUtility(a,phase,mode,context)||a.id.localeCompare(b.id))){
      if(covered.has(b.id))continue;
      let free=teams.filter(t=>!targets[key][t.id]);if(!free.length)break;
      free.sort((a,c)=>targetScore(c,b,phase,mode,context,targets.p1[c.id])-targetScore(a,b,phase,mode,context,targets.p1[a.id])||c.power-a.power||a.id.localeCompare(c.id));
      targets[key][free[0].id]=b.id;covered.add(b.id);
    }
    // Aggressive mode uses a second Central force as an explicit concentration trade-off.
    if(phase===2&&mode==='aggressive'&&teams.length>=3){const candidate=teams.filter(t=>!locked[t.id]&&targets[key][t.id]!=='central').sort((a,b)=>a.power-b.power)[0];if(candidate){targets[key][candidate.id]='central';covered=new Set(Object.values(targets[key]));}}
    // Same-target-set swaps improve strength/resistance and transition fit without duplicating objectives.
    for(let pass=0;pass<teams.length;pass++){
      let changed=false;for(let i=0;i<teams.length;i++)for(let j=i+1;j<teams.length;j++){
        const a=teams[i],b=teams[j];if(locked[a.id]||locked[b.id])continue;
        const x=s.buildings.find(v=>v.id===targets[key][a.id]),y=s.buildings.find(v=>v.id===targets[key][b.id]);if(!x||!y)continue;
        const before=targetScore(a,x,phase,mode,context,targets.p1[a.id])+targetScore(b,y,phase,mode,context,targets.p1[b.id]);
        const after=targetScore(a,y,phase,mode,context,targets.p1[a.id])+targetScore(b,x,phase,mode,context,targets.p1[b.id]);
        if(after>before+0.001){[targets[key][a.id],targets[key][b.id]]=[y.id,x.id];changed=true;}
      }if(!changed)break;
    }
    const secondary=available.filter(b=>!covered.has(b.id)).sort((a,b)=>buildingUtility(b,phase,mode,context)-buildingUtility(a,phase,mode,context));
    for(const t of teams){
      targets[sub][t.id]=s.targetLocks?.[sub]?.[t.id]?s.targets[sub][t.id]:(secondary.shift()?.id||(phase===2?'water':'reinforce'));
      const b=s.buildings.find(b=>b.id===targets[key][t.id]);
      explanations[`${key}:${t.id}`]=`${b.short}: ${fmt(b.rate)}/dk, FTC ${fmt(b.ftc)}; ${fmt(t.power,2)} M takım gücü. Öncelik ${fmt(b.priority??1,1)}, rakip güç varsayımı ${fmt(b.resistance??0,2)} M. ${locked[t.id]?'Manuel hedef kilidi korundu.':'Üretim, FTC, özel etki, direnç ve faz devamlılığı birlikte değerlendirildi.'}`;
    }
  }
  return {targets,explanations};
}
function generatePlan(mode='balanced',s=state) {
  validateConfig({...s.config,mode});
  const main=s.players.filter(p=>p.status==='main').slice().sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id));
  const n=s.config.teams,k=s.config.killers,minH=s.config.holderMin;
  if(main.length>s.config.mainLimit)fail(`Asil sınırı ${s.config.mainLimit}; ${main.length} oyuncu seçili.`);
  if(main.length<n*minH+k)fail(`${n} takım için ${n*minH} Holder ve ${k} bağımsız Killer gerekli; yalnızca ${main.length} asil var.`);
  const lockedTeam=p=>s.assign[p.id]?.team||p.team;
  for(const p of main){if(p.roleLock&&!ROLES.includes(p.rolePref))fail(p.name+': kilitli rol geçersiz.');if(p.teamLock&&!new RegExp(`^T[1-${n}]$`).test(lockedTeam(p)))fail(p.name+': kilitli takım mevcut değil.');if(p.teamLock&&p.roleLock&&p.rolePref==='killer')fail(p.name+': Killer takım kilidine sahip olamaz.');}
  const forcedK=main.filter(p=>p.roleLock&&p.rolePref==='killer');if(forcedK.length>k)fail(`Kilitli Killer sayısı ${forcedK.length}, hedef ${k}.`);
  const candidates=main.filter(p=>!p.roleLock&&!p.teamLock).sort((a,b)=>(b.killerSuitability||0)-(a.killerSuitability||0)||Number(b.rolePref==='killer')-Number(a.rolePref==='killer')||b.power-a.power||a.id.localeCompare(b.id));
  const killers=[...forcedK,...candidates.slice(0,k-forcedK.length)];if(killers.length!==k)fail('Rol/takım kilitleri nedeniyle yeterli bağımsız Killer adayı yok.');
  const rest=main.filter(p=>!killers.includes(p)),out=Object.fromEntries(killers.map(p=>[p.id,{role:'killer',team:''}]));
  const teams=Array.from({length:n},(_,i)=>({id:teamId(i),players:[],power:0,holders:0}));
  const add=(p,t,role)=>{out[p.id]={role,team:t.id};t.players.push(p);t.power+=p.power;if(role==='holder')t.holders++;};
  for(const p of rest.filter(p=>p.teamLock))add(p,teams.find(t=>t.id===lockedTeam(p)),p.roleLock?p.rolePref:'support');
  for(const p of rest.filter(p=>!p.teamLock&&p.roleLock&&p.rolePref==='holder')){const t=teams.slice().sort((a,b)=>a.holders-b.holders||Number(b.id===p.team)-Number(a.id===p.team)||a.power-b.power||a.id.localeCompare(b.id))[0];add(p,t,'holder');}
  for(const t of teams){
    while(t.holders<minH){
      const local=t.players.filter(p=>!p.roleLock&&out[p.id].role!=='holder').sort((a,b)=>Number(b.rolePref==='holder')-Number(a.rolePref==='holder')||b.power-a.power)[0];
      if(local){out[local.id].role='holder';t.holders++;continue;}
      const p=rest.filter(p=>!out[p.id]&&!p.roleLock).sort((a,b)=>Number(b.rolePref==='holder')-Number(a.rolePref==='holder')||Number(b.team===t.id)-Number(a.team===t.id)||b.power-a.power)[0];
      if(!p)fail(`${t.id}: rol/takım kilitleri altında ${minH} Holder sağlanamıyor.`);add(p,t,'holder');
    }
  }
  for(const p of rest.filter(p=>!out[p.id])){
    const minSize=Math.min(...teams.map(t=>t.players.length));
    const t=teams.filter(t=>t.players.length===minSize).sort((a,b)=>Number(b.id===p.team)-Number(a.id===p.team)||a.power-b.power||a.id.localeCompare(b.id))[0];add(p,t,p.roleLock?p.rolePref:'support');
  }
  // Improve power spread with same-role, unlocked swaps; counts and hard constraints stay fixed.
  for(let pass=0;pass<80;pass++){
    let best;let improvement=0;
    for(let i=0;i<n;i++)for(let j=i+1;j<n;j++)for(const a of teams[i].players)for(const b of teams[j].players){if(a.teamLock||b.teamLock||out[a.id].role!==out[b.id].role)continue;
      const x=teams[i].power-a.power+b.power,y=teams[j].power-b.power+a.power;
      const pref=(p,team)=>p.team&&p.team!==team?1:0,scale=(teamPower(rest)/n)**2*0.05*s.config.weights.preference;
      const d=teams[i].power**2+teams[j].power**2-x*x-y*y+scale*(pref(a,teams[i].id)+pref(b,teams[j].id)-pref(a,teams[j].id)-pref(b,teams[i].id));
      if(d>improvement+0.001){improvement=d;best={i,j,a,b,x,y};}}
    if(!best)break;const {i,j,a,b,x,y}=best;teams[i].players.splice(teams[i].players.indexOf(a),1,b);teams[j].players.splice(teams[j].players.indexOf(b),1,a);teams[i].power=x;teams[j].power=y;out[a.id].team=teams[j].id;out[b.id].team=teams[i].id;
  }
  const result={assign:out,...assignTargets(teams,mode,s),teams,mode};const errors=planErrors(s,result);if(errors.length)fail(errors.join('\n'));return result;
}
function applyGenerated(result,shouldRefresh=true){const errors=planErrors(state,result);if(errors.length)fail(errors.join('\n'));state.assign=result.assign;state.targets=result.targets;state.explanations=result.explanations||{};state.config.mode=result.mode;state.lastGenerated=new Date().toISOString();for(const [team,id] of Object.entries(state.leaders||{}))if(state.assign[id]?.team!==team||state.assign[id]?.role!=='holder')delete state.leaders[team];if(shouldRefresh){autosave();renderAll();toast('Kilitler korunarak plan üretildi.')}}
function recomputePlan(mode=state.config.mode){try{applyGenerated(generatePlan(mode));return true}catch(e){toast(e.message,true);return false}}
function warnings(){const issues=planErrors(state).map(txt=>({kind:'bad',txt}));
  if(selected().length!==state.config.mainLimit)issues.push({kind:'warn',txt:`Asil: ${selected().length}/${state.config.mainLimit}.`});
  if(reserve().length!==state.config.reserveLimit)issues.push({kind:'warn',txt:`Yedek: ${reserve().length}/${state.config.reserveLimit}.`});
  for(const t of teamsFrom())if(!t.support.length)issues.push({kind:'warn',txt:t.id+': Support kapasitesi yok; ikincil göreve Holder çıkarmayın.'});
  for(const p of selected())if(!p.coming||!p.joined)issues.push({kind:'warn',txt:`${p.name}: ${!p.coming?'katılım teyidi yok':'katılmadı'}.`});
  for(const phase of [1,2]){const key=phase===1?'p1':'p2',covered=new Set(Object.values(state.targets[key]));for(const b of state.buildings.filter(b=>(phase===2||b.phase===1)&&b.rate>=1200))if(!covered.has(b.id))issues.push({kind:'warn',txt:`Phase ${phase}: ${b.short} korunmuyor (${fmt(b.rate)}/dk).`});
    for(const id of covered){const teams=teamsFrom().filter(t=>state.targets[key][t.id]===id),b=bById(id);if(b&&teamPower(teams.flatMap(t=>t.players))<(b.resistance||0))issues.push({kind:'warn',txt:`Phase ${phase} ${b.short}: atanan güç, girilen rakip güç varsayımının altında.`});}}
  if(startupError)issues.unshift({kind:'bad',txt:startupError});return issues;
}
function transitionFor(t,targets=state.targets){
  const from=targets.p1[t.id],to=targets.p2[t.id],cover=teamsFrom().filter(x=>x.id!==t.id&&targets.p2[x.id]===from).map(x=>x.id),stationary=from===to;
  return {initial:`Başlangıç: ${siteName(from)} çevresinde Holder A önde, B takviyeye hazır.`,transition:stationary?`${siteName(from)} savunmasını sürdür; toplu çıkış yok.`:cover.length?`${cover.join('+')} ${siteName(from)} garnizonunu devralıp komutan onayladıktan sonra ${siteName(to)} hedefine geç.`:`Önce Support keşif/destek için ${siteName(to)} yönüne hazırlanır. ${siteName(from)} için yedek garnizon bulunmadan Holder'lar çıkmaz; gerekirse R4 bu hedefin bırakılmasını onaylar.`,reinforce:targets.p2sub[t.id]||'reinforce',fallback:stationary?`${siteName(from)} tutulamıyorsa en yakın güvenli müttefik garnizona komutan onayıyla çekil.`:`${siteName(to)} alınamazsa ${siteName(from)} savunmasını koru; eşzamanlı boşaltma yapma.`};
}
function configUpdate(target,value){state.config[target]=value;autosave();renderAll()}

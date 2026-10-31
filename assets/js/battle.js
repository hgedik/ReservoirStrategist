'use strict';
function normalizeBattle(raw,config,buildings,players){
  if(raw!==undefined&&!isRecord(raw))fail('Geçersiz Battle Control kaydı.');
  const b={minute:0,scoreUs:0,scoreThem:0,sites:{},disabled:[],...(raw||{})};
  b.minute=finiteValue(b.minute,'Savaş dakikası',0,config.duration);for(const key of ['scoreUs','scoreThem'])b[key]=finiteValue(b[key],key,0,1e12);
  if(!isRecord(b.sites)||!Array.isArray(b.disabled))fail('Geçersiz Battle Control verisi.');
  if(b.disabled.some(id=>!players.some(p=>p.id===id&&p.status==='main')))fail('Katılamayan oyuncu asil kadroda olmalı.');
  b.sites=Object.fromEntries(buildings.map(site=>{const row={owner:'none',vulnerable:false,...b.sites[site.id]};if(!['none','us','them'].includes(row.owner)||typeof row.vulnerable!=='boolean')fail('Geçersiz saha kontrolü.');return [site.id,row];}));return b;
}
function battleAssessment(s=state){
  const b=s.battle,left=s.config.duration-b.minute,unlocked=site=>site.phase===1||b.minute>=s.config.phase2;
  const rates={us:0,them:0};for(const site of s.buildings)if(unlocked(site)&&b.sites[site.id]?.owner!=='none')rates[b.sites[site.id].owner]+=site.rate;
  const warnings=[];for(const site of s.buildings){const row=b.sites[site.id];if(row.owner!=='us'||!unlocked(site))continue;
    const assigned=s.players.filter(p=>s.assign[p.id]?.role==='holder'&&s.targets[b.minute<s.config.phase2?'p1':'p2'][s.assign[p.id]?.team]===site.id&&!b.disabled.includes(p.id));
    if(row.vulnerable||assigned.length<s.config.holderMin)warnings.push(`${site.name}: garnizon riskli; ${assigned.length} kullanılabilir planlı Holder. R4 saha durumunu doğrulasın.`);
  }
  const projectedUs=b.scoreUs+rates.us*left,projectedThem=b.scoreThem+rates.them*left;
  if(projectedUs<projectedThem)warnings.push('Mevcut kontrol sürerse puan açığı kapanmıyor. Yeni gelir, rakip gelirini kesme veya tank toplama seçeneklerini karşılaştırın.');
  const central=s.buildings.find(x=>x.id==='central');let alternative=null;
  if(b.minute>=s.config.phase2&&b.sites.central.owner!=='us'&&left>s.config.captureDelay){
    const key='p2',teams=Array.from({length:s.config.teams},(_,i)=>teamId(i));
    const candidates=teams.map(team=>{const old=s.buildings.find(x=>x.id===s.targets[key][team]),members=s.players.filter(p=>s.assign[p.id]?.team===team&&!b.disabled.includes(p.id)),holders=members.filter(p=>s.assign[p.id].role==='holder');
      const sole=old&&Object.values(s.targets[key]).filter(id=>id===old.id).length===1&&b.sites[old.id]?.owner==='us';
      const cost=sole?old.rate*left:0,gain=central.rate*Math.max(0,left-s.config.captureDelay)-cost;return {team,gain,cost,old,power:teamPower(members),holders};
    }).filter(t=>t.holders.length>=s.config.holderMin).sort((a,b)=>b.gain-a.gain||b.power-a.power);
    const t=candidates[0];if(t)alternative={...t,projectedUs:projectedUs+t.gain,projectedThem:projectedThem-(b.sites.central.owner==='them'?central.rate*(left-s.config.captureDelay):0)};
  }
  return {rates,projectedUs,projectedThem,warnings,alternative};
}
function renderBattle(){
  const b=state.battle,a=battleAssessment();$('battleMinute').value=b.minute;$('battleUs').value=b.scoreUs;$('battleThem').value=b.scoreThem;
  $('battleSites').innerHTML=state.buildings.map(site=>`<div class="site-tile"><b>${safe(site.name)}</b><label class="form-field">Saha sahibi<select aria-label="${site.name} saha sahibi" data-live-site="${site.id}" ${site.phase===2&&b.minute<state.config.phase2?'disabled':''}>${options([['none','Bilinmiyor / boş'],['us','Biz'],['them','Rakip']],b.sites[site.id].owner)}</select></label><label class="lock-label"><input type="checkbox" data-live-risk="${site.id}" ${b.sites[site.id].vulnerable?'checked':''}> Garnizon riskli</label></div>`).join('');
  $('battlePlayers').innerHTML=selected().map(p=>`<label class="lock-label"><input type="checkbox" data-live-player="${safe(p.id)}" ${b.disabled.includes(p.id)?'checked':''}>${safe(p.name)} kullanılamıyor</label>`).join('');
  $('battleAdvice').innerHTML=`<div class="grid g2"><div class="panel"><h3>Mevcut kontrol sürerse</h3><p>Biz ${fmt(a.projectedUs)} / Rakip ${fmt(a.projectedThem)}</p><p class="help">Anlık gelir: ${fmt(a.rates.us)} / ${fmt(a.rates.them)} su/dk.</p></div><div class="panel"><h3>Central Reservoir seçeneği</h3>${a.alternative?`<p>${a.alternative.team}: ${fmt(a.alternative.power,2)} M kullanılabilir güç.</p><p>Varsayımsal son puan: ${fmt(a.alternative.projectedUs)} / ${fmt(a.alternative.projectedThem)}</p><p class="help">${state.config.captureDelay} dk sonra ele geçirilirse; terk edilen ${a.alternative.old?.name||'hedef'} gelir maliyeti ${fmt(a.alternative.cost)} su. ${a.alternative.gain<0?'Bu seçenek kendi toplam suyunuzu azaltır.':''} Holder devri ve rakip direnci doğrulanmadan uygulanmaz.</p>`:'<p class="help">Central Reservoir kapalı, bizde veya uygun Holder ekibi bulunamadı.</p>'}</div></div>`+a.warnings.map(txt=>`<div class="alert">${safe(txt)}</div>`).join('')+`<p class="help">Bunlar manuel girilen skor ve sahipliğin kalan sürede değişmediği varsayımıdır. Gelecekte açılacak veya alınacak binalar, FTC ve tanklar bu projeksiyona eklenmez. Saha bilgisi olmadan kazanma olasılığı hesaplanmaz.</p>`;
}
function handleBattleChange(el){const c=deepcopy(state),b=c.battle;
  if(el.dataset.liveSite)b.sites[el.dataset.liveSite].owner=el.value;
  else if(el.dataset.liveRisk)b.sites[el.dataset.liveRisk].vulnerable=el.checked;
  else if(el.dataset.livePlayer)b.disabled=el.checked?[...new Set([...b.disabled,el.dataset.livePlayer])]:b.disabled.filter(id=>id!==el.dataset.livePlayer);
  else {const key={battleMinute:'minute',battleUs:'scoreUs',battleThem:'scoreThem'}[el.id];if(!key)return false;b[key]=finiteValue(el.value,key,0,key==='minute'?c.config.duration:1e12);}
  c.battle=normalizeBattle(b,c.config,c.buildings,c.players);state=c;autosave();renderBattle();return true;
}

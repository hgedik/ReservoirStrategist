'use strict';
function options(labelValue,cur){return labelValue.map(([v,t])=>`<option value="${safe(v)}"${String(v)===String(cur)?' selected':''}>${safe(t)}</option>`).join('')}
function selectSite(cur,phase,extra=false){const allowed=state.buildings.filter(b=>phase===2||b.phase===1).map(b=>[b.id,b.name]);return `<select data-allow-site="1">${options([['','—'],...allowed,...(extra?[...((phase===2||state.config.waterStart<state.config.phase2)?[['water','Water Tanks toplama']]:[]),['reinforce','Hızlı destek']]:[])],cur)}</select>`}
function badge(text,cls=''){return `<span class="pill ${cls}">${safe(text)}</span>`}
function uiIcon(name){const paths={users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M20 21v-2a4 4 0 0 0-3-3.87',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6',power:'m13 2-9 12h7l-1 8 10-13h-7z',balance:'M4 20V10 M10 20V4 M16 20v-8 M22 20H2',check:'M5 12l4 4L19 6'};return `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.shield}"/></svg>`;}
function renderKpis(){
  const main=selected(),subs=reserve(),teams=teamsFrom(),powers=teams.map(t=>t.power),range=Math.max(...powers,0)-Math.min(...powers);
  const metrics=[['ASİL KADRO',`${main.length} / ${state.config.mainLimit}`,'Aktif operasyon kadrosu','users'],['YEDEK KADRO',`${subs.length} / ${state.config.reserveLimit}`,'Gerektiğinde göreve hazır','shield'],['TOPLAM GÜÇ',`${fmt(teamPower(main),2)}<span class="metric-unit">M</span>`,'Bağımsız Killer dahil','power'],['TAKIM GÜÇ FARKI',`${fmt(range,2)}<span class="metric-unit">M</span>`,'En güçlü − en düşük takım','balance']];
  $('dashboardKpis').innerHTML=metrics.map(([label,value,sub,icon])=>`<div class="panel kpi"><div class="kpi-top"><span class="label">${label}</span><span class="kpi-icon">${uiIcon(icon)}</span></div><div class="num">${value}</div><div class="sub">${sub}</div></div>`).join('');
}
function renderPlanChecks(issues,compact=false){
  const errors=issues.filter(x=>x.kind==='bad'),notes=issues.filter(x=>x.kind!=='bad');
  const status=errors.length?errors.map(x=>`<div class="alert danger">${safe(x.txt)}</div>`).join(''):`<div class="check-status">${uiIcon('check')}<span>Rol, takım ve hedef kontrolleri tamam.</span></div>`;
  return status+(notes.length?`<details class="warning-details" ${compact?'':'open'}><summary>${notes.length} katılım / taktik notunu incele</summary><div class="warning-items">${notes.map(x=>`<div class="warning-item">${safe(x.txt)}</div>`).join('')}</div></details>`:'');
}
function renderDashboard(){
  renderKpis();const empty=state.players.length===0,issues=empty?[]:warnings(),errors=issues.filter(x=>x.kind==='bad');
  $('generateBtn').disabled=empty;$('quickGenerate').disabled=empty;
  $('noticeTop').innerHTML=empty?`<div class="panel section" style="margin:0 0 22px"><h2>İlk adım: kendi kadronuzu ekleyin</h2><p class="help">Uygulama boş başlar. Excel, CSV veya JSON dosyanız yalnızca bu tarayıcıda işlenir. Kadro cihazlar arasında otomatik paylaşılmaz; JSON yedeğiyle taşıyabilirsiniz.</p><button class="btn primary" data-jumptab="roster">Kadro içe aktar</button></div>`:selected().length>state.config.mainLimit?`<div class="alert danger">${selected().length} asil oyuncu seçili. Sahaya çıkmadan önce ${state.config.mainLimit} kişilik sınırı düzeltin.</div>`:'';
  $('phaseBadge').textContent=state.config.phase2;
  $('briefPhase1').innerHTML=`00–${state.config.phase2} <em>dk</em>`;$('briefPhase2').innerHTML=`${state.config.phase2}–${state.config.duration} <em>dk</em>`;$('briefWater').innerHTML=`${state.config.waterStart}+ <em>dk</em>`;
  $('dashboardOrders').innerHTML=`<div class="tablewrap"><table><thead><tr><th>TAKIM</th><th class="table-right">GÜÇ</th><th>PHASE I</th><th>PHASE II</th></tr></thead><tbody>${teamsFrom().map(t=>`<tr><td><span class="team-token">${t.id}</span></td><td class="table-right">${fmt(t.power,2)} <small>M</small></td><td><span class="target-tag">${siteName(state.targets.p1[t.id])}</span></td><td><span class="target-tag phase-two">${siteName(state.targets.p2[t.id])}</span></td></tr>`).join('')}</tbody></table></div><p class="strategy-caption">Ana hedefler gösterilir. İkincil görevler ve güvenli faz geçişi takım kartlarında.</p>`;
  $('warningCount').textContent=errors.length?`${errors.length} plan hatası`:issues.length?`${issues.length} kontrol notu`:'Hazır';$('warningCount').className='pill '+(errors.length?'bad':issues.length?'warn':'ok');
  $('dashboardChecks').innerHTML=empty?'<p class="help">Plan kontrolü, kadronuzu ekledikten sonra yapılır.</p>':renderPlanChecks(issues,true);if(empty){$('warningCount').textContent='Kadro bekleniyor';$('warningCount').className='pill';}
  const teams=teamsFrom(),max=Math.max(...teams.map(t=>t.power),1);
  $('powerSummary').innerHTML=teams.map(t=>`<div class="power-row"><span class="team-token">${t.id}</span><div><div class="power-caption"><span>${t.players.length} oyuncu</span><span>${t.holders.length} Holder</span></div><div class="progress"><i style="width:${t.power/max*100}%"></i></div></div><span class="power-value">${fmt(t.power,2)} M</span></div>`).join('');
  $('killerSummary').innerHTML=killerPlayers().map(p=>`<div class="killer-member"><span class="role-mark killer-mark">K</span><div><strong>${safe(p.name)}</strong><small>Bağımsız saldırı / hedef engelleme</small></div><span>${fmt(p.power,2)} M</span></div>`).join('')+`<p class="killer-note">Takım garnizonundan bağımsız hareket eder. Rakip ilerleyişini keser, kritik operasyonlara destek verir.</p>`;
  if(!killerPlayers().length)$('killerSummary').innerHTML='<p class="help">Bu profilde bağımsız Killer seçilmedi.</p>';
  $('teamCountText').textContent=empty?'Henüz kadro yok':`${state.config.teams} takım · ${killerPlayers().length} Killer`;
  if(empty){$('dashboardOrders').innerHTML='<div class="empty">Takım görevleri kadronuzu ekleyip plan ürettiğinizde burada görünecek.</div>';$('powerSummary').innerHTML='<div class="empty">Henüz oyuncu eklenmedi.</div>';}
  $('quickMode').innerHTML=options(Object.entries(TACTICS).map(([id,t])=>[id,t.label]),state.config.mode);
  $('quickTeams').innerHTML=options(Array.from({length:6},(_,i)=>[String(i+3),String(i+3)+' takım']),state.config.teams);
  $('quickKillers').innerHTML=options(Array.from({length:7},(_,i)=>[String(i),String(i)+' Killer']),state.config.killers);
}
function rosterRowMarkup(p,idx){const a=getAssign(p),main=p.status==='main';return `<tr data-roster-row="${safe(p.id)}"><td>${idx+1}</td><td><input aria-label="Oyuncu adı" data-player="${safe(p.id)}" data-field="name" value="${safe(p.name)}" style="min-width:118px"></td><td><input type="text" inputmode="decimal" data-player="${safe(p.id)}" data-field="power" value="${fmt(p.power,2)}" style="width:93px"></td><td><select data-player="${safe(p.id)}" data-field="status">${options([['main','Asil'],['reserve','Yedek'],['pool','Havuz']],p.status)}</select></td><td><input type="checkbox" data-player="${safe(p.id)}" data-field="coming" ${p.coming?'checked':''}></td><td><input type="checkbox" data-player="${safe(p.id)}" data-field="joined" ${p.joined?'checked':''}></td><td><select data-player="${safe(p.id)}" data-field="role" ${!main?'disabled':''}>${options([['holder','Holder'],['support','Support'],['killer','Killer']],a.role)}</select></td><td><select data-player="${safe(p.id)}" data-field="team" data-team-count="${state.config.teams}" ${!main||a.role==='killer'?'disabled':''}>${options([['','—'],...Array.from({length:state.config.teams},(_,i)=>[teamId(i),teamId(i)])],a.team)}</select></td><td><input type="checkbox" data-player="${safe(p.id)}" data-field="roleLock" ${p.roleLock?'checked':''} ${!main?'disabled':''}></td><td><input aria-label="Takım kilidi" type="checkbox" data-player="${safe(p.id)}" data-field="teamLock" ${p.teamLock?'checked':''} ${!main||a.role==='killer'?'disabled':''}></td><td><select aria-label="Rol tercihi" data-player="${safe(p.id)}" data-field="rolePref" ${p.roleLock?'disabled':''}>${options([['','Otomatik'],...Object.entries(ROLE_LABEL)],p.rolePref)}</select></td><td><input aria-label="Killer uygunluğu" type="number" min="0" max="5" data-player="${safe(p.id)}" data-field="killerSuitability" value="${p.killerSuitability}"></td><td><input aria-label="Oyuncu notu" data-player="${safe(p.id)}" data-field="notes" value="${safe(p.notes)}"></td><td><button class="btn sm warn" data-remove-player="${safe(p.id)}" aria-label="Oyuncu sil">×</button></td></tr>`;}
function sortRosterPlayers(players,assign,key='original',direction='asc'){
  const list=players.slice(),sign=direction==='desc'?-1:1;
  if(key==='original')return list;
  const value=p=>{
    if(key==='power')return p.power;
    if(key==='status')return {main:0,reserve:1,pool:2}[p.status];
    const a=p.status==='main'?assign[p.id]:null;
    if(key==='role')return {killer:0,holder:1,support:2}[a?.role];
    if(key==='team')return a?.team?Number(a.team.slice(1)):undefined;
  };
  return list.sort((a,b)=>{const x=value(a),y=value(b);if(x===undefined)return y===undefined?0:1;if(y===undefined)return -1;return (x-y)*sign;});
}
function updateRosterRow(row,p,index){
  const a=getAssign(p),main=p.status==='main';row.cells[0].textContent=String(index+1);
  for(const el of row.querySelectorAll('[data-field]')){
    const field=el.dataset.field,value=field==='role'?a.role:field==='team'?a.team:field==='power'?fmt(p.power,2):p[field];
    if(field==='team'&&el.dataset.teamCount!==String(state.config.teams)){
      el.innerHTML=options([['','—'],...Array.from({length:state.config.teams},(_,i)=>[teamId(i),teamId(i)])],a.team);el.dataset.teamCount=String(state.config.teams);
    }
    if(el.type==='checkbox')el.checked=!!value;
    else if(el!==document.activeElement)el.value=value??'';
    if(field==='role'||field==='roleLock')el.disabled=!main;
    else if(field==='team'||field==='teamLock')el.disabled=!main||a.role==='killer';
    else if(field==='rolePref')el.disabled=p.roleLock;
  }
}
function focusRosterPlayer(id){
  const row=[...$('rosterTable').querySelectorAll('[data-roster-row]')].find(row=>row.dataset.rosterRow===id);
  const input=row?.querySelector('[data-field="name"]');
  if(input){row.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});input.focus({preventScroll:true});input.select();}
}
function renderRoster(){
  const host=$('rosterTable'),viewport=host.querySelector?.('.tablewrap');
  const savedView=viewport?{top:viewport.scrollTop,left:viewport.scrollLeft,x:window.scrollX,y:window.scrollY,active:document.activeElement}:null;
  $('replaceOut').innerHTML=options(selected().map(p=>[p.id,p.name+(!p.coming||!p.joined?' · katılım eksik':'')]),$('replaceOut').value);
  $('replaceIn').innerHTML=options(reserve().map(p=>[p.id,p.name]),$('replaceIn').value);
  $('rosterFilter').value=rosterFilter;$('rosterSearch').value=rosterTerm;$('rosterSort').value=rosterSort;$('rosterSortDirection').value=rosterSortDirection;$('rosterSortDirection').disabled=rosterSort==='original';
  const filtered=state.players.filter(p=>(rosterFilter==='all'||p.status===rosterFilter)&&p.name.toLocaleLowerCase('tr-TR').includes(rosterTerm.toLocaleLowerCase('tr-TR')));
  const list=sortRosterPlayers(filtered,state.assign,rosterSort,rosterSortDirection);
  $('rosterCount').textContent=`${list.length} oyuncu · ${selected().length} asil · ${reserve().length} yedek`;
  // Keep the scroll container and existing controls alive when a field commits on blur.
  if(!viewport){host.innerHTML=`<div class="tablewrap" role="region" aria-label="Oyuncu kadrosu tablosu" tabindex="0"><table><thead><tr><th>#</th><th>NAME</th><th>POWER (M)</th><th>KADRO</th><th>GELİYOR</th><th>KATILDI</th><th>ROL</th><th>TAKIM</th><th>SABİT ROL</th><th>SABİT TAKIM</th><th>ROL TERCİHİ</th><th>KILLER UYGUNLUĞU</th><th>NOTLAR</th><th></th></tr></thead><tbody>${list.map(rosterRowMarkup).join('')}</tbody></table></div>`;return;}
  const body=viewport.querySelector('tbody'),rows=new Map([...body.rows].map(row=>[row.dataset.rosterRow,row]));
  let next=body.firstElementChild;
  list.forEach((p,index)=>{
    let row=rows.get(p.id);
    if(!row){const fragment=document.createElement('tbody');fragment.innerHTML=rosterRowMarkup(p,index);row=fragment.firstElementChild;}
    else updateRosterRow(row,p,index);
    if(row!==next)body.insertBefore(row,next);else next=next.nextElementSibling;
    rows.delete(p.id);
  });
  for(const row of rows.values())row.remove();
  if(savedView.active?.isConnected&&document.activeElement!==savedView.active&&host.contains(savedView.active))savedView.active.focus({preventScroll:true});
  viewport.scrollTop=savedView.top;viewport.scrollLeft=savedView.left;
  if(window.scrollX!==savedView.x||window.scrollY!==savedView.y)window.scrollTo({left:savedView.x,top:savedView.y,behavior:'instant'});
}
function renderTeams(){
  if(!state.players.length){$('teamWarnings').innerHTML='';$('teamCards').innerHTML='<div class="empty">Takım planı için önce Oyuncu Kadrosu ekranından kendi dosyanızı içe aktarın.</div>';$('killersDetail').innerHTML='<p class="help">Henüz Killer atanmadı.</p>';return;}
  const issues=warnings();$('teamWarnings').innerHTML=issues.length?`<div class="panel team-warning-wrap">${renderPlanChecks(issues,true)}</div>`:'';
  document.querySelectorAll('.durationText').forEach(x=>x.textContent=state.config.duration);document.querySelectorAll('.phaseText').forEach(x=>x.textContent=state.config.phase2);document.querySelectorAll('[data-phase]').forEach(x=>x.classList.toggle('active',Number(x.dataset.phase)===currentPhase));
  const primary=currentPhase===1?'p1':'p2',secondary=currentPhase===1?'p1sub':'p2sub',teams=teamsFrom(),max=Math.max(1,...teams.map(t=>t.power));
  $('teamCards').innerHTML=teams.map(t=>{
    const leader=t.holders.find(p=>p.id===state.leaders[t.id])||t.holders.slice().sort((a,b)=>b.power-a.power)[0],holders=leader?[leader,...t.holders.filter(p=>p.id!==leader.id)]:t.holders,tr=transitionFor(t);
    const siteOptions=state.buildings.filter(b=>currentPhase===2||b.phase===1).map(b=>[b.id,b.name]);
    return `<article class="team-card" aria-label="${t.id} takım planı"><div class="team-top"><div class="team-identity"><span class="team-headline">${t.id}</span><small>${t.players.length} OYUNCU<br>TAKIM KUVVETİ</small></div><span class="pill ${holders.length>=state.config.holderMin?'ok':'bad'}">${holders.length} HOLDER</span></div><div class="team-strength">${fmt(t.power,2)} <span>M</span></div><div class="progress"><i style="width:${t.power/max*100}%"></i></div>
    <div class="target-pair"><label>ANA HEDEF<select aria-label="${t.id} ana hedef" data-target-team="${t.id}" data-target-key="${primary}">${options(siteOptions,state.targets[primary][t.id])}</select><span class="lock-label"><input type="checkbox" data-target-lock="${t.id}" data-target-key="${primary}" ${state.targetLocks[primary][t.id]?'checked':''}>Hedef kilidi</span></label><label>İKİNCİ HEDEF<select aria-label="${t.id} ikincil hedef" data-target-team="${t.id}" data-target-key="${secondary}">${options([['','—'],...siteOptions,...((currentPhase===2||state.config.waterStart<state.config.phase2)?[['water','Water Tanks toplama']]:[]),['reinforce','Hızlı destek']],state.targets[secondary][t.id])}</select><span class="lock-label"><input type="checkbox" data-target-lock="${t.id}" data-target-key="${secondary}" ${state.targetLocks[secondary][t.id]?'checked':''}>Hedef kilidi</span></label></div>
    <div class="team-members">${t.players.slice().sort((a,b)=>b.power-a.power).map(p=>`<div class="team-member"><b class="member-name">${safe(p.name)}</b><span class="member-role ${getAssign(p).role==='holder'?'holder':''}">${ROLE_LABEL[getAssign(p).role]}</span><span class="member-power">${fmt(p.power,2)} M</span></div>`).join('')}</div>
    <label class="form-field">Garnizon lideri<select data-leader="${t.id}">${options([['','Otomatik seçim'],...holders.map(p=>[p.id,p.name])],state.leaders[t.id]||'')}</select></label><div class="leader-note">${leader?safe(leader.name):'Holder atanmadı'} · ${state.leaders[t.id]?'manuel seçim':'güce göre öneri'}</div>
    <div class="rotations">${badge('A · '+(holders[0]?.name||'—'),'ok')}<span>⇄</span>${badge('B · '+(holders[1]?.name||'—'),'blue')}</div>
    <details><summary>Gerekçe ve geçiş emirleri</summary><p class="help">${safe(state.explanations?.[primary+':'+t.id]||'Manuel plan: mevcut hedef ve güç değerlerini kontrol edin.')}</p><p class="help">${safe(tr.initial)}</p><p>${safe(tr.transition)}</p><p class="help">Takviye: ${safe(siteName(tr.reinforce)==='—'?tr.reinforce:siteName(tr.reinforce))}. İkincil göreve yalnızca ana garnizon güvendeyken gidin.</p><p class="help">Geri çekilme: ${safe(tr.fallback)}</p></details>
    <p class="rotation-note">Güvenli devir: B takviyeye girer, savunma doğrulanır, ardından A çıkar. Liderlik otomatik devredilmiş sayılmaz.</p></article>`;
  }).join('');
  $('killersDetail').innerHTML=`<div class="grid g2">${killerPlayers().map(p=>`<div class="killer-member"><span class="role-mark killer-mark">K</span><div><strong>${safe(p.name)}</strong><small>Killer · bağımsız operasyon</small></div><span>${fmt(p.power,2)} M</span></div>`).join('')}</div><p class="killer-note">Killer hiçbir takım listesine dahil edilmez. Rakibi engeller, kritik saldırıları destekler ve garnizon rotasyonuna katılmaz.</p>`;
}
function nodeOccupancy(phase){const k=phase===1?'p1':'p2';let out={};for(const [team,site] of Object.entries(state.targets[k]))if(bById(site))(out[site]||=[]).push(team);return out}
function makeMap(){
  const occupied=nodeOccupancy(mapPhase),links=[['central','wtc1'],['central','wtc2'],['central','munitions'],['central','dev'],['wtc1','wpp1'],['wtc1','wpp3'],['wtc2','wpp2'],['wtc2','wpp4'],['solar','central'],['helipad','central']];
  const point=b=>({x:b.x*1.5+50,y:b.y*1.5+35});
  const lines=links.map(([a,b])=>{const x=point(bById(a)),y=point(bById(b));return `<path d="M${x.x} ${x.y}L${y.x} ${y.y}" stroke="#38504c" stroke-dasharray="5 5" fill="none"/>`;}).join('');
  const nodes=state.buildings.map(b=>{
    const p=point(b),disabled=b.phase===2&&mapPhase===1,teams=occupied[b.id]||[],secondary=Object.entries(state.targets[mapPhase===1?'p1sub':'p2sub']).filter(([,v])=>v===b.id).map(([id])=>id);
    const words=b.name.split(' '),title=words.length>2?[words.slice(0,2).join(' '),words.slice(2).join(' ')]:[b.name];
    const status=disabled?'Phase II açılışında':teams.join(' + ')||(secondary.length?'İkincil: '+secondary.join(' + '):'Atanmamış');
    return `<g class="map-node ${teams.length?'ally':''} ${selectedSite===b.id?'selected':''}" data-map-site="${b.id}" opacity="${disabled?.5:1}"><title>${safe(b.name)} · ${safe(status)}</title><rect x="${p.x-90}" y="${p.y-38}" width="180" height="76" rx="10"/><text class="node-title" x="${p.x}" y="${p.y-(title.length===2?12:3)}">${title.map((line,i)=>`<tspan x="${p.x}" dy="${i?17:0}">${safe(line)}</tspan>`).join(' ')}</text><text class="sub" x="${p.x}" y="${p.y+24}">${safe(status)}</text></g>`;
  }).join('');
  return `<svg class="map" viewBox="0 0 1000 620" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Tam bina adlarıyla şematik 11 bina haritası"><defs><pattern id="grid0" width="30" height="30" patternUnits="userSpaceOnUse"><path d="M30 0H0V30" fill="none" stroke="#243530" stroke-width="0.7"/></pattern></defs><rect width="1000" height="620" fill="url(#grid0)"/>${lines}${nodes}<text x="20" y="604" fill="#9cafa7" font-size="11">Şematik yerleşim · Gerçek mesafe veya seyahat süresi hesabı değildir</text></svg>`;
}
function renderBattlefield(){ $('mapPhase').value=String(mapPhase);$('mapSvg').innerHTML=makeMap();const occ=nodeOccupancy(mapPhase),site=bById(selectedSite)||state.buildings[0];$('siteDetails').innerHTML=`<div class="panel" style="padding:13px;background:#1d3048;margin-bottom:12px"><span class="pill ${site.phase===1?'ok':'warn'}">PHASE ${site.phase}</span><h2 style="margin-top:9px">${safe(site.name)}</h2><div class="spaced"><strong>${fmt(site.rate)} su/dk</strong><b>FTC +${fmt(site.ftc)}</b></div><p class="help" style="margin-top:7px">${safe(site.bonus)}</p><p class="help">Ana sorumlular: ${safe((occ[site.id]||[]).join(', ')||'Henüz atanmadı')}</p></div>${state.buildings.map(b=>`<div class="team-member"><div><b>${safe(b.name)}</b><br><small>+${fmt(b.rate)}/dk · FTC ${fmt(b.ftc)}</small></div><span>${badge((occ[b.id]||[]).join(', ')||'Boş',occ[b.id]?'ok':'warn')}</span></div>`).join('')}`;
 const active=state.buildings.filter(b=>mapPhase===2||b.phase===1),primary=new Set(Object.values(state.targets[mapPhase===1?'p1':'p2'])),secondary=new Set(Object.values(state.targets[mapPhase===1?'p1sub':'p2sub']));$('uncoveredSites').innerHTML=active.map(b=>{let st=primary.has(b.id)?'Ana hedef':secondary.has(b.id)?'İkincil':'Atanmamış';return `<span class="pill ${st==='Atanmamış'?'bad':st==='İkincil'?'warn':'ok'}" style="margin:4px">${b.name}: ${st}</span>`}).join('');}

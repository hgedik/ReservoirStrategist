 'use strict';
function emptySimRow(){return {p1:'none',p2:'none',ftc:'auto',events:'',delay1:state.config.captureDelay,delay2:state.config.captureDelay}}
function makeScenarioForPlan(plan,s=state){const result={};for(const b of s.buildings){const r={p1:'none',p2:'none',ftc:'auto',events:'',delay1:s.config.captureDelay,delay2:s.config.captureDelay};for(const phase of [1,2]){if(phase===1&&b.phase===2)continue;const key=phase===1?'p1':'p2';r[key]=Object.values(plan.targets[key]||{}).includes(b.id)?'us':s.config.unassigned==='enemy'?'them':'none';}result[b.id]=r;}return result}
function resetSimulationFromPlan(shouldRender=true){state.sim.buildings=makeScenarioForPlan({targets:state.targets});if(shouldRender){autosave();renderSimulator();toast('Plan varsayımları simülasyona aktarıldı.')}}
function ownerWord(w){return w==='us'?'Biz':w==='them'?'Rakip':'Boş'}
function parseTimedText(text,withCount=false){
  if(!String(text||'').trim())return [];
  const rx=withCount?/(\d+(?:[.,]\d+)?)\s*:\s*(us|biz|them|rakip)\s*:\s*(\d+(?:[.,]\d+)?)/gi:/(\d+(?:[.,]\d+)?)\s*:\s*(us|biz|them|rakip|none|boş|bos|empty)/gi;
  let cursor=0;const out=[];for(const match of String(text).matchAll(rx)){if(String(text).slice(cursor,match.index).replace(/[\s,;]+/g,''))fail('Zaman çizelgesi okunamadı. Örnek: 1:biz; 18:rakip');const owner=({us:'us',biz:'us',them:'them',rakip:'them',none:'none','boş':'none',bos:'none',empty:'none'})[match[2].toLowerCase()];out.push({t:num(match[1]),owner,...(withCount?{count:num(match[3])}:{})});cursor=match.index+match[0].length;}
  if(!out.length||String(text).slice(cursor).replace(/[\s,;]+/g,''))fail('Zaman çizelgesi okunamadı.');
  return out.sort((a,b)=>a.t-b.t);
}
function controlEvents(b,row,config){
  const s={p1:'none',p2:'none',delay1:config.captureDelay,delay2:config.captureDelay,...row},unlock=b.phase===2?config.phase2:0;let events=[];
  if(String(s.events||'').trim())events=parseTimedText(s.events);
  else {const p1Captured=b.phase===1&&s.p1!=='none'&&num(s.delay1)<config.phase2;if(p1Captured)events.push({t:num(s.delay1),owner:s.p1});
    if(b.phase===2){if(s.p2!=='none')events.push({t:config.phase2+num(s.delay2),owner:s.p2});}
    else if(s.p2!==s.p1||!p1Captured){events.push({t:config.phase2,owner:'none'});if(s.p2!=='none')events.push({t:config.phase2+num(s.delay2),owner:s.p2});}}
  events=events.filter(e=>e.t>=unlock&&e.t<=config.duration).sort((a,b)=>a.t-b.t);
  const clean=[];for(const e of events){if(!['none','us','them'].includes(e.owner))fail('Geçersiz bina sahibi.');const last=clean.at(-1);if(last?.t===e.t){if(last.owner==='none')clean.pop();else if(e.owner==='none'||last.owner===e.owner)continue;else fail(b.short+': aynı dakikada iki farklı sahip olamaz.');}clean.push(e);}return clean;
}
function tankEvents(sim,config){
  if(String(sim.tankEvents||'').trim()){const events=parseTimedText(sim.tankEvents,true);for(const e of events)if(e.t<config.waterStart||e.t>config.duration||!Number.isInteger(e.count))fail('Tank olayları açılış ile maç sonu arasında ve adet tam sayı olmalı.');return events.map(e=>({...e,water:e.count*num(sim.waterUnit)}));}
  return ['us','them'].map(owner=>({t:config.waterStart,owner,water:Math.max(0,num(sim[owner==='us'?'waterUs':'waterThem']))*Math.max(0,num(sim.waterUnit))}));
}
function evaluateScenario(sim,config=state.config,buildings=state.buildings){
  const duration=config.duration,unit=Math.max(0,num(sim.waterUnit));
  const tanks=tankEvents({...sim,waterUnit:unit},config),perSite=[],captureCounts={us:0,them:0};
  for(const b of buildings){const row=sim.buildings?.[b.id]||{},events=controlEvents(b,row,config),first=events.find(e=>e.owner!=='none');
    // Manual FTC selection is allowed only for the actual first capturing side; never transfer it on recapture.
    if(first&&['us','them'].includes(row.ftc)&&row.ftc!==first.owner)fail(b.short+': FTC yalnızca ilk ele geçiren tarafa verilebilir.');
    const ftcOwner=first&&row.ftc!=='none'?first.owner:'none';if(ftcOwner!=='none')captureCounts[ftcOwner]++;
    const spans=events.map((e,i)=>({...e,end:events[i+1]?.t??duration}));
    const at=time=>{const values={us:0,them:0};for(const span of spans)if(span.owner!=='none')values[span.owner]+=Math.max(0,Math.min(time,span.end)-span.t)*b.rate;if(first&&time>=first.t&&ftcOwner!=='none')values[ftcOwner]+=b.ftc;return values;};
    const end=at(duration);perSite.push({id:b.id,...end,events,spans,ftcOwner,ftcTime:first?.t??null,at,controlUs:spans.filter(x=>x.owner==='us').reduce((v,x)=>v+x.end-x.t,0),controlThem:spans.filter(x=>x.owner==='them').reduce((v,x)=>v+x.end-x.t,0)});
  }
  const at=time=>{const values={us:0,them:0};for(const b of perSite){const v=b.at(time);values.us+=v.us;values.them+=v.them;}for(const e of tanks)if(e.t<=time)values[e.owner]+=e.water;return values;};
  const times=Array.from({length:Math.ceil(duration)+1},(_,i)=>Math.min(i,duration)),series=times.map(at),end=at(duration),tankUs=tanks.filter(e=>e.owner==='us').reduce((v,e)=>v+e.water,0),tankThem=tanks.filter(e=>e.owner==='them').reduce((v,e)=>v+e.water,0),phase1=at(config.phase2);
  return {...end,gap:end.us-end.them,usSeries:series.map(v=>v.us),themSeries:series.map(v=>v.them),perSite:perSite.map(({at,...rest})=>rest),captureCounts,phase1Us:phase1.us,phase1Them:phase1.them,tankUs,tankThem,buildingUs:end.us-tankUs,buildingThem:end.them-tankThem};
}
function svgChart(data,conf=state.config){let n=Math.min(data.usSeries.length-1,Math.max(1,Math.round(conf.duration))),max=Math.max(1,...data.usSeries,...data.themSeries)*1.08,W=840,H=265,padL=62,padR=17,padTop=20,padBot=35;
 const xx=t=>padL+(t/n)*(W-padL-padR),yy=v=>padTop+(1-v/max)*(H-padTop-padBot),step=Math.max(1,Math.round(n/6));
 const path=vals=>vals.map((v,i)=>`${i?'L':'M'}${xx(i).toFixed(1)},${yy(v).toFixed(1)}`).join(' ');
 let grid=Array.from({length:5},(_,i)=>{let val=max/4*i,y=yy(val);return `<line x1="${padL}" y1="${y}" x2="${W-padR}" y2="${y}" stroke="#30425b" stroke-dasharray="3 5"/><text class="chart-label" text-anchor="end" x="${padL-9}" y="${y+3}">${fmt(val)}</text>`}).join('');
 let times=Array.from({length:Math.ceil(n/step)+1},(_,i)=>Math.min(n,i*step)).filter((v,i,a)=>a.indexOf(v)===i).map(v=>`<text class="chart-label" text-anchor="middle" x="${xx(v)}" y="${H-12}">${v}dk</text>`).join('');
 return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Maç boyunca biriken su puanı çizgi grafiği">${grid}<line x1="${xx(conf.phase2)}" y1="${padTop}" x2="${xx(conf.phase2)}" y2="${H-padBot}" stroke="#ffe0a2" stroke-width="1.5" stroke-dasharray="5 5"/><path d="${path(data.usSeries)}" fill="none" stroke="#57dbb6" stroke-width="3.5" stroke-linejoin="round"/><path d="${path(data.themSeries)}" fill="none" stroke="#ff8798" stroke-width="3.5" stroke-linejoin="round"/>${times}<circle cx="${xx(n)}" cy="${yy(data.us)}" r="5" fill="#57dbb6"/><circle cx="${xx(n)}" cy="${yy(data.them)}" r="5" fill="#ff8798"/></svg>`}
function renderSimulator(){let s=state.sim,c=state.config,d=evaluateScenario(s),income=(o)=>state.buildings.reduce((sum,b)=>{const ev=d.perSite.find(x=>x.id===b.id).events;let owner='none';for(let item of ev)if(item.t<=c.duration-1)owner=item.owner;return sum+(owner===o?b.rate:0)},0);
 $('simKpis').innerHTML=[['BİZİM SU',fmt(d.us),'Toplam ittifak puanı'],['RAKİP SU',fmt(d.them),'Varsayımsal rakip puanı'],['PUAN FARKI',(d.gap>0?'+':'')+fmt(d.gap),d.gap>=0?'Biz öndeyiz (senaryo)':'Rakip önde (senaryo)'],['SON DAKİKA SU/DK',fmt(income('us'))+' / '+fmt(income('them')),'Biz / Rakip']].map(([lab,note,sub],i)=>`<div class="panel kpi"><div class="label">${lab}</div><div class="num" style="font-size:${i===3?'22':'27'}px;color:${i===2?(d.gap>=0?'var(--green)':'var(--red)'):'inherit'}">${note}</div><div class="sub">${sub}</div></div>`).join('');
 $('waterGraph').innerHTML=svgChart(d);$('waterUs').value=s.waterUs;$('waterThem').value=s.waterThem;$('waterUnit').value=s.waterUnit;$('waterStart').value=c.waterStart;$('tankEvents').value=s.tankEvents||'';
 $('simTable').innerHTML=`<div class="sim-row head"><span>Bina / su</span><span>Phase I</span><span>Phase II</span><span>FTC</span><span>Özel olay çizelgesi</span></div>`+state.buildings.map(b=>{const r=s.buildings[b.id]||emptySimRow();return `<div class="sim-row"><div><b>${safe(b.short)}</b> <small>+${fmt(b.rate)}/dk</small></div><select aria-label="${safe(b.short)} Phase I" data-sim-site="${b.id}" data-sim-field="p1" ${b.phase===2?'disabled':''}>${options([['none',b.phase===2?'Kapalı':'Boş'],['us','Biz'],['them','Rakip']],b.phase===2?'none':r.p1)}</select><select aria-label="${safe(b.short)} Phase II" data-sim-site="${b.id}" data-sim-field="p2">${options([['none','Boş'],['us','Biz'],['them','Rakip']],r.p2)}</select><select aria-label="${safe(b.short)} FTC" data-sim-site="${b.id}" data-sim-field="ftc">${options([['auto','Oto'],['us','Biz'],['them','Rakip'],['none','Yok']],r.ftc)}</select><input aria-label="${safe(b.short)} özel olaylar" title="Ör: 1:biz, 18:rakip, 32:biz" placeholder="1:biz, 18:rakip..." value="${safe(r.events||'')}" data-sim-site="${b.id}" data-sim-field="events"></div>`}).join('');
 $('simBreakdown').innerHTML=`<div class="tablewrap"><table><thead><tr><th>Bina</th><th>Su/dk</th><th>FTC</th><th>Biz</th><th>Rakip</th><th>Kontrol süresi (biz/rakip)</th><th>FTC sahibi</th></tr></thead><tbody>${d.perSite.map(s=>{const b=bById(s.id);return `<tr><td>${safe(b.name)}</td><td>${fmt(b.rate)}</td><td>${fmt(b.ftc)}</td><td class="table-right good-text">${fmt(s.us)}</td><td class="table-right danger-text">${fmt(s.them)}</td><td>${fmt(s.controlUs,1)} / ${fmt(s.controlThem,1)} dk</td><td>${ownerWord(s.ftcOwner)}</td></tr>`}).join('')}</tbody></table></div><p class="help">Bina suyu: Biz ${fmt(d.buildingUs)}, rakip ${fmt(d.buildingThem)}. Tank suyu: Biz ${fmt(d.tankUs)}, rakip ${fmt(d.tankThem)}. FTC'nin sahibi her bina için ilk ele geçiren taraftır (veya bonus kapatılabilir).</p>`;
}
function compareModels(){return Object.keys(TACTICS).map(mode=>{try{const plan=generatePlan(mode),sim={...state.sim,buildings:makeScenarioForPlan(plan)},d=evaluateScenario(sim);return {mode,plan,sim,d}}catch(e){return {mode,error:e.message}}})}

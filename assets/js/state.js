'use strict';
function defaultState(){return normalizeState({players:[],config:deepcopy(BASE_CONFIG)});}
let state;let currentTab='dashboard',currentPhase=1,mapPhase=1,rosterTerm='',rosterFilter='all',rosterSort='original',rosterSortDirection='asc',selectedSite='central',dirty=false;
let startupError='';
function getSaved(){try{const raw=JSON.parse(localStorage.getItem('rr-strategy-commander-v1')||'null');return raw?normalizeState(raw):null}catch(e){startupError='Yerel kayıt açılamadı; kayıt üzerine yazılmadı. JSON yedeğini kontrol edin. '+e.message;return null}}
function loadState(){state=getSaved()||defaultState();if(state.players.some(p=>p.status==='main')&&!Object.keys(state.assign).length){try{applyGenerated(generatePlan(state.config.mode),false);if(!Object.keys(state.sim.buildings).length)resetSimulationFromPlan(false)}catch(e){startupError=e.message}}}
function store(){try{localStorage.setItem('rr-strategy-commander-v1',JSON.stringify(state));dirty=false;toast('Plan tarayıcıya kaydedildi.')}catch(e){toast('Yerel kayıt yapılamadı. JSON yedeği kullanın.',true)}}
function autosave(){dirty=true;try{localStorage.setItem('rr-strategy-commander-v1',JSON.stringify(state))}catch(e){}}
function toast(s,error){const el=$('toast');el.textContent=s;el.style.background=error?'#4d2c38':'#23443f';el.hidden=false;clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>el.hidden=true,3500)}
function selected(){return state.players.filter(p=>p.status==='main')}
function reserve(){return state.players.filter(p=>p.status==='reserve')}
function getAssign(p){return state.assign[p.id]||{role:'support',team:''}}
function teamId(i){return 'T'+(i+1)}
function bById(id){return state.buildings.find(x=>x.id===id)}
function siteName(id){return bById(id)?.name||({water:'Water Tanks toplama',reinforce:'Hızlı destek'})[id]||'—'}
function teamPower(members){return members.reduce((s,p)=>s+p.power,0)}
function teamsFrom(assign=state.assign){return Array.from({length:state.config.teams},(_,i)=>{let id=teamId(i);let players=selected().filter(p=>assign[p.id]?.team===id&&assign[p.id]?.role!=='killer');return {id,players,power:teamPower(players),holders:players.filter(p=>assign[p.id]?.role==='holder'),support:players.filter(p=>assign[p.id]?.role==='support')};})}
function killerPlayers(assign=state.assign){return selected().filter(p=>assign[p.id]?.role==='killer')}
function siteTargetRanking(mode,phase){let ids=[...TACTICS[mode].phase1];if(phase===2)ids=[...TACTICS[mode].phase2];return ids}

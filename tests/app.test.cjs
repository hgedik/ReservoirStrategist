const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const tags = [...html.matchAll(/<script\b([^>]*)><\/script>/g)];
const paths = tags.map(([, attrs]) => attrs.match(/src="([^"]+)"/)[1]);

// Execute each file as its own classic script, just as the HTML does.
function app({seed=true}={}) {
  const elements = new Map();
  for (const [, id] of html.matchAll(/\bid="([^"]+)"/g)) elements.set(id, {
    id, innerHTML: '', textContent: '', value: '', style: {},
    classList: { toggle() {} }, addEventListener() {},
  });
  const saved = new Map();
  const ctx = vm.createContext({
    document: {
      getElementById(id) { assert.ok(elements.has(id), `Missing DOM id: ${id}`); return elements.get(id); },
      querySelectorAll() { return []; }, addEventListener() {},
    },
    localStorage: { getItem: key => saved.get(key) ?? null, setItem: (key, v) => saved.set(key, v) },
    setTimeout() {}, clearTimeout() {},
  });
  ctx.window = ctx; ctx.addEventListener = () => {}; ctx.scrollTo = () => {};
  for (const file of paths) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  if(seed){ctx.testRoster=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/synthetic-roster.json'),'utf8'));vm.runInContext('state=normalizeState({players:testRoster});applyGenerated(generatePlan(),false);resetSimulationFromPlan(false);renderAll()',ctx);}
  return { ctx, elements, run: code => vm.runInContext(code, ctx) };
}

test('The index entry point loads ordered, relative deferred scripts', () => {
  assert.equal(tags.length, 10);
  for (const [tag, attrs] of tags) {
    assert.match(attrs, /\bdefer\b/);
    assert.match(tag, /src="\.\/assets\/js\//);
  }
  for (const file of paths) {
    assert.ok(fs.existsSync(path.join(root, file)));
    assert.equal(new URL(file, 'https://example.github.io/ReservoirStrategist/').pathname, '/ReservoirStrategist/' + file.slice(2));
  }
});

test('Synthetic imported roster renders 30 main, 10 reserve, 2 independent Killers, 6 teams', () => {
  const { run, elements } = app();
  assert.equal(run('selected().length'), 30);
  assert.equal(run('reserve().length'), 10);
  assert.equal(run('killerPlayers().length'), 2);
  assert.equal(run('killerPlayers().every(p=>!getAssign(p).team)'), true);
  assert.equal(run('teamsFrom().length'), 6);
  assert.equal(run('teamsFrom().every(t=>t.holders.length>=2)'), true);
  assert.match(elements.get('dashboardKpis').innerHTML, /30 \/ 30/);
});

test('All views render across script boundaries and saved plans restore', () => {
  const { run, elements } = app();
  for (const tab of ['roster', 'teams', 'battlefield', 'simulator', 'compare', 'settings','battle']) run(`switchTab('${tab}')`);
  for (const id of ['rosterTable', 'teamCards', 'mapSvg', 'simTable', 'compareCards', 'buildingSettings']) assert.ok(elements.get(id).innerHTML.length > 100, id);
  const before = run('JSON.stringify(state)');
  run('autosave(); state=defaultState(); loadState()');
  assert.equal(run('JSON.stringify(state)'), before);
});

test('Alternative team counts preserve roster coverage and Holder minimums', () => {
  const { run } = app();
  for (const n of [3, 5, 6]) {
    run(`state.config.teams=${n}; applyGenerated(generatePlan('balanced'),false)`);
    assert.equal(run('teamsFrom().length'), n);
    assert.equal(run('teamsFrom().every(t=>t.holders.length>=2)'), true);
    assert.equal(run('teamsFrom().reduce((sum,t)=>sum+t.players.length,0)'), 28);
  }
});

test('Scoring counts production, FTC once, ownership changes and tanks', () => {
  const { run } = app();
  run("state.buildings=[{id:'test',phase:1,rate:600,ftc:3000}]");
  const result = JSON.parse(run(`JSON.stringify(evaluateScenario({buildings:{test:{events:'0:biz, 10:rakip, 20:biz',ftc:'auto'}},waterUs:2,waterThem:0,waterUnit:500}))`));
  assert.equal(result.us, 50 * 600 + 3000 + 1000);
  assert.equal(result.them, 10 * 600);
});

test('CSV import retains comma decimals and Unicode names', () => {
  const { run } = app();
  const players = JSON.parse(run(`JSON.stringify(parseRosterRows(guessRows('Name;Power\\nاختبار 01;42,75\\nТестовый 02;36,25'))) `));
  assert.equal(players[0].name, 'اختبار 01');
  assert.equal(players[0].power, 42.75);
  assert.equal(players[1].name, 'Тестовый 02');
});

test('Regression: team locks and target locks survive regeneration', () => {
  const { run } = app();
  run("state.players.find(p=>p.id==='p3').teamLock=true;state.assign.p3={role:'holder',team:'T6'};state.targetLocks={p1:{T1:true}};state.targets.p1.T1='wpp4'");
  assert.equal(run("generatePlan().assign.p3.team"), 'T6');
  assert.equal(run("generatePlan().targets.p1.T1"), 'wpp4');
});

test('Regression: unassigned objectives are neutral unless explicitly modeled', () => {
  const { run } = app();
  assert.equal(run("Object.values(makeScenarioForPlan({targets:{p1:{},p2:{},p1sub:{},p2sub:{}}})).some(s=>s.p1==='them'||s.p2==='them')"), false);
});

test('Regression: FTC is paid at the capture instant, including the final minute', () => {
  const { run } = app();
  run("state.buildings=[{id:'test',phase:1,rate:600,ftc:3000}]");
  assert.equal(run("evaluateScenario({buildings:{test:{events:'60:us',ftc:'auto'}}}).us"), 3000);
});

test('Infeasible locks reject generation without changing the current plan', () => {
  const { run } = app();
  run("selected().forEach(p=>{p.roleLock=true;p.rolePref=getAssign(p).role});selected().filter(p=>getAssign(p).role==='holder').slice(0,3).forEach(p=>p.rolePref='support')");
  const before=run('JSON.stringify(state)');
  assert.throws(()=>run('generatePlan()'),/Holder/);
  assert.equal(run('JSON.stringify(state)'),before);
});

test('Killer count conflicts and locked team removal never silently override locks', () => {
  const { run }=app();
  run("killerPlayers().forEach(p=>{p.roleLock=true;p.rolePref='killer'});state.config.killers=1");
  assert.throws(()=>run('generatePlan()'),/Killer/);
  run("state.config.killers=2;const p=selected().find(p=>getAssign(p).team==='T6');p.teamLock=true;state.config.teams=5");
  assert.throws(()=>run('generatePlan()'),/takım/);
});

test('Impossible sizes and excess selected players are rejected', () => {
  const { run }=app();
  run('state.config.holderMin=5');assert.throws(()=>run('generatePlan()'),/Holder/);
  run("state.config.holderMin=2;reserve()[0].status='main'");assert.throws(()=>run('generatePlan()'),/Asil/);
});

test('No player is duplicated; output is deterministic across modes and team counts', () => {
  const { run }=app();
  for(const n of [3,5,6,8])for(const mode of ['balanced','aggressive','defensive','fast','water']) {
    run(`state.config.teams=${n}`);
    assert.equal(run(`JSON.stringify(generatePlan('${mode}'))===JSON.stringify(generatePlan('${mode}'))`),true);
    assert.equal(run(`planErrors(state,generatePlan('${mode}')).length`),0);
    assert.equal(run(`new Set(generatePlan('${mode}').teams.flatMap(t=>t.players.map(p=>p.id))).size`),28);
  }
});

test('Locked Support stays Support; locked Holder and Killer roles stay fixed', () => {
  const { run }=app();
  run("for(const role of ['killer','holder','support']){const p=selected().find(p=>getAssign(p).role===role);p.roleLock=true;p.rolePref=role;}");
  assert.equal(run("selected().filter(p=>p.roleLock).every(p=>generatePlan().assign[p.id].role===p.rolePref)"),true);
});

test('JSON migration and restoration preserve settings, locks, Unicode, notes and simulation', () => {
  const { run }=app();
  run("state.players[2].notes='مرحبا · notlar';state.players[2].teamLock=true;state.sim.tankEvents='23:biz:2';state.targetLocks.p2.T1=true;state.config.weights.special=2.5");
  assert.equal(run('JSON.stringify(normalizeState(JSON.parse(JSON.stringify(state))))'),run('JSON.stringify(state)'));
  assert.equal(run("normalizeState({players:state.players,version:1}).version"),3);
  assert.throws(()=>run('normalizeState({...state,version:99})'),/sürümü/);
});

test('Malformed JSON structures, duplicates and invalid numeric values are rejected atomically', () => {
  const { run }=app();const before=run('JSON.stringify(state)');
  for(const raw of ['{players:[{id:"x",name:"",power:3}]}','{...state,players:[state.players[0],state.players[0]]}','{...state,players:[{...state.players[0],power:"NaN"}]}','{...state,config:{...state.config,duration:10}}','{...state,buildings:[{id:"central",rate:"NaN"}]}','{...state,assign:{oops:{role:"holder",team:"T1"}}}']) assert.throws(()=>run(`prepareImport(${raw})`));
  assert.equal(run('JSON.stringify(state)'),before);
});

test('CSV rejects missing names, invalid power, contradictory statuses and bad quoting', () => {
  const { run }=app();
  assert.throws(()=>run("parseRosterRows([['Name','Power'],['',12]])"),/adı/);
  assert.throws(()=>run("parseRosterRows([['Name','Power'],['Test','oops']])"),/güç/);
  assert.throws(()=>run("parseRosterRows([['Name','Power','Final Selected','Subs.'],['Test',12,'+','~']])"),/aynı anda/);
  assert.throws(()=>run("guessRows('Name;Power\\n\"Test;12')"),/tırnak/);
});

test('Roster preview leaves state untouched and cannot discard existing locks', () => {
  const { run }=app();
  run("state.players[2].teamLock=true;state.players[2].roleLock=true;state.players[2].rolePref=getAssign(state.players[2]).role");
  const before=run('JSON.stringify(state)');
  assert.equal(run('planErrors(prepareImport(state.players,true)).length'),0);
  assert.equal(run('JSON.stringify(state)'),before);
  assert.throws(()=>run('prepareImport(state.players.slice(3),true)'),/kilitli/);
});

test('Phase I rejects unopened targets and locked target changes are flagged', () => {
  const { run }=app();
  assert.throws(()=>run("normalizeState({...state,targets:{...state.targets,p1:{...state.targets.p1,T1:'central'}}})"),/hedef/);
  run("state.targetLocks.p1.T1=true");
  assert.equal(run("planErrors(state,{assign:state.assign,targets:{...state.targets,p1:{...state.targets.p1,T1:'central'}}}).length>0"),true);
});

test('Fractional control intervals, zero-time FTC and same-minute conflicts are handled', () => {
  const { run }=app();run("state.buildings=[{id:'test',short:'TEST',phase:1,rate:600,ftc:3000}]");
  assert.equal(run("evaluateScenario({buildings:{test:{events:'1.5:us; 2.25:them',ftc:'auto'}}}).us"),3450);
  assert.equal(run("evaluateScenario({buildings:{test:{events:'1,5:us; 2,25:them',ftc:'auto'}}}).us"),3450);
  assert.equal(run("evaluateScenario({buildings:{test:{events:'0:us',ftc:'auto'}}}).usSeries[0]"),3000);
  assert.throws(()=>run("evaluateScenario({buildings:{test:{events:'1:us; 1:them'}}})"),/aynı dakika/);
  assert.throws(()=>run("evaluateScenario({buildings:{test:{events:'oops'}}})"),/çizelgesi/);
  assert.throws(()=>run("evaluateScenario({buildings:{test:{events:'0:us;10:them',ftc:'them'}}})"),/FTC/);
});

test('Custom Phase II opening, end-time capture and locked pre-opening events', () => {
  const { run }=app();run("state.buildings=[{id:'test',short:'TEST',phase:2,rate:1800,ftc:9000}];state.config.phase2=17");
  assert.equal(run("evaluateScenario({buildings:{test:{events:'0:them;17:us'}}}).us"),9000+43*1800);
  assert.equal(run("evaluateScenario({buildings:{test:{events:'0:them;17:us'}}}).them"),0);
});

test('Timed tanks replace aggregate counts, allow zero unit and respect spawn/end boundaries', () => {
  const { run }=app();run('state.buildings=[]');
  assert.equal(run("evaluateScenario({waterUs:99,waterUnit:500,tankEvents:'20:us:3;60:them:2'}).us"),1500);
  assert.equal(run("evaluateScenario({waterUs:99,waterUnit:0,tankEvents:'20:us:3'}).us"),0);
  assert.equal(run("evaluateScenario({waterUs:2,waterUnit:500}).usSeries[20]"),1000);
  assert.throws(()=>run("evaluateScenario({waterUnit:500,tankEvents:'19:us:2'})"),/Tank/);
});

test('User names are escaped when rendered and exported CSV blocks formula execution', () => {
  const { run,elements }=app();
  run("state.players[2].name='<img src=x onerror=alert(1)> مرحبا';switchTab('roster')");
  assert.ok(elements.get('rosterTable').innerHTML.includes('&lt;img'));
  assert.ok(!elements.get('rosterTable').innerHTML.includes('<img src=x'));
  assert.equal(run("csvSafe('=HYPERLINK(1)')"),'"\'=HYPERLINK(1)"');
});

test('Objective utility responds to user priorities and resistance assumptions', () => {
  const { run }=app();
  run("state.buildings.find(b=>b.id==='dev').priority=5;state.config.weights.special=5");
  assert.equal(run("Object.values(generatePlan('balanced').targets.p2).includes('dev')"),true);
  run("state.buildings.find(b=>b.id==='wtc1').resistance=350");
  assert.equal(run("generatePlan('defensive').explanations['p1:T1'].includes('rakip güç varsayımı')"),true);
  assert.equal(run("JSON.stringify(generatePlan('aggressive').targets)!==JSON.stringify(generatePlan('water').targets)"),true);
});

test('Explicit enemy assumption changes unassigned ownership consistently across comparisons', () => {
  const { run }=app();
  run("state.config.unassigned='enemy'");
  assert.equal(run("compareModels().every(m=>!m.error&&m.d.them>0)"),true);
  assert.equal(run("compareModels().every(m=>m.sim.waterUnit===state.sim.waterUnit)"),true);
});

test('Manual edits flag incomplete roles and failed settings preserve the previous configuration', () => {
  const { run,elements }=app();
  const before=run('JSON.stringify(state)');run('updateSettings({teams:8,holderMin:5})');
  assert.equal(run('JSON.stringify(state)'),before);
  assert.match(elements.get('toast').textContent,/Holder/);
  run("state.assign[killerPlayers()[0].id].team='T1'");assert.equal(run('planErrors(state).length>0'),true);
});

test('Battle Control retains manual scores, checks unavailable Holders and includes opportunity cost', () => {
  const { run }=app();
  run("state.battle.minute=30;state.battle.scoreUs=10000;state.battle.scoreThem=20000;state.battle.sites.wtc1.owner='us';state.battle.sites.central.owner='them'");
  assert.equal(run('battleAssessment().projectedUs'),46000);
  assert.equal(run('battleAssessment().projectedThem'),74000);
  assert.equal(run('battleAssessment().alternative!==null'),true);
  run('state.battle.disabled=selected().filter(p=>getAssign(p).role===\'holder\').map(p=>p.id)');
  assert.equal(run('battleAssessment().alternative'),null);
  assert.equal(run("battleAssessment().warnings.some(x=>x.includes('garnizon'))"),true);
  assert.equal(run('normalizeState(JSON.parse(JSON.stringify(state))).battle.scoreUs'),10000);
});

test('Short Phase I cannot capture a building after that phase has already ended', () => {
  const { run }=app();
  const sim="{buildings:{test:{p1:'us',p2:'none',delay1:10,delay2:10}}}";
  assert.equal(run(`evaluateScenario(${sim},{duration:60,phase2:5,waterStart:20,captureDelay:10},[{id:'test',phase:1,rate:600,ftc:3000}]).us`),0);
});

test('Exported unfinished manual drafts restore with warnings rather than losing edits', () => {
  const { run }=app();
  run("const p=selected().find(p=>getAssign(p).role==='holder');state.assign[p.id].role='support';p.notes='Taslak değişiklik'");
  assert.equal(run('JSON.stringify(prepareImport(JSON.parse(JSON.stringify(state)))).includes("Taslak değişiklik")'),true);
});

test('Failed file imports leave state and saved data unchanged', async() => {
  const { run,ctx,elements }=app();
  run('autosave()');const before=run('JSON.stringify(state)'),saved=ctx.localStorage.getItem('rr-strategy-commander-v1');
  await ctx.importFile({name:'broken.json',text:async()=>'{"players":'});
  assert.equal(run('JSON.stringify(state)'),before);assert.equal(ctx.localStorage.getItem('rr-strategy-commander-v1'),saved);
  assert.match(elements.get('toast').textContent,/İçe aktarma hatası/);
});

test('Preview approval rejects stale previews after the commander edits the plan', async() => {
  const { run,ctx,elements }=app();
  const raw=run('JSON.stringify(state)');await ctx.importFile({name:'plan.json',text:async()=>raw});
  run("state.players[2].notes='Daha yeni not'");ctx.confirmImport();
  assert.equal(run('state.players[2].notes'),'Daha yeni not');assert.match(elements.get('toast').textContent,/plan değişti/);
});

test('Fresh installation starts empty without exposing any bundled roster', () => {
  const {run,elements}=app({seed:false});
  assert.equal(run('state.players.length'),0);assert.equal(run('Object.keys(state.assign).length'),0);
  assert.equal(run('startupError'),'');assert.equal(run('typeof window.SEED_ROSTER'),'undefined');
  assert.equal(elements.get('generateBtn').disabled,true);assert.match(elements.get('noticeTop').innerHTML,/Kadro içe aktar/);
  for(const tab of ['roster','teams','compare','settings','battle','simulator','battlefield'])run(`switchTab('${tab}')`);
  assert.ok(!html.includes('seed-roster.js'));assert.ok(!fs.existsSync(path.join(root,'assets/js/seed-roster.js')));
  assert.ok(!fs.existsSync(path.join(__dirname,'fixtures/rr-roster.xlsx')));
});

test('Empty roster settings save and existing local rosters remain restorable', () => {
  const {run}=app({seed:false});run('updateSettings({teams:5,phase2:15})');
  assert.equal(run('state.config.teams'),5);assert.equal(run('state.config.phase2'),15);assert.equal(run('state.players.length'),0);
  const loaded=app();const before=loaded.run('JSON.stringify(state)');loaded.run('autosave();state=defaultState();loadState()');assert.equal(loaded.run('JSON.stringify(state)'),before);
});

test('Clearing local storage returns to an empty roster, never a real example', () => {
  const {run,ctx}=app();ctx.confirm=()=>true;ctx.clearLocalRoster();
  assert.equal(run('state.players.length'),0);assert.equal(JSON.parse(ctx.localStorage.getItem('rr-strategy-commander-v1')).players.length,0);
});

test('Roster import is processed locally and only saves after preview confirmation', async()=>{
  const {ctx,run}=app({seed:false});ctx.fetch=()=>{throw Error('Network upload is forbidden')};
  const players=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/synthetic-roster.json'),'utf8'));
  await ctx.importFile({name:'private-local.json',text:async()=>JSON.stringify(players)});
  assert.equal(run('state.players.length'),0);assert.equal(ctx.localStorage.getItem('rr-strategy-commander-v1'),null);
  ctx.confirmImport();assert.equal(run('state.players.length'),42);assert.equal(JSON.parse(ctx.localStorage.getItem('rr-strategy-commander-v1')).players.length,42);
});

test('Roster Power sorting supports both directions without mutating saved order',()=>{
  const {run}=app();const before=run('JSON.stringify(state)');
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'power','desc')[0].power"),196.75);
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'power','asc')[0].power"),63.5);
  assert.equal(run('JSON.stringify(state)'),before);
});

test('Roster sorting groups status, role and numbered teams; unassigned players stay last',()=>{
  const {run}=app();
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'status','asc')[0].status"),'main');
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'status','desc')[0].status"),'pool');
  assert.equal(run("getAssign(sortRosterPlayers(state.players,state.assign,'role','asc')[0]).role"),'killer');
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'role','desc').at(-1).status"),'pool');
  assert.equal(run("getAssign(sortRosterPlayers(state.players,state.assign,'team','asc')[0]).team"),'T1');
  assert.equal(run("getAssign(sortRosterPlayers(state.players,state.assign,'team','desc')[0]).team"),'T6');
  assert.equal(run("sortRosterPlayers([{id:'a',status:'main'},{id:'b',status:'main'}],{a:{team:'T10'},b:{team:'T2'}},'team','asc')[0].id"),'b');
});

test('Roster sorting is stable for tied values and original order remains available',()=>{
  const {run}=app();
  assert.equal(run("sortRosterPlayers([{id:'a',power:50},{id:'b',power:50}],{},'power','desc').map(p=>p.id).join(',')"),'a,b');
  assert.equal(run("sortRosterPlayers(state.players,state.assign,'original','desc').map(p=>p.id).join(',')"),run("state.players.map(p=>p.id).join(',')"));
});

test('Roster JSON export includes the complete strategy and locks irrespective of view sorting',()=>{
  const {run,ctx}=app();let exported;
  ctx.download=(name,body,type)=>{exported={name,data:JSON.parse(body),type};};
  run("state.players[2].teamLock=true;rosterFilter='reserve';rosterSort='power';rosterSortDirection='desc'");
  ctx.exportJSON();assert.equal(exported.data.players.length,42);assert.equal(exported.data.players[2].teamLock,true);
  assert.equal(exported.data.config.teams,6);assert.equal(exported.type,'application/json');
  assert.equal(run('state.players[0].id'),exported.data.players[0].id);
});

test('Conflicting same-time manual capture/release events must not create phantom income',()=>{
  const {run}=app();
  assert.throws(()=>run("evaluateScenario({buildings:{test:{events:'0:us;0:none'}}},state.config,[{id:'test',name:'Test building',phase:1,rate:600,ftc:3000}])"),/aynı dakika/);
});

test('Phase-I summary excludes captures and tanks exactly at the Phase-II boundary',()=>{
  const {run}=app();
  const result=JSON.parse(run("JSON.stringify(evaluateScenario({buildings:{test:{events:'15:us'}},waterUs:2,waterUnit:500},{...state.config,phase2:15,waterStart:15,captureDelay:0},[{id:'test',name:'Test building',phase:2,rate:1800,ftc:9000}]))"));
  assert.equal(result.phase1Us,0);assert.equal(result.usSeries[15],10000);assert.equal(result.phase1Us+result.phase2Us,result.us);
});

test('End-income indicator includes captures during the final fractional minute',()=>{
  const {run,elements}=app();run("state.buildings=[BASE_BUILDINGS[0]];state.sim={buildings:{central:{events:'59.5:us',ftc:'auto'}},waterUs:0,waterThem:0,waterUnit:500};renderSimulator()");
  assert.match(elements.get('simKpis').innerHTML,/1\.800 \/ 0/);
});

test('All reference buildings, full English names, rates, FTC and phases match audited source facts',()=>{
  const {run}=app();const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/calculator-reference.json'),'utf8'));
  const actual=JSON.parse(run('JSON.stringify(BASE_BUILDINGS.map(({id,name,rate,ftc,phase})=>({id,name,rate,ftc,phase})))'));
  assert.deepEqual(actual,reference.buildings);
});

test('Reference scoring agrees at every source checkpoint with matched timing and ownership',()=>{
  const {ctx}=app();const reference=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/calculator-reference.json'),'utf8'));
  const profile={phase2:15,duration:60,waterStart:20,captureDelay:0};
  for(const scenario of ['all-us','mixed','no-ftc']){
    const sim={buildings:{},waterUs:5,waterThem:15,waterUnit:500};
    reference.buildings.forEach((b,i)=>{const owner=scenario==='all-us'||i%2===0?'us':'them';sim.buildings[b.id]={p1:b.phase===1?owner:'none',p2:owner,ftc:scenario==='no-ftc'?'none':'auto',delay1:0,delay2:0};});
    const result=ctx.evaluateScenario(sim,profile);
    for(const time of [0,10,15,20,30,45,60])for(const owner of ['us','them']){
      const expected=reference.buildings.reduce((sum,b,i)=>{const side=scenario==='all-us'||i%2===0?'us':'them',unlock=b.phase===2?15:0;return sum+(side===owner&&time>=unlock?b.rate*(time-unlock)+(scenario==='no-ftc'?0:b.ftc):0);},0)+(time>=20?(owner==='us'?5:15)*500:0);
      assert.equal(result[owner==='us'?'usSeries':'themSeries'][time],expected,`${scenario} ${owner} at ${time}`);
    }
    assert.equal(result.phase1Us+result.phase2Us,result.us);assert.equal(result.phase1Them+result.phase2Them,result.them);
  }
});

test('All-building zero-delay reference total is 457200; tanks are one-off additions',()=>{
  const {run}=app();
  assert.equal(run("evaluateScenario({buildings:Object.fromEntries(BASE_BUILDINGS.map(b=>[b.id,{p1:b.phase===1?'us':'none',p2:'us',ftc:'auto',delay1:0,delay2:0}]))},{...state.config,phase2:15,captureDelay:0}).us"),457200);
});

test('Full names render in mission views and exports; old saved labels and imported aliases remain compatible',()=>{
  const {run,elements,ctx}=app();
  assert.equal(run("siteName('wtc1')"),'Water Treatment Center #1');
  for(const alias of ['WTC I','Water Treatment Center I','Water Treatment Center #1'])assert.equal(run(`resolveSite(${JSON.stringify(alias)})`),'wtc1');
  for(const alias of ['WPP IV','Water Processing Plant IV','Water Processing Plant #4'])assert.equal(run(`resolveSite(${JSON.stringify(alias)})`),'wpp4');
  run("state.explanations={'p1:T1':'WTC I: previous generated reason'};state=normalizeState(state)");assert.match(run("state.explanations['p1:T1']"),/^Water Treatment Center #1:/);
  run("switchTab('simulator')");assert.ok(elements.get('simTable').innerHTML.includes('Water Treatment Center #2'));assert.ok(!elements.get('simTable').innerHTML.includes('WTC II'));
  run("switchTab('battlefield')");assert.ok(elements.get('mapSvg').innerHTML.includes('Water Processing'));assert.ok(!elements.get('mapSvg').innerHTML.includes('WPP IV'));
  let text;ctx.download=(name,body)=>{text=body};ctx.exportOrders();assert.match(text,/Water Treatment Center/);assert.ok(!text.includes('WTC I'));
});

test('Capture-delay changes propagate to automatic scenarios without discarding custom timing',()=>{
  const {run}=app();run('state.sim.buildings.wtc1.delay1=2;updateSettings({captureDelay:0})');
  assert.equal(run('state.sim.buildings.central.delay2'),0);assert.equal(run('state.sim.buildings.wtc1.delay1'),2);assert.equal(run('state.sim.buildings.wtc1.delay2'),0);
});

test('Active special effects are shown without inventing water-production multipliers',()=>{
  const {run,elements}=app();
  run("state.sim.buildings=Object.fromEntries(BASE_BUILDINGS.map(b=>[b.id,{p1:b.phase===1?'us':'none',p2:'us',ftc:'auto',delay1:0,delay2:0}]));renderSimulator()");
  assert.match(elements.get('simBonuses').innerHTML,/Solar Power Station/);assert.match(elements.get('simBonuses').innerHTML,/Dev Compound/);assert.match(elements.get('simBonuses').innerHTML,/4 kata/);
  assert.equal(run("evaluateScenario({buildings:{munitions:{events:'15:us'},wtc1:{events:'0:us'}}},{...state.config,phase2:15,captureDelay:0}).us"),90000);
});

test('Reference timing is opt-in and preserves the commander default and manual locks',()=>{
  const {run}=app();assert.equal(run('BASE_CONFIG.phase2'),12);
  run("state.players[2].teamLock=true;state.targetLocks.p1.T1=true");const team=run('state.assign.p3.team'),target=run('state.targets.p1.T1');
  run('updateSettings({phase2:15,duration:60,waterStart:20,captureDelay:0})');
  assert.equal(run('state.config.phase2'),15);assert.equal(run('state.config.captureDelay'),0);assert.equal(run('state.assign.p3.team'),team);assert.equal(run('state.targets.p1.T1'),target);
});


test('Commander is optional, unique and independent, excluded from Killer selection and team power',()=>{
  const {run}=app();assert.equal(run('commanderPlayers().length'),0);
  run("state.players[0].rolePref='commander';state.players[0].roleLock=true;applyGenerated(generatePlan(),false)");
  assert.equal(run('commanderPlayers()[0].id'),'p1');assert.equal(run('getAssign(commanderPlayers()[0]).team'),'');
  assert.equal(run('killerPlayers().length'),2);assert.equal(run('teamsFrom().flatMap(t=>t.players).length'),27);
  assert.equal(run('teamsFrom().every(t=>t.holders.length>=2)'),true);
  const before=run('JSON.stringify(state)');run("state.players[1].rolePref='commander'");assert.throws(()=>run('generatePlan()'),/bir Commander/);
  run('state=JSON.parse('+JSON.stringify(before)+')');run('state.players[0].teamLock=true');assert.throws(()=>run('generatePlan()'),/Commander takım kilidi/);
});

test('Commander manual edits reject duplicates atomically and disable team assignment',()=>{
  const {run,elements}=app();
  run("handlePlayerChange({dataset:{player:'p1',field:'role'},value:'commander'})");assert.equal(run('state.assign.p1.role'),'commander');assert.equal(run('state.assign.p1.team'),'');
  const before=run('JSON.stringify(state)');run("handlePlayerChange({dataset:{player:'p2',field:'role'},value:'commander'})");assert.equal(run('JSON.stringify(state)'),before);
  run("switchTab('roster')");assert.match(elements.get('rosterTable').innerHTML,/Commander/);
  run("handlePlayerChange({dataset:{player:'p1',field:'team'},value:'T1'})");assert.equal(run('state.assign.p1.team'),'');
});

test('Commander import/export retains role and all CSV locations use full building names',()=>{
  const {ctx,run}=app();
  assert.equal(run("parseRosterRows(guessRows('Name;Power;Mission\\nKomutan;100;Commander'))[0].rolePref"),'commander');
  run("state.players[0].rolePref='commander';applyGenerated(generatePlan(),false)");let csv,orders;ctx.download=(name,text)=>{if(name.endsWith('.csv'))csv=text;else orders=text;};ctx.exportCSV();ctx.exportOrders();
  assert.match(csv,/Commander/);assert.match(csv,/Water Treatment Center/);assert.ok(!/"(?:wtc[12]|wpp[1-4]|solar|helipad|central|munitions|dev)"/.test(csv));assert.match(orders,/COMMANDER: Test Oyuncusu 01/);
  assert.equal(run('normalizeState(JSON.parse(JSON.stringify(state))).assign.p1.role'),'commander');
});

test('Legacy building aliases are normalized in preferences and throughout generated explanations',()=>{
  const {run}=app();run("state.players[0].phase1='WTC I';state.players[0].phase2='WPP IV';state.explanations={'p1:T1':'SOLAR: WTC II ve HELIPAD takviyesi'};state=normalizeState(state)");
  assert.equal(run('state.players[0].phase1'),'Water Treatment Center #1');assert.equal(run('state.players[0].phase2'),'Water Processing Plant #4');
  assert.equal(run("state.explanations['p1:T1']"),'Solar Power Station: Water Treatment Center #2 ve Abandoned Helipad takviyesi');
});

test('Every generated mode places the top three field players at Central Reservoir in Phase II',()=>{
  const {run}=app();
  for(const teams of [3,5,6,8])for(const mode of ['water','balanced','aggressive','defensive','fast']){
    run(`state.config.teams=${teams};state.players[0].rolePref='commander';state.players[0].roleLock=true;applyGenerated(generatePlan('${mode}'),false)`);
    assert.equal(run('planErrors(state).length'),0);
    assert.equal(run("selected().filter(p=>!independentRole(getAssign(p).role)).sort((a,b)=>b.power-a.power||a.id.localeCompare(b.id)).slice(0,3).every(p=>state.targets.p2[getAssign(p,2).team]==='central')"),true);
    assert.equal(run('teamsFrom(state.assignP2).flatMap(t=>t.players).length'),27);
    assert.equal(run('teamsFrom(state.assignP2).every(t=>t.holders.length>=state.config.holderMin)'),true);
  }
});

test('Phase-II rosters differ, roundtrip independently and migrate old plans without overwriting them',()=>{
  const {run}=app();assert.equal(run('selected().some(p=>getAssign(p).team!==getAssign(p,2).team)'),true);
  assert.equal(run('JSON.stringify(normalizeState(JSON.parse(JSON.stringify(state))))'),run('JSON.stringify(state)'));
  run('const legacy=deepcopy(state);legacy.version=2;delete legacy.assignP2;delete legacy.leadersP2;state=normalizeState(legacy)');
  assert.equal(run('JSON.stringify(state.assignP2)'),run('JSON.stringify(state.assign)'));
  assert.equal(run('state.assignP2===state.assign'),false);
  assert.equal(run("planErrors(state).some(e=>e.includes('Central Reservoir'))"),true);
});

test('Central concentration respects both team and target locks or rejects without mutation',()=>{
  const {run}=app();run("const top=selected().filter(p=>!independentRole(getAssign(p).role)).sort((a,b)=>b.power-a.power)[0];top.teamLock=true;state.targets.p2[getAssign(top).team]='solar';state.targetLocks.p2[getAssign(top).team]=true");
  const before=run('JSON.stringify(state)');assert.throws(()=>run('generatePlan()'),/takım kilidi.*hedef kilidi/);assert.equal(run('JSON.stringify(state)'),before);
  run('state.targetLocks.p2={};applyGenerated(generatePlan(),false)');assert.equal(run('planErrors(state).length'),0);
  assert.equal(run("selected().filter(p=>p.teamLock).every(p=>getAssign(p).team===getAssign(p,2).team)"),true);
});

test('Minimal Holder-only roster can split its top three over two Central teams',()=>{
  const {run}=app();run("state=normalizeState({players:testRoster.slice(0,18).map((p,i)=>({...p,status:'main',roleLock:true,rolePref:i<2?'killer':'holder'})),config:{teams:8}});applyGenerated(generatePlan(),false)");
  assert.equal(run('planErrors(state).length'),0);assert.equal(run('teamsFrom(state.assignP2).every(t=>t.holders.length===2)'),true);
  assert.ok(run("Object.values(state.targets.p2).filter(id=>id==='central').length")>=2);
});

test('Role locks are honored independently in both phase rosters',()=>{
  const {run}=app();run("for(const p of selected()){p.roleLock=true;p.rolePref=getAssign(p).role;}applyGenerated(generatePlan(),false)");
  assert.equal(run('planErrors(state).length'),0);assert.equal(run('selected().every(p=>getAssign(p,2).role===p.rolePref)'),true);
});

test('Team cards, comparisons and CSV use Phase-II members and powers rather than Phase-I members',()=>{
  const {ctx,run,elements}=app();run("currentPhase=2;switchTab('teams')");
  const plan=JSON.parse(run('JSON.stringify(state)'));
  for(const team of run('Array.from({length:state.config.teams},(_,i)=>teamId(i))')){
    const card=elements.get('teamCards').innerHTML.split(`aria-label="${team} takım planı"`)[1].split('</article>')[0];
    for(const p of plan.players.filter(p=>p.status==='main'&&plan.assignP2[p.id]?.team===team))assert.ok(card.includes(p.name));
  }
  let csv;ctx.download=(name,text)=>{csv=text};ctx.exportCSV();const rows=run('parseDelimited('+JSON.stringify(csv)+',\';\')');assert.equal(rows[0].at(-1),'Phase II Team');
  for(const p of plan.players.filter(p=>p.status==='main'&&!['commander','killer'].includes(plan.assign[p.id]?.role))){const row=rows.find(r=>r[0]===p.name);assert.equal(row.at(-1),plan.assignP2[p.id].team);assert.equal(row[10],plan.buildings.find(b=>b.id===plan.targets.p2[plan.assignP2[p.id].team]).name);}
  run("switchTab('compare')");assert.ok(elements.get('compareCards').innerHTML.includes('Faz II:'));
});

test('Substitute replacement transfers both phase assignments atomically',()=>{
  const {run,elements}=app();const old=run("selected().find(p=>getAssign(p).team!==getAssign(p,2).team&&p.power<160).id");
  const a1=run(`JSON.stringify(state.assign['${old}'])`),a2=run(`JSON.stringify(state.assignP2['${old}'])`);
  elements.get('replaceOut').value=old;elements.get('replaceIn').value='p31';run('replacePlayer()');
  assert.equal(run("JSON.stringify(state.assign.p31)"),a1);assert.equal(run("JSON.stringify(state.assignP2.p31)"),a2);assert.equal(run('planErrors(state).length'),0);
});

test('Battle Control and per-player transition orders follow actual Phase-II assignment',()=>{
  const {run}=app();run("state.battle.minute=state.config.phase2;state.battle.sites.central.owner='us';state.battle.disabled=[]");
  assert.equal(run("battleAssessment().warnings.some(t=>t.startsWith('Central Reservoir: garnizon riskli'))"),false);
  run("state.battle.disabled=selected().filter(p=>getAssign(p,2).role==='holder'&&state.targets.p2[getAssign(p,2).team]==='central').map(p=>p.id)");
  assert.equal(run("battleAssessment().warnings.some(t=>t.startsWith('Central Reservoir: garnizon riskli'))"),true);
  const move=run('selected().find(p=>getAssign(p).team!==getAssign(p,2).team).id');assert.match(run(`playerTransition(state.players.find(p=>p.id==='${move}'))`),/→ T[1-8] \/ /);
});


test('A different Commander in each phase is rejected and legacy leader picks migrate to both phases',()=>{
  const {run}=app();run("const legacy=deepcopy(state);legacy.version=2;delete legacy.assignP2;delete legacy.leadersP2;legacy.leaders={T1:selected().find(p=>getAssign(p).role==='holder'&&getAssign(p).team==='T1').id};state=normalizeState(legacy)");
  assert.equal(run('state.leaders.T1'),run('state.leadersP2.T1'));
  run("state.assign.p1={role:'commander',team:''};state.assignP2.p2={role:'commander',team:''}");assert.throws(()=>run('normalizeState(state)'),/bir Commander/);
});

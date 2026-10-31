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
  run("for(const role of ROLES){const p=selected().find(p=>getAssign(p).role===role);p.roleLock=true;p.rolePref=role;}");
  assert.equal(run("selected().filter(p=>p.roleLock).every(p=>generatePlan().assign[p.id].role===p.rolePref)"),true);
});

test('JSON migration and restoration preserve settings, locks, Unicode, notes and simulation', () => {
  const { run }=app();
  run("state.players[2].notes='مرحبا · notlar';state.players[2].teamLock=true;state.sim.tankEvents='23:biz:2';state.targetLocks.p2.T1=true;state.config.weights.special=2.5");
  assert.equal(run('JSON.stringify(normalizeState(JSON.parse(JSON.stringify(state))))'),run('JSON.stringify(state)'));
  assert.equal(run("normalizeState({players:state.players,version:1}).version"),2);
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

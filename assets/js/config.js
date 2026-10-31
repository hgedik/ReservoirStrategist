'use strict';
// RR Strategy Commander — independent offline planner for Tiles Survive!
// Source-model constants: alter/tiles-survive-calculator (alliance points).
const BASE_BUILDINGS=[
{id:'central',name:'Central Reservoir',short:'CENTRAL',rate:1800,ftc:9000,phase:2,x:300,y:207,bonus:'En yüksek sürekli su üretimi'},
{id:'wtc1',name:'Water Treatment Center I',short:'WTC I',rate:1200,ftc:6000,phase:1,x:100,y:268,bonus:'Yüksek su üretimi'},
{id:'wtc2',name:'Water Treatment Center II',short:'WTC II',rate:1200,ftc:6000,phase:1,x:503,y:131,bonus:'Yüksek su üretimi'},
{id:'wpp1',name:'Water Processing Plant I',short:'WPP I',rate:600,ftc:3000,phase:1,x:48,y:159,bonus:'Sürekli su üretimi'},
{id:'wpp2',name:'Water Processing Plant II',short:'WPP II',rate:600,ftc:3000,phase:1,x:556,y:40,bonus:'Sürekli su üretimi'},
{id:'wpp3',name:'Water Processing Plant III',short:'WPP III',rate:600,ftc:3000,phase:1,x:49,y:51,bonus:'Sürekli su üretimi'},
{id:'wpp4',name:'Water Processing Plant IV',short:'WPP IV',rate:600,ftc:3000,phase:1,x:548,y:310,bonus:'Sürekli su üretimi'},
{id:'solar',name:'Solar Power Station',short:'SOLAR',rate:240,ftc:1200,phase:1,x:182,y:73,bonus:'Bina kontrol süresini %50 azaltır'},
{id:'helipad',name:'Abandoned Helipad',short:'HELIPAD',rate:240,ftc:1200,phase:1,x:414,y:333,bonus:'Advanced Relocator bekleme süresini %50 azaltır'},
{id:'munitions',name:'Munitions Factory',short:'MUNITIONS',rate:240,ftc:1200,phase:2,x:425,y:205,bonus:'%15 saldırı ve %15 savunma (referans)'},
{id:'dev',name:'Dev Compound',short:'DEV',rate:240,ftc:1200,phase:2,x:183,y:331,bonus:'Enfekte dalgaları'}];
const TACTICS={balanced:{label:'Balanced Control',detail:'Arıtma merkezlerini güçlü takımlarla koru, Solar ve Helipad için ayrıca ekip ayır.',phase1:['wtc1','wtc2','solar','helipad','wpp1','wpp2','wpp3','wpp4'],phase2:['central','wtc1','wtc2','munitions','wpp1','wpp2','wpp3','wpp4'],extraCentral:false},aggressive:{label:'Aggressive Central',detail:'Güçlü birimlerle merkezi hedefle, ikinci merkez takımıyla baskı kur.',phase1:['solar','wtc1','wtc2','helipad','wpp1','wpp2','wpp3','wpp4'],phase2:['central','central','wtc1','wtc2','munitions','wpp1','wpp2','wpp3'],extraCentral:true},defensive:{label:'Defensive Water',detail:'WTC ve WPP sürekliliğini korumaya öncelik ver, merkeze tek güçlü ekip gönder.',phase1:['wtc1','wtc2','wpp1','wpp2','solar','helipad','wpp3','wpp4'],phase2:['wtc1','wtc2','central','wpp1','wpp2','wpp3','wpp4','munitions'],extraCentral:false},fast:{label:'Fast Capture',detail:'Solar ve Helipad avantajlarını öne çıkarıp ikincil WPP noktalarını hızlı kap.',phase1:['solar','helipad','wtc1','wtc2','wpp1','wpp2','wpp3','wpp4'],phase2:['central','wtc1','wtc2','wpp1','wpp2','munitions','wpp3','wpp4'],extraCentral:false}};
TACTICS.water={label:'Maximum Water',detail:'İlan edilen kontrol süreleri altında bina üretimi ve FTC toplamını öne çıkarır; savaş sonucu tahmini değildir.',phase1:[],phase2:[],extraCentral:false};
const ROLE_LABEL={killer:'Killer',holder:'Holder',support:'Support'};
const BASE_CONFIG={teams:6,killers:2,phase2:12,duration:60,waterStart:20,mainLimit:30,reserveLimit:10,holderMin:2,captureDelay:1,mode:'balanced',unassigned:'neutral',weights:{water:1,ftc:1,special:1,defense:1,transition:1,preference:1}};
const $=id=>document.getElementById(id);const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));const fmt=(x,d=0)=>Number(x||0).toLocaleString('tr-TR',{minimumFractionDigits:d,maximumFractionDigits:d});
const safe=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const num=x=>{if(typeof x==='number')return Number.isFinite(x)?x:0;let v=String(x??'').trim().replace(/\s/g,'').replace(/(m|million)$/i,'');if(!v)return 0;if(v.includes(',')&&v.includes('.'))v=v.lastIndexOf(',')>v.lastIndexOf('.')?v.replaceAll('.','').replace(',','.'):v.replaceAll(',','');else if(v.includes(','))v=v.replace(',','.');return Number(v)||0};
const deepcopy=o=>JSON.parse(JSON.stringify(o));

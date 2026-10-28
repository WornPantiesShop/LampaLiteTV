import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {webcrypto} from 'node:crypto';
const records=new Map(),updates=[];let menu,profile=0;
const ctx={location:{hostname:'lampa.mx'},crypto:webcrypto,Uint8Array,setTimeout,console,window:{appready:true},Lampa:{
 Player:{play:()=>{}},Storage:{get:()=> 'external'},Torserver:{toPlayUrl:u=>u},SettingsApi:{addParam:()=>{}},Controller:{enabled:()=>({name:'content'}),toggle:()=>{}},Select:{show:p=>menu=p},
 Timeline:{filename:()=>profile ? 'file_view_'+profile : 'file_view',view:(hash,meta)=>Object.assign({hash:String(hash),profile,time:0,duration:0,percent:0},meta,records.get(profile+':'+hash)),update:r=>{updates.push(r);records.set(profile+':'+r.hash,r);}}
}};ctx.window.Lampa=ctx.Lampa;vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../app/src/main/assets/player-selection.js',import.meta.url),'utf8'),ctx);
const state=ctx.window.__lampaLitePlayer;
function play(hash,url='https://example.com/rotating?token=private') { menu=null;ctx.Lampa.Player.play({url,title:'Test',timeline:{hash,profile}}); }
function take() {let id=new URL(ctx.location.href).searchParams.get('id');return {id,media:state.take(id)};}
play(101);let first=take();assert.equal(first.media.startMs,0);assert(!ctx.location.href.includes('private'));state.finish(first.id,false);
assert.deepEqual(Array.from(state.applyResults([{id:first.id,meta:first.media.timeline,positionMs:123000,durationMs:600000,completed:false}])),[first.id]);
assert.equal(updates.at(-1).time,123);assert.equal(updates.at(-1).duration,600);assert.equal(updates.at(-1).percent,21);
play(101,'https://example.com/new-token');assert(menu.items[0].title.includes('00:02:03'));menu.onSelect(menu.items[0]);assert.equal(take().media.startMs,123000);
play(101);menu.onSelect(menu.items[1]);assert.equal(take().media.startMs,0);assert.equal(records.get('0:101').time,123);
play(102);assert.equal(menu,null);assert.equal(take().media.startMs,0);
const before=updates.length;state.applyResults([{id:'a'.repeat(32),meta:{hash:'101',profile:0},positionMs:-10,durationMs:600000}]);assert.equal(updates.length,before);
state.applyResults([{id:'b'.repeat(32),meta:{hash:'101',profile:0},positionMs:0,durationMs:0,completed:true}]);assert.equal(updates.at(-1).percent,100);assert.equal(updates.at(-1).time,600);
play(101);assert.equal(menu,null); // Completed films start from the beginning.
const deferred={id:'c'.repeat(32),meta:{hash:'103',profile:7},positionMs:22000,durationMs:100000};assert.equal(state.applyResults([deferred]).length,0);
profile=7;assert.equal(state.applyResults([deferred]).length,1);assert.equal(records.get('7:103').time,22);assert.equal(records.has('0:103'),false);
assert.equal(state.applyResults([{id:'d'.repeat(32),meta:{hash:'0',profile:7},positionMs:100,durationMs:1000}]).length,0);
console.log('PASS returned milliseconds, native timeline, refreshed URLs, episode isolation, resume/restart, invalid results, completion, profile isolation');

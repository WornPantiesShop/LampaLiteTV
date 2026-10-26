import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
const source=readFileSync(new URL('../app/src/main/assets/default-extensions.js',import.meta.url),'utf8');
const plugins=[{url:'https://modss.tv/',status:0},{url:'https://existing.invalid/plugin',status:0}];
const storage=new Map();const loads=[];const context={location:{hostname:'lampa.mx'},window:{appready:true},console,Lampa:{Listener:{},Storage:{get:(k,d)=>storage.has(k)?storage.get(k):d,set:(k,v)=>storage.set(k,v)},Plugins:{get:()=>plugins,save:()=>{},push:p=>loads.push(p.url),add:p=>{plugins.push(p);loads.push(p.url)}}}};
context.window.Lampa=context.Lampa;vm.createContext(context);vm.runInContext(source,context);
assert.equal(plugins.length,5);assert.equal(plugins[0].status,1);assert.equal(plugins[1].status,0);assert.equal(loads.length,4);assert.equal(context.window.__lampaLiteExtensions.status,'installed');
plugins[0].status=0;plugins.splice(2,1);delete context.window.__lampaLiteExtensions;vm.runInContext(source,context);
assert.equal(plugins.length,4);assert.equal(plugins[0].status,0);assert.equal(loads.length,4);assert.equal(context.window.__lampaLiteExtensions.status,'already-configured');
console.log('PASS: no duplicates; unrelated plugin retained; later disable/removal respected');

// Startup can finish after the asset was injected; wait for Lampa's ready event.
storage.clear();plugins.length=0;loads.length=0;context.window.appready=false;
delete context.window.__lampaLiteExtensions;let onReady;
context.Lampa.Listener.follow=(name,callback)=>{assert.equal(name,'app');onReady=callback};
vm.runInContext(source,context);assert.equal(loads.length,0);assert.equal(context.window.__lampaLiteExtensions.status,'waiting-for-app');
onReady({type:'ready'});onReady({type:'ready'});assert.equal(plugins.length,4);assert.equal(loads.length,4);
console.log('PASS: delayed app readiness installs only once');

// Upgrade an existing profile without re-enabling any older manually disabled plugins.
storage.clear();storage.set('lampa_lite_extensions_seed_v1',true);
plugins.length=0;plugins.push({url:'https://modss.tv',status:0});loads.length=0;
context.window.appready=true;delete context.window.__lampaLiteExtensions;
vm.runInContext(source,context);assert.equal(plugins.length,2);assert.equal(plugins[0].status,0);
assert.equal(loads.length,1);assert.equal(plugins[1].url,'http://nb557.surge.sh/online_mod.js');
console.log('PASS: fourth extension migration preserves previous manual choices');

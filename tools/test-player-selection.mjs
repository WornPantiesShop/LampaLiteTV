import vm from 'node:vm'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; import {webcrypto} from 'node:crypto';
let mode='inner', played=0, menu, settings;
const ctx={location:{hostname:'lampa.mx'},crypto:webcrypto,Uint8Array,setTimeout,console,window:{appready:true},Lampa:{Player:{play:()=>++played},Storage:{get:()=>mode},Torserver:{toPlayUrl:u=>u},SettingsApi:{addParam:p=>settings=p},Controller:{enabled:()=>({name:'content'}),toggle:()=>{}},Select:{show:p=>menu=p}}}; ctx.window.Lampa=ctx.Lampa;
vm.createContext(ctx); vm.runInContext(readFileSync(new URL('../app/src/main/assets/player-selection.js', import.meta.url),'utf8'),ctx);
assert.equal(settings.component,'player'); ctx.Lampa.Player.play({url:'https://example.com/test.mp4'});assert.equal(played,1);
mode='ask'; ctx.Lampa.Player.play({url:'https://example.com/test.mp4'}); menu.onBack(); assert.equal(played,1);
menu.onSelect(menu.items[0]);assert.equal(played,2);
ctx.Lampa.Player.play({url:'https://example.com/test.mp4?token=secret'});menu.onSelect(menu.items[1]);
assert(!ctx.location.href.includes('secret'));const id=new URL(ctx.location.href).searchParams.get('id');assert.match(id,/^[a-f0-9]{32}$/);
assert(ctx.window.__lampaLitePlayer.take(id).url.includes('secret'));assert.equal(ctx.window.__lampaLitePlayer.take(id),null);
ctx.window.__lampaLitePlayer.finish(id,true);ctx.window.__lampaLitePlayer.finish(id,true);assert.equal(played,3);
mode='external';ctx.Lampa.Player.play({url:'javascript:alert(1)'});assert.equal(played,4);
console.log('PASS builtin, prompt/cancel, external, opaque one-shot request, fallback, non-http bypass');


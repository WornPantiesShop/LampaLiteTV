import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const ctx = {location:{hostname:'lampa.mx'},window:{appready:false,$:{}},Lampa:{Menu:{},Listener:{follow(){}}},WeakSet,Set,console,setTimeout};
ctx.window.Lampa=ctx.Lampa;vm.createContext(ctx);
vm.runInContext(readFileSync(new URL('../app/src/main/assets/menu-submenus.js',import.meta.url),'utf8'),ctx);
const s=ctx.window.__lampaLiteMenu;
assert.equal(s.catalog('cartoon','series').card_type,'tv');
assert.equal(s.catalog('cartoon','features').card_type,'movie');
assert(s.catalog('cartoon','series').url.includes('with_genres=16'));
assert(s.catalog('cartoon','features').url.includes('with_genres=16'));
for(const type of ['movie','tv']) {
 const ru=s.catalog(type,'russian'); assert.equal(ru.card_type,type);assert(ru.url.includes('with_original_language=ru'));
 const foreign=s.catalog(type,'foreign',['ru','en','ja','en']);assert(foreign.url.includes('with_original_language=en|ja'));assert(!foreign.url.includes('without_original_language'));
 assert.equal(s.catalog(type,'foreign',[]),null);
}
assert.equal(s.catalog('movie','series'),null);assert.equal(s.catalog('other','foreign'),null);
assert.deepEqual([...s.languageCodes([{iso_639_1:'ru'},{iso_639_1:'en'},{iso_639_1:'cn'},{iso_639_1:'en'},{iso_639_1:'../bad'},{},null].filter(Boolean))],['cn','en']);
assert.equal(s.back(),false);
console.log('PASS cartoon movie/TV routing, Russian/non-Russian filters, validated language list and invalid routes');

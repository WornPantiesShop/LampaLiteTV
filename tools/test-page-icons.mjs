import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
class Link {
 constructor(rel,href){this.rel=rel;this.href=href;}
 matches(s){return s==='link';}
 getAttribute(k){return k==='href'?this.href:this.rel;}
 setAttribute(k,v){this[k]=v;}
 removeAttribute(k){this[k]=null;}
}
const a=new Link('icon','/old.ico'), css=new Link('stylesheet','/app.css');
const nodes=[a,css];let notify,disconnected=false;
const context={location:{hostname:'lampa.mx'},window:{},document:{head:{querySelectorAll:()=>nodes}},MutationObserver:class{constructor(cb){notify=cb;}observe(){}disconnect(){disconnected=true;}}};
vm.runInNewContext(readFileSync('app/src/main/assets/page-icons.js','utf8'),context);
assert.ok(a.href.startsWith('data:image/png;'));assert.equal(css.href,'/app.css');
const late=new Link('shortcut icon','/late.png');nodes.push(late);
notify([{type:'childList',addedNodes:[{},late]}]);assert.equal(late.href,a.href);
a.href='/updated.ico';notify([{type:'attributes',target:a}]);assert.equal(a.href,late.href);
context.window.__lampaLitePageIcons.restore();assert.equal(a.href,'/updated.ico');assert.equal(late.href,'/late.png');assert.equal(css.href,'/app.css');assert.ok(disconnected);assert.equal(context.window.__lampaLitePageIcons,undefined);
console.log('PASS page icons: initial, late, replacement, stylesheet, restore');

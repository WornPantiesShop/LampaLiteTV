import vm from 'node:vm';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let now = 10000, filter, controller = 'content', starts = 0, stops = 0, cancelled = 0;
const controllers = {};
class Element {
    constructor() { this.style = {}; this.children = []; }
    appendChild(node) { this.children.push(node); }
    remove() { this.removed = true; }
}
const body = new Element();
const loading = {start() { starts++; controller = 'loading'; }, stop() { stops++; controller = 'content'; }};
const ctx = {location: {hostname: 'lampa.mx', href: 'http://lampa.mx'}, URL, Number, console,
    Date: class extends Date { static now() { return now; } }, setTimeout,
    document: {createElement: () => new Element(), body},
    window: {appready: true, addEventListener() {}},
    $: {ajaxPrefilter: callback => { filter = callback; }},
    Lampa: {Loading: loading, Torserver: {url: () => 'http://127.0.0.1:8090'}, Controller: {
        enabled: () => ({name: controller}), add: (name, item) => { controllers[name] = item; },
        toggle: name => { controller = name; }, clear() {}
    }}
};
ctx.window.Lampa = ctx.Lampa; ctx.window.$ = ctx.$;
vm.createContext(ctx);
const source = readFileSync(new URL('../app/src/main/assets/torrent-preflight.js', import.meta.url), 'utf8');
vm.runInContext(source, ctx);
const state = ctx.window.__lampaLitePreflight;
const media = {url: 'http://127.0.0.1:8090/stream/file.mkv?link=hash&index=1&preload', length: 1000000000, timeline: {duration: 1000}, title: '<b>Literal title</b>'};
assert.equal(state.requiredRate(media), 1000000);
assert.equal(state.requiredRate({...media, timeline: {duration: 0}}), 0);
let view = state.model(media, {preload_size: 100, preloaded_bytes: 40, download_speed: 100}, {count: 1, elapsedMs: 1000, stalledMs: 0, average: 100});
assert.equal(view.warning, ''); assert.equal(view.progress, 40);
view = state.model(media, {preload_size: 100, preloaded_bytes: 40}, {count: 4, elapsedMs: 6000, stalledMs: 0, average: 100});
assert(view.warning.includes('Скорость ниже'));
view = state.model(media, {preload_size: 100, preloaded_bytes: 100}, {count: 4, elapsedMs: 6000, stalledMs: 20000, average: 0});
assert.equal(view.warning, ''); assert.equal(view.ready, true);
view = state.model({}, {}, {count: 4, elapsedMs: 15000, stalledMs: 15000, average: 0});
assert(view.warning.includes('Данные не поступают')); assert.equal(view.progress, 0);
loading.start(() => { cancelled++; loading.stop(); }, '', {media});
assert.equal(starts, 1); assert.equal(controller, 'lampa_lite_preflight');
assert.equal(state.active.root.children[0].children[1].textContent, media.title);
const options = {url: media.url.replace('&preload', '&stat'), dataFilter: s => s}; filter(options);
assert.equal(typeof options.dataFilter, 'function');
const response = JSON.stringify({preload_size: 100, preloaded_bytes: 40, download_speed: 3000000, active_peers: 4});
assert.equal(options.dataFilter(response, 'json'), response);
assert.equal(state.active.bar.style.width, '40%');
assert.equal(options.dataFilter('not json'), 'not json');
const other = {url: media.url.replace('index=1', 'index=2')}; filter(other); assert.equal(other.dataFilter, undefined);
const oldSession = state.active;
controllers.lampa_lite_preflight.enter(); controllers.lampa_lite_preflight.enter();
assert.equal(cancelled, 1); assert.equal(stops, 1); assert.equal(state.active, null); assert(oldSession.root.removed);
options.dataFilter(response); assert.equal(state.active, null);
loading.start(() => {}, '', {media: {url: 'https://example.com/video.mp4'}});
assert.equal(state.active, null); assert.equal(starts, 2); loading.stop();
vm.runInContext(source, ctx); assert.equal(starts, 2);
console.log('PASS: rate/unknown/stall/ready, existing-request observation, response preservation, scoped matching, remote cancellation once, stale callbacks and normal loads');

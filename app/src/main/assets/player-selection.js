(() => {
'use strict';
if (location.hostname !== 'lampa.mx' || window.__lampaLitePlayer) return;
const pending = new Map(), sessions = new Map();
const validHash = hash => (typeof hash === 'string' || typeof hash === 'number') && /^[-\w:.]{1,128}$/.test(String(hash)) && String(hash) !== '0';
function metadata(timeline) {
 if (!timeline || !validHash(timeline.hash)) return null;
 const meta = {hash: String(timeline.hash), profile: Number(timeline.profile) || 0};
 if (typeof timeline.card === 'string' && /^[a-z0-9_]{1,64}$/.test(timeline.card)) meta.card = timeline.card;
 for (const key of ['season', 'episode']) if (Number.isInteger(timeline[key]) && timeline[key] >= 0) meta[key] = timeline[key];
 return meta;
}
function latest(timeline) {
 const meta = metadata(timeline);
 return meta && Lampa.Timeline?.view ? Lampa.Timeline.view(meta.hash, meta) : timeline;
}
const state = window.__lampaLitePlayer = {
 take(id) { const p = pending.get(id); if (!p || p.sent) return null; p.sent = true; return p.media; },
 finish(id, fallback) { const p = pending.get(id); if (!p) return; pending.delete(id); if (fallback) { sessions.delete(id); p.inner(); } },
 applyResults(results) {
  if (!window.appready || !Lampa.Timeline?.update || !Lampa.Timeline?.view || !Array.isArray(results)) return [];
  const acknowledged = [];
  for (const result of results) {
   if (!result || !/^[a-f0-9]{32}$/.test(result.id) || !validHash(result.meta?.hash)) continue;
   const meta = metadata(result.meta), current = Lampa.Timeline.view(meta.hash, meta);
   // Timeline files are profile-specific. Retain the native result until its profile is active.
   const filename = Lampa.Timeline.filename?.() || '';
   const profile = /^file_view_(\d+)$/.exec(filename);
   if (Number(meta.profile) !== Number(profile ? profile[1] : 0)) continue;
   let duration = Number(result.durationMs) / 1000;
   const position = Number(result.positionMs) / 1000;
   if (!Number.isFinite(duration) || duration < 0 || !Number.isFinite(position) || position < 0
       || (!result.completed && (duration <= 0 || position > duration + 60))) { acknowledged.push(result.id); continue; }
   if (result.completed && !duration) duration = Number(current.duration) || 0;
   const time = result.completed ? duration : Math.min(position, duration);
   const percent = result.completed ? 100 : Math.min(100, Math.round(time / duration * 100));
   const update = Object.assign({}, meta, {time, duration, percent});
   try {
    Lampa.Timeline.update(update);
    const timeline = sessions.get(result.id);
    if (timeline) Object.assign(timeline, update);
    sessions.delete(result.id); acknowledged.push(result.id);
   } catch (error) { console.warn('Lampa Lite: progress update deferred'); }
  }
  return acknowledged;
 }
};
function install() {
 if (state.active) return;
 state.active = true;
 Lampa.SettingsApi.addParam({component: 'player',
 param: {name: 'lampa_lite_player', type: 'select', default: 'inner', values: {inner: 'Встроенный Lampa', ask: 'Спрашивать перед запуском', external: 'Внешний Android-плеер'}},
 field: {name: 'Плеер Lampa Lite TV', description: 'Vimu возвращает позицию просмотра в Lampa. При повторном запуске можно продолжить или начать сначала.'}});
 const original = Lampa.Player.play;
 Lampa.Player.play = function(data) {
  const self = this, args = arguments, inner = () => original.apply(self, args);
  const mode = Lampa.Storage.get('lampa_lite_player', 'inner');
  if (!data || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url) || mode === 'inner') return inner();
  function external() {
   const timeline = latest(data.timeline), meta = metadata(timeline);
   function launch(startMs) {
    const id = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
    if (meta) { sessions.set(id, data.timeline); if (sessions.size > 8) sessions.delete(sessions.keys().next().value); }
    pending.set(id, {inner, media: {url: Lampa.Torserver.toPlayUrl(data.url), title: String(data.title || ''), startMs, timeline: meta}});
    location.href = 'lampalite://player-request?id=' + id;
   }
   const time = Number(timeline?.time), duration = Number(timeline?.duration);
   if (meta && time >= 10 && Number(timeline.percent) < 95 && (!duration || time < duration - 5)) {
    const controller = Lampa.Controller.enabled().name;
    const seconds = Math.floor(time), label = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60].map(n => String(n).padStart(2, '0')).join(':');
    Lampa.Select.show({title: 'Продолжить просмотр?', items: [{title: 'Продолжить с ' + label, resume: true}, {title: 'С начала'}],
     onSelect(item) { Lampa.Controller.toggle(controller); launch(item.resume ? Math.min(2147483647, Math.round(time * 1000)) : 0); },
     onBack() { Lampa.Controller.toggle(controller); }});
   } else launch(0);
  }
  if (mode === 'external') return external();
  const controller = Lampa.Controller.enabled().name;
  Lampa.Select.show({title: 'Выберите плеер', items: [{title: 'Встроенный Lampa', inner: true}, {title: 'Внешний Android-плеер'}],
   onSelect(item) { Lampa.Controller.toggle(controller); item.inner ? inner() : external(); },
   onBack() { Lampa.Controller.toggle(controller); }});
 };
}
let tries = 0;
function ready() {
 if (window.Lampa?.Player?.play && Lampa.SettingsApi) {
  if (window.appready) install(); else Lampa.Listener.follow('app', e => { if (e.type === 'ready') install(); });
 } else if (++tries < 240) setTimeout(ready, 500);
}
ready();
})();

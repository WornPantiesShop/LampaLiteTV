(() => {
'use strict';
if (location.hostname !== 'lampa.mx' || window.__lampaLitePlayer) return;
const pending = new Map();
const state = window.__lampaLitePlayer = {
 take(id) { const p = pending.get(id); if (!p || p.sent) return null; p.sent = true; return p.media; },
 finish(id, fallback) { const p = pending.get(id); if (!p) return; pending.delete(id); if (fallback) p.inner(); }
};
function install() {
 if (state.active) return;
 state.active = true;
 Lampa.SettingsApi.addParam({component: 'player',
 param: {name: 'lampa_lite_player', type: 'select', default: 'inner', values: {inner: 'Встроенный Lampa', ask: 'Спрашивать перед запуском', external: 'Внешний Android-плеер'}},
 field: {name: 'Плеер Lampa Lite TV', description: 'Внешний плеер выбирается из установленных на телевизоре. Для серий и сохранения прогресса используйте встроенный.'}});
 const original = Lampa.Player.play;
 Lampa.Player.play = function(data) {
  const self = this, args = arguments, inner = () => original.apply(self, args);
  const mode = Lampa.Storage.get('lampa_lite_player', 'inner');
  if (!data || typeof data.url !== 'string' || !/^https?:\/\//i.test(data.url) || mode === 'inner') return inner();
  function external() {
   const id = [...crypto.getRandomValues(new Uint8Array(16))].map(v => v.toString(16).padStart(2, '0')).join('');
   pending.set(id, {inner, media: {url: Lampa.Torserver.toPlayUrl(data.url), title: String(data.title || '')}});
   location.href = 'lampalite://player-request?id=' + id;
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

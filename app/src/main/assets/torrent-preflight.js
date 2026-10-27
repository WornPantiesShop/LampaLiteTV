(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLitePreflight) return;
    const state = window.__lampaLitePreflight = {active: null, installed: false};
    const number = v => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : 0;
    const mib = v => (v / 1048576).toFixed(1);
    const mbps = v => (v * 8 / 1000000).toFixed(1);
    function requiredRate(media) {
        const duration = number(media.timeline?.duration) || number(media.card?.runtime) * 60;
        return duration >= 10 && duration <= 86400 ? number(media.length) / duration : 0;
    }
    function model(media, stats, sample) {
        const loaded = number(stats.preloaded_bytes), target = number(stats.preload_size);
        const progress = target ? Math.min(100, loaded / target * 100) : 0;
        const peers = number(stats.active_peers), speed = number(stats.download_speed);
        const required = requiredRate(media);
        const ready = target > 0 && progress >= 95;
        let phase = ready ? 'Буфер готов' : peers || loaded ? 'Заполнение буфера' : 'Подключение к сидам';
        let warning = '';
        if (!ready && sample.stalledMs >= 10000) {
            phase = 'Ожидание данных от раздачи';
            warning = 'Данные не поступают. Можно подождать или отменить загрузку и выбрать другую раздачу.';
        } else if (!ready && required && sample.count >= 3 && sample.elapsedMs >= 5000 && sample.average < required * 1.2) {
            warning = sample.average < required
                ? 'Скорость ниже среднего потока файла — при просмотре возможны паузы.'
                : 'Запас скорости небольшой — при просмотре возможны паузы.';
        }
        return {phase, warning, progress, loaded, target, peers, speed, required, ready};
    }
    state.cancel = () => { if (!state.active) return false; state.active.cancel(); return true; };
    state.model = model;
    state.requiredRate = requiredRate;
    function stream(media) {
        try {
            const url = new URL(media?.url);
            const server = new URL(Lampa.Torserver.url());
            return url.origin === server.origin && url.pathname.startsWith('/stream/')
                && url.searchParams.has('link') && url.searchParams.has('index')
                && url.searchParams.has('preload') ? url : null;
        } catch (_) { return null; }
    }
    function cleanup() {
        if (!state.active) return;
        state.active.root.remove();
        state.active = null;
    }
    function render(session, stats) {
        if (state.active !== session) return;
        const now = Date.now(), loaded = number(stats.preloaded_bytes);
        if (loaded > session.lastBytes) { session.lastBytes = loaded; session.lastChange = now; }
        const speed = number(stats.download_speed);
        session.average = session.count ? session.average * 0.65 + speed * 0.35 : speed;
        session.count++;
        const view = model(session.media, stats, {count: session.count, elapsedMs: now - session.started,
            stalledMs: now - session.lastChange, average: session.average});
        session.phase.textContent = view.phase;
        session.speed.textContent = 'Скорость: ' + mbps(view.speed) + ' Мбит/с';
        session.peers.textContent = 'Подключено пиров: ' + view.peers + ' · Сидов: ' + number(stats.connected_seeders);
        session.buffer.textContent = view.target
            ? 'Буфер: ' + mib(view.loaded) + ' / ' + mib(view.target) + ' МиБ · ' + Math.round(view.progress) + '%'
            : 'Буфер: ' + mib(view.loaded) + ' МиБ · уточняем размер';
        session.bar.style.width = view.progress + '%';
        session.estimate.textContent = view.required
            ? 'Средний поток файла ≈ ' + mbps(view.required) + ' Мбит/с. Оценка по размеру и длительности; пики могут быть выше.'
            : 'Битрейт неизвестен: по одной скорости нельзя гарантировать просмотр без пауз.';
        session.warning.textContent = view.warning;
        if (Lampa.Controller.enabled().name !== 'lampa_lite_preflight') Lampa.Controller.toggle('lampa_lite_preflight');
    }
    function panel(media, url, onCancel, previousController) {
        const root = document.createElement('div');
        root.id = 'lampa-lite-preflight';
        root.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(12,15,20,.98);color:#fff;display:flex;align-items:center;justify-content:center;font:' + Math.max(14, Math.min(24, number(window.innerHeight) * 0.026 || 18)) + 'px/1.4 sans-serif;';
        const box = document.createElement('div');
        box.style.cssText = 'width:80%;max-width:1200px;max-height:96vh;overflow:auto;padding:2vh 2vw;box-sizing:border-box;';
        root.appendChild(box);
        const add = (tag, css) => { const e = document.createElement(tag); e.style.cssText = css || ''; box.appendChild(e); return e; };
        add('div', 'color:#aab7c9;font-size:.83em;margin-bottom:.4em;').textContent = 'ПРОВЕРКА РАЗДАЧИ';
        const title = add('div', 'font-size:1.25em;max-height:3em;overflow:hidden;margin-bottom:.7em;');
        title.textContent = String(media.title || 'Подготовка видео');
        const phase = add('div', 'font-size:1.55em;margin-bottom:.4em;');
        phase.textContent = 'Подключение к сидам';
        const speed = add('div'), peers = add('div'), buffer = add('div');
        const track = add('div', 'height:.4em;background:#353f4e;border-radius:8px;margin:.7em 0;overflow:hidden;');
        const bar = document.createElement('div'); bar.style.cssText = 'width:0;height:100%;background:#74bfff;'; track.appendChild(bar);
        const estimate = add('div', 'font-size:.85em;color:#b7c3d4;');
        const warning = add('div', 'min-height:2.9em;color:#ffcc80;font-size:.92em;margin-top:.5em;');
        add('div', 'font-size:.85em;color:#b7c3d4;margin-bottom:.7em;').textContent = 'После заполнения буфера откроется выбранный плеер.';
        const button = add('button', 'font:inherit;border:2px solid #fff;border-radius:.5em;padding:.55em 1em;background:#fff;color:#111;');
        button.textContent = 'Отменить загрузку';
        const session = {root, media, url, phase, speed, peers, buffer, bar, estimate, warning, count: 0,
            average: 0, started: Date.now(), lastChange: Date.now(), lastBytes: 0, previousController};
        state.active = session;
        const cancel = () => {
            if (state.active !== session || session.cancelled) return;
            session.cancelled = true;
            try { if (typeof onCancel === 'function') onCancel(); }
            finally { if (state.active === session) Lampa.Loading.stop(); }
        };
        session.cancel = cancel;
        button.onclick = e => { e.stopPropagation(); cancel(); };
        document.body.appendChild(root);
        Lampa.Controller.add('lampa_lite_preflight', {
            toggle() { Lampa.Controller.clear(); }, enter: cancel, back: cancel,
            up() {}, down() {}, left() {}, right() {}
        });
        Lampa.Controller.toggle('lampa_lite_preflight');
        render(session, {});
    }
    function install() {
        if (state.installed) return;
        state.installed = true;
        const loading = Lampa.Loading, start = loading.start, stop = loading.stop;
        loading.start = function(onCancel, text, options) {
            if (state.active) {
                const controller = state.active.previousController;
                cleanup();
                Lampa.Controller.toggle(controller);
            }
            const previousController = Lampa.Controller.enabled().name;
            const result = start.apply(this, arguments);
            const url = stream(options?.media);
            if (url) panel(options.media, url, onCancel, previousController);
            return result;
        };
        loading.stop = function() { cleanup(); return stop.apply(this, arguments); };
        // Observe the existing prefetch response before Lampa decides to launch.
        // Never add a second stream, poller, preload request or global animation override.
        $.ajaxPrefilter((options) => {
            const session = state.active;
            if (!session) return;
            let url;
            try { url = new URL(options.url, location.href); } catch (_) { return; }
            if (url.origin !== session.url.origin || url.pathname !== session.url.pathname
                || url.searchParams.get('link') !== session.url.searchParams.get('link')
                || url.searchParams.get('index') !== session.url.searchParams.get('index')
                || !(url.searchParams.has('preload') || url.searchParams.has('stat'))) return;
            const filter = options.dataFilter;
            options.dataFilter = function(data, type) {
                const result = filter ? filter.apply(this, arguments) : data;
                try { render(session, typeof result === 'string' ? JSON.parse(result) : result); } catch (_) { /* keep the original response */ }
                return result;
            };
        });
        window.addEventListener('pagehide', () => { if (state.active) state.active.cancel(); });
    }
    let tries = 0;
    function ready() {
        if (window.Lampa?.Loading && Lampa.Torserver && window.$?.ajaxPrefilter) {
            if (window.appready) install();
            else Lampa.Listener.follow('app', e => { if (e.type === 'ready') install(); });
        } else if (++tries < 240) setTimeout(ready, 500);
    }
    ready();
})();

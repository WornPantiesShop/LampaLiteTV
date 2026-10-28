(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteRezkaTransport) return;
    const requests = new Map();
    const state = {requests: 0, cancelled: 0, timedOut: 0};
    window.__lampaLiteRezkaTransport = state;
    state.take = id => {
        const request = requests.get(id);
        if (!request || request.started) return null;
        request.started = true;
        return request.data;
    };
    state.stats = () => ({active: requests.size, inFlight: [...requests.values()].filter(r => r.started).length, requests: state.requests, cancelled: state.cancelled, timedOut: state.timedOut});
    function cancel(id) {
        const request = requests.get(id);
        if (!request) return null;
        clearTimeout(request.timer);
        requests.delete(id);
        state.cancelled++;
        if (request.started) location.href = 'lampalite://rezka-cancel?id=' + id;
        return request;
    }
    state.finish = (id, result) => {
        const request = requests.get(id);
        if (!request) return;
        requests.delete(id);
        clearTimeout(request.timer);
        if (new URL(request.data.url).pathname === '/ajax/login/' && result.status === 200) {
            try {
                const json = JSON.parse(result.body);
                if (json.success || json.message === 'Уже авторизован на сайте. Необходимо обновить страницу!') {
                    if (result.cookies) {
                        Lampa.Storage.set('online_mod_rezka2_cookie', result.cookies);
                        const field = $('[data-name=online_mod_rezka2_cookie]');
                        if (field.length) Lampa.Params.update(field, [], null);
                    }
                }
            } catch (_) { }
        }
        request.complete(result.status || 502, '', {text: result.body || ''}, 'Content-Type: text/plain; charset=utf-8');
    };
    function addCookieFields() {
        const params = Lampa.SettingsApi.getParam('online_mod_rezka2');
        if (!params || params.some(p => p.param?.name === 'online_mod_rezka2_cookie')) return;
        Lampa.SettingsApi.addParam({component: 'online_mod_rezka2', param: {name: 'online_mod_rezka2_cookie', type: 'input', values: '', default: ''}, field: {name: 'Куки для HDrezka'}});
        Lampa.SettingsApi.addParam({component: 'online_mod_rezka2', param: {name: 'lampa_lite_rezka_fill_cookie', type: 'button'}, field: {name: 'Заполнить куки для HDrezka'}, onChange: () => {
            const login = Lampa.SettingsApi.getParam('online_mod_rezka2').find(p => p.param?.name === 'online_mod_rezka2_login');
            if (login?.onChange) login.onChange();
        }});
        if (document.querySelector('.settings__body [data-name=online_mod_rezka2_name]')) {
            setTimeout(() => {
                if (document.querySelector('.settings__body [data-name=online_mod_rezka2_name]')) Lampa.Settings.update();
            }, 0);
        }
    }
    let attempts = 0;
    function ready() {
        if (!window.Lampa?.SettingsApi || !window.jQuery?.ajaxTransport) {
            if (++attempts < 240) setTimeout(ready, 500);
            return;
        }
        $.ajaxTransport('+*', options => {
            let url;
            try { url = new URL(options.url, location.href); } catch (_) { return; }
            if (url.protocol !== 'https:' || url.username || url.password || url.port
                    || !['kvk.zone', 'rezka.ag'].includes(url.hostname)) return;
            let id;
            return {
                send: (headers, complete) => {
                    if (requests.size >= 16) { complete(429, ''); return; }
                    const bytes = new Uint8Array(16); crypto.getRandomValues(bytes);
                    id = [...bytes].map(b => b.toString(16).padStart(2, '0')).join('');
                    requests.set(id, {data: {url: url.href, method: (options.type || 'GET').toUpperCase(), body: typeof options.data === 'string' ? options.data : '', headers: {...headers, 'User-Agent': navigator.userAgent, 'Cookie': Lampa.Storage.get('online_mod_rezka2_cookie', '')}}, complete});
                    const request = requests.get(id);
                    request.timer = setTimeout(() => {
                        const expired = cancel(id);
                        if (expired) { state.timedOut++; expired.complete(504, '', {text: ''}, 'Content-Type: text/plain; charset=utf-8'); }
                    }, 25000);
                    state.requests++;
                    // Only an opaque ID enters the URL; credentials stay in memory.
                    location.href = 'lampalite://rezka-request?id=' + id;
                },
                abort: () => {
                    cancel(id);
                }
            };
        });
        addCookieFields();
        Lampa.Settings.listener.follow('open', addCookieFields);
        Lampa.Listener.follow('app', event => { if (event.type === 'ready') addCookieFields(); });
    }
    ready();
})();

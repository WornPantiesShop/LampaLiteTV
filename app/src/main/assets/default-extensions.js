(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteExtensions) return;
    const state = {status: 'waiting', attempts: 0};
    window.__lampaLiteExtensions = state;
    const marker = 'lampa_lite_extensions_seed_v1';
    const defaults = [
        {url: 'https://modss.tv', name: "MODS's", status: 1},
        {url: 'http://bwa.ad/rc', status: 1},
        {url: 'https://gpbx.me/w', status: 1}
    ];

    function install() {
        if (state.status === 'installed' || state.status === 'already-configured') return;
        try {
            if (Lampa.Storage.get(marker, false)) {
                state.status = 'already-configured';
                return;
            }
            for (const entry of defaults) {
                const existing = Lampa.Plugins.get().find(plugin =>
                    String(plugin.url).replace(/\/$/, '') === entry.url);
                if (existing) {
                    if (existing.status !== 1) {
                        existing.status = 1;
                        Lampa.Plugins.save();
                    }
                    Lampa.Plugins.push(existing);
                } else {
                    Lampa.Plugins.add(Object.assign({}, entry));
                }
            }
            // Respect later removal/disable: never re-seed a configured profile.
            Lampa.Storage.set(marker, true);
            state.status = 'installed';
        } catch (error) {
            state.status = 'error';
            console.warn('Lampa Lite: extension setup failed', error);
        }
    }

    function ready() {
        if (window.Lampa && Lampa.Plugins && Lampa.Storage && Lampa.Listener) {
            if (window.appready) install();
            else {
                state.status = 'waiting-for-app';
                Lampa.Listener.follow('app', event => { if (event.type === 'ready') install(); });
            }
        } else if (++state.attempts < 240) {
            setTimeout(ready, 500);
        } else state.status = 'unavailable';
    }
    ready();
})();

(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteExtensions) return;
    const state = {status: 'waiting', attempts: 0};
    window.__lampaLiteExtensions = state;
    const onlineModUrls = ['http://nb557.surge.ch/online_mod.js', 'http://nb557.surge.sh/online_mod.js'];
    const migrations = [{marker: 'lampa_lite_extensions_seed_v1', plugins: [
        {url: 'https://modss.tv', name: "MODS's", status: 1},
        {url: 'http://bwa.ad/rc', status: 1},
        {url: 'https://gpbx.me/w', status: 1}
    ]}, {marker: 'lampa_lite_online_mod_seed_v2', plugins: [
        {url: onlineModUrls[0], name: 'Online Mod', status: 1}
    ]}];

    function normalizeUrl(value) {
        return String(value || '').replace(/\/$/, '').toLowerCase();
    }

    function install() {
        if (state.status === 'installed' || state.status === 'already-configured') return;
        try {
            let changed = false;
            for (const migration of migrations) {
                if (Lampa.Storage.get(migration.marker, false)) continue;
                for (const entry of migration.plugins) {
                    const existing = Lampa.Plugins.get().find(plugin => {
                        const url = normalizeUrl(plugin.url);
                        return url === normalizeUrl(entry.url)
                            || (plugin.name === 'Online Mod' && onlineModUrls.some(candidate => url === normalizeUrl(candidate)));
                    });
                    if (existing) {
                        if (pluginNeedsMigration(existing, entry)) {
                            existing.url = entry.url;
                            existing.name = entry.name || existing.name || 'Online Mod';
                            existing.status = 1;
                            Lampa.Plugins.save();
                            changed = true;
                        }
                        if (existing.status !== 1) {
                            existing.status = 1;
                            Lampa.Plugins.save();
                        }
                        Lampa.Plugins.push(existing);
                    } else {
                        Lampa.Plugins.add(Object.assign({}, entry));
                        changed = true;
                    }
                }
                Lampa.Storage.set(migration.marker, true);
                changed = true;
            }
            state.status = changed ? 'installed' : 'already-configured';
        } catch (error) {
            state.status = 'error';
            console.warn('Lampa Lite: extension setup failed', error);
        }
    }

    function pluginNeedsMigration(plugin, entry) {
        if (!plugin || !entry) return false;
        const pluginUrl = normalizeUrl(plugin.url);
        const entryUrl = normalizeUrl(entry.url);
        if (plugin.name === 'Online Mod' && pluginUrl !== entryUrl) return true;
        return pluginUrl === normalizeUrl('http://nb557.surge.sh/online_mod.js') && entryUrl === normalizeUrl('http://nb557.surge.ch/online_mod.js');
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

(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteMenu) return;
    const groups = {
        cartoon: {title: 'Мультфильмы', items: [{title: 'Мультсериалы', key: 'series'}, {title: 'Полнометражные', key: 'features'}]},
        tv: {title: 'Сериалы', items: [{title: 'Русские', key: 'russian'}, {title: 'Зарубежные', key: 'foreign'}]},
        movie: {title: 'Фильмы', items: [{title: 'Русские', key: 'russian'}, {title: 'Зарубежные', key: 'foreign'}]}
    };
    const state = window.__lampaLiteMenu = {root: null, parent: null, children: false, index: 0, blocked: null, pending: null};
    const patched = new WeakSet();
    function languageCodes(rows) {
        return [...new Set((Array.isArray(rows) ? rows : []).map(x => x?.iso_639_1)
            .filter(x => typeof x === 'string' && /^[a-z]{2,3}$/.test(x) && x !== 'ru'))].sort();
    }
    function catalog(action, key, languages) {
        if (!groups[action]?.items.some(x => x.key === key)) return null;
        const type = action === 'cartoon' ? (key === 'series' ? 'tv' : 'movie') : action;
        let filter;
        if (action === 'cartoon') filter = 'with_genres=16';
        else if (key === 'russian') filter = 'with_original_language=ru';
        else {
            const codes = languageCodes((languages || []).map(iso_639_1 => ({iso_639_1})));
            if (!codes.length) return null;
            filter = 'with_original_language=' + codes.join('|');
        }
        const item = groups[action].items.find(x => x.key === key);
        return {title: groups[action].title + ' — ' + item.title, url: 'discover/' + type + '?' + filter + '&sort_by=popularity.desc',
            component: 'category_full', source: 'tmdb', page: 1, card_type: type};
    }
    state.catalog = catalog;
    state.languageCodes = languageCodes;
    function hide() {
        state.root?.remove();
        state.root = null; state.parent = null; state.children = false; state.buttons = [];
    }
    function restoreParent() {
        const parent = state.parent;
        if (!parent) return;
        state.blocked = parent;
        hide();
        const menu = $(parent).closest('.menu');
        Lampa.Controller.collectionSet(menu);
        Lampa.Controller.collectionFocus(parent, menu, true);
    }
    state.back = () => {
        if (state.pending) { state.pending.cancel(); return true; }
        if (!state.root) return false;
        restoreParent(); return true;
    };
    function paint() {
        state.buttons.forEach((button, index) => {
            const selected = state.children && state.index === index;
            button.style.background = selected ? '#ffffff18' : 'transparent';
            button.style.borderColor = selected ? '#ffffff90' : 'transparent';
            button.style.color = '#fff';
        });
    }
    function focus(index) {
        if (!state.root) return;
        state.index = Math.max(0, Math.min(state.buttons.length - 1, index));
        Lampa.Controller.collectionFocus(state.buttons[state.index], $(state.root), true);
        paint();
    }
    function enter() {
        if (!state.root) return;
        state.children = true;
        Lampa.Controller.collectionSet($(state.root));
        focus(0);
    }
    function choose(action, key) {
        hide(); state.blocked = null;
        Lampa.Controller.toggle('content');
        if (key !== 'foreign') { Lampa.Activity.push(catalog(action, key)); return; }
        if (state.languages) { Lampa.Activity.push(catalog(action, key, state.languages)); return; }
        const token = {cancel() {
            if (state.pending !== token) return;
            state.pending = null; Lampa.Loading.stop();
        }};
        state.pending = token;
        Lampa.Loading.start(token.cancel, 'Подготовка зарубежного каталога');
        Lampa.Api.sources.tmdb.get('configuration/languages', {}, rows => {
            if (state.pending !== token) return;
            state.pending = null; Lampa.Loading.stop();
            const codes = languageCodes(rows);
            const descriptor = catalog(action, key, codes);
            if (descriptor) { state.languages = codes; Lampa.Activity.push(descriptor); }
            else Lampa.Noty.show('Не удалось получить языки каталога. Повторите выбор.');
        }, () => {
            if (state.pending !== token) return;
            state.pending = null; Lampa.Loading.stop();
            Lampa.Noty.show('Каталог недоступен. Повторите выбор.');
        }, {life: 60 * 24 * 7});
    }
    function patch(controller) {
        if (patched.has(controller)) return;
        patched.add(controller);
        for (const direction of ['up', 'down', 'right', 'left', 'gone']) {
            const original = controller[direction];
            controller[direction] = function() {
                if (direction === 'right' && !state.root && state.blocked) { show(state.blocked, true); enter(); return; }
                if (direction === 'gone') hide();
                else if (state.root) {
                    if (direction === 'right') { if (state.children) choose(state.action, state.keys[state.index]); else enter(); return; }
                    if (direction === 'left') { restoreParent(); return; }
                    if (state.children) { focus(state.index + (direction === 'up' ? -1 : 1)); return; }
                }
                if (original) return original.apply(this, arguments);
            };
        }
    }
    function show(parent, force) {
        const action = parent.getAttribute('data-action');
        if (!groups[action]) { state.blocked = null; hide(); return; }
        const enabled = Lampa.Controller.enabled();
        if (enabled.name !== 'menu') return;
        patch(enabled.controller);
        if (!force && state.blocked === parent) return;
        state.blocked = null;
        if (state.parent === parent && state.root) return;
        hide(); state.parent = parent; state.action = action; state.keys = groups[action].items.map(x => x.key);
        const root = document.createElement('div'); state.root = root;
        root.id = 'lampa-lite-menu-submenu';
        root.style.cssText = 'position:fixed;z-index:2147482000;background:#202223;color:white;border:1px solid #ffffff18;border-radius:6px;padding:6px;box-sizing:border-box;box-shadow:0 4px 14px #0005;line-height:1.4;';
        const menuStyle = getComputedStyle(parent.querySelector('.menu__text') || parent);
        root.style.fontSize = menuStyle.fontSize;
        root.style.fontFamily = menuStyle.fontFamily;
        state.buttons = groups[action].items.map((item, index) => {
            const button = document.createElement('button'); button.type = 'button'; button.className = 'selector';
            button.textContent = item.title;
            button.style.cssText = 'display:block;width:100%;border:1px solid transparent;border-radius:4px;font:inherit;line-height:1.35;text-align:left;padding:.5em .7em;margin:2px 0;background:transparent;color:white;';
            const activate = () => { if (state.root === root) choose(action, item.key); };
            $(button).on('hover:enter', activate).on('hover:focus', () => { state.index = index; paint(); });
            button.onclick = e => { e.stopPropagation(); activate(); };
            button.onmouseenter = () => { if (!state.children) enter(); focus(index); };
            root.appendChild(button); return button;
        });
        root.onmousedown = e => e.stopPropagation();
        document.body.appendChild(root);
        function position() {
            if (state.root !== root) return;
            const rect = parent.getBoundingClientRect();
            const width = Math.min(230, Math.max(180, rect.width * 1.15));
            root.style.width = width + 'px';
            root.style.left = Math.max(8, Math.min(window.innerWidth - width - 8, rect.right + 4)) + 'px';
            root.style.top = Math.max(8, Math.min(window.innerHeight - root.offsetHeight - 8, rect.top)) + 'px';
        }
        position(); requestAnimationFrame(position);
    }
    function install() {
        if (state.installed) return;
        state.installed = true;
        // Lampa dispatches non-bubbling focus events: listen in capture phase.
        const hover = event => {
            const parent = event.target.closest?.('.menu__item');
            if (parent) show(parent);
        };
        document.addEventListener('hover:focus', hover, true);
        document.addEventListener('hover:hover', hover, true);
        Lampa.Listener.follow('menu', event => {
            if (event.type === 'action' && groups[event.action]) {
                event.abort(); show(event.target, true); enter();
            }
        });
        window.addEventListener('pagehide', () => { hide(); if (state.pending) state.pending.cancel(); });
    }
    let tries = 0;
    function ready() {
        if (window.Lampa?.Menu && Lampa.Listener && window.$) {
            if (window.appready) install();
            else Lampa.Listener.follow('app', e => { if (e.type === 'ready') install(); });
        } else if (++tries < 240) setTimeout(ready, 500);
    }
    ready();
})();

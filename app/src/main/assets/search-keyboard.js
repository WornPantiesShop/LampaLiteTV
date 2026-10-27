(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteSearchKeyboard) return;
    const state = window.__lampaLiteSearchKeyboard = {dock: null};
    const patched = new WeakSet();
    let keypad, marker, observer, returnKey;
    function patchController() {
        const active = Lampa.Controller.enabled();
        if (!state.dock || active.name !== 'keybord' || patched.has(active.controller)) return;
        const controller = active.controller;
        const up = controller.up, down = controller.down;
        patched.add(controller);
        controller.up = function () {
            if (Navigator.canmove('up')) return up.apply(this, arguments);
            const keys = [...keypad.querySelectorAll('.hg-button')];
            returnKey = keypad.querySelector('.focus') || keys[0];
            const last = keys[keys.length - 1];
            if (last) {
                Lampa.Controller.collectionFocus(last, $(keypad), true);
                down.call(this);
            }
        };
        controller.down = function () {
            if (Navigator.canmove('down')) return down.apply(this, arguments);
        };
        if (returnKey?.isConnected) {
            Lampa.Controller.collectionFocus(returnKey, $(keypad), true);
            returnKey = null;
        }
    }
    function unmount() {
        observer?.disconnect(); observer = null;
        if (marker?.parentNode && keypad) marker.replaceWith(keypad);
        state.dock?.remove(); state.dock = null;
        document.body.removeAttribute('data-lampa-search-docked');
        document.body.style.removeProperty('--lampa-search-keyboard-height');
        keypad = marker = returnKey = null;
    }
    function mount() {
        if (state.dock || Lampa.Storage.get('keyboard_type') !== 'lampa') return;
        keypad = document.querySelector('.main-search .search__keypad');
        if (!keypad?.querySelector('.simple-keyboard')) return;
        marker = document.createComment('Lampa search keyboard');
        keypad.before(marker);
        const font = getComputedStyle(keypad);
        const dock = document.createElement('div');
        dock.id = 'lampa-search-keyboard-dock';
        dock.style.fontSize = font.fontSize;
        dock.style.fontFamily = font.fontFamily;
        dock.append(keypad);
        document.body.append(dock);
        state.dock = dock;
        document.body.setAttribute('data-lampa-search-docked', '');
        const size = () => document.body.style.setProperty('--lampa-search-keyboard-height', Math.ceil(dock.getBoundingClientRect().height) + 'px');
        observer = new ResizeObserver(size); observer.observe(dock); size();
        if (Lampa.Controller.enabled().name === 'keybord') Lampa.Controller.toggle('keybord');
        patchController();
    }
    state.back = () => {
        if (!state.dock) return false;
        const name = Lampa.Controller.enabled().name;
        if (name !== 'keybord' && !/^search(?:_|$)/.test(name)) return false;
        if (name === 'keybord') Lampa.Search.close();
        else Lampa.Controller.toggle('keybord');
        return true;
    };
    const style = document.createElement('style');
    style.textContent = `
        #lampa-search-keyboard-dock {position:fixed;left:0;right:0;bottom:0;z-index:50;padding:8px 1.5em;background:#202223;border-top:1px solid #454647;box-sizing:border-box;}
        #lampa-search-keyboard-dock .search__keypad {margin:0;}
        body[data-lampa-search-docked] .main-search .search.scroll {height:calc(100vh - var(--lampa-search-keyboard-height, 150px)) !important;}
    `;
    document.head.append(style);
    function init() {
        if (!window.Lampa?.Search?.listener || !Lampa.Controller?.listener) return setTimeout(init, 250);
        Lampa.Search.listener.follow('open', mount);
        Lampa.Search.listener.follow('close', unmount);
        Lampa.Controller.listener.follow('toggle', patchController);
        if (document.body.classList.contains('search--open')) mount();
    }
    window.addEventListener('pagehide', unmount);
    window.addEventListener('pageshow', () => {if (document.body.classList.contains('search--open')) mount();});
    init();
})();

(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteIdlePanels || !document.head) return;
    const style = document.createElement('style');
    style.id = 'lampa-lite-idle-panels';
    // Closed off-screen panels need no persistent transform promotion.
    // Opening classes immediately restore Lampa's original hints and transitions.
    style.textContent = `
        body:not(.settings--open) .settings .layer--height,
        body:not(.settings--open) .settings .layer--wheight,
        body:not(.settings--open) .settings .scroll__body,
        body:not(.selectbox--open) .selectbox .layer--height,
        body:not(.selectbox--open) .selectbox .layer--wheight,
        body:not(.selectbox--open) .selectbox .scroll__body { will-change: auto; }
    `;
    document.head.appendChild(style);
    const state = window.__lampaLiteIdlePanels = {status: 'active', restore() {
        style.remove();
        state.status = 'disabled';
        delete window.__lampaLiteIdlePanels;
    }};
})();

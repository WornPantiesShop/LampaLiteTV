(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteRowLayout
            || !window.CSS?.supports('contain', 'layout') || !document.head) return;
    const style = document.createElement('style');
    style.id = 'lampa-lite-row-layout';
    // Limit layout invalidation to a catalogue row. Do not contain paint or size:
    // enlarged focus cards must remain visible and each row keeps its natural height.
    style.textContent = '.items-line .scroll--horizontal { contain: layout; }';
    document.head.appendChild(style);
    const state = window.__lampaLiteRowLayout = {status: 'active', restore() {
        style.remove();
        state.status = 'disabled';
        delete window.__lampaLiteRowLayout;
    }};
})();

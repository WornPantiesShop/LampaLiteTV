(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx') return;

    // Restore Lampa's own keyboard once, without replacing its layout,
    // navigation controllers, search DOM or language picker.
    function restoreNativeKeyboard(attempt = 0) {
        if (!window.Lampa?.Storage?.get || !window.Lampa?.Storage?.set) {
            if (attempt < 120) setTimeout(() => restoreNativeKeyboard(attempt + 1), 250);
            return;
        }
        const marker = 'lampa_lite_native_keyboard_v1';
        if (Lampa.Storage.get(marker, false)) return;
        Lampa.Storage.set('keyboard_type', 'lampa');
        Lampa.Storage.set(marker, true);
    }

    restoreNativeKeyboard();
})();

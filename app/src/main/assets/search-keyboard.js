(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx') return;

    // Force the stock Lampa keyboard instead of the simple fallback keyboard.
    // This keeps the app's search flow, navigation, and language handling intact.
    function restoreNativeKeyboard(attempt = 0) {
        const storage = window.Lampa?.Storage;
        if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
            if (attempt < 180) setTimeout(() => restoreNativeKeyboard(attempt + 1), 150);
            return;
        }

        const currentType = storage.get('keyboard_type', 'lampa');
        if (currentType !== 'lampa') {
            storage.set('keyboard_type', 'lampa');
        }

        const defaultLang = storage.get('keyboard_default_lang', storage.get('language', 'ru'));
        if (defaultLang) {
            storage.set('keyboard_default_lang', defaultLang);
        }

        try {
            document.body?.classList.remove('system--keyboard');
        } catch (e) {
            // Ignore DOM mismatch during early page boot.
        }

        const marker = 'lampa_lite_native_keyboard_v1';
        if (!storage.get(marker, false)) {
            storage.set(marker, true);
        }
    }

    restoreNativeKeyboard();
})();

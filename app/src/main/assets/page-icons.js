(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLitePageIcons) return;
    // Website tab icons are not used by the native Android TV host or its launcher icon.
    const icon = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const saved = new WeakMap();
    function replace(link) {
        if (!link.matches?.('link') || !/(^|\s)icon(\s|$)/i.test(link.rel)) return;
        if (link.getAttribute('href') === icon) return;
        saved.set(link, link.getAttribute('href'));
        link.setAttribute('href', icon);
    }
    document.head.querySelectorAll('link[rel]').forEach(replace);
    const observer = new MutationObserver(records => {
        for (const record of records) {
            if (record.type === 'attributes') replace(record.target);
            else for (const node of record.addedNodes) {
                replace(node);
                node.querySelectorAll?.('link[rel]').forEach(replace);
            }
        }
    });
    observer.observe(document.head, {childList: true, subtree: true, attributes: true, attributeFilter: ['href','rel']});
    window.__lampaLitePageIcons = {restore() {
        observer.disconnect();
        document.head.querySelectorAll('link[rel]').forEach(link => {
            if (!saved.has(link) || link.getAttribute('href') !== icon) return;
            const href = saved.get(link);
            if (href === null) link.removeAttribute('href'); else link.setAttribute('href', href);
        });
        delete window.__lampaLitePageIcons;
    }};
})();

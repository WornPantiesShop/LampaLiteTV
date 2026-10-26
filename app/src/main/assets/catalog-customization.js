(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteCatalog) return;
    const state = {status: 'waiting'};
    window.__lampaLiteCatalog = state;
    const icon = '<svg><use xlink:href="#sprite-movie"></use></svg>';
    function open(type) {
        if (type !== 'movie' && type !== 'tv') return;
        Lampa.Controller.toggle('content');
        Lampa.Activity.push({
            title: type === 'movie' ? 'Русские — фильмы' : 'Русские — сериалы',
            url: 'discover/' + type + '?with_original_language=ru&sort_by=popularity.desc',
            component: 'category_full', source: 'tmdb', page: 1,
            card_type: type === 'tv' ? 'tv' : 'movie'
        });
    }
    state.open = open;
    function prune() {
        document.querySelectorAll('.menu__item').forEach(item => {
            const title = item.querySelector('.menu__text')?.textContent.trim().toLowerCase();
            const action = item.getAttribute('data-action');
            const shotsIcon = [...item.querySelectorAll('use')].some(use =>
                (use.getAttribute('xlink:href') || use.getAttribute('href')) === '#sprite-shots');
            if (action === 'settings' || action === 'shots' || action === 'shorts'
                    || shotsIcon || ['shots', 'shorts', 'шортс'].includes(title)) item.remove();
        });
        if (!document.querySelector('[data-action="lampa-lite-russian"]')) {
            const item = Lampa.Menu.addButton(icon, 'Русские', () => {
                Lampa.Select.show({
                    title: 'Русские',
                    items: [{title: 'Фильмы', type: 'movie'}, {title: 'Сериалы', type: 'tv'}],
                    onSelect: item => open(item.type),
                    onBack: () => Lampa.Controller.toggle('menu')
                });
            });
            item.attr('data-action', 'lampa-lite-russian');
            const series = document.querySelector('.menu__item[data-action="tv"]');
            if (series) series.after(item[0]);
        }
    }
    function install() {
        prune();
        const observer = new MutationObserver(prune);
        for (const root of document.querySelectorAll('.menu, .head')) {
            observer.observe(root, {childList: true, subtree: true});
            if (root.parentNode) observer.observe(root.parentNode, {childList: true});
        }
        state.status = 'active';
    }
    let attempts = 0;
    function ready() {
        if (window.Lampa?.Menu && Lampa.Listener) {
            if (window.appready) install();
            else Lampa.Listener.follow('app', event => { if (event.type === 'ready' && state.status !== 'active') install(); });
        } else if (++attempts < 240) setTimeout(ready, 500);
    }
    ready();
})();

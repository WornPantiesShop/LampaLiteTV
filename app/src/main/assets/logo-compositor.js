(() => {
    'use strict';
    if (location.hostname !== 'lampa.mx' || window.__lampaLiteFire) return;
    const state = {status: 'waiting', timer: 0, fire: null};
    window.__lampaLiteFire = state;
    const colors = [
        'rgb(255, 235, 59)', 'rgb(255, 209, 59)', 'rgb(255, 183, 59)',
        'rgb(255, 235, 59)', 'rgb(251, 234, 83)', 'rgb(255, 193, 59)',
        'rgb(251, 235, 87)', 'rgb(255, 203, 59)', 'rgb(255, 244, 147)',
        'rgb(252, 170, 56)', 'rgb(255, 235, 59)'
    ];
    const offsets = [0, .10, .14, .25, .27, .50, .58, .80, .90, .95, 1];
    const boundaries = offsets.slice(1).map(value => value * 5000);
    const styleId = 'lampa-lite-fire-compositor';
    const css = `
        @keyframes lampa-lite-fire-opacity {
            0%,14%,27%,58%,90%,100% {opacity:0}
            10%,25%,50%,80%,95% {opacity:1}
        }
        .head__logo-halloween .head__logo-halloween-fire {
            animation:none;
            background:var(--lampa-fire-base,rgb(255,235,59));
        }
        .head__logo-halloween .head__logo-halloween-fire::after {
            content:'';position:absolute;inset:0;pointer-events:none;
            background:var(--lampa-fire-top,rgb(255,209,59));
            will-change:opacity;
            animation:lampa-lite-fire-opacity 5s ease infinite;
        }
    `;
    let animation;
    let lastBase;
    let lastTop;

    function synchronize() {
        clearTimeout(state.timer);
        if (document.hidden || !state.fire || !state.fire.isConnected) return;
        const phase = Number(animation.currentTime || 0) % 5000;
        let segment = offsets.length - 2;
        for (let i = 0; i < boundaries.length; i++) {
            if (phase < boundaries[i]) { segment = i; break; }
        }
        // One layer is fully opaque while the other's color is changed out of sight.
        // Only opacity interpolates every frame; discrete colors change at 10 stops/5s.
        const base = colors[segment % 2 ? segment + 1 : segment];
        const top = colors[segment % 2 ? segment : segment + 1];
        if (base !== lastBase) state.fire.style.setProperty('--lampa-fire-base', base);
        if (top !== lastTop) state.fire.style.setProperty('--lampa-fire-top', top);
        lastBase = base;
        lastTop = top;
        state.timer = setTimeout(synchronize, Math.max(8, boundaries[segment] - phase + 1));
    }

    function cleanUp() {
        clearTimeout(state.timer);
        document.removeEventListener('visibilitychange', synchronize);
        document.getElementById(styleId)?.remove();
        if (state.fire) {
            state.fire.style.removeProperty('--lampa-fire-base');
            state.fire.style.removeProperty('--lampa-fire-top');
        }
        state.fire = null;
        state.status = 'waiting';
        lastBase = lastTop = undefined;
    }

    function install() {
        if (state.fire && state.fire.isConnected) return;
        if (state.fire) cleanUp();
        const fire = document.querySelector('.head__logo-halloween-fire');
        if (!fire || !fire.getAnimations) return;
        const original = fire.getAnimations().find(item => item.animationName === 'logo-halloween-fire');
        if (!original || original.playState !== 'running') return;
        const timing = original.effect.getTiming();
        const frames = original.effect.getKeyframes();
        // Fail closed if Lampa changes this animation. Never affect catalog animations.
        if (original.playbackRate !== 1 || timing.iterationStart !== 0 || timing.endDelay !== 0
                || timing.easing !== 'linear' || timing.duration !== 5000
                || timing.iterations !== Infinity || timing.delay !== 0
                || timing.direction !== 'normal' || frames.length !== colors.length
                || frames.some((frame, i) => Math.abs(frame.computedOffset - offsets[i]) > .00001
                    || frame.backgroundColor !== colors[i] || frame.easing !== 'ease')) return;
        const pseudo = getComputedStyle(fire, '::after').content;
        if (pseudo !== 'none' && pseudo !== 'normal') return;
        const phase = original.currentTime;
        const style = document.createElement('style');
        style.id = styleId;
        style.textContent = css;
        state.fire = fire;
        try {
            document.head.appendChild(style);
            animation = fire.getAnimations({subtree: true})
                .find(item => item.animationName === 'lampa-lite-fire-opacity');
            if (!animation) throw new Error('Opacity animation unavailable');
            animation.currentTime = phase;
            state.status = 'active';
            synchronize();
            document.addEventListener('visibilitychange', synchronize);
            // Watch only the header and its replacement, not the changing catalog rows.
            observer.disconnect();
            const header = fire.closest('.head');
            if (header) {
                observer.observe(header, {childList: true, subtree: true});
                if (header.parentNode) observer.observe(header.parentNode, {childList: true});
            }
        } catch (error) {
            cleanUp();
            observer.disconnect();
            console.warn('Lampa Lite: original logo animation retained', error);
        }
    }

    const observer = new MutationObserver(install);
    // Read-only diagnostic A/B can restore the untouched page without reloading user data.
    state.restore = () => { cleanUp(); observer.disconnect(); state.status = 'disabled'; };
    observer.observe(document.documentElement, {childList: true, subtree: true});
    install();
})();

(function () {
    const markers = document.querySelectorAll('.content sup.footnote-marker');
    if (!markers.length) return;
    markers.forEach((m, i) => { m.setAttribute('data-num', String(i + 1)); });

    const popover = document.createElement('div');
    popover.className = 'footnote-view-popover';
    popover.hidden = true;
    popover.innerHTML = '<div class="footnote-view-text"></div>';
    document.body.appendChild(popover);
    const popText = popover.querySelector('.footnote-view-text');

    function position(rect) {
        const w = Math.min(280, window.innerWidth - 16);
        popover.style.width = w + 'px';
        let left = rect.left + window.scrollX;
        const maxLeft = window.scrollX + window.innerWidth - w - 8;
        if (left > maxLeft) left = maxLeft;
        if (left < window.scrollX + 8) left = window.scrollX + 8;
        popover.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        popover.style.left = left + 'px';
    }

    function open(marker) {
        popText.textContent = marker.getAttribute('data-note') || '';
        popover.hidden = false;
        position(marker.getBoundingClientRect());
    }

    function close() {
        popover.hidden = true;
    }

    document.addEventListener('click', (e) => {
        const marker = e.target.closest && e.target.closest('sup.footnote-marker');
        if (marker) {
            e.preventDefault();
            e.stopPropagation();
            open(marker);
            return;
        }
        if (popover.contains(e.target)) return;
        close();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !popover.hidden) close();
    });

    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
})();

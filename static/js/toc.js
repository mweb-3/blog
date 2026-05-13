(function () {
    const post = document.querySelector('body > h1');
    const content = document.querySelector('.content');
    if (!content) return;

    const headings = [];
    if (post) headings.push({ el: post, level: 'title', text: post.textContent });
    content.querySelectorAll('h1, h2, h3').forEach((el) => {
        headings.push({ el, level: el.tagName.toLowerCase(), text: el.textContent });
    });
    if (headings.length < 2) return;

    const bands = { title: [38, 50], h1: [28, 38], h2: [18, 28], h3: [10, 18] };
    function widthFor(level, text) {
        const [min, max] = bands[level];
        const t = Math.min(50, Math.max(5, (text || '').trim().length));
        const ratio = (t - 5) / 45;
        return Math.round(min + (max - min) * ratio);
    }

    const toc = document.createElement('nav');
    toc.className = 'toc';
    toc.setAttribute('aria-label', 'Contents');
    document.body.appendChild(toc);

    const lines = headings.map((h) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'toc-line toc-' + h.level;
        btn.style.width = widthFor(h.level, h.text) + 'px';
        const title = (h.text || '').trim();
        btn.setAttribute('data-title', title);
        btn.setAttribute('aria-label', title);
        btn.addEventListener('click', () => {
            h.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
        toc.appendChild(btn);
        return { line: btn, headingEl: h.el };
    });

    function updateActive() {
        const threshold = window.innerHeight * 0.3;
        let activeIdx = 0;
        for (let i = 0; i < lines.length; i++) {
            const top = lines[i].headingEl.getBoundingClientRect().top;
            if (top <= threshold) activeIdx = i;
            else break;
        }
        lines.forEach((l, i) => l.line.classList.toggle('is-active', i === activeIdx));
    }

    updateActive();
    window.addEventListener('scroll', updateActive, { passive: true });
    window.addEventListener('resize', updateActive);
})();

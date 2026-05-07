(function () {
    function applyTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
    function currentTheme() {
        return document.documentElement.getAttribute('data-theme') || 'light';
    }
    function setTheme(theme, persist) {
        applyTheme(theme);
        if (persist) {
            try { localStorage.setItem('theme', theme); } catch (e) {}
        }
    }

    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    if (mql && typeof mql.addEventListener === 'function') {
        mql.addEventListener('change', (e) => {
            let saved = null;
            try { saved = localStorage.getItem('theme'); } catch (e2) {}
            if (!saved) {
                applyTheme(e.matches ? 'dark' : 'light');
            }
        });
    }

    const btn = document.getElementById('theme-toggle');
    if (btn) {
        btn.addEventListener('click', () => {
            const next = currentTheme() === 'dark' ? 'light' : 'dark';
            setTheme(next, true);
        });
    }
})();

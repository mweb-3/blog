(function () {
    const Block = Quill.import('blots/block');
    const BlockEmbed = Quill.import('blots/block/embed');
    const Embed = Quill.import('blots/embed');

    class CaptionBlock extends Block {}
    CaptionBlock.blotName = 'caption';
    CaptionBlock.tagName = 'P';
    CaptionBlock.className = 'caption';
    Quill.register(CaptionBlock, true);

    class DividerBlot extends BlockEmbed {}
    DividerBlot.blotName = 'divider';
    DividerBlot.tagName = 'HR';
    Quill.register(DividerBlot, true);

    class FootnoteBlot extends Embed {
        static create(value) {
            const node = super.create();
            node.setAttribute('data-note', value || '');
            node.setAttribute('contenteditable', 'false');
            return node;
        }
        static value(node) {
            return node.getAttribute('data-note') || '';
        }
    }
    FootnoteBlot.blotName = 'footnote';
    FootnoteBlot.tagName = 'SUP';
    FootnoteBlot.className = 'footnote-marker';
    Quill.register(FootnoteBlot, true);

    const toolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],
        ['link'],
        [{ 'header': 1 }, { 'header': 2 }, { 'header': 3 }],
        ['blockquote', 'code-block'],
        [{ 'list': 'bullet' }, { 'list': 'ordered' }],
    ];

    const triggerLink = function () {
        const linkBtn = document.querySelector('.ql-tooltip .ql-link');
        if (linkBtn) linkBtn.click();
    };

    const triggerImage = function () {
        document.getElementById('image-picker').click();
    };

    const editorEl = document.getElementById('editor');
    const initialHTML = editorEl.innerHTML;
    editorEl.innerHTML = '';

    const quill = new Quill('#editor', {
        theme: 'bubble',
        placeholder: 'Start writing…',
        modules: {
            toolbar: toolbarOptions,
        },
    });

    const Delta = Quill.import('delta');
    quill.clipboard.addMatcher('P', (node, delta) => {
        if (node.classList && node.classList.contains('caption')) {
            return delta.compose(new Delta().retain(delta.length(), { caption: true }));
        }
        return delta;
    });
    quill.clipboard.addMatcher('HR', () => new Delta().insert({ divider: true }));
    quill.clipboard.addMatcher('SUP', (node, delta) => {
        if (node.classList && node.classList.contains('footnote-marker')) {
            return new Delta().insert({ footnote: node.getAttribute('data-note') || '' });
        }
        return delta;
    });

    if (initialHTML && initialHTML.trim()) {
        quill.setContents(quill.clipboard.convert({ html: initialHTML }), 'silent');
    }

    let suppressCleanup = false;
    function withCleanupSuppressed(fn) {
        const prev = suppressCleanup;
        suppressCleanup = true;
        try { return fn(); } finally { suppressCleanup = prev; }
    }

    function focusedLine() {
        const sel = quill.getSelection();
        if (!sel) return null;
        return quill.getLine(sel.index)[0];
    }

    function isEmptyCaption(blot) {
        if (!blot || !blot.domNode) return false;
        if (!blot.domNode.classList.contains('caption')) return false;
        const text = (blot.domNode.textContent || '').replace(/​/g, '');
        return text === '';
    }

    let selectedImage = null;

    function imageBlot(img) {
        try { return Quill.find(img); } catch (_) { return null; }
    }

    function captionLineForImage(img) {
        const blot = imageBlot(img);
        if (!blot) return null;
        const idx = quill.getIndex(blot);
        const [imgLine] = quill.getLine(idx);
        if (!imgLine) return null;
        const after = quill.getIndex(imgLine) + imgLine.length();
        const [next] = quill.getLine(after);
        if (next && next.domNode && next.domNode.classList.contains('caption')) return next;
        return null;
    }

    function ensureCaptionFor(img) {
        if (captionLineForImage(img)) return;
        const blot = imageBlot(img);
        if (!blot) return;
        const idx = quill.getIndex(blot);
        const [imgLine] = quill.getLine(idx);
        if (!imgLine) return;
        const after = quill.getIndex(imgLine) + imgLine.length();
        withCleanupSuppressed(() => {
            quill.insertText(after, '\n', 'user');
            quill.formatLine(after, 1, 'caption', true, 'user');
        });
    }

    function deselectImage() {
        if (!selectedImage) return;
        selectedImage.classList.remove('is-selected');
        selectedImage = null;
        setTimeout(cleanupEmptyCaptions, 0);
    }

    function selectImage(img) {
        if (selectedImage === img) return;
        if (selectedImage) selectedImage.classList.remove('is-selected');
        selectedImage = img;
        img.classList.add('is-selected');
        ensureCaptionFor(img);
        quill.setSelection(null);
        if (document.activeElement && typeof document.activeElement.blur === 'function') {
            document.activeElement.blur();
        }
    }

    function deleteSelectedImage() {
        if (!selectedImage) return;
        const img = selectedImage;
        const blot = imageBlot(img);
        const captionBlot = captionLineForImage(img);
        selectedImage.classList.remove('is-selected');
        selectedImage = null;
        if (!blot) return;
        const imgIdx = quill.getIndex(blot);
        const [imgLine] = quill.getLine(imgIdx);
        if (!imgLine) return;
        const lineStart = quill.getIndex(imgLine);
        const lineLen = imgLine.length();
        const aloneInLine = lineLen === 2;
        withCleanupSuppressed(() => {
            if (captionBlot) {
                const capStart = quill.getIndex(captionBlot);
                const capLen = captionBlot.length();
                quill.deleteText(capStart, capLen, 'user');
            }
            if (aloneInLine) {
                quill.deleteText(lineStart, lineLen, 'user');
                quill.setSelection(Math.max(0, lineStart), 0, 'user');
            } else {
                quill.deleteText(imgIdx, 1, 'user');
                quill.setSelection(imgIdx, 0, 'user');
            }
        });
    }

    function cleanupEmptyCaptions() {
        if (suppressCleanup) return;
        const focused = focusedLine();
        const protectedCaption = selectedImage ? captionLineForImage(selectedImage) : null;
        const nodes = Array.from(quill.root.querySelectorAll('p.caption'));
        for (let i = nodes.length - 1; i >= 0; i--) {
            let blot;
            try { blot = Quill.find(nodes[i]); } catch (_) { continue; }
            if (!blot) continue;
            if (blot === focused || blot === protectedCaption) continue;
            if (!isEmptyCaption(blot)) continue;
            const start = quill.getIndex(blot);
            const len = blot.length();
            withCleanupSuppressed(() => quill.deleteText(start, len, 'silent'));
        }
    }

    quill.on('text-change', cleanupEmptyCaptions);
    quill.on('selection-change', (range) => {
        if (range && selectedImage) {
            selectedImage.classList.remove('is-selected');
            selectedImage = null;
        }
        cleanupEmptyCaptions();
    });

    function insertImage(src) {
        withCleanupSuppressed(() => {
            const range = quill.getSelection(true) || { index: quill.getLength() - 1, length: 0 };
            const idx = range.index;
            quill.insertEmbed(idx, 'image', src, 'user');
            quill.insertText(idx + 1, '\n', 'user');
            quill.formatLine(idx + 2, 1, 'caption', true, 'user');
            quill.setSelection(idx + 2, 0, 'user');
        });
    }

    async function uploadImage(file) {
        const fd = new FormData();
        fd.append('image', file);
        const resp = await fetch('/api/upload-image', { method: 'POST', body: fd });
        if (!resp.ok) {
            let detail = '';
            try { detail = JSON.stringify(await resp.json()); } catch (_) {}
            throw new Error('upload failed ' + resp.status + ' ' + detail);
        }
        const data = await resp.json();
        if (!data.url) throw new Error('no url in upload response');
        return data.url;
    }

    async function uploadAndInsert(file) {
        try {
            const url = await uploadImage(file);
            insertImage(url);
        } catch (e) {
            console.error(e);
            alert('Image upload failed: ' + e.message);
        }
    }

    document.getElementById('image-picker').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        await uploadAndInsert(file);
        e.target.value = '';
    });

    quill.root.addEventListener('paste', (e) => {
        const items = e.clipboardData && e.clipboardData.items;
        if (!items) return;
        for (const it of items) {
            if (it.type && it.type.startsWith('image/')) {
                e.preventDefault();
                e.stopImmediatePropagation();
                const file = it.getAsFile();
                if (file) uploadAndInsert(file);
                return;
            }
        }
    }, true);

    quill.root.addEventListener('drop', async (e) => {
        const files = e.dataTransfer && e.dataTransfer.files;
        if (!files || !files.length) return;
        const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
        if (!images.length) return;
        e.preventDefault();
        for (const f of images) {
            await uploadAndInsert(f);
        }
    });
    quill.root.addEventListener('dragover', (e) => {
        if (e.dataTransfer && Array.from(e.dataTransfer.items || []).some((i) => i.kind === 'file')) {
            e.preventDefault();
        }
    });

    quill.root.addEventListener('mousedown', (e) => {
        if (e.target && e.target.tagName === 'IMG') {
            e.preventDefault();
            selectImage(e.target);
        }
    });
    document.addEventListener('mousedown', (e) => {
        if (!selectedImage) return;
        if (e.target === selectedImage) return;
        deselectImage();
    });
    document.addEventListener('keydown', (e) => {
        if (!selectedImage) return;
        if (e.key === 'Backspace' || e.key === 'Delete') {
            e.preventDefault();
            deleteSelectedImage();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            deselectImage();
        }
    }, true);

    quill.keyboard.addBinding({
        key: 'Backspace',
        format: ['caption'],
        offset: 0,
    }, function (range) {
        const [line] = quill.getLine(range.index);
        if (!line) return true;
        const start = quill.getIndex(line);
        if (start === 0) return true;
        const [prevLine] = quill.getLine(start - 1);
        if (!prevLine || !prevLine.domNode) return true;
        const img = prevLine.domNode.querySelector('img');
        if (!img) return true;
        selectImage(img);
        return false;
    });

    quill.keyboard.addBinding({
        key: 'Enter',
        format: ['caption'],
    }, function (range) {
        const [line] = quill.getLine(range.index);
        if (!line) return true;
        const start = quill.getIndex(line);
        const end = start + line.length();
        const [afterBlot] = quill.getLine(end);
        const afterIsCaption = afterBlot && afterBlot.domNode && afterBlot.domNode.classList.contains('caption');
        if (afterBlot && !afterIsCaption) {
            quill.setSelection(end, 0, 'user');
        } else {
            quill.insertText(end, '\n', 'user');
            quill.formatLine(end, 1, 'caption', false, 'user');
            quill.setSelection(end, 0, 'user');
        }
        return false;
    });

    quill.on('text-change', (delta, _old, source) => {
        if (source !== 'user' || suppressCleanup) return;
        let onlyNewline = false;
        let pos = 0;
        for (const op of delta.ops) {
            if (op.retain != null) pos += op.retain;
            else if (op.insert === '\n') onlyNewline = true;
            else if (op.insert) return;
            else if (op.delete) return;
        }
        if (!onlyNewline) return;
        const [prevLine] = quill.getLine(Math.max(0, pos - 1));
        if (!prevLine || !prevLine.domNode) return;
        if (prevLine.domNode.tagName !== 'P') return;
        if (prevLine.domNode.classList.contains('caption')) return;
        const text = (prevLine.domNode.textContent || '').trim();
        if (text !== '---') return;
        const start = quill.getIndex(prevLine);
        const len = prevLine.length();
        Promise.resolve().then(() => {
            withCleanupSuppressed(() => {
                quill.deleteText(start, len, 'user');
                quill.insertEmbed(start, 'divider', true, 'user');
                quill.setSelection(start + 1, 0, 'user');
            });
        });
    });

    const titleInput = document.getElementById('title');
    if (titleInput) {
        titleInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                quill.focus();
                quill.setSelection(0, 0, 'user');
            }
        });
    }

    const footnotePopover = document.createElement('div');
    footnotePopover.className = 'footnote-popover';
    footnotePopover.hidden = true;
    footnotePopover.innerHTML =
        '<textarea class="footnote-text" rows="3" placeholder="Footnote…"></textarea>' +
        '<div class="footnote-actions">' +
        '<button type="button" class="footnote-delete">Delete</button>' +
        '<button type="button" class="footnote-save">Done</button>' +
        '</div>';
    document.body.appendChild(footnotePopover);
    const footnoteText = footnotePopover.querySelector('.footnote-text');
    let activeMarker = null;

    function positionPopover(rect) {
        const w = 280;
        footnotePopover.style.width = w + 'px';
        let left = rect.left + window.scrollX;
        const maxLeft = window.scrollX + window.innerWidth - w - 8;
        if (left > maxLeft) left = maxLeft;
        if (left < window.scrollX + 8) left = window.scrollX + 8;
        footnotePopover.style.top = (rect.bottom + window.scrollY + 8) + 'px';
        footnotePopover.style.left = left + 'px';
    }

    function openFootnoteEditor(marker) {
        activeMarker = marker;
        footnoteText.value = marker.getAttribute('data-note') || '';
        footnotePopover.hidden = false;
        positionPopover(marker.getBoundingClientRect());
        setTimeout(() => { footnoteText.focus(); footnoteText.select(); }, 0);
    }

    function removeMarker(marker) {
        try {
            const blot = Quill.find(marker);
            if (blot) {
                const idx = quill.getIndex(blot);
                quill.deleteText(idx, 1, 'user');
                return;
            }
        } catch (_) {}
        marker.remove();
    }

    function closeFootnoteEditor(saveOnClose) {
        if (!activeMarker) {
            footnotePopover.hidden = true;
            return;
        }
        const marker = activeMarker;
        activeMarker = null;
        if (saveOnClose) {
            const text = footnoteText.value.trim();
            if (text) {
                marker.setAttribute('data-note', text);
            } else {
                removeMarker(marker);
            }
        } else if (!(marker.getAttribute('data-note') || '').trim()) {
            removeMarker(marker);
        }
        footnotePopover.hidden = true;
        renumberFootnotes();
    }

    footnotePopover.querySelector('.footnote-save').addEventListener('click', () => closeFootnoteEditor(true));
    footnotePopover.querySelector('.footnote-delete').addEventListener('click', () => {
        if (!activeMarker) return;
        const marker = activeMarker;
        activeMarker = null;
        removeMarker(marker);
        footnotePopover.hidden = true;
        renumberFootnotes();
    });
    footnoteText.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            e.stopPropagation();
            closeFootnoteEditor(true);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            closeFootnoteEditor(false);
        }
    });

    function insertFootnote() {
        const range = quill.getSelection(true);
        if (!range) return;
        const tempId = '__pending_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
        quill.insertEmbed(range.index, 'footnote', tempId, 'user');
        quill.setSelection(range.index + 1, 0, 'user');
        setTimeout(() => {
            const sel = 'sup.footnote-marker[data-note="' + tempId + '"]';
            const marker = quill.root.querySelector(sel);
            if (marker) {
                marker.setAttribute('data-note', '');
                renumberFootnotes();
                openFootnoteEditor(marker);
            }
        }, 0);
    }

    function renumberFootnotes() {
        const markers = quill.root.querySelectorAll('sup.footnote-marker');
        markers.forEach((m, i) => { m.setAttribute('data-num', String(i + 1)); });
    }

    quill.root.addEventListener('mousedown', (e) => {
        const marker = e.target.closest && e.target.closest('sup.footnote-marker');
        if (!marker) return;
        e.preventDefault();
        e.stopPropagation();
        openFootnoteEditor(marker);
    });

    quill.root.addEventListener('contextmenu', (e) => {
        e.preventDefault();

        const sel = window.getSelection();
        if (sel && sel.rangeCount > 0 && !sel.isCollapsed && quill.root.contains(sel.anchorNode)) {
            const r = sel.getRangeAt(0);
            const rect = r.getBoundingClientRect();
            if (e.clientX >= rect.left - 4 && e.clientX <= rect.right + 4 &&
                e.clientY >= rect.top - 4 && e.clientY <= rect.bottom + 4) {
                return;
            }
        }

        let domRange = null;
        if (document.caretRangeFromPoint) {
            domRange = document.caretRangeFromPoint(e.clientX, e.clientY);
        } else if (document.caretPositionFromPoint) {
            const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
            if (pos) {
                domRange = document.createRange();
                domRange.setStart(pos.offsetNode, pos.offset);
                domRange.collapse(true);
            }
        }
        if (!domRange) return;

        const node = domRange.startContainer;
        if (!node || node.nodeType !== Node.TEXT_NODE) return;
        if (!quill.root.contains(node)) return;

        const text = node.textContent || '';
        let start = domRange.startOffset;
        let end = start;
        const isWord = (c) => !!c && /[\w'’\-]/.test(c);
        while (start > 0 && isWord(text[start - 1])) start--;
        while (end < text.length && isWord(text[end])) end++;
        if (start === end) return;

        let blot;
        try { blot = Quill.find(node, true); } catch (_) { return; }
        if (!blot) return;
        const blotIdx = quill.getIndex(blot);
        quill.setSelection(blotIdx + start, end - start, 'user');
    });

    document.addEventListener('mousedown', (e) => {
        if (footnotePopover.hidden) return;
        if (footnotePopover.contains(e.target)) return;
        if (e.target.closest && e.target.closest('sup.footnote-marker')) return;
        closeFootnoteEditor(false);
    });

    quill.on('text-change', renumberFootnotes);
    renumberFootnotes();

    function toggleInlineFmt(name) {
        const range = quill.getSelection();
        if (!range) return;
        const fmt = quill.getFormat(range);
        quill.format(name, !fmt[name], 'user');
    }
    function toggleLineHeader(level) {
        const range = quill.getSelection();
        if (!range) return;
        const fmt = quill.getFormat(range);
        quill.format('header', fmt.header === level ? false : level, 'user');
    }
    function setLineBody() {
        const range = quill.getSelection();
        if (!range) return;
        ['header', 'blockquote', 'code-block', 'list', 'caption'].forEach((n) => {
            quill.format(n, false, 'user');
        });
    }
    function toggleLineList(kind) {
        const range = quill.getSelection();
        if (!range) return;
        const fmt = quill.getFormat(range);
        quill.format('list', fmt.list === kind ? false : kind, 'user');
    }
    function toggleLineQuote() {
        const range = quill.getSelection();
        if (!range) return;
        const fmt = quill.getFormat(range);
        quill.format('blockquote', !fmt.blockquote, 'user');
    }
    function toggleLineCodeBlock() {
        const range = quill.getSelection();
        if (!range) return;
        const fmt = quill.getFormat(range);
        quill.format('code-block', !fmt['code-block'], 'user');
    }
    function insertDividerAtCursor() {
        const range = quill.getSelection();
        if (!range) return;
        const [line] = quill.getLine(range.index);
        if (!line) return;
        const start = quill.getIndex(line);
        const len = line.length();
        const txt = (line.domNode.textContent || '');
        if (txt.trim() === '' && len <= 1) {
            quill.insertEmbed(start, 'divider', true, 'user');
            quill.setSelection(start + 1, 0, 'user');
        } else {
            quill.insertText(range.index, '\n', 'user');
            quill.insertEmbed(range.index + 1, 'divider', true, 'user');
            quill.setSelection(range.index + 2, 0, 'user');
        }
    }

    const shortcutTable = [
        { code: 'KeyX', shift: true,  alt: false, fn: () => toggleInlineFmt('strike') },
        { code: 'KeyK', shift: false, alt: false, fn: triggerLink },
        { code: 'Digit1', shift: false, alt: true, fn: () => toggleLineHeader(1) },
        { code: 'Digit2', shift: false, alt: true, fn: () => toggleLineHeader(2) },
        { code: 'Digit3', shift: false, alt: true, fn: () => toggleLineHeader(3) },
        { code: 'Digit0', shift: false, alt: true, fn: setLineBody },
        { code: 'Digit8', shift: true,  alt: false, fn: () => toggleLineList('bullet') },
        { code: 'Digit7', shift: true,  alt: false, fn: () => toggleLineList('ordered') },
        { code: 'KeyQ', shift: true,  alt: false, fn: toggleLineQuote },
        { code: 'KeyE', shift: false, alt: false, fn: () => toggleInlineFmt('code') },
        { code: 'KeyC', shift: true,  alt: false, fn: toggleLineCodeBlock },
        { code: 'KeyD', shift: true,  alt: false, fn: insertDividerAtCursor },
        { code: 'KeyI', shift: true,  alt: false, fn: triggerImage },
        { code: 'KeyN', shift: false, alt: true,  fn: insertFootnote },
    ];

    quill.root.addEventListener('keydown', (e) => {
        if (slashMenu.open) return;
        const mod = e.metaKey || e.ctrlKey;
        if (!mod) return;
        for (const s of shortcutTable) {
            if (s.code !== e.code) continue;
            if (s.shift !== e.shiftKey) continue;
            if (s.alt !== e.altKey) continue;
            e.preventDefault();
            e.stopImmediatePropagation();
            s.fn();
            return;
        }
    }, true);

    const tooltipMap = [
        ['.ql-bold', 'Bold', '⌘B'],
        ['.ql-italic', 'Italic', '⌘I'],
        ['.ql-underline', 'Underline', '⌘U'],
        ['.ql-strike', 'Strikethrough', '⌘⇧X'],
        ['.ql-link', 'Link', '⌘K'],
        ['.ql-blockquote', 'Quote', '⌘⇧Q'],
        ['.ql-code-block', 'Code block', '⌘⇧C'],
        ['.ql-list[value="ordered"]', 'Numbered list', '⌘⇧7'],
        ['.ql-list[value="bullet"]', 'Bulleted list', '⌘⇧8'],
        ['.ql-header[value="1"]', 'Heading 1', '⌘⌥1'],
        ['.ql-header[value="2"]', 'Heading 2', '⌘⌥2'],
        ['.ql-header[value="3"]', 'Heading 3', '⌘⌥3'],
    ];
    tooltipMap.forEach(([sel, label, shortcut]) => {
        document.querySelectorAll('.ql-tooltip ' + sel).forEach((el) => {
            el.setAttribute('data-tip', shortcut ? label + ' · ' + shortcut : label);
        });
    });

    const form = document.getElementById('post-form');
    form.addEventListener('submit', (e) => {
        if (quill.getText().trim().length === 0 && !document.getElementById('title').value.trim()) {
            e.preventDefault();
            document.getElementById('title').focus();
            return;
        }
        document.getElementById('content').value = quill.root.innerHTML;
    });

    const toggle = document.getElementById('shortcuts-toggle');
    const overlay = document.getElementById('shortcuts-overlay');
    function openCheatsheet() {
        overlay.hidden = false;
        requestAnimationFrame(() => overlay.classList.add('show'));
    }
    function closeCheatsheet() {
        overlay.classList.remove('show');
        setTimeout(() => { overlay.hidden = true; }, 200);
    }
    toggle.addEventListener('click', openCheatsheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) closeCheatsheet(); });

    document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
            e.preventDefault();
            form.requestSubmit();
            return;
        }
        if (e.key === 'Escape' && !overlay.hidden) {
            closeCheatsheet();
            return;
        }
        const isInTitle = document.activeElement && document.activeElement.id === 'title';
        const isInEditor = document.activeElement === quill.root || quill.root.contains(document.activeElement);
        if (e.key === '?' && !e.metaKey && !e.ctrlKey && !isInTitle && !isInEditor) {
            e.preventDefault();
            overlay.hidden ? openCheatsheet() : closeCheatsheet();
        }
    });

    const slashItems = [
        { id: 'h1',          label: 'Heading 1',     desc: 'Large section heading', icon: 'H1', keywords: ['heading 1', 'h1', 'title'] },
        { id: 'h2',          label: 'Heading 2',     desc: 'Medium section heading', icon: 'H2', keywords: ['heading 2', 'h2'] },
        { id: 'h3',          label: 'Heading 3',     desc: 'Small section heading', icon: 'H3', keywords: ['heading 3', 'h3', 'subheading'] },
        { id: 'body',        label: 'Body text',     desc: 'Plain paragraph', icon: '¶', keywords: ['body', 'text', 'paragraph', 'normal', 'plain'] },
        { id: 'bullet',      label: 'Bulleted list', desc: 'Simple bulleted list', icon: '•', keywords: ['bullet', 'list', 'unordered'] },
        { id: 'ordered',     label: 'Numbered list', desc: 'Ordered list', icon: '1.', keywords: ['numbered', 'ordered', 'list'] },
        { id: 'quote',       label: 'Quote',         desc: 'Block quote', icon: '“', keywords: ['quote', 'blockquote'] },
        { id: 'inline-code', label: 'Inline code',   desc: 'Monospace within a line', icon: '`c`', keywords: ['inline code', 'code', 'mono', 'monospace'] },
        { id: 'code',        label: 'Code block',    desc: 'Multi-line code snippet', icon: '<>', keywords: ['code block', 'codeblock', 'code', 'pre'] },
        { id: 'divider',     label: 'Divider',       desc: 'Horizontal rule', icon: '—', keywords: ['divider', 'rule', 'separator', 'hr', 'horizontal'] },
    ];

    const slashMenu = { el: null, open: false, startIndex: 0, query: '', selectedIndex: 0, filtered: [] };

    function buildSlashMenu() {
        const el = document.createElement('div');
        el.className = 'slash-menu';
        el.setAttribute('role', 'listbox');
        el.hidden = true;
        el.addEventListener('mousedown', (e) => { e.preventDefault(); });

        const list = document.createElement('div');
        list.className = 'slash-menu-list';
        el.appendChild(list);

        const footer = document.createElement('div');
        footer.className = 'slash-menu-footer';
        el.appendChild(footer);

        document.body.appendChild(el);
        slashMenu.el = el;
        slashMenu.listEl = list;
        slashMenu.footerEl = footer;
    }

    function filterSlashItems(query) {
        const q = query.trim().toLowerCase();
        if (!q) return slashItems.slice();
        const scored = [];
        for (const item of slashItems) {
            const label = item.label.toLowerCase();
            let score = -1;
            if (label === q) score = 200;
            else if (label.startsWith(q)) score = 120;
            else if (item.keywords.some((k) => k.startsWith(q))) score = 90;
            else if (label.includes(q)) score = 60;
            else if (item.keywords.some((k) => k.includes(q))) score = 40;
            if (score >= 0) scored.push({ item, score });
        }
        scored.sort((a, b) => b.score - a.score);
        return scored.map((s) => s.item);
    }

    function renderSlashFooter() {
        const q = (slashMenu.query || '').trim();
        const total = slashItems.length;
        const shown = slashMenu.filtered.length;
        const footer = slashMenu.footerEl;
        if (q && shown) {
            footer.textContent = shown + ' of ' + total;
            footer.hidden = false;
        } else {
            footer.hidden = true;
            footer.textContent = '';
        }
    }

    function renderSlashMenu() {
        const list = slashMenu.listEl;
        if (!slashMenu.filtered.length) {
            list.innerHTML = '<div class="slash-menu-empty">No matches</div>';
            renderSlashFooter();
            return;
        }
        list.innerHTML = '';
        slashMenu.filtered.forEach((item, idx) => {
            const row = document.createElement('div');
            row.className = 'slash-menu-item' + (idx === slashMenu.selectedIndex ? ' is-active' : '');
            row.setAttribute('role', 'option');
            row.dataset.id = item.id;
            const icon = document.createElement('div');
            icon.className = 'slash-menu-icon';
            icon.textContent = item.icon;
            const text = document.createElement('div');
            text.className = 'slash-menu-text';
            const label = document.createElement('div');
            label.className = 'slash-menu-label';
            label.textContent = item.label;
            const desc = document.createElement('div');
            desc.className = 'slash-menu-desc';
            desc.textContent = item.desc;
            text.appendChild(label);
            text.appendChild(desc);
            row.appendChild(icon);
            row.appendChild(text);
            row.addEventListener('mouseenter', () => {
                if (slashMenu.selectedIndex === idx) return;
                slashMenu.selectedIndex = idx;
                updateSlashHighlight();
            });
            row.addEventListener('click', (e) => {
                e.preventDefault();
                slashMenu.selectedIndex = idx;
                applySlashSelection();
            });
            list.appendChild(row);
        });
        renderSlashFooter();
    }

    function updateSlashHighlight() {
        const items = slashMenu.listEl.querySelectorAll('.slash-menu-item');
        items.forEach((it, idx) => it.classList.toggle('is-active', idx === slashMenu.selectedIndex));
        const active = items[slashMenu.selectedIndex];
        if (active) active.scrollIntoView({ block: 'nearest' });
    }

    function positionSlashMenu() {
        const el = slashMenu.el;
        const bounds = quill.getBounds(slashMenu.startIndex);
        const editorRect = quill.root.getBoundingClientRect();
        const prevVis = el.style.visibility;
        el.style.visibility = 'hidden';
        el.hidden = false;
        const mw = el.offsetWidth;
        const mh = el.offsetHeight;
        let top = editorRect.top + window.scrollY + bounds.top - mh - 10;
        let left = editorRect.left + window.scrollX + bounds.left;
        if (top < window.scrollY + 8) {
            top = editorRect.top + window.scrollY + bounds.bottom + 10;
        }
        const maxLeft = window.scrollX + window.innerWidth - mw - 12;
        if (left > maxLeft) left = maxLeft;
        if (left < window.scrollX + 8) left = window.scrollX + 8;
        el.style.top = top + 'px';
        el.style.left = left + 'px';
        el.style.visibility = prevVis;
    }

    function markSlashLine() {
        const [line] = quill.getLine(slashMenu.startIndex);
        if (!line || !line.domNode) return;
        unmarkSlashLine(line.domNode);
        line.domNode.classList.add('is-slash-active');
        line.domNode.setAttribute('data-slash-query', slashMenu.query || '');
    }
    function unmarkSlashLine(except) {
        quill.root.querySelectorAll('.is-slash-active').forEach((el) => {
            if (el === except) return;
            el.classList.remove('is-slash-active');
            el.removeAttribute('data-slash-query');
        });
    }

    function openSlashMenu(startIndex) {
        slashMenu.open = true;
        slashMenu.startIndex = startIndex;
        slashMenu.query = '';
        slashMenu.selectedIndex = 0;
        slashMenu.filtered = filterSlashItems('');
        renderSlashMenu();
        markSlashLine();
        requestAnimationFrame(() => {
            positionSlashMenu();
            slashMenu.el.classList.add('show');
        });
    }

    function updateSlashMenuQuery(query) {
        const prevId = slashMenu.filtered[slashMenu.selectedIndex] && slashMenu.filtered[slashMenu.selectedIndex].id;
        slashMenu.query = query;
        slashMenu.filtered = filterSlashItems(query);
        const newIdx = slashMenu.filtered.findIndex((i) => i.id === prevId);
        slashMenu.selectedIndex = newIdx >= 0 ? newIdx : 0;
        renderSlashMenu();
        markSlashLine();
        positionSlashMenu();
    }

    function closeSlashMenu() {
        if (!slashMenu.open) return;
        slashMenu.open = false;
        slashMenu.el.classList.remove('show');
        unmarkSlashLine();
        const el = slashMenu.el;
        setTimeout(() => { if (!slashMenu.open) el.hidden = true; }, 160);
    }

    function clearLineFormats(index) {
        ['header', 'blockquote', 'code-block', 'list', 'caption'].forEach((n) => {
            quill.formatLine(index, 1, n, false, 'user');
        });
    }

    function applySlashSelection() {
        if (!slashMenu.open || !slashMenu.filtered.length) return;
        const item = slashMenu.filtered[slashMenu.selectedIndex];
        const start = slashMenu.startIndex;
        const length = 1 + slashMenu.query.length;
        closeSlashMenu();
        withCleanupSuppressed(() => {
            quill.deleteText(start, length, 'user');
            if (item.id === 'divider') {
                quill.insertEmbed(start, 'divider', true, 'user');
                quill.setSelection(start + 1, 0, 'user');
                return;
            }
            clearLineFormats(start);
            switch (item.id) {
                case 'h1': quill.formatLine(start, 1, 'header', 1, 'user'); break;
                case 'h2': quill.formatLine(start, 1, 'header', 2, 'user'); break;
                case 'h3': quill.formatLine(start, 1, 'header', 3, 'user'); break;
                case 'body': break;
                case 'bullet': quill.formatLine(start, 1, 'list', 'bullet', 'user'); break;
                case 'ordered': quill.formatLine(start, 1, 'list', 'ordered', 'user'); break;
                case 'quote': quill.formatLine(start, 1, 'blockquote', true, 'user'); break;
                case 'code': quill.formatLine(start, 1, 'code-block', true, 'user'); break;
            }
            quill.setSelection(start, 0, 'user');
            if (item.id === 'inline-code') {
                quill.format('code', true, 'user');
            }
        });
    }

    buildSlashMenu();

    quill.on('text-change', (delta, _oldDelta, source) => {
        if (source !== 'user') return;
        if (slashMenu.open) {
            const [line] = quill.getLine(slashMenu.startIndex);
            if (!line || !line.domNode) { closeSlashMenu(); return; }
            const lineStart = quill.getIndex(line);
            const text = line.domNode.textContent || '';
            if (lineStart !== slashMenu.startIndex || text[0] !== '/' || /\n/.test(text)) {
                closeSlashMenu();
                return;
            }
            updateSlashMenuQuery(text.slice(1));
            return;
        }
        let pos = 0;
        for (const op of delta.ops) {
            if (op.retain != null) { pos += op.retain; continue; }
            if (typeof op.insert === 'string') {
                if (op.insert === '/') {
                    const [line] = quill.getLine(pos);
                    if (line && line.domNode && !line.domNode.classList.contains('caption')) {
                        const lineStart = quill.getIndex(line);
                        const text = line.domNode.textContent || '';
                        if (pos === lineStart && text === '/') {
                            openSlashMenu(pos);
                            break;
                        }
                    }
                }
                pos += op.insert.length;
            } else if (op.insert) {
                pos += 1;
            }
        }
    });

    quill.on('selection-change', (range) => {
        if (!slashMenu.open) return;
        if (!range) { closeSlashMenu(); return; }
        const [line] = quill.getLine(slashMenu.startIndex);
        if (!line) { closeSlashMenu(); return; }
        const lineStart = quill.getIndex(line);
        const lineEnd = lineStart + line.length();
        if (range.index < slashMenu.startIndex || range.index > lineEnd) closeSlashMenu();
    });

    function exitInlineCodeIfBoundary(e) {
        const range = quill.getSelection();
        if (!range || range.length !== 0) return false;
        const fmt = quill.getFormat(range);
        if (!fmt.code) return false;
        const ahead = quill.getFormat(range.index, 1);
        if (ahead && ahead.code) return false;
        e.preventDefault();
        e.stopImmediatePropagation();
        quill.format('code', false, 'user');
        return true;
    }

    quill.root.addEventListener('keydown', (e) => {
        if (!slashMenu.open) {
            if (e.key === 'ArrowRight' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
                exitInlineCodeIfBoundary(e);
            }
            return;
        }
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!slashMenu.filtered.length) return;
            slashMenu.selectedIndex = (slashMenu.selectedIndex + 1) % slashMenu.filtered.length;
            updateSlashHighlight();
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!slashMenu.filtered.length) return;
            slashMenu.selectedIndex = (slashMenu.selectedIndex - 1 + slashMenu.filtered.length) % slashMenu.filtered.length;
            updateSlashHighlight();
        } else if (e.key === 'Enter') {
            if (!slashMenu.filtered.length) { closeSlashMenu(); return; }
            e.preventDefault();
            e.stopImmediatePropagation();
            applySlashSelection();
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopImmediatePropagation();
            closeSlashMenu();
        } else if (e.key === 'Tab') {
            if (!slashMenu.filtered.length) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            applySlashSelection();
        }
    }, true);

    document.addEventListener('mousedown', (e) => {
        if (!slashMenu.open) return;
        if (slashMenu.el.contains(e.target)) return;
        closeSlashMenu();
    });

    window.addEventListener('scroll', () => { if (slashMenu.open) positionSlashMenu(); }, true);
    window.addEventListener('resize', () => { if (slashMenu.open) positionSlashMenu(); });

    if (document.body.dataset.mode === 'edit') {
        setTimeout(() => {
            const len = quill.getLength();
            quill.setSelection(Math.max(0, len - 1), 0, 'silent');
            quill.root.scrollIntoView({ block: 'end' });
        }, 0);
    }
})();

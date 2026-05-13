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

    const toggleInline = (name) => function (range) {
        if (!range) return;
        const fmt = this.quill.getFormat(range);
        this.quill.format(name, !fmt[name], 'user');
    };

    const toggleHeader = (level) => function (range) {
        if (!range) return;
        const fmt = this.quill.getFormat(range);
        this.quill.format('header', fmt.header === level ? false : level, 'user');
    };

    const setBody = function (range) {
        if (!range) return;
        ['header', 'blockquote', 'code-block', 'list', 'caption'].forEach((n) => {
            this.quill.format(n, false, 'user');
        });
    };

    const toggleList = (kind) => function (range) {
        if (!range) return;
        const fmt = this.quill.getFormat(range);
        this.quill.format('list', fmt.list === kind ? false : kind, 'user');
    };

    const toggleQuote = function (range) {
        if (!range) return;
        const fmt = this.quill.getFormat(range);
        this.quill.format('blockquote', !fmt.blockquote, 'user');
    };

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

    [
        [{ key: 'X', shortKey: true, shiftKey: true }, toggleInline('strike')],
        [{ key: 'K', shortKey: true }, triggerLink],
        [{ key: '1', shortKey: true, altKey: true }, toggleHeader(1)],
        [{ key: '2', shortKey: true, altKey: true }, toggleHeader(2)],
        [{ key: '3', shortKey: true, altKey: true }, toggleHeader(3)],
        [{ key: '0', shortKey: true, altKey: true }, setBody],
        [{ key: '8', shortKey: true, shiftKey: true }, toggleList('bullet')],
        [{ key: '7', shortKey: true, shiftKey: true }, toggleList('ordered')],
        [{ key: 'Q', shortKey: true, shiftKey: true }, toggleQuote],
        [{ key: 'E', shortKey: true }, toggleInline('code')],
        [{ key: 'I', shortKey: true, shiftKey: true }, triggerImage],
        [{ key: 'N', shortKey: true, altKey: true }, function () { insertFootnote(); }],
    ].forEach(([binding, handler]) => {
        quill.keyboard.addBinding(binding, handler);
    });

    const tooltipMap = [
        ['.ql-bold', 'Bold', '⌘B'],
        ['.ql-italic', 'Italic', '⌘I'],
        ['.ql-underline', 'Underline', '⌘U'],
        ['.ql-strike', 'Strikethrough', '⌘⇧X'],
        ['.ql-link', 'Link', '⌘K'],
        ['.ql-blockquote', 'Quote', '⌘⇧Q'],
        ['.ql-code-block', 'Code block', null],
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

    if (document.body.dataset.mode === 'edit') {
        setTimeout(() => {
            const len = quill.getLength();
            quill.setSelection(Math.max(0, len - 1), 0, 'silent');
            quill.root.scrollIntoView({ block: 'end' });
        }, 0);
    }
})();

/**
 * ============================================================
 *  MegaForm Widget: Rich Text Editor (WYSIWYG) v2.0
 * ============================================================
 *
 *  Powered by Quill.js 1.3.7 (snow theme, lazy-loaded from local module assets).
 *
 *  Features
 *  ────────
 *  • Three toolbar presets: full / basic / minimal
 *  • Secure image upload through the module's own API
 *    – DNN  → /API/MegaForm/Upload/Image
 *    – Oqtane → /api/MegaForm/Upload/Image
 *    – Fallback: base64-inline (no server required)
 *  • Character & word counters with optional limits
 *  • Read-only mode (for viewing submissions / builder preview)
 *  • Paste sanitisation (strip dangerous scripts/iframes)
 *  • Conditional logic via standard hidden <input>
 *  • Mobile responsive (toolbar wraps, min-height adapts)
 *  • Builder property panel: height, toolbar, placeholder,
 *    readOnly, maxLength, showWordCount, imageUpload toggle
 *  • Full keyboard accessibility + ARIA labels
 *
 *  Compile
 *  ───────
 *  tsc megaform-widget-rich-text.ts --target ES5 --lib ES5,DOM \
 *      --outFile ../js/plugins/megaform-widget-rich-text.js
 *
 *  Or: included in the build pipeline alongside other widgets.
 *
 *  Runtime dependency
 *  ─────────────────
 *  megaform-widgets.js (MegaFormWidgets registry) must load first.
 *  Quill.js 1.3.7 is lazy-loaded at bind time if not already present.
 *
 *  © 2025 MegaForm — MIT-style licence within the module.
 * ============================================================
 */
// ── Namespace ────────────────────────────────────────────────
var MegaRTE;
(function (MegaRTE) {
    /* ──────────────────────────────────────────────────────────
       Utility helpers
       ────────────────────────────────────────────────────────── */
    function escHtml(s) {
        return String(s == null ? "" : s)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    MegaRTE.escHtml = escHtml;
    function mergeDefaults(wp) {
        return {
            height: parseInt(wp && wp.height) || 250,
            toolbar: (wp && wp.toolbar) || "full",
            placeholder: (wp && wp.placeholder) || "Start writing…",
            readOnly: !!(wp && wp.readOnly),
            maxLength: parseInt(wp && wp.maxLength) || 0,
            showWordCount: wp ? wp.showWordCount !== false : true,
            imageUpload: (wp && wp.imageUpload) || "api",
            apiBaseUrl: (wp && wp.apiBaseUrl) || "",
            platform: (wp && wp.platform) || "auto",
        };
    }
    /** Strip <script>, <iframe>, on* attributes from pasted HTML */
    function sanitiseHtml(html) {
        // Remove script / iframe tags entirely
        html = html.replace(/<script[\s\S]*?<\/script>/gi, "");
        html = html.replace(/<iframe[\s\S]*?<\/iframe>/gi, "");
        html = html.replace(/<iframe[\s\S]*?\/>/gi, "");
        // Remove event handlers
        html = html.replace(/\s+on\w+\s*=\s*"[^"]*"/gi, "");
        html = html.replace(/\s+on\w+\s*=\s*'[^']*'/gi, "");
        // Remove javascript: URLs
        html = html.replace(/href\s*=\s*"javascript:[^"]*"/gi, 'href="#"');
        html = html.replace(/src\s*=\s*"javascript:[^"]*"/gi, 'src=""');
        return html;
    }
    function countWords(text) {
        var trimmed = text.trim();
        if (!trimmed)
            return 0;
        return trimmed.split(/\s+/).length;
    }
    function countChars(text) {
        return text.length;
    }
    /* ──────────────────────────────────────────────────────────
       Quill.js lazy loader (self-hosted, with CDN fallback)
       ────────────────────────────────────────────────────────── */
    var _quillLoading = false;
    var _quillReady = false;
    var _quillQueue = [];
    function resolveAssetBase() {
        if (window.MegaFormConfig && window.MegaFormConfig.assetBaseUrl) {
            return String(window.MegaFormConfig.assetBaseUrl).replace(/\/+$/, "");
        }
        if (document.querySelector('meta[name="oqtane"]')) {
            return "/Modules/MegaForm/Assets";
        }
        return "/DesktopModules/MegaForm/Assets";
    }
    function finishQuillLoad() {
        _quillReady = true;
        while (_quillQueue.length) {
            var fn = _quillQueue.shift();
            if (fn)
                fn();
        }
    }
    function ensureQuill(cb) {
        if (typeof Quill !== "undefined") {
            _quillReady = true;
            cb();
            return;
        }
        _quillQueue.push(cb);
        if (_quillLoading)
            return; // already fetching
        _quillLoading = true;
        var assetBase = resolveAssetBase();
        // Load CSS
        var link = document.createElement("link");
        link.rel = "stylesheet";
        link.href = assetBase + "/css/plugins/vendor/quill/quill.snow.css";
        document.head.appendChild(link);
        // Load JS
        var script = document.createElement("script");
        script.src = assetBase + "/js/plugins/vendor/quill/quill.min.js";
        script.onload = finishQuillLoad;
        script.onerror = function () {
            console.warn("MegaRTE: local Quill asset unavailable; trying CDN fallback");
            var fallbackCss = document.createElement("link");
            fallbackCss.rel = "stylesheet";
            fallbackCss.href = "https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.snow.min.css";
            fallbackCss.crossOrigin = "anonymous";
            document.head.appendChild(fallbackCss);
            var fallbackScript = document.createElement("script");
            fallbackScript.src = "https://cdnjs.cloudflare.com/ajax/libs/quill/1.3.7/quill.min.js";
            fallbackScript.crossOrigin = "anonymous";
            fallbackScript.onload = finishQuillLoad;
            fallbackScript.onerror = function () {
                console.error("MegaRTE: Failed to load both local and CDN Quill.js");
                _quillLoading = false;
            };
            document.head.appendChild(fallbackScript);
        };
        document.head.appendChild(script);
    }
    /* ──────────────────────────────────────────────────────────
       Toolbar configurations
       ────────────────────────────────────────────────────────── */
    function getToolbarConfig(level) {
        if (level === "minimal") {
            return [
                ["bold", "italic", "underline"],
                ["link"],
                ["clean"]
            ];
        }
        if (level === "basic") {
            return [
                ["bold", "italic", "underline", "strike"],
                [{ list: "ordered" }, { list: "bullet" }],
                ["link", "image"],
                ["clean"]
            ];
        }
        // Full toolbar
        return [
            [{ header: [1, 2, 3, 4, false] }],
            [{ font: [] }],
            ["bold", "italic", "underline", "strike"],
            [{ color: [] }, { background: [] }],
            [{ list: "ordered" }, { list: "bullet" }, { indent: "-1" }, { indent: "+1" }],
            [{ align: [] }],
            ["blockquote", "code-block"],
            ["link", "image", "video"],
            [{ script: "sub" }, { script: "super" }],
            [{ direction: "rtl" }],
            ["clean"]
        ];
    }
    /* ──────────────────────────────────────────────────────────
       Secure Image Upload
       ────────────────────────────────────────────────────────── */
    /**
     * Detect the API base URL from the page context.
     *  DNN pattern:    /API/MegaForm/
     *  Oqtane pattern: /api/MegaForm/
     */
    function detectApiBase(platform) {
        // Try explicit setting on the form wrapper
        var wrapper = document.querySelector("[data-mf-api-base]");
        if (wrapper)
            return wrapper.getAttribute("data-mf-api-base") || "";
        // Try from MegaFormConfig global
        if (window.MegaFormConfig && window.MegaFormConfig.apiBaseUrl) {
            return window.MegaFormConfig.apiBaseUrl;
        }
        // Auto-detect from current page context
        if (platform === "oqtane" || document.querySelector('meta[name="oqtane"]')) {
            return "/api/MegaForm/";
        }
        // Default DNN
        var sf = window.$.ServicesFramework;
        if (sf) {
            try {
                var sfi = sf(0); // any moduleId
                return sfi.getServiceRoot("MegaForm");
            }
            catch (e) { /* fall through */ }
        }
        return "/API/MegaForm/";
    }
    /**
     * Upload image to the module's secure endpoint.
     * Returns a Promise<string> with the URL of the uploaded image.
     */
    function uploadImageToApi(file, apiBase) {
        return new Promise(function (resolve, reject) {
            // Validate client-side
            if (file.size > 5 * 1024 * 1024) {
                reject("Image must be under 5 MB");
                return;
            }
            if (!/^image\/(jpeg|png|gif|webp|svg\+xml|bmp)$/i.test(file.type)) {
                reject("Only image files are allowed (JPEG, PNG, GIF, WebP, SVG)");
                return;
            }
            var fd = new FormData();
            fd.append("file", file);
            var xhr = new XMLHttpRequest();
            var url = apiBase.replace(/\/+$/, "") + "/Upload/Image";
            xhr.open("POST", url, true);
            // DNN anti-forgery token
            var tokenInput = document.querySelector('input[name="__RequestVerificationToken"]');
            if (tokenInput) {
                xhr.setRequestHeader("RequestVerificationToken", tokenInput.value);
            }
            // ModuleId header (DNN requires it)
            var modIdEl = document.querySelector("[data-mf-module-id]");
            if (modIdEl) {
                xhr.setRequestHeader("ModuleId", modIdEl.getAttribute("data-mf-module-id") || "");
            }
            var tabIdEl = document.querySelector("[data-mf-tab-id]");
            if (tabIdEl) {
                xhr.setRequestHeader("TabId", tabIdEl.getAttribute("data-mf-tab-id") || "");
            }
            xhr.onload = function () {
                if (xhr.status >= 200 && xhr.status < 300) {
                    try {
                        var resp = JSON.parse(xhr.responseText);
                        if (resp && resp.url) {
                            resolve(resp.url);
                        }
                        else if (resp && resp.Url) {
                            resolve(resp.Url);
                        }
                        else {
                            reject("Upload succeeded but no URL in response");
                        }
                    }
                    catch (e) {
                        reject("Invalid server response");
                    }
                }
                else if (xhr.status === 401 || xhr.status === 403) {
                    reject("Upload not authorised – you may need to log in");
                }
                else {
                    reject("Upload failed (HTTP " + xhr.status + ")");
                }
            };
            xhr.onerror = function () {
                reject("Network error during upload");
            };
            xhr.send(fd);
        });
    }
    /**
     * Read file as base64 data-URL (fallback when API not available).
     */
    function readAsDataUrl(file) {
        return new Promise(function (resolve, reject) {
            if (file.size > 5 * 1024 * 1024) {
                reject("Image must be under 5 MB");
                return;
            }
            var reader = new FileReader();
            reader.onload = function (e) { resolve(e.target.result); };
            reader.onerror = function () { reject("Failed to read file"); };
            reader.readAsDataURL(file);
        });
    }
    /* ──────────────────────────────────────────────────────────
       Instance tracker
       ────────────────────────────────────────────────────────── */
    var instances = {};
    /* ──────────────────────────────────────────────────────────
       Initialize a single Quill instance
       ────────────────────────────────────────────────────────── */
    function initQuillInstance(wrap, editorEl, hidden, fieldKey, formId, wp) {
        var id = "mf-" + formId + "-" + fieldKey;
        // Configure toolbar
        var toolbarConfig = wp.readOnly ? false : getToolbarConfig(wp.toolbar);
        // Determine image handling
        var imageInToolbar = !wp.readOnly && wp.imageUpload !== "disabled";
        var quill = new Quill(editorEl, {
            theme: "snow",
            placeholder: wp.placeholder,
            readOnly: wp.readOnly,
            modules: {
                toolbar: toolbarConfig,
                clipboard: { matchVisual: false } // cleaner paste
            }
        });
        // Restore existing content
        if (hidden.value) {
            try {
                var delta = JSON.parse(hidden.value);
                if (delta && delta.ops) {
                    quill.setContents(delta);
                }
                else {
                    quill.clipboard.dangerouslyPasteHTML(sanitiseHtml(hidden.value), "silent");
                }
            }
            catch (_) {
                quill.clipboard.dangerouslyPasteHTML(sanitiseHtml(hidden.value), "silent");
            }
        }
        // Word + char counters
        var wordCountEl = wrap.querySelector(".mfw-rte-word-count");
        var charCountEl = wrap.querySelector(".mfw-rte-char-count");
        function updateCounters() {
            var text = quill.getText();
            var wc = countWords(text);
            var cc = countChars(text) - 1; // Quill always has trailing \n
            if (wordCountEl) {
                wordCountEl.textContent = wc + " word" + (wc !== 1 ? "s" : "");
            }
            if (charCountEl) {
                if (wp.maxLength > 0) {
                    charCountEl.textContent = cc + " / " + wp.maxLength;
                    charCountEl.className = "mfw-rte-char-count" +
                        (cc > wp.maxLength ? " over-limit" : "");
                }
                else {
                    charCountEl.textContent = cc + " chars";
                }
            }
        }
        // Sync content → hidden input on every change
        quill.on("text-change", function (_delta, _oldDelta, source) {
            var html = quill.root.innerHTML;
            // Quill's empty state is <p><br></p>
            hidden.value = (html === "<p><br></p>" || html === "<p></p>") ? "" : html;
            // Max length enforcement
            if (wp.maxLength > 0) {
                var len = quill.getText().length - 1;
                if (len > wp.maxLength && source === "user") {
                    quill.deleteText(wp.maxLength, len);
                }
            }
            updateCounters();
            // Trigger native input event for conditional-logic watchers
            try {
                hidden.dispatchEvent(new Event("input", { bubbles: true }));
                hidden.dispatchEvent(new Event("change", { bubbles: true }));
            }
            catch (_) { /* IE fallback — ignore */ }
        });
        // Paste sanitisation
        quill.root.addEventListener("paste", function (e) {
            // Let Quill handle the paste, then sanitise after a tick
            setTimeout(function () {
                var currentHtml = quill.root.innerHTML;
                var clean = sanitiseHtml(currentHtml);
                if (clean !== currentHtml) {
                    quill.root.innerHTML = clean;
                    hidden.value = clean;
                }
            }, 0);
        });
        // Image handler — secure upload via module API (or inline fallback)
        if (!wp.readOnly && wp.imageUpload !== "disabled") {
            var tb = quill.getModule("toolbar");
            if (tb) {
                tb.addHandler("image", function () {
                    var input = document.createElement("input");
                    input.type = "file";
                    input.accept = "image/jpeg,image/png,image/gif,image/webp,image/svg+xml";
                    input.style.display = "none";
                    input.addEventListener("change", function () {
                        if (!input.files || !input.files[0])
                            return;
                        var file = input.files[0];
                        // Show uploading indicator
                        var range = quill.getSelection(true);
                        quill.insertText(range.index, "⏳ Uploading image…", { italic: true, color: "#9ca3af" });
                        quill.setSelection(range.index + 22);
                        var uploadPromise = wp.imageUpload === "api"
                            ? uploadImageToApi(file, wp.apiBaseUrl || detectApiBase(wp.platform))
                            : readAsDataUrl(file);
                        uploadPromise
                            .then(function (url) {
                            // Remove placeholder text
                            quill.deleteText(range.index, 22);
                            quill.insertEmbed(range.index, "image", url);
                            quill.setSelection(range.index + 1);
                        })
                            .catch(function (err) {
                            // Remove placeholder, show error
                            quill.deleteText(range.index, 22);
                            quill.insertText(range.index, "⚠ " + String(err), { italic: true, color: "#dc2626" });
                            console.error("MegaRTE image upload:", err);
                            // If API failed, try inline fallback automatically
                            if (wp.imageUpload === "api") {
                                readAsDataUrl(file).then(function (dataUrl) {
                                    var errorLen = String(err).length + 2;
                                    quill.deleteText(range.index, errorLen);
                                    quill.insertEmbed(range.index, "image", dataUrl);
                                }).catch(function () { });
                            }
                        });
                    });
                    document.body.appendChild(input);
                    input.click();
                    // Clean up
                    setTimeout(function () {
                        if (input.parentNode)
                            input.parentNode.removeChild(input);
                    }, 60000);
                });
            }
        }
        // Initial counter update
        updateCounters();
        // Store instance
        var inst = {
            quill: quill,
            hidden: hidden,
            wrap: wrap,
            fieldKey: fieldKey,
            wp: wp,
            wordCountEl: wordCountEl,
            charCountEl: charCountEl
        };
        instances[id] = inst;
    }
    /**
     * Return the live editor instance for host integrations such as Razor modules.
     * The storage key mirrors the widget's generated DOM id.
     */
    function getInstance(formId, fieldKey) {
        return instances["mf-" + formId + "-" + fieldKey] || null;
    }
    MegaRTE.getInstance = getInstance;
    /**
     * Insert a gallery image through Quill so the canonical hidden HTML value and
     * all native input/change listeners stay synchronized.
     */
    function insertImage(formId, fieldKey, url, altText) {
        var inst = getInstance(formId, fieldKey);
        if (!inst || !inst.quill || !url)
            return false;
        var quill = inst.quill;
        var range = quill.getSelection(true) || { index: Math.max(0, quill.getLength() - 1) };
        quill.insertEmbed(range.index, "image", url, "user");
        quill.setSelection(range.index + 1, 0, "silent");
        if (altText) {
            var images = quill.root.querySelectorAll("img");
            for (var index = images.length - 1; index >= 0; index--) {
                if (images[index].getAttribute("src") === url) {
                    images[index].setAttribute("alt", altText);
                    break;
                }
            }
            inst.hidden.value = sanitiseHtml(quill.root.innerHTML);
            try {
                inst.hidden.dispatchEvent(new Event("input", { bubbles: true }));
                inst.hidden.dispatchEvent(new Event("change", { bubbles: true }));
            }
            catch (_) { /* IE fallback — ignore */ }
        }
        return true;
    }
    MegaRTE.insertImage = insertImage;
    /* ──────────────────────────────────────────────────────────
       Plugin registration
       ────────────────────────────────────────────────────────── */
    MegaFormWidgets.register("RichText", {
        meta: {
            label: "Rich Text Editor",
            icon: "fa-align-left",
            category: "advanced"
        },
        defaults: {
            height: 250,
            toolbar: "full",
            placeholder: "Start writing…",
            readOnly: false,
            maxLength: 0,
            showWordCount: true,
            imageUpload: "api", // "api" | "inline" | "disabled"
            platform: "auto"
        },
        properties: [
            {
                key: "toolbar", label: "Toolbar Preset", type: "select",
                options: [
                    { label: "Full (headers, fonts, colors, media)", value: "full" },
                    { label: "Basic (formatting, lists, links)", value: "basic" },
                    { label: "Minimal (bold, italic, links)", value: "minimal" }
                ],
                default: "full"
            },
            { key: "height", label: "Editor Height (px)", type: "number", default: 250 },
            { key: "placeholder", label: "Placeholder Text", type: "text", default: "Start writing…" },
            { key: "maxLength", label: "Max Characters (0 = unlimited)", type: "number", default: 0 },
            { key: "showWordCount", label: "Show Word/Char Count", type: "checkbox", default: true },
            { key: "readOnly", label: "Read Only", type: "checkbox", default: false },
            {
                key: "imageUpload", label: "Image Upload Mode", type: "select",
                options: [
                    { label: "Secure API (recommended)", value: "api" },
                    { label: "Inline Base64", value: "inline" },
                    { label: "Disabled", value: "disabled" }
                ],
                default: "api"
            },
            {
                key: "platform", label: "Platform", type: "select",
                options: [
                    { label: "Auto-detect", value: "auto" },
                    { label: "DNN", value: "dnn" },
                    { label: "Oqtane", value: "oqtane" }
                ],
                default: "auto"
            }
        ],
        /* ── render() ─────────────────────────────────────────
           Returns initial HTML. Quill is mounted later in bind().
           ───────────────────────────────────────────────────── */
        render: function (field, formId, val) {
            var id = "mf-" + formId + "-" + field.key;
            var wp = mergeDefaults(field.widgetProps);
            var h = wp.height;
            var ro = wp.readOnly;
            var html = '<div class="mfw-rte-wrap' + (ro ? " mfw-rte-readonly" : "") + '" '
                + 'id="' + id + '-wrap" '
                + 'data-field-key="' + escHtml(field.key) + '" '
                + 'data-form-id="' + escHtml(formId) + '" '
                + 'data-toolbar="' + escHtml(wp.toolbar) + '" '
                + 'data-placeholder="' + escHtml(wp.placeholder) + '" '
                + 'data-readonly="' + (ro ? "1" : "0") + '" '
                + 'data-height="' + h + '" '
                + 'data-max-length="' + wp.maxLength + '" '
                + 'data-image-upload="' + escHtml(wp.imageUpload) + '" '
                + 'data-platform="' + escHtml(wp.platform) + '" '
                + 'role="group" aria-label="' + escHtml(field.label || "Rich text editor") + '">';
            // Label
            html += '<label class="mfw-rte-label" for="' + id + '-editor">'
                + escHtml(field.label || "Content");
            if (field.required)
                html += ' <span class="mf-required">*</span>';
            html += '</label>';
            // Help text
            if (field.helpText) {
                html += '<div class="mfw-rte-help">' + escHtml(field.helpText) + '</div>';
            }
            // Editor container (Quill mounts here)
            html += '<div class="mfw-rte-editor-wrap">';
            html += '<div class="mfw-rte-editor" id="' + id + '-editor" '
                + 'style="min-height:' + h + 'px;" '
                + 'aria-label="' + escHtml(field.label || "Rich text editor") + '"></div>';
            // Loading overlay
            html += '<div class="mfw-rte-loading" id="' + id + '-loading">'
                + '<div class="mfw-rte-loading-spinner"></div>'
                + '<span>Loading editor…</span></div>';
            html += '</div>'; // .mfw-rte-editor-wrap
            // Status bar (word/char count)
            if (wp.showWordCount) {
                html += '<div class="mfw-rte-status-bar">';
                html += '<span class="mfw-rte-word-count">0 words</span>';
                html += '<span class="mfw-rte-char-count">'
                    + (wp.maxLength > 0 ? '0 / ' + wp.maxLength : '0 chars')
                    + '</span>';
                html += '</div>';
            }
            // Hidden input for conditional logic + form data
            html += '<input type="hidden" name="' + field.key + '" id="' + id + '" '
                + 'value="' + escHtml(val || "") + '">';
            // Error slot
            html += '<div class="mf-field-error" id="mf-err-' + field.key + '"></div>';
            html += '</div>'; // .mfw-rte-wrap
            return html;
        },
        /* ── bind() ───────────────────────────────────────────
           Called once after HTML is in the DOM.
           Lazy-loads Quill then initialises each editor instance.
           ───────────────────────────────────────────────────── */
        bind: function (formId) {
            var wraps = document.querySelectorAll(".mfw-rte-wrap");
            wraps.forEach(function (wrapNode) {
                var wrap = wrapNode;
                if (wrap._rteBound)
                    return;
                wrap._rteBound = true;
                var fieldKey = wrap.getAttribute("data-field-key") || "";
                var fid = wrap.getAttribute("data-form-id") || formId;
                var editorEl = wrap.querySelector(".mfw-rte-editor");
                var loadingEl = wrap.querySelector(".mfw-rte-loading");
                var hidden = wrap.querySelector('input[type="hidden"]');
                if (!editorEl || !hidden)
                    return;
                // Read config from data attributes
                var wp = mergeDefaults({
                    toolbar: wrap.getAttribute("data-toolbar"),
                    placeholder: wrap.getAttribute("data-placeholder"),
                    readOnly: wrap.getAttribute("data-readonly") === "1",
                    height: wrap.getAttribute("data-height"),
                    maxLength: wrap.getAttribute("data-max-length"),
                    imageUpload: wrap.getAttribute("data-image-upload"),
                    platform: wrap.getAttribute("data-platform"),
                    showWordCount: !!wrap.querySelector(".mfw-rte-status-bar"),
                });
                ensureQuill(function () {
                    // Hide loading spinner
                    if (loadingEl) {
                        loadingEl.style.display = "none";
                    }
                    try {
                        initQuillInstance(wrap, editorEl, hidden, fieldKey, fid, wp);
                    }
                    catch (err) {
                        console.error("MegaRTE: init error for field " + fieldKey, err);
                        if (loadingEl) {
                            loadingEl.innerHTML =
                                '<div class="mfw-rte-error">⚠ Failed to initialise editor</div>';
                            loadingEl.style.display = "";
                        }
                    }
                });
            });
        },
        /* ── collect() ─────────────────────────────────────────
           Retrieve current value (HTML string) for form submission.
           ───────────────────────────────────────────────────── */
        collect: function (key, container) {
            var el = container.querySelector('input[name="' + key + '"]');
            return el ? el.value : "";
        },
        /* ── validate() ───────────────────────────────────────
           Returns true if the field has meaningful content.
           Empty Quill produces "<p><br></p>" — treated as empty.
           Also enforces maxLength if set.
           ───────────────────────────────────────────────────── */
        validate: function (key, container) {
            var el = container.querySelector('input[name="' + key + '"]');
            if (!el)
                return false;
            var val = el.value.trim();
            if (!val || val === "<p><br></p>" || val === "<p></p>")
                return false;
            // Check max length
            var wrap = container.querySelector('.mfw-rte-wrap[data-field-key="' + key + '"]');
            if (wrap) {
                var maxLen = parseInt(wrap.getAttribute("data-max-length") || "0");
                if (maxLen > 0) {
                    // Strip HTML to get text length
                    var tmp = document.createElement("div");
                    tmp.innerHTML = val;
                    var textLen = (tmp.textContent || tmp.innerText || "").length;
                    if (textLen > maxLen)
                        return false;
                }
            }
            return true;
        },
        /* ── renderProperties() ───────────────────────────────
           Called by builder to render the property panel in the
           right sidebar when this widget type is selected.
           ───────────────────────────────────────────────────── */
        renderProperties: function (body, field, onChange) {
            var wp = mergeDefaults(field.widgetProps);
            var h = '';
            h += '<div class="mf-prop-row">';
            h += '<label>Toolbar</label>';
            h += '<select id="mf-prop-rte-toolbar" class="mf-prop-input">';
            h += '<option value="full"' + (wp.toolbar === "full" ? " selected" : "") + '>Full (all features)</option>';
            h += '<option value="basic"' + (wp.toolbar === "basic" ? " selected" : "") + '>Basic (format + lists)</option>';
            h += '<option value="minimal"' + (wp.toolbar === "minimal" ? " selected" : "") + '>Minimal (bold + links)</option>';
            h += '</select></div>';
            h += '<div class="mf-prop-row">';
            h += '<label>Editor Height (px)</label>';
            h += '<input type="number" id="mf-prop-rte-height" class="mf-prop-input" min="100" max="800" value="' + wp.height + '">';
            h += '</div>';
            h += '<div class="mf-prop-row">';
            h += '<label>Placeholder</label>';
            h += '<input type="text" id="mf-prop-rte-placeholder" class="mf-prop-input" value="' + escHtml(wp.placeholder) + '">';
            h += '</div>';
            h += '<div class="mf-prop-row">';
            h += '<label>Max Characters <small style="color:#9ca3af">(0 = no limit)</small></label>';
            h += '<input type="number" id="mf-prop-rte-maxlength" class="mf-prop-input" min="0" value="' + wp.maxLength + '">';
            h += '</div>';
            h += '<div class="mf-prop-row">';
            h += '<label><input type="checkbox" id="mf-prop-rte-wordcount"' + (wp.showWordCount ? ' checked' : '') + '> Show Word/Char Count</label>';
            h += '</div>';
            h += '<div class="mf-prop-row">';
            h += '<label><input type="checkbox" id="mf-prop-rte-readonly"' + (wp.readOnly ? ' checked' : '') + '> Read Only</label>';
            h += '</div>';
            h += '<div class="mf-prop-row">';
            h += '<label>Image Upload</label>';
            h += '<select id="mf-prop-rte-imgupload" class="mf-prop-input">';
            h += '<option value="api"' + (wp.imageUpload === "api" ? " selected" : "") + '>Secure API (recommended)</option>';
            h += '<option value="inline"' + (wp.imageUpload === "inline" ? " selected" : "") + '>Inline Base64</option>';
            h += '<option value="disabled"' + (wp.imageUpload === "disabled" ? " selected" : "") + '>Disabled</option>';
            h += '</select></div>';
            h += '<div class="mf-prop-row">';
            h += '<label>Platform</label>';
            h += '<select id="mf-prop-rte-platform" class="mf-prop-input">';
            h += '<option value="auto"' + (wp.platform === "auto" ? " selected" : "") + '>Auto-detect</option>';
            h += '<option value="dnn"' + (wp.platform === "dnn" ? " selected" : "") + '>DNN</option>';
            h += '<option value="oqtane"' + (wp.platform === "oqtane" ? " selected" : "") + '>Oqtane</option>';
            h += '</select></div>';
            // Preview
            h += '<div class="mf-prop-row" style="margin-top:12px;">';
            h += '<div style="padding:10px;background:#f1f5f9;border-radius:6px;font-size:12px;color:#64748b;">';
            h += '💡 <strong>Tip:</strong> Use "Secure API" for image upload to store files ';
            h += 'through the module\'s own upload endpoint. "Inline Base64" embeds images ';
            h += 'directly in the HTML (increases form data size).';
            h += '</div></div>';
            body.innerHTML = h;
            // Bind change listeners
            var ids = [
                "mf-prop-rte-toolbar", "mf-prop-rte-height", "mf-prop-rte-placeholder",
                "mf-prop-rte-maxlength", "mf-prop-rte-wordcount", "mf-prop-rte-readonly",
                "mf-prop-rte-imgupload", "mf-prop-rte-platform"
            ];
            ids.forEach(function (elId) {
                var el = document.getElementById(elId);
                if (el) {
                    el.addEventListener("change", function () {
                        if (!field.widgetProps)
                            field.widgetProps = {};
                        field.widgetProps.toolbar = document.getElementById("mf-prop-rte-toolbar").value;
                        field.widgetProps.height = parseInt(document.getElementById("mf-prop-rte-height").value) || 250;
                        field.widgetProps.placeholder = document.getElementById("mf-prop-rte-placeholder").value;
                        field.widgetProps.maxLength = parseInt(document.getElementById("mf-prop-rte-maxlength").value) || 0;
                        field.widgetProps.showWordCount = document.getElementById("mf-prop-rte-wordcount").checked;
                        field.widgetProps.readOnly = document.getElementById("mf-prop-rte-readonly").checked;
                        field.widgetProps.imageUpload = document.getElementById("mf-prop-rte-imgupload").value;
                        field.widgetProps.platform = document.getElementById("mf-prop-rte-platform").value;
                        onChange();
                    });
                }
            });
        }
    }); // end register("RichText")
})(MegaRTE || (MegaRTE = {})); // end namespace MegaRTE

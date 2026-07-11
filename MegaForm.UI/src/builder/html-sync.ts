import { MegaFormBuilder } from './core';
import { insertIntoCardBody, syncFieldPlaceholders, reorderFieldTokens } from '@shared/custom-html-insert';
import { isPremiumNativeSchema, syncPremiumNativeShellToSchema } from '@shared/premium-native-migration';

(function () {
    'use strict';

    var B: any = MegaFormBuilder as any;
    var HTML_SYNC_BADGE = 'HTML sync v20260403-06';
    var htmlSyncTimer: any = null;

    function ensureSettings(): any {
        if (!B.state.schema) B.state.schema = { version: '1.0', fields: [], settings: {} };
        if (!B.state.schema.settings) B.state.schema.settings = {};
        return B.state.schema.settings;
    }

    function getCustomHtml(): string {
        var s = ensureSettings();
        return String(s.customHtml || s.CustomHtml || '');
    }

    function setCustomHtml(html: string): void {
        var s = ensureSettings();
        s.customHtml = html;
        s.CustomHtml = html;
        var htmlEd = document.getElementById('mf-custom-html-editor') as HTMLTextAreaElement | null;
        if (htmlEd && htmlEd.value !== html) htmlEd.value = html;
    }

    function normalizeKey(raw: any): string {
        return String(raw || '').trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    function humanizeKey(key: string): string {
        return String(key || '')
            .replace(/[_-]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\b\w/g, function (c) { return c.toUpperCase(); }) || 'Text';
    }

    function extractFieldKeysFromHtml(html: string): string[] {
        var found: string[] = [];
        var seen: Record<string, boolean> = {};
        String(html || '').replace(/\{\{\s*field:([a-zA-Z0-9_-]+)\s*\}\}/g, function (_m: string, key: string) {
            var normalized = normalizeKey(key);
            if (normalized && !seen[normalized]) {
                seen[normalized] = true;
                found.push(normalized);
            }
            return _m;
        });
        return found;
    }

    function escapeRegExp(text: string): string {
        return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function removeFieldTokensFromHtml(html: string, key: string): string {
        var rx = new RegExp('(?:\\s*<div[^>]*>\\s*)?\\{\\{\\s*field:' + escapeRegExp(key) + '\\s*\\}\\}(?:\\s*<\\/div>)?', 'g');
        return String(html || '').replace(rx, '');
    }

    function replaceFieldTokensInHtml(html: string, oldKey: string, newKey: string): string {
        if (!oldKey || !newKey || oldKey === newKey) return String(html || '');
        var rx = new RegExp('(\\{\\{\\s*field:)' + escapeRegExp(oldKey) + '(\\s*\\}\\})', 'g');
        return String(html || '').replace(rx, '$1' + newKey + '$2');
    }

    function flattenFieldRefs(): any[] {
        var list: any[] = [];
        var fields = (B.state.schema && Array.isArray(B.state.schema.fields)) ? B.state.schema.fields : [];
        fields.forEach(function (f: any, index: number) {
            list.push({ key: f.key, field: f, index: index, kind: 'top' });
            if (f && f.type === 'Row' && Array.isArray(f.columns)) {
                f.columns.forEach(function (col: any, colIndex: number) {
                    (col.fields || []).forEach(function (cf: any, fieldIndex: number) {
                        list.push({ key: cf.key, field: cf, rowIndex: index, colIndex: colIndex, fieldIndex: fieldIndex, rowField: f, kind: 'row-child' });
                    });
                });
            }
        });
        return list;
    }

    function findFieldRefByKey(key: string): any | null {
        var refs = flattenFieldRefs();
        for (var i = 0; i < refs.length; i++) {
            if (refs[i].key === key) return refs[i];
        }
        return null;
    }

    function removeFieldRef(ref: any): boolean {
        if (!ref) return false;
        var fields = (B.state.schema && Array.isArray(B.state.schema.fields)) ? B.state.schema.fields : [];
        if (ref.kind === 'top') {
            if (ref.index >= 0 && ref.index < fields.length) {
                fields.splice(ref.index, 1);
                return true;
            }
            return false;
        }
        var row = fields[ref.rowIndex];
        if (!row || row.type !== 'Row' || !Array.isArray(row.columns)) return false;
        var col = row.columns[ref.colIndex];
        if (!col || !Array.isArray(col.fields)) return false;
        if (ref.fieldIndex >= 0 && ref.fieldIndex < col.fields.length) {
            col.fields.splice(ref.fieldIndex, 1);
            return true;
        }
        return false;
    }

    function createStubField(key: string): any {
        return B.createFieldFromTemplate({
            type: 'Text',
            key: key,
            label: humanizeKey(key),
            placeholder: '',
            helpText: '',
            defaultValue: ''
        });
    }

    function ruleNodeTouchesKey(node: any, touched: Record<string, boolean>): boolean {
        if (!node) return false;
        if (node.type === 'rule' && node.field && touched[node.field]) return true;
        var children = Array.isArray(node.children) ? node.children : [];
        for (var i = 0; i < children.length; i++) {
            if (ruleNodeTouchesKey(children[i], touched)) return true;
        }
        return false;
    }

    function actionTouchesKey(action: any, touched: Record<string, boolean>): boolean {
        if (!action) return false;
        var candidates = [action.target, action.field, action.fieldKey, action.sourceField, action.source];
        for (var i = 0; i < candidates.length; i++) {
            if (candidates[i] && touched[String(candidates[i])]) return true;
        }
        return false;
    }

    function removeTouchedRules(keys: string[]): number {
        if (!keys || !keys.length) return 0;
        var touched: Record<string, boolean> = {};
        keys.forEach(function (key) { if (key) touched[key] = true; });
        var settings = ensureSettings();
        var removed = 0;
        var rules = Array.isArray(settings.rules) ? settings.rules : [];
        settings.rules = rules.filter(function (rule: any) {
            var hit = ruleNodeTouchesKey(rule && rule.when, touched);
            if (!hit) {
                var actions = ([] as any[]).concat((rule && rule.then) || [], (rule && rule.else) || []);
                hit = actions.some(function (action: any) { return actionTouchesKey(action, touched); });
            }
            if (hit) removed++;
            return !hit;
        });
        if (Array.isArray((B.state.schema as any).rules)) {
            (B.state.schema as any).rules = settings.rules.slice();
        }
        if ((B.state.schema as any).rulesJson) {
            try { (B.state.schema as any).rulesJson = JSON.stringify(settings.rules); } catch (_e) {}
        }
        flattenFieldRefs().forEach(function (ref: any) {
            var field = ref.field;
            if (!field) return;
            if (touched[ref.key] && field.showIf) {
                field.showIf = null;
                return;
            }
            var conds = field.showIf && Array.isArray(field.showIf.conditions) ? field.showIf.conditions : null;
            if (!conds || !conds.length) return;
            var hitCond = conds.some(function (cond: any) { return cond && cond.fieldKey && touched[String(cond.fieldKey)]; });
            if (hitCond) field.showIf = null;
        });
        return removed;
    }

    function cleanupSelection(): void {
        var selectedIndex = typeof B.state.selectedFieldIndex === 'number' ? B.state.selectedFieldIndex : -1;
        if (selectedIndex >= 0) {
            var topField = B.state.schema.fields[selectedIndex];
            if (!topField) B.state.selectedFieldIndex = -1;
        }
        var rowRef = B.state._rowFieldRef || null;
        if (rowRef && typeof rowRef.rowIndex === 'number') {
            var row = B.state.schema.fields[rowRef.rowIndex];
            var child = row && row.type === 'Row' && row.columns && row.columns[rowRef.colIndex] && row.columns[rowRef.colIndex].fields
                ? row.columns[rowRef.colIndex].fields[rowRef.fieldIndex]
                : null;
            if (!child) B.state._rowFieldRef = null;
        }
        if (B.state.selectedFieldIndex < 0 && !B.state._rowFieldRef) {
            B.callModule('properties', 'hideProps');
        }
    }

    // [B266] Delegate to the shared, quote-agnostic, shell-agnostic inserter so an auto-injected
    // field token lands INSIDE the card (before the actions/submit area) instead of before the
    // document-final </div>. The old exact double-quoted anchors never matched single-quoted
    // template markup (class='mfp-actions'), so the fallback ejected fields outside the .mfp card
    // (e.g. form 803 "Geolocation").
    function insertBeforeActions(html: string, tag: string): string {
        return insertIntoCardBody(html, '      <div class="mf-custom-field">' + tag + '</div>\n');
    }

    function insertFieldTokenAfterKey(html: string, insertAfterKey: string, tag: string): string {
        if (!insertAfterKey || !tag || html.indexOf(tag) !== -1) return String(html || '');
        var rx = new RegExp('(\{\{\s*field:' + escapeRegExp(insertAfterKey) + '\s*\}\})');
        if (!rx.test(html)) return String(html || '');
        return String(html || '').replace(rx, function (m: string) {
            return m + '\n' + tag;
        });
    }


    function insertFieldTokenBeforeKey(html: string, insertBeforeKey: string, tag: string): string {
        if (!insertBeforeKey || !tag || html.indexOf(tag) !== -1) return String(html || '');
        var rx = new RegExp('(\{\{\s*field:' + escapeRegExp(insertBeforeKey) + '\s*\}\})');
        if (!rx.test(html)) return String(html || '');
        return String(html || '').replace(rx, function (m: string) {
            return tag + '\n' + m;
        });
    }

    function syncHtmlToSchemaImmediate(options?: any): any {
        var html = getCustomHtml();
        if (!String(html || '').trim()) return { added: 0, removed: 0, rulesRemoved: 0 };
        var tokenKeys = extractFieldKeysFromHtml(html);
        var tokenSet: Record<string, boolean> = {};
        tokenKeys.forEach(function (key) { tokenSet[key] = true; });
        var added = 0;
        var removed = 0;
        var removedKeys: string[] = [];

        tokenKeys.forEach(function (key) {
            if (!findFieldRefByKey(key)) {
                B.state.schema.fields.push(createStubField(key));
                added++;
            }
        });

        var refs = flattenFieldRefs().slice().reverse();
        refs.forEach(function (ref: any) {
            if (ref.field && ref.field.type === 'Section') {
                return;
            }
            if (ref.kind === 'top') {
                if (ref.field && ref.field.type === 'Row') {
                    var hasRowToken = !!tokenSet[ref.key];
                    var hasLegacyChildToken = false;
                    (ref.field.columns || []).forEach(function (col: any) {
                        (col.fields || []).forEach(function (cf: any) {
                            if (tokenSet[String(cf.key || '')]) hasLegacyChildToken = true;
                        });
                    });
                    if (!hasRowToken && !hasLegacyChildToken) {
                        if (removeFieldRef(ref)) {
                            removed++;
                            removedKeys.push(ref.key);
                        }
                    }
                    return;
                }
                if (!tokenSet[ref.key]) {
                    if (removeFieldRef(ref)) {
                        removed++;
                        removedKeys.push(ref.key);
                    }
                }
                return;
            }
            var rowTokenPresent = ref.rowField && tokenSet[String(ref.rowField.key || '')];
            if (rowTokenPresent) return;
            if (!tokenSet[ref.key]) {
                if (removeFieldRef(ref)) {
                    removed++;
                    removedKeys.push(ref.key);
                }
            }
        });

        var rulesRemoved = removeTouchedRules(removedKeys);
        if (added || removed || rulesRemoved) {
            B.state.isDirty = true;
            cleanupSelection();
        }
        return { added: added, removed: removed, rulesRemoved: rulesRemoved };
    }

    function syncSchemaToHtmlImmediate(options?: any): any {
        var html = getCustomHtml();
        if (!String(html || '').trim()) return { updated: false, injected: 0, removedTokens: 0, rulesRemoved: 0 };
        options = options || {};
        var originalHtml = html;
        var removedTokens = 0;
        var injected = 0;
        var rulesRemoved = 0;

        if (options.renameMap && options.renameMap.oldKey && options.renameMap.newKey && options.renameMap.oldKey !== options.renameMap.newKey) {
            html = replaceFieldTokensInHtml(html, options.renameMap.oldKey, options.renameMap.newKey);
            rulesRemoved += removeTouchedRules([options.renameMap.oldKey]);
        }

        if (Array.isArray(options.removeKeys)) {
            options.removeKeys.forEach(function (key: string) {
                var next = removeFieldTokensFromHtml(html, key);
                if (next !== html) {
                    removedTokens++;
                    html = next;
                }
            });
            rulesRemoved += removeTouchedRules(options.removeKeys);
        }

        // [2026-06-27] Honour an EXPLICIT manual insert position first (insert-after /
        // insert-before a sibling), then delegate ALL remaining token bookkeeping to the
        // shared structure-aware sync: it drops orphan + duplicate + Row-rendered-sub-field
        // tokens and places any missing field's token INSIDE its data-step panel (not before
        // the shared actions row at the very end, which collapsed the multi-step wizard).
        if (options.insertKey) {
            var insTag = '{{field:' + options.insertKey + '}}';
            if (html.indexOf(insTag) === -1) {
                var positioned = html;
                if (options.insertAfterKey) positioned = insertFieldTokenAfterKey(html, options.insertAfterKey, insTag);
                if (positioned === html && options.insertBeforeKey) positioned = insertFieldTokenBeforeKey(html, options.insertBeforeKey, insTag);
                if (positioned !== html) { html = positioned; injected++; }
            }
        }
        var schemaFields = (B.state.schema && Array.isArray(B.state.schema.fields)) ? B.state.schema.fields : [];
        var beforeSync = html;
        var afterSync = syncFieldPlaceholders(html, schemaFields);
        if (afterSync !== beforeSync) { html = afterSync; injected++; }

        // [2026-06-28 D1] On an EXPLICIT reorder (builder drag), move each field WRAPPER so the
        // customHtml token order matches the new schema order — this is what makes drag-reorder
        // take effect at render time for custom-shell forms (layout = token order, not schema
        // order). Gated on options.reorder: it must NOT run during AI rebrand/keep-style, which
        // preserves the shell byte-for-byte (the schema order from the model is not authoritative
        // there). Whole-step reorder is intentionally NOT done here (data-step nodes are fixed).
        if (options.reorder) {
            var reordered = reorderFieldTokens(html, schemaFields);
            if (reordered !== html) { html = reordered; injected++; }
        }

        if (isPremiumNativeSchema(B.state.schema)) {
            B.state.schema.settings.customHtml = html;
            B.state.schema.settings.CustomHtml = html;
            if (syncPremiumNativeShellToSchema(B.state.schema)) {
                html = getCustomHtml();
                injected++;
            }
        }

        if (html !== originalHtml) {
            setCustomHtml(html);
            B.state.isDirty = true;
        }
        if (rulesRemoved) {
            B.state.isDirty = true;
        }
        return { updated: html !== originalHtml || !!rulesRemoved, injected: injected, removedTokens: removedTokens, rulesRemoved: rulesRemoved };
    }

    function syncBidirectional(options?: any): any {
        var a = syncHtmlToSchemaImmediate(options);
        var b = syncSchemaToHtmlImmediate(options);
        if ((a.added || a.removed || a.rulesRemoved || b.injected || b.removedTokens || b.rulesRemoved) && options && options.refreshEditors !== false) {
            B.callModule('properties', 'refreshHtmlEditors');
        }
        return { htmlToSchema: a, schemaToHtml: b };
    }

    function scheduleHtmlEditorSync(): void {
        if (htmlSyncTimer) clearTimeout(htmlSyncTimer);
        htmlSyncTimer = setTimeout(function () {
            htmlSyncTimer = null;
            syncBidirectional({ reason: 'html-editor' });
            B.callModule('canvas', 'render');
        }, 220);
    }

    function ensureFooterBadge(): void {
        var badge = document.getElementById('mf-builder-version-badge') as HTMLElement | null;
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
    }

    B.syncHtmlToSchemaImmediate = syncHtmlToSchemaImmediate;
    B.syncSchemaToHtmlImmediate = syncSchemaToHtmlImmediate;
    B.syncCustomHtmlBidirectional = syncBidirectional;
    B.scheduleHtmlEditorSync = scheduleHtmlEditorSync;
    B.ensureBuilderVersionBadge = ensureFooterBadge;

    B.registerModule('html-sync', {
        init: function () {
            ensureFooterBadge();
        },
        syncHtmlToSchemaImmediate: syncHtmlToSchemaImmediate,
        syncSchemaToHtmlImmediate: syncSchemaToHtmlImmediate,
        syncCustomHtmlBidirectional: syncBidirectional,
        scheduleHtmlEditorSync: scheduleHtmlEditorSync,
        ensureFooterBadge: ensureFooterBadge,
        getBadge: function () { return HTML_SYNC_BADGE; }
    });
})();

export {};

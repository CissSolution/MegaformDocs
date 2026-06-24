/**
 * MegaForm AI Form Assistant — Vite entry.
 *
 * One bundle exposing providers + ops + chat. Build output:
 *   Assets/js/megaform-ai-form-assistant.js
 *
 * Mount surfaces:
 *   - Builder page: bubble auto-mounts via [data-mf-builder] sentinel.
 *   - Dashboard page: same via [data-mf-dashboard].
 *   - Inline edit overlay: scaffold, real overlay TBD.
 */

import './providers';
import './ops';
import './chat';
import './settings';
import './inline-edit';

const ENTRY_BADGE = 'MfAiFormAssistant v20260527-04-entry';
(window as any).__MFAI_ENTRY_BADGE__ = ENTRY_BADGE;

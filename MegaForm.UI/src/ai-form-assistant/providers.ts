/**
 * MegaForm AI Form Assistant — multi-provider AI abstraction.
 *
 * Ported from ACME AI Block Builder (E:\CISS.SideMenu.Nuget_GPT\src\ai-client\src\providers.ts)
 * to MegaForm canonical TS. Default provider: OpenAI GPT-4o.
 *
 * Storage:
 *   1. localStorage['megaform-ai'] = { provider, baseUrl, apiKey, model }
 *   2. Server fallback: GET /DesktopModules/MegaForm/API/AiAssistant/DefaultConfig
 *      (reads MegaForm_AI_* HostSettings — see MegaForm.Core/Services/AiAssistant)
 *
 * Exposes window.MF_AI:
 *   MF_AI.providers, getConfig, setConfig, getProvider, chat(opts), test(),
 *   renderSettingsHTML(), wireSettings({onSave})
 *
 * Multi-modal: opts.attachments [{type:'image',dataUrl,...} | {type:'text',name,content}]
 */

export interface ProviderPreset {
  label: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  api: 'openai' | 'anthropic' | 'claude-cli';
  helpUrl: string;
}

export interface AIConfig {
  provider: string;
  baseUrl: string;
  apiKey?: string;
  model: string;
}

export interface Attachment {
  type: 'image' | 'text';
  name: string;
  mediaType?: string;
  dataUrl?: string;
  content?: string;
  size?: number;
  dropped?: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  attachments?: Attachment[];
}

export interface ToolDef {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, any>;
}

export interface ToolCall {
  id: string;
  name: string;
  /** Already-parsed args object. */
  args: Record<string, any>;
}

export interface ChatMessageWithTools extends ChatMessage {
  /** OpenAI: assistant turn that called tools. */
  toolCalls?: ToolCall[];
  /** OpenAI: tool result reply linked back to its tool_call_id. */
  toolCallId?: string;
  /** Slot for `role: 'tool'`. */
  toolResult?: string;
}

export interface ChatOpts {
  system?: string;
  history?: ChatMessage[] | ChatMessageWithTools[];
  user?: string;
  attachments?: Attachment[];
  jsonMode?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** [v20260528-20] When set, AI can call these tools (OpenAI function-calling). */
  tools?: ToolDef[];
  /** 'auto' | 'required' | 'none' | { type:'function', function:{name} } */
  toolChoice?: any;
}

export interface ChatResult {
  /** Final text content (may be empty when AI only emitted tool_calls). */
  text: string;
  /** Tool calls the model wants invoked, or null when none. */
  toolCalls?: ToolCall[] | null;
  /** Raw assistant message including tool_calls — to be appended verbatim to history before sending tool results. */
  rawAssistantMessage?: any;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

export interface MfAiApi {
  providers: Record<string, ProviderPreset>;
  getConfig(): AIConfig;
  setConfig(cfg: AIConfig): void;
  getProvider(): ProviderPreset;
  chat(opts: ChatOpts): Promise<string>;
  /** [v20260528-20] Tool-use variant returning ChatResult with structured tool_calls. */
  chatWithTools(opts: ChatOpts): Promise<ChatResult>;
  test(): Promise<{ ok: boolean; message: string }>;
  renderSettingsHTML(): string;
  wireSettings(opts?: { onSave?: () => void }): void;
}

declare global {
  interface Window {
    MF_AI?: MfAiApi;
    __MF_PLATFORM__?: any;
  }
}

(() => {
  if (window.MF_AI) return;

  const providers: Record<string, ProviderPreset> = {
    openai: {
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      defaultModel: 'gpt-4o',
      models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-3.5-turbo'],
      api: 'openai',
      helpUrl: 'https://platform.openai.com/api-keys',
    },
    claude: {
      label: 'Anthropic Claude',
      baseUrl: 'https://api.anthropic.com/v1',
      defaultModel: 'claude-sonnet-4-5',
      models: [
        'claude-sonnet-4-5',
        'claude-haiku-4-5',
        'claude-opus-4-5',
        'claude-3-5-haiku-20241022',
        'claude-3-5-sonnet-20241022',
      ],
      api: 'anthropic',
      helpUrl: 'https://console.anthropic.com/settings/keys',
    },
    kimi: {
      label: 'Kimi (Moonshot.ai International)',
      baseUrl: 'https://api.moonshot.ai/v1',
      defaultModel: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k', 'kimi-k2-0905-preview', 'moonshot-v1-8k-vision-preview'],
      api: 'openai',
      helpUrl: 'https://platform.moonshot.ai/console/api-keys',
    },
    'kimi-cn': {
      label: 'Kimi (Moonshot.cn China)',
      baseUrl: 'https://api.moonshot.cn/v1',
      defaultModel: 'moonshot-v1-8k',
      models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'],
      api: 'openai',
      helpUrl: 'https://platform.moonshot.cn/console/api-keys',
    },
    openrouter: {
      label: 'OpenRouter (multi-model)',
      baseUrl: 'https://openrouter.ai/api/v1',
      defaultModel: 'openai/gpt-4o',
      models: [
        'openai/gpt-4o',
        'openai/gpt-4o-mini',
        'anthropic/claude-3.5-haiku',
        'anthropic/claude-3.5-sonnet',
        'google/gemini-flash-1.5',
        'meta-llama/llama-3.1-70b-instruct',
        'qwen/qwen-2.5-coder-32b-instruct',
      ],
      api: 'openai',
      helpUrl: 'https://openrouter.ai/keys',
    },
    local: {
      label: 'Local (Ollama / LM Studio)',
      baseUrl: 'http://localhost:11434/v1',
      defaultModel: 'llama3.1',
      models: ['llama3.1', 'qwen2.5', 'mistral', 'codellama'],
      api: 'openai',
      helpUrl: 'https://ollama.com/',
    },
    'megaform-local': {
      label: 'MegaForm Local AI (no API key)',
      baseUrl: '/api/MegaFormAi',
      defaultModel: 'megaform-local-kb',
      models: ['megaform-local-kb'],
      api: 'openai',
      helpUrl: '',
    },
    'claude-cli': {
      // [B88] Free local provider — shells out to the Claude Code CLI on the
      // server (no API key, no token cost). Requires env MEGAFORM_ALLOW_LOCAL_CLI=1.
      // NOTE: pure text completion — no OpenAI function-calling, so the chatbot's
      // KB tool-use loop degrades to plain chat; great for the AI Form Creator
      // and simple edits. baseUrl points at the same-origin server endpoint.
      label: 'Claude Local CLI (free · no token)',
      baseUrl: '/api/AiAssistant/LocalCliChat',
      defaultModel: 'sonnet',
      models: ['default', 'haiku', 'sonnet', 'opus'],
      api: 'claude-cli',
      helpUrl: 'https://docs.anthropic.com/en/docs/claude-code',
    },
    custom: {
      label: 'Custom OpenAI-compatible',
      baseUrl: '',
      defaultModel: '',
      models: [],
      api: 'openai',
      helpUrl: '',
    },
  };

  const DEFAULT_PROVIDER: AIConfig = {
    provider: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
  };

  const STORAGE_KEY = 'megaform-ai';
  let _serverDefaultLoaded = false;

  function getConfig(): AIConfig {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<AIConfig>;
      return saved.apiKey ? (saved as AIConfig) : { ...DEFAULT_PROVIDER, ...saved };
    } catch {
      return { ...DEFAULT_PROVIDER };
    }
  }

  function setConfig(cfg: AIConfig): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
  }

  /**
   * Return the per-platform URL of the AiAssistant DefaultConfig endpoint:
   *   • DNN  → /DesktopModules/MegaForm/API/AiAssistant/DefaultConfig
   *   • Oqtane → /api/AiAssistant/DefaultConfig
   *   • Web/standalone → /api/MegaForm/AiAssistant/DefaultConfig (fallback)
   */
  function aiAssistantDefaultConfigUrl(): string {
    const w = window as any;
    const pf = (w.__MF_PLATFORM__ || {}) as any;
    const platform = String(pf.platform || '').toLowerCase();
    const apiBase = String(pf.apiBase || '');
    // [v20260601-B27 / B51] Detect Oqtane by ANY of:
    //   1. platform === 'oqtane' (set by Razor AddHeadContent before body scripts)
    //   2. apiBase pattern '/api/MegaForm/'
    //   3. window.Oqtane / window.__OQTANE__ globals (set by Blazor runtime)
    //   4. [data-mf-platform=oqtane] sentinel element
    // The IIFE here fires at script-load time; in some Blazor SSR enhanced-nav
    // scenarios pf.platform is unset though pf.apiBase === '/api/MegaForm/' is.
    const isOqtane = (platform === 'oqtane')
      || /^\/api\/MegaForm\/?$/i.test(apiBase)
      || !!w.Oqtane
      || !!w.__OQTANE__
      || !!document.querySelector('[data-mf-platform="oqtane"]');
    if (isOqtane) {
      return '/api/AiAssistant/DefaultConfig';
    }
    // DNN admin shell and any other build that exposes apiBase use the legacy
    // /DesktopModules/MegaForm/API/ root; replace /MegaForm/API/ with /MegaForm/API/AiAssistant/.
    const ab = String(pf.apiBase || '/DesktopModules/MegaForm/API/').replace(/\/?$/, '/');
    return ab + 'AiAssistant/DefaultConfig';
  }

  function withPortalIdQuery(url: string): string {
    if (/[?&]portalId=/i.test(url) || /[?&]entityid=/i.test(url)) return url;
    const pf = (window.__MF_PLATFORM__ || {}) as any;
    const platform = String(pf.platform || '').toLowerCase();
    // [B84] Oqtane AiAssistant controller resolves the site id from the
    // entityid/entityname query (AuthEntityId) with a siteId fallback — without
    // it AuthEntityId returns -1 and the endpoint hands back defaults (no key).
    if (platform === 'oqtane') {
      const sid = pf.siteId ?? pf.SiteId ?? pf.portalId ?? 0;
      const sep = url.indexOf('?') >= 0 ? '&' : '?';
      return url + sep + 'entityid=' + encodeURIComponent(String(sid)) + '&entityname=Site&siteId=' + encodeURIComponent(String(sid));
    }
    const raw = pf.portalId !== undefined ? pf.portalId : pf.PortalId;
    const n = typeof raw === 'number' ? raw : parseInt(String(raw == null ? '0' : raw), 10);
    const pid = isFinite(n) && n >= 0 ? n : 0;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'portalId=' + pid;
  }

  async function loadServerDefault(): Promise<void> {
    if (_serverDefaultLoaded) return;
    _serverDefaultLoaded = true;
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}') as Partial<AIConfig>;
      if (saved.apiKey) return;
      const r = await fetch(withPortalIdQuery(aiAssistantDefaultConfigUrl()), {
        credentials: 'same-origin',
        cache: 'no-store',
      });
      if (r.ok) {
        const def = (await r.json()) as AIConfig;
        // [B88] claude-cli and megaform-local need no apiKey — accept on provider name.
        if (def && (def.apiKey || def.provider === 'claude-cli' || def.provider === 'megaform-local')) {
          setConfig(def);
          // eslint-disable-next-line no-console
          console.log('[MF_AI] loaded server default provider:', def.provider);
        }
      }
    } catch {
      /* file may not exist — that's fine */
    }
  }
  loadServerDefault();

  function getProvider(): ProviderPreset {
    const cfg = getConfig();
    return providers[cfg.provider] || providers['openai']!;
  }

  function buildUserContent(
    text: string,
    attachments: Attachment[] | undefined,
    apiKind: 'openai' | 'anthropic',
  ): string | ContentPart[] {
    let textPart = text || '';
    const images = (attachments || []).filter((a) => a && a.type === 'image' && a.dataUrl);
    const files = (attachments || []).filter((a) => a && a.type === 'text' && a.content);

    if (files.length) {
      const fileBlock = files
        .map((f) => `\n--- FILE: ${f.name || 'attachment.txt'} ---\n${f.content}\n--- END FILE ---`)
        .join('\n');
      textPart = (textPart || '') + fileBlock;
    }

    if (!images.length) return textPart;

    if (apiKind === 'anthropic') {
      const parts: ContentPart[] = [];
      for (const img of images) {
        const m = (img.dataUrl || '').match(/^data:([^;]+);base64,(.+)$/);
        if (!m) continue;
        parts.push({ type: 'image', source: { type: 'base64', media_type: m[1]!, data: m[2]! } });
      }
      parts.push({ type: 'text', text: textPart || '(image attached)' });
      return parts;
    }
    const parts: ContentPart[] = [{ type: 'text', text: textPart || '(image attached)' }];
    for (const img of images) {
      parts.push({ type: 'image_url', image_url: { url: img.dataUrl! } });
    }
    return parts;
  }

  function historyToMessages(
    history: ChatMessage[] | undefined,
    apiKind: 'openai' | 'anthropic',
    includeAttachments: boolean,
  ): Array<{ role: string; content: string | ContentPart[] }> {
    return (history || []).map((m) => {
      if (m.role === 'user' && includeAttachments && m.attachments && m.attachments.length) {
        return { role: 'user', content: buildUserContent(m.content || '', m.attachments, apiKind) };
      }
      return { role: m.role, content: m.content || '' };
    });
  }

  async function chat(opts: ChatOpts): Promise<string> {
    const result = await chatWithTools(opts);
    return result.text;
  }

  /**
   * [v20260528-20] Full chat + tool-use loop entry-point.
   *
   * When `opts.tools` is non-empty, OpenAI may return tool_calls instead of
   * final text. The caller (chat.ts) handles the conversation loop:
   *   call chatWithTools → if toolCalls, dispatch tools → push tool results
   *   into history → call chatWithTools again → repeat until no toolCalls.
   *
   * History items can include `toolCalls` (assistant turn that called tools)
   * and `toolCallId` + `toolResult` (tool result reply) — both are
   * faithfully serialized into the provider wire format.
   */
  /** [v20260529-08] Parse OpenAI "Please try again in N(s|ms)" hints. */
  function parseRetryAfter(text: string): number {
    if (!text) return 0;
    let m = /try again in (\d+(?:\.\d+)?)\s*ms/i.exec(text);
    if (m) return Math.ceil(parseFloat(m[1]));
    m = /try again in (\d+(?:\.\d+)?)\s*s/i.exec(text);
    if (m) return Math.ceil(parseFloat(m[1]) * 1000);
    return 0;
  }

  async function chatWithTools(opts: ChatOpts): Promise<ChatResult> {
    const cfg = getConfig();
    const p = providers[cfg.provider] || providers['openai']!;
    // [B88] claude-cli needs no API key (server shells out to the local CLI).
    if (p.api !== 'claude-cli' && cfg.provider !== 'megaform-local' && !cfg.apiKey) throw new Error('No API key configured. Open AI Settings.');
    const baseUrl = (cfg.baseUrl || p.baseUrl).replace(/\/+$/, '');
    const model = cfg.model || p.defaultModel;
    const attachments = opts.attachments || [];
    const history = (opts.history || []) as ChatMessageWithTools[];

    // [B88] Local Claude CLI — flatten the conversation into one prompt and POST
    // to the same-origin server endpoint. No OpenAI function-calling, so tools
    // are ignored here (chatbot KB-tool loop degrades to plain chat).
    if (p.api === 'claude-cli') {
      const lines: string[] = [];
      history.forEach((h) => {
        const c = typeof h.content === 'string' ? h.content : '';
        if (!c) return;
        lines.push((h.role === 'assistant' ? 'Assistant: ' : 'User: ') + c);
      });
      if (opts.user) lines.push('User: ' + opts.user);
      let prompt = lines.join('\n\n');
      if (opts.jsonMode) prompt += '\n\nIMPORTANT: respond with ONLY raw JSON — no markdown fences, no prose.';
      const url = cfg.baseUrl || p.baseUrl; // same-origin server endpoint
      const res = await fetch(url, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, systemPrompt: opts.system || '', model: model || 'sonnet', timeoutMs: 180000 }),
      });
      if (!res.ok) throw new Error('Local CLI ' + res.status + ': ' + (await res.text()).slice(0, 200));
      const data = (await res.json()) as { ok?: boolean; content?: string; message?: string };
      if (!data || !data.ok) throw new Error((data && data.message) || 'Local CLI error');
      let text = String(data.content || '');
      if (opts.jsonMode) text = text.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      return { text, toolCalls: null, rawAssistantMessage: { role: 'assistant', content: text } };
    }

    const messages: any[] = [];
    if (opts.system && p.api === 'openai') messages.push({ role: 'system', content: opts.system });

    // [v20260529-06] Build a Set of valid tool_call_ids seen on assistant turns
    // so we can drop ORPHAN role:'tool' messages whose assistant ancestor was
    // truncated by saveHistory's .slice(-MAX_HISTORY) cut. OpenAI 400s with
    // "messages with role 'tool' must be a response to a preceeding message
    // with 'tool_calls'" when this pairing is broken.
    const validToolCallIds = new Set<string>();
    let lastAssistantHadCalls = false;

    history.forEach((h) => {
      if (h.role === 'assistant' && h.toolCalls && h.toolCalls.length) {
        h.toolCalls.forEach((tc) => validToolCallIds.add(tc.id));
        messages.push({
          role: 'assistant',
          content: h.content || null,
          tool_calls: h.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.args || {}) },
          })),
        });
        lastAssistantHadCalls = true;
      } else if (h.toolCallId) {
        if (validToolCallIds.has(h.toolCallId)) {
          messages.push({ role: 'tool', tool_call_id: h.toolCallId, content: h.toolResult ?? h.content });
        }
        // else: orphan — drop silently. The matching assistant turn was cut out.
      } else {
        // Any regular user/assistant message after orphan-drop terminates the tool chain.
        lastAssistantHadCalls = false;
        const subset: ChatMessage[] = [{ role: h.role, content: h.content, attachments: h.attachments }];
        historyToMessages(subset, p.api, false).forEach((m) => messages.push(m));
      }
    });

    // [v20260529-06] If the last assistant turn had tool_calls but no
    // corresponding tool result followed (e.g. user submitted next prompt
    // before tools resolved, or a tool result was lost), strip that trailing
    // assistant turn so the next user message can land cleanly.
    if (lastAssistantHadCalls) {
      let lastToolResultIdx = -1;
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'tool') { lastToolResultIdx = i; break; }
        if (messages[i].role === 'assistant' && messages[i].tool_calls) break;
      }
      if (lastToolResultIdx < 0) {
        // No tool result followed the tool_calls — pop the orphan assistant turn.
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === 'assistant' && messages[i].tool_calls) { messages.splice(i, 1); break; }
        }
      }
    }
    if (opts.user || attachments.length) {
      messages.push({ role: 'user', content: buildUserContent(opts.user || '', attachments, p.api) });
    }

    if (p.api === 'anthropic') {
      // Anthropic tool-use schema (only used when tools are passed).
      const body: any = {
        model,
        max_tokens: opts.maxTokens || 4096,
        messages: messages.filter((m) => m.role !== 'system'),
        system: opts.system || undefined,
      };
      if (opts.tools && opts.tools.length) {
        body.tools = opts.tools.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.parameters,
        }));
        if (opts.toolChoice) body.tool_choice = opts.toolChoice;
      }
      const res = await fetch(baseUrl + '/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': cfg.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Claude ' + res.status + ': ' + (await res.text()).slice(0, 200));
      const data = (await res.json()) as { content?: any[] };
      const textParts: string[] = [];
      const toolCalls: ToolCall[] = [];
      (data.content || []).forEach((c: any) => {
        if (c.type === 'text') textParts.push(String(c.text || ''));
        else if (c.type === 'tool_use') toolCalls.push({ id: String(c.id), name: String(c.name), args: c.input || {} });
      });
      return { text: textParts.join('\n'), toolCalls: toolCalls.length ? toolCalls : null, rawAssistantMessage: data };
    }

    // OpenAI-compatible
    const body: Record<string, any> = {
      model,
      messages,
      temperature: opts.temperature != null ? opts.temperature : 0.4,
    };
    if (opts.jsonMode && !(opts.tools && opts.tools.length)) body.response_format = { type: 'json_object' };
    if (opts.maxTokens) body.max_tokens = opts.maxTokens;
    if (opts.tools && opts.tools.length) {
      body.tools = opts.tools.map((t) => ({
        type: 'function',
        function: { name: t.name, description: t.description, parameters: t.parameters },
      }));
      body.tool_choice = opts.toolChoice || 'auto';
    }
    // [v20260529-10] Auto-retry 429 up to 3 times with progressive backoff.
    // gpt-4o has a 30k TPM cap; a long tool chain can briefly burst over
    // that and OpenAI returns "Please try again in Ns". Previously we
    // retried ONCE — but the OpenAI window resets at 60s, so the second
    // retry could also hit. Retrying 3 times spanning ~60s gives the
    // window enough room to clear without nagging the user.
    const doFetch = () => fetch(baseUrl + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
      body: JSON.stringify(body),
    });
    let res = await doFetch();
    let attempts = 0;
    while (res.status === 429 && attempts < 3) {
      attempts++;
      const errText = (await res.text()).slice(0, 500);
      const hinted = parseRetryAfter(errText);
      // Honor provider hint but cap; progressive floor in case hint is tiny.
      const waitMs = Math.min(Math.max(hinted || 0, 8000 * attempts), 25000);
      await new Promise((r) => setTimeout(r, waitMs));
      res = await doFetch();
    }
    if (!res.ok) throw new Error(p.label + ' ' + res.status + ': ' + (await res.text()).slice(0, 200));
    const data = (await res.json()) as { choices?: any[] };
    const msg = data.choices?.[0]?.message;
    const content = msg?.content ?? '';
    const toolCalls: ToolCall[] = [];
    if (Array.isArray(msg?.tool_calls)) {
      msg.tool_calls.forEach((tc: any) => {
        try {
          toolCalls.push({
            id: String(tc.id),
            name: String(tc.function?.name || ''),
            args: tc.function?.arguments ? JSON.parse(tc.function.arguments) : {},
          });
        } catch { /* swallow malformed args */ }
      });
    }
    if (!content && !toolCalls.length) throw new Error('Empty response from ' + p.label);
    return { text: content || '', toolCalls: toolCalls.length ? toolCalls : null, rawAssistantMessage: msg };
  }

  async function test(): Promise<{ ok: boolean; message: string }> {
    try {
      const reply = await chat({ user: 'ping', maxTokens: 5 });
      return { ok: true, message: 'OK · ' + reply.slice(0, 50) };
    } catch (e) {
      return { ok: false, message: (e as Error).message };
    }
  }

  function esc(s: string): string {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderSettingsHTML(): string {
    const cfg = getConfig();
    const providerOpts = Object.keys(providers)
      .map((k) => `<option value="${k}"${cfg.provider === k ? ' selected' : ''}>${esc(providers[k]!.label)}</option>`)
      .join('');
    return [
      '<div class="mf-ai-settings" style="display:grid;gap:8px;font:13px/1.4 system-ui,-apple-system,sans-serif;">',
      '<label style="font-weight:600;font-size:12px;color:#475569;">Provider</label>',
      `<select id="mf-ai-provider" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;">${providerOpts}</select>`,
      '<label style="font-weight:600;font-size:12px;color:#475569;">Base URL</label>',
      `<input id="mf-ai-base" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" value="${esc(cfg.baseUrl || '')}" placeholder="auto from provider">`,
      '<label style="font-weight:600;font-size:12px;color:#475569;">API Key</label>',
      `<input id="mf-ai-key" type="password" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" value="${esc(cfg.apiKey || '')}" placeholder="sk-... / ak-...">`,
      '<label style="font-weight:600;font-size:12px;color:#475569;">Model</label>',
      `<input id="mf-ai-model" style="width:100%;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;" value="${esc(cfg.model || '')}" placeholder="auto from provider" list="mf-ai-models">`,
      '<datalist id="mf-ai-models"></datalist>',
      '<p id="mf-ai-help" style="font-size:11px;color:#64748b;margin:4px 0 0;">Key stored in browser localStorage. Click provider to autofill Base URL + model list.</p>',
      '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;">',
      '  <button type="button" id="mf-ai-test-btn" style="background:transparent;border:0;color:#4f46e5;font-size:13px;cursor:pointer;">Test connection</button>',
      '  <button type="button" id="mf-ai-save-btn" style="background:#4f46e5;color:#fff;padding:8px 16px;border:0;border-radius:6px;font-weight:600;cursor:pointer;">Save</button>',
      '</div>',
      '<div id="mf-ai-test-result" style="font-size:12px;margin-top:4px;"></div>',
      '</div>',
    ].join('');
  }

  function wireSettings(opts?: { onSave?: () => void }): void {
    const sel = document.getElementById('mf-ai-provider') as HTMLSelectElement | null;
    const baseEl = document.getElementById('mf-ai-base') as HTMLInputElement | null;
    const keyEl = document.getElementById('mf-ai-key') as HTMLInputElement | null;
    const modelEl = document.getElementById('mf-ai-model') as HTMLInputElement | null;
    const modelsDl = document.getElementById('mf-ai-models');
    const helpEl = document.getElementById('mf-ai-help');
    const testBtn = document.getElementById('mf-ai-test-btn');
    const saveBtn = document.getElementById('mf-ai-save-btn');
    const resultEl = document.getElementById('mf-ai-test-result');
    if (!sel || !baseEl || !keyEl || !modelEl || !modelsDl || !helpEl || !testBtn || !saveBtn || !resultEl) return;

    function autofill(k: string): void {
      const p = providers[k];
      if (!p) return;
      if (!baseEl!.value || baseEl!.dataset['auto'] === '1') {
        baseEl!.value = p.baseUrl;
        baseEl!.dataset['auto'] = '1';
      }
      if (!modelEl!.value || modelEl!.dataset['auto'] === '1') {
        modelEl!.value = p.defaultModel;
        modelEl!.dataset['auto'] = '1';
      }
      modelsDl!.innerHTML = p.models.map((m) => `<option value="${esc(m)}">`).join('');
      helpEl!.innerHTML =
        'Key stored in browser localStorage. ' +
        (p.helpUrl ? `<a href="${esc(p.helpUrl)}" target="_blank" style="color:#4f46e5;">Get ${esc(p.label)} API key →</a>` : '');
    }
    sel.addEventListener('change', () => {
      baseEl!.dataset['auto'] = '1';
      modelEl!.dataset['auto'] = '1';
      autofill(sel!.value);
    });
    autofill(sel.value);

    testBtn.addEventListener('click', async () => {
      const tmpCfg: AIConfig = { provider: sel!.value, baseUrl: baseEl!.value, apiKey: keyEl!.value, model: modelEl!.value };
      setConfig(tmpCfg);
      resultEl!.textContent = 'Testing…';
      resultEl!.style.color = '#64748b';
      const r = await test();
      resultEl!.textContent = r.message;
      resultEl!.style.color = r.ok ? '#16a34a' : '#dc2626';
    });

    saveBtn.addEventListener('click', () => {
      const cfg: AIConfig = { provider: sel!.value, baseUrl: baseEl!.value, apiKey: keyEl!.value, model: modelEl!.value };
      setConfig(cfg);
      if (opts && typeof opts.onSave === 'function') opts.onSave();
    });
  }

  const api: MfAiApi = {
    providers,
    getConfig,
    setConfig,
    getProvider,
    chat,
    chatWithTools,
    test,
    renderSettingsHTML,
    wireSettings,
  };
  window.MF_AI = api;
})();

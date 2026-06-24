// My Inbox — 3-pane layout (left nav | task list | detail panel)
// Adapted from the Next.js mock design to vanilla TS + CSS.
import type { MyInboxResult, WorkflowInboxTask, DirectoryGroup } from '../workflow-inbox/types';
import type { InboxTaskItem, InboxView, InboxTab, ReplyMode, InboxSort, InboxDensity, InboxTaskStatus } from './types';
import { VIEW_META, STATUS_CONFIG, PRIORITY_CONFIG, HISTORY_TYPE_CFG, STATUS_RANK, adaptTask } from './types';
import { div, span, btn, mk, ic, escapeHtml, escapeAttr, isImageUrl, isHttpUrl, looksLikeHtml, sanitizeHtml, T, el } from './ui';

// [DetailRender 2026-06-16] Render a structured/composite field value (a JSON object such
// as Address parts, Phone-pro, or Confirm-email) as a clean headline + humanized part list
// instead of raw JSON. Shared by My Inbox AND the Submissions detail sheet (which mounts this
// same panel via standalone-detail.mountTaskDetail). Each part is rendered by content kind
// (image → <img>, html → sanitized, url → link, else escaped text).
function mfLooksLikeJsonObject(s: unknown): boolean {
  if (typeof s !== 'string') return false;
  const t = s.trim();
  if (t.length < 2 || t.charAt(0) !== '{' || t.charAt(t.length - 1) !== '}') return false;
  try { const o = JSON.parse(t); return !!o && typeof o === 'object' && !Array.isArray(o); } catch { return false; }
}
function mfHumanizePartKey(k: string): string {
  return String(k || '').replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || k;
}
function mfRenderPartValue(s: string): string {
  if (isImageUrl(s)) return `<img src="${escapeAttr(s)}" alt="" loading="lazy" style="max-width:150px;height:auto;border-radius:6px;display:block">`;
  if (looksLikeHtml(s)) return sanitizeHtml(s);
  if (isHttpUrl(s)) return `<a href="${escapeAttr(s)}" target="_blank" rel="noopener noreferrer">${escapeHtml(s)}</a>`;
  return escapeHtml(s);
}
function mfRenderStructuredValue(raw: string): string {
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(raw); } catch { return escapeHtml(raw); }
  const DISPLAY = ['display', 'Display', 'displayValue', 'DisplayValue', 'formatted', 'Formatted', 'fullName', 'FullName'];
  let headline = '';
  for (const k of DISPLAY) { const val = obj[k]; if (val != null && typeof val !== 'object' && String(val).trim()) { headline = String(val); break; } }
  const keys = Object.keys(obj).filter((k) => !k.startsWith('__') && DISPLAY.indexOf(k) === -1 && obj[k] != null && typeof obj[k] !== 'object' && String(obj[k]).trim() !== '');
  if (!headline && !keys.length) return '<span class="mf-mi3-cell-empty">—</span>';
  let html = '';
  if (headline) html += `<div class="mf-mi3-cell-structured-main" style="font-weight:600;color:#0f172a">${mfRenderPartValue(headline)}</div>`;
  if (keys.length) {
    html += `<div class="mf-mi3-cell-parts" style="display:flex;flex-direction:column;gap:3px;margin-top:${headline ? '4px' : '0'}">`;
    html += keys.map((k) => `<div style="display:flex;gap:8px;align-items:baseline"><span style="min-width:90px;flex-shrink:0;color:#64748b;font-size:11px;font-weight:600">${escapeHtml(mfHumanizePartKey(k))}</span><span style="color:#0f172a;font-size:13px;word-break:break-word">${mfRenderPartValue(String(obj[k]))}</span></div>`).join('');
    html += '</div>';
  }
  return html;
}

export type InboxPaneTab = 'incoming' | 'inProgress' | 'completed';

export interface BoardContext {
  data: MyInboxResult | null;
  tab: InboxPaneTab;
  busy: boolean;
  error: string;
  activeView: InboxView;
  selectedTask: InboxTaskItem | null;
  detailLoading?: boolean;
  // [Standalone 2026-06-14] When the detail is a plain submission with no workflow
  // task, hide Approve/Reject/Return/Forward/Comment (they'd be no-ops) — keep Export.
  hideTaskActions?: boolean;
  replyMode: ReplyMode;
  searchQuery: string;
  priorityFilter: string;
  sortBy: InboxSort;
  density: InboxDensity;
  formFilter: string;
  statusFilter: string;
  openMenu: 'filter' | 'sort' | 'more' | 'density' | 'status' | null;
  enrichLookup?: (submissionId: number) => { returnCount: number; hasAttachment: boolean; tags?: string[] } | undefined;
  isStarred: (taskId: string) => boolean;
  activeDetailTab: InboxTab;
  onTab: (t: InboxPaneTab) => void;
  onRefresh: () => void;
  onViewChange: (v: InboxView) => void;
  onSelectTask: (t: InboxTaskItem | null) => void;
  onSearch: (q: string) => void;
  onToggleMenu: (m: 'filter' | 'sort' | 'more' | 'density' | 'status') => void;
  onSetPriority: (p: string) => void;
  onSetSort: (s: InboxSort) => void;
  onSetDensity: (d: InboxDensity) => void;
  onFormFilter: (formTitle: string) => void;
  onSetStatus: (s: string) => void;
  onOpenInSubmissions: (t: InboxTaskItem) => void;
  onMoreAction: (action: 'snooze' | 'tag' | 'pdf' | 'archive' | 'delete', t: InboxTaskItem) => void;
  // [Forward org-tree]
  directory: DirectoryGroup[] | null;
  dirLoading: boolean;
  forwardTarget: string;
  forwardTargetName: string;
  onForwardSelect: (userName: string, displayName: string) => void;
  onForwardClear: () => void;
  onDetailTab: (t: InboxTab) => void;
  onQuickAction: (kind: 'approve' | 'claim', task: WorkflowInboxTask) => void;
  onReplyMode: (mode: ReplyMode) => void;
  onSubmitReply: (mode: ReplyMode, text: string, target: string) => void;
  onExport: (task: InboxTaskItem) => void;
  onOpen: (task: WorkflowInboxTask, focus?: 'forward' | 'reject' | null) => void;
  onToggleStar: (taskId: string) => void;
}

// Reply-mode presentation config (mock parity).
const REPLY_CFG: Record<Exclude<ReplyMode, 'none'>, { title: string; icon: string; confirm: string; cls: string; placeholder: string; requireText: boolean }> = {
  approve: { title: 'Approve submission',  icon: 'thumbsUp',      confirm: 'Confirm Approval',  cls: 'is-approve', placeholder: 'Approval note (optional)…',        requireText: false },
  reject:  { title: 'Reject submission',   icon: 'thumbsDown',    confirm: 'Confirm Rejection', cls: 'is-reject',  placeholder: 'Reason for rejection (required)…',  requireText: true },
  return:  { title: 'Return for revision', icon: 'rotateCcw',     confirm: 'Send Return',       cls: 'is-return',  placeholder: 'What needs to be revised? (required)…', requireText: true },
  forward: { title: 'Forward task',        icon: 'forward',       confirm: 'Forward',           cls: 'is-forward', placeholder: 'Note to recipient (optional)…',     requireText: false },
  comment: { title: 'Add comment',         icon: 'messageSquare', confirm: 'Add Comment',       cls: 'is-comment', placeholder: 'Write your comment… (required)',    requireText: true },
};

export function renderBoard(mountEl: HTMLElement, ctx: BoardContext): void {
  while (mountEl.firstChild) mountEl.removeChild(mountEl.firstChild);
  const shell = div('mf-mi3-shell');

  if (ctx.error) {
    const err = div('mf-mi3-error');
    err.innerHTML = `${ic('alert', 15)} <span>${escapeHtml(ctx.error)}</span>`;
    shell.appendChild(err);
    mountEl.appendChild(shell);
    return;
  }

  // 3-pane container
  const panes = div('mf-mi3-panes');
  panes.appendChild(buildLeftNav(ctx));
  panes.appendChild(buildTaskList(ctx));
  panes.appendChild(buildDetailPanel(ctx));
  shell.appendChild(panes);

  mountEl.appendChild(shell);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  LEFT NAV (w-52)
// ═══════════════════════════════════════════════════════════════════════════════
function buildLeftNav(ctx: BoardContext): HTMLElement {
  const nav = div('mf-mi3-nav');

  // [Exit link 2026-06-17] My Inbox is a standalone surface (?mfpanel=myinbox) with its
  // OWN nav — without this the admin had no way back to the MegaForm dashboard / other
  // surfaces ("vào inbox là kẹt"). A clear "Back to Dashboard" link at the very top exits
  // to the dashboard (which carries the full Form Builder/Submissions/Settings sidebar).
  // Use a hard navigation so Blazor Server's enhanced-nav can't soft-swap into a stuck SPA.
  const back = el('a', 'mf-mi3-nav-back') as HTMLAnchorElement;
  // The dashboard surface lives on the SAME page as My Inbox, switched by the mfpanel
  // query param (?mfpanel=myinbox → ?mfpanel=dashboard). Build it from the current URL so
  // we land on the real dashboard (which carries the full sidebar), not the public home
  // page. getPlatformRoute('dashboard') returns the bare page path here (no dashboardUrl
  // in the inbox host config) → it would dump the admin on the public form instead.
  const dashUrl = (() => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('mfpanel', 'dashboard');
      u.hash = '';
      return u.pathname + u.search;
    } catch { return '?mfpanel=dashboard'; }
  })();
  back.href = dashUrl;
  back.setAttribute('data-enhance-nav', 'false');
  back.innerHTML = `${ic('arrowLeft', 15)}<span>${T('inbox.back_dashboard', 'Back to Dashboard')}</span>`;
  back.addEventListener('click', (e) => { e.preventDefault(); try { window.location.assign(dashUrl); } catch { window.location.href = dashUrl; } });
  nav.appendChild(back);

  // Header
  const hd = div('mf-mi3-nav-hd');
  const hdLeft = div('mf-mi3-nav-hd-left');
  hdLeft.innerHTML = `<div class="mf-mi3-nav-icon">${ic('inbox', 16)}</div><span class="mf-mi3-nav-title">${T('inbox.title', 'My Inbox')}</span>`;
  const refresh = btn('mf-mi3-nav-refresh', ic('refresh', 14), () => ctx.onRefresh());
  if (ctx.busy) refresh.setAttribute('disabled', 'true');
  mk(hd, hdLeft, refresh);
  nav.appendChild(hd);

  // Views
  const viewsWrap = div('mf-mi3-nav-views');
  const tasks = getAllTasks(ctx);
  const counts = countByView(tasks);
  (Object.keys(VIEW_META) as InboxView[]).forEach((view) => {
    const meta = VIEW_META[view];
    const isActive = ctx.activeView === view;
    const count = counts[view] || 0;
    const b = btn(
      'mf-mi3-nav-view' + (isActive ? ' is-active' : ''),
      `${ic(meta.icon, 16)} <span class="mf-mi3-nav-view-label">${T('inbox.view_' + view, meta.label)}</span>${count > 0 ? `<span class="mf-mi3-nav-view-count${isActive ? ' is-active' : ''}">${count}</span>` : ''}`,
      () => ctx.onViewChange(view),
    );
    viewsWrap.appendChild(b);
  });
  nav.appendChild(viewsWrap);

  // By Form
  const forms = getFormList(ctx);
  if (forms.length) {
    const byFormHd = div('mf-mi3-nav-section-hd', T('inbox.by_form', 'By Form'));
    nav.appendChild(byFormHd);
    const byForm = div('mf-mi3-nav-byform');
    forms.forEach((f) => {
      // [Inbox redesign 2026-06-12] By-Form rows now FILTER the list (click to toggle).
      const isOn = ctx.formFilter === f.name;
      const row = btn('mf-mi3-nav-form' + (isOn ? ' is-active' : ''),
        `<span class="mf-mi3-form-dot ${f.color}"></span><span class="mf-mi3-form-name">${escapeHtml(f.name)}</span><span class="mf-mi3-form-count">${f.count}</span>`,
        () => ctx.onFormFilter(f.name));
      byForm.appendChild(row);
    });
    nav.appendChild(byForm);
  }

  // Tags
  const tags = getTagList(ctx);
  if (tags.length) {
    const tagHd = div('mf-mi3-nav-section-hd', T('inbox.tags', 'Tags'));
    nav.appendChild(tagHd);
    const tagWrap = div('mf-mi3-nav-tags');
    tags.forEach((tag) => {
      const t = div('mf-mi3-nav-tag', `#${tag}`);
      tagWrap.appendChild(t);
    });
    nav.appendChild(tagWrap);
  }

  return nav;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TASK LIST (w-80)
// ═══════════════════════════════════════════════════════════════════════════════
function buildTaskList(ctx: BoardContext): HTMLElement {
  const col = div('mf-mi3-list' + (ctx.density === 'compact' ? ' is-compact' : ''));

  // Toolbar
  const tb = div('mf-mi3-list-tb');
  const searchWrap = div('mf-mi3-list-search-wrap');
  searchWrap.innerHTML = `${ic('search', 14)}<input type="text" class="mf-mi3-list-search" placeholder="${T('inbox.search', 'Search...')}" value="${escapeHtml(ctx.searchQuery)}">`;
  const searchInput = searchWrap.querySelector('input') as HTMLInputElement;
  searchInput.addEventListener('input', (e) => ctx.onSearch((e.target as HTMLInputElement).value));
  // Priority filter dropdown
  const PRIORITY_OPTS: Array<{ value: string; label: string }> = [
    { value: 'all', label: T('inbox.all_priorities', 'All priorities') },
    { value: 'urgent', label: T('inbox.priority_urgent', 'Urgent') },
    { value: 'high', label: T('inbox.priority_high', 'High') },
    { value: 'normal', label: T('inbox.priority_normal', 'Normal') },
    { value: 'low', label: T('inbox.priority_low', 'Low') },
  ];
  const filterWrap = div('mf-mi3-dd');
  const filterBtn = btn('mf-mi3-list-filter' + (ctx.priorityFilter !== 'all' ? ' is-on' : ''), ic('filter', 14), (e) => { e.stopPropagation(); ctx.onToggleMenu('filter'); });
  filterWrap.appendChild(filterBtn);
  if (ctx.openMenu === 'filter') {
    const menu = div('mf-mi3-dd-menu mf-mi3-dd-menu-right');
    PRIORITY_OPTS.forEach((o) => menu.appendChild(
      btn('mf-mi3-dd-item' + (o.value === ctx.priorityFilter ? ' is-active' : ''), `${o.value === ctx.priorityFilter ? ic('check', 13) : '<span class="mf-mi3-dd-gap"></span>'}${escapeHtml(o.label)}`, () => ctx.onSetPriority(o.value)),
    ));
    filterWrap.appendChild(menu);
  }
  // [Inbox redesign 2026-06-12] Status filter dropdown (All statuses + each status).
  const statWrap = div('mf-mi3-dd');
  const statBtn = btn('mf-mi3-list-filter' + (ctx.statusFilter !== 'all' ? ' is-on' : ''), ic('circleDot', 14), (e) => { e.stopPropagation(); ctx.onToggleMenu('status'); });
  statWrap.appendChild(statBtn);
  if (ctx.openMenu === 'status') {
    const menu = div('mf-mi3-dd-menu mf-mi3-dd-menu-right');
    const STAT_OPTS: Array<[string, string]> = [['all', T('inbox.all_statuses', 'All statuses')],
      ...(Object.keys(STATUS_CONFIG) as InboxTaskStatus[]).map((s) => [s, T('inbox.status_' + s, STATUS_CONFIG[s].label)] as [string, string])];
    STAT_OPTS.forEach(([v, l]) => menu.appendChild(
      btn('mf-mi3-dd-item' + (v === ctx.statusFilter ? ' is-active' : ''), `${v === ctx.statusFilter ? ic('check', 13) : '<span class="mf-mi3-dd-gap"></span>'}${escapeHtml(l)}`, () => ctx.onSetStatus(v)),
    ));
    statWrap.appendChild(menu);
  }
  // [Inbox redesign 2026-06-12] Density toggle (Comfortable default ⇄ Compact).
  const densWrap = div('mf-mi3-dd');
  const densBtn = btn('mf-mi3-list-filter' + (ctx.density === 'compact' ? ' is-on' : ''), ic('layers', 14), (e) => { e.stopPropagation(); ctx.onToggleMenu('density'); });
  densBtn.setAttribute('title', T('inbox.density', 'Density'));
  densWrap.appendChild(densBtn);
  if (ctx.openMenu === 'density') {
    const menu = div('mf-mi3-dd-menu mf-mi3-dd-menu-right');
    const DENS: Array<[InboxDensity, string]> = [['comfortable', T('inbox.density_comfortable', 'Comfortable')], ['compact', T('inbox.density_compact', 'Compact')]];
    DENS.forEach(([v, l]) => menu.appendChild(
      btn('mf-mi3-dd-item' + (v === ctx.density ? ' is-active' : ''), `${v === ctx.density ? ic('check', 13) : '<span class="mf-mi3-dd-gap"></span>'}${escapeHtml(l)}`, () => ctx.onSetDensity(v)),
    ));
    densWrap.appendChild(menu);
  }
  mk(tb, searchWrap, filterWrap, statWrap, densWrap);
  col.appendChild(tb);

  // Meta bar (count + sort dropdown)
  const filtered = filterTasks(ctx);
  const SORT_OPTS: Array<{ value: InboxSort; label: string }> = [
    { value: 'newest', label: T('inbox.sort_newest', 'Newest') },
    { value: 'oldest', label: T('inbox.sort_oldest', 'Oldest') },
    { value: 'priority', label: T('inbox.sort_priority', 'Priority') },
    { value: 'due', label: T('inbox.sort_due', 'Due date') },
    { value: 'status', label: T('inbox.sort_status', 'Status') },
    { value: 'form', label: T('inbox.sort_form', 'Form') },
    { value: 'submitter', label: T('inbox.sort_submitter', 'Submitter') },
  ];
  const sortLabel = (SORT_OPTS.find((o) => o.value === ctx.sortBy) || SORT_OPTS[0]).label;
  const meta = div('mf-mi3-list-meta');
  const unread = filtered.filter((t) => !t.isRead).length;
  const countSpan = span();
  countSpan.innerHTML = `${filtered.length} ${T('inbox.tasks', 'task')}${filtered.length !== 1 ? 's' : ''}${unread > 0 && ctx.activeView === 'inbox' ? ` · <strong>${unread} unread</strong>` : ''}`;
  const sortWrap = div('mf-mi3-dd');
  const sortBtn = btn('mf-mi3-list-sort', `${escapeHtml(sortLabel)} ${ic('chevronDown', 12)}`, (e) => { e.stopPropagation(); ctx.onToggleMenu('sort'); });
  sortWrap.appendChild(sortBtn);
  if (ctx.openMenu === 'sort') {
    const menu = div('mf-mi3-dd-menu mf-mi3-dd-menu-right');
    SORT_OPTS.forEach((o) => menu.appendChild(
      btn('mf-mi3-dd-item' + (o.value === ctx.sortBy ? ' is-active' : ''), `${o.value === ctx.sortBy ? ic('check', 13) : '<span class="mf-mi3-dd-gap"></span>'}${escapeHtml(o.label)}`, () => ctx.onSetSort(o.value)),
    ));
    sortWrap.appendChild(menu);
  }
  mk(meta, countSpan, sortWrap);
  col.appendChild(meta);

  // Task items
  const scroll = div('mf-mi3-list-scroll');
  if (!filtered.length) {
    const empty = div('mf-mi3-list-empty');
    empty.innerHTML = `${ic('inbox', 40)}<p class="mf-mi3-list-empty-title">${T('inbox.no_tasks', 'No tasks')}</p><p class="mf-mi3-list-empty-sub">${T('inbox.try_filters', 'Try adjusting filters')}</p>`;
    scroll.appendChild(empty);
  } else {
    filtered.forEach((task) => scroll.appendChild(buildTaskCard(ctx, task)));
  }
  col.appendChild(scroll);

  return col;
}

function buildTaskCard(ctx: BoardContext, task: InboxTaskItem): HTMLElement {
  const isActive = ctx.selectedTask?.id === task.id;
  const card = div('mf-mi3-task' + (isActive ? ' is-active' : '') + (!task.isRead && !isActive ? ' is-unread' : ''));
  card.addEventListener('click', () => ctx.onSelectTask(task));

  // Unread dot
  if (!task.isRead) {
    card.appendChild(div('mf-mi3-task-unread-dot'));
  }

  // Top row: form + priority + time
  const top = div('mf-mi3-task-top');
  const formColor = task.formColor.replace('mf-mi-fc-', 'mf-mi3-task-form-');
  top.innerHTML = `<span class="mf-mi3-task-form-dot ${formColor}"></span><span class="mf-mi3-task-form">${escapeHtml(task.form)}</span><span class="mf-mi3-task-prio ${PRIORITY_CONFIG[task.priority].dot}"></span><span class="mf-mi3-task-time">${task.receivedAt}</span>`;
  card.appendChild(top);

  // Subject row: subject (clamp) + star (top-right, hover-reveal, amber when starred) — mock parity
  const subjRow = div('mf-mi3-task-subj-row');
  subjRow.appendChild(div('mf-mi3-task-subj' + (!task.isRead ? ' is-bold' : ''), task.subject));
  const starBtn = btn('mf-mi3-task-star' + (task.isStarred ? ' is-starred' : ''), ic('star', 14), (e) => {
    e.stopPropagation();
    ctx.onToggleStar(task.id);
  });
  subjRow.appendChild(starBtn);
  card.appendChild(subjRow);

  // Submitter
  card.appendChild(div('mf-mi3-task-submitter', task.submitter));

  // Snippet
  card.appendChild(div('mf-mi3-task-snippet', task.snippet));

  // Bottom: status badge + return count + attachment (no star here — mock)
  const bot = div('mf-mi3-task-bot');
  const stCfg = STATUS_CONFIG[task.status];
  bot.innerHTML = `<span class="mf-mi3-badge ${stCfg.cls}">${ic(stCfg.icon, 10)}${T('inbox.status_' + task.status, stCfg.label)}</span>`;
  if (task.returnCount > 0) {
    bot.innerHTML += `<span class="mf-mi3-badge mf-mi3-badge-return">${ic('rotateCcw', 10)}${task.returnCount}</span>`;
  }
  if (task.hasAttachment) {
    bot.innerHTML += ic('paperclip', 12);
  }
  card.appendChild(bot);

  return card;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  DETAIL PANEL (flex-1)
// ═══════════════════════════════════════════════════════════════════════════════
export function buildDetailPanel(ctx: BoardContext): HTMLElement {
  const panel = div('mf-mi3-detail');
  const task = ctx.selectedTask;

  if (!task) {
    const empty = div('mf-mi3-detail-empty');
    empty.innerHTML = `${ic('inbox', 48)}<p>${T('inbox.select_task', 'Select a task to view details')}</p>`;
    panel.appendChild(empty);
    return panel;
  }

  // Header
  const hd = div('mf-mi3-detail-hd');
  const hdInfo = div('mf-mi3-detail-hd-info');
  const metaLine = div('mf-mi3-detail-meta-line');
  const stCfg = STATUS_CONFIG[task.status];
  metaLine.innerHTML = `<span class="mf-mi3-detail-form-dot ${task.formColor}"></span><span class="mf-mi3-detail-form">${escapeHtml(task.form)}</span><span class="mf-mi3-detail-sep">·</span><span class="mf-mi3-detail-id">${task.submissionId}</span><span class="mf-mi3-badge ${stCfg.cls}">${ic(stCfg.icon, 10)}${T('inbox.status_' + task.status, stCfg.label)}</span>${task.returnCount > 0 ? `<span class="mf-mi3-badge mf-mi3-badge-return">${ic('rotateCcw', 10)}${T('inbox.returned_x', 'Returned {n}×', { n: task.returnCount })}</span>` : ''}`;
  hdInfo.appendChild(metaLine);
  hdInfo.appendChild(div('mf-mi3-detail-subject', task.subject));
  const meta2 = div('mf-mi3-detail-meta2');
  meta2.innerHTML = `<span>${ic('user', 14)}${escapeHtml(task.submitter)}</span><span>${ic('clock', 14)}${task.receivedAt}</span><span>${ic('calendar', 14)}${T('inbox.due_date', 'Due {date}', { date: task.dueDate })}</span><span class="${PRIORITY_CONFIG[task.priority].color}">${ic('flag', 14)}${T('inbox.priority_' + task.priority, PRIORITY_CONFIG[task.priority].label)}</span>`;
  hdInfo.appendChild(meta2);

  const hdActions = div('mf-mi3-detail-hd-actions');
  // [§4-3] Star toggle with tooltip + filled state
  const starBtn = btn('mf-mi3-detail-hd-btn' + (task.isStarred ? ' is-starred' : ''), ic('star', 16), () => ctx.onToggleStar(task.id));
  starBtn.setAttribute('title', task.isStarred ? T('inbox.unstar', 'Unstar') : T('inbox.star', 'Star'));
  hdActions.appendChild(starBtn);
  // [§4-1] Open in Submissions (new tab, scoped to this form/submission)
  const extBtn = btn('mf-mi3-detail-hd-btn', ic('externalLink', 16), () => ctx.onOpenInSubmissions(task));
  extBtn.setAttribute('title', T('inbox.open_in_submissions', 'Open in Submissions'));
  hdActions.appendChild(extBtn);
  // [§4-2] More menu (Snooze / Add tag / Download PDF / Archive / Delete)
  const moreWrap = div('mf-mi3-dd');
  const moreBtn = btn('mf-mi3-detail-hd-btn', ic('moreHorizontal', 16), (e) => { e.stopPropagation(); ctx.onToggleMenu('more'); });
  moreBtn.setAttribute('title', T('inbox.more', 'More'));
  moreWrap.appendChild(moreBtn);
  if (ctx.openMenu === 'more') {
    const menu = div('mf-mi3-dd-menu mf-mi3-dd-menu-right');
    const item = (icon: string, label: string, fn: () => void, danger = false): HTMLButtonElement =>
      btn('mf-mi3-dd-item' + (danger ? ' is-danger' : ''), `${ic(icon, 14)}${escapeHtml(label)}`, fn);
    mk(menu,
      item('bell', T('inbox.snooze', 'Snooze'), () => ctx.onMoreAction('snooze', task)),
      item('tag', T('inbox.add_tag', 'Add tag'), () => ctx.onMoreAction('tag', task)),
      item('download', T('inbox.download_pdf', 'Download PDF'), () => ctx.onMoreAction('pdf', task)),
    );
    const sep = div('mf-mi3-dd-sep');
    menu.appendChild(sep);
    mk(menu,
      item('archive', T('inbox.archive', 'Archive'), () => ctx.onMoreAction('archive', task)),
      item('trash2', T('inbox.delete', 'Delete'), () => ctx.onMoreAction('delete', task), true),
    );
    moreWrap.appendChild(menu);
  }
  hdActions.appendChild(moreWrap);

  mk(hd, hdInfo, hdActions);
  panel.appendChild(hd);

  // Tabs
  const tabs = div('mf-mi3-detail-tabs');
  const TAB_ORDER: InboxTab[] = ['details', 'history', 'workflow'];
  const TAB_ICONS: Record<InboxTab, string> = { details: 'fileText', history: 'history', workflow: 'workflow' };
  const TAB_LABELS: Record<InboxTab, string> = { details: 'Details', history: 'History', workflow: 'Workflow' };
  TAB_ORDER.forEach((tab) => {
    const isActive = ctx.activeDetailTab === tab;
    const b = btn(
      'mf-mi3-detail-tab' + (isActive ? ' is-active' : ''),
      `${ic(TAB_ICONS[tab], 14)}${T(`inbox.tab_${tab}`, TAB_LABELS[tab])}${tab === 'history' && task.history.length > 0 ? `<span class="mf-mi3-detail-tab-count">${task.history.length}</span>` : ''}`,
      () => ctx.onDetailTab(tab),
    );
    tabs.appendChild(b);
  });
  panel.appendChild(tabs);

  // Content
  const body = div('mf-mi3-detail-body');
  if (ctx.activeDetailTab === 'details') {
    body.appendChild(buildDetailTabDetails(task, !!ctx.detailLoading));
  } else if (ctx.activeDetailTab === 'history') {
    body.appendChild(buildDetailTabHistory(task, !!ctx.detailLoading));
  } else {
    body.appendChild(buildDetailTabWorkflow(task, ctx));
  }
  panel.appendChild(body);

  // Action bar (fixed at bottom) — interactive reply modes (mock parity)
  panel.appendChild(buildActionBar(ctx, task));

  return panel;
}

// Bottom action bar. Default = a row of action buttons; selecting an action
// (Approve/Reject/Return/Forward/Comment) swaps the bar for an inline reply panel
// (textarea + contextual confirm). Export downloads a CSV client-side.
function buildActionBar(ctx: BoardContext, task: InboxTaskItem): HTMLElement {
  const bar = div('mf-mi3-detail-actions');
  const pending = !(task.status === 'approved' || task.status === 'rejected' || task.status === 'done');

  if (ctx.replyMode === 'none') {
    const mkAct = (mode: ReplyMode | 'export', icon: string, label: string, cls: string): HTMLButtonElement =>
      btn('mf-mi3-act-btn ' + cls, `${ic(icon, 14)}${label}`, () => {
        if (mode === 'export') ctx.onExport(task);
        else ctx.onReplyMode(mode);
      });
    // No workflow task → only Export (the rest would be no-ops).
    if (ctx.hideTaskActions) {
      mk(bar, mkAct('export', 'download', T('inbox.export', 'Export'), 'mf-mi3-act-export'));
      return bar;
    }
    // [§4-9] Approve/Reject/Return only while pending; Forward/Comment/Export always.
    if (pending) {
      mk(bar,
        mkAct('approve', 'thumbsUp', T('inbox.approve', 'Approve'), 'mf-mi3-act-approve'),
        mkAct('reject', 'thumbsDown', T('inbox.reject', 'Reject'), 'mf-mi3-act-reject'),
        mkAct('return', 'rotateCcw', T('inbox.return', 'Return'), 'mf-mi3-act-return'),
      );
    } else {
      bar.appendChild(span('mf-mi3-detail-done', `${T('inbox.completed', 'Task completed')}`));
    }
    mk(bar,
      mkAct('forward', 'forward', T('inbox.forward', 'Forward'), 'mf-mi3-act-forward'),
      mkAct('comment', 'messageSquare', T('inbox.comment', 'Comment'), 'mf-mi3-act-comment'),
      mkAct('export', 'download', T('inbox.export', 'Export'), 'mf-mi3-act-export'),
    );
    return bar;
  }

  // Reply panel
  const mode = ctx.replyMode;
  const cfg = REPLY_CFG[mode];
  bar.classList.add('is-reply');

  const head = div('mf-mi3-reply-head');
  const title = span('mf-mi3-reply-title ' + cfg.cls);
  title.innerHTML = `${ic(cfg.icon, 14)}${T('inbox.reply_' + mode + '_title', cfg.title)}`;
  head.appendChild(title);
  head.appendChild(btn('mf-mi3-reply-cancel', T('inbox.cancel', 'Cancel'), () => ctx.onReplyMode('none')));
  bar.appendChild(head);

  // [§4-4] Forward = org-tree picker (real Oqtane users grouped by department).
  if (mode === 'forward') {
    bar.appendChild(buildForwardPicker(ctx));
  }

  const ta = el('textarea', 'mf-mi3-reply-text');
  ta.placeholder = T('inbox.reply_' + mode + '_ph', cfg.placeholder);
  bar.appendChild(ta);

  const footer = div('mf-mi3-reply-footer');
  // [§4-10] Attach (left) — visual parity with the mock (reply attachments not wired to submit yet)
  footer.appendChild(btn('mf-mi3-reply-attach', `${ic('paperclip', 14)}${T('inbox.attach', 'Attach')}`, () => { /* reply-attach not yet wired */ }));
  // Forward confirm = "Send to {firstName}", disabled until a recipient is picked.
  const confirmLabel = mode === 'forward'
    ? (ctx.forwardTarget ? T('inbox.send_to', 'Send to {name}', { name: (ctx.forwardTargetName || ctx.forwardTarget).split(' ')[0] }) : T('inbox.select_recipient', 'Select recipient'))
    : T('inbox.reply_' + mode + '_confirm', cfg.confirm);
  const confirm = btn('mf-mi3-reply-confirm ' + cfg.cls, `${ic(cfg.icon, 14)}${confirmLabel}`, () => {
    ctx.onSubmitReply(mode, ta.value.trim(), ctx.forwardTarget);
  });
  if (mode === 'forward' && !ctx.forwardTarget) (confirm as HTMLButtonElement).disabled = true;
  footer.appendChild(confirm);
  bar.appendChild(footer);

  // Focus the textarea so the user can type immediately (not on forward — focus search).
  if (mode !== 'forward') setTimeout(() => { try { ta.focus(); } catch { /* noop */ } }, 0);

  return bar;
}

// [§4-4] Forward org-tree: selected-recipient pill OR a searchable Dept→User tree.
function buildForwardPicker(ctx: BoardContext): HTMLElement {
  const wrap = div('mf-mi3-reply-fwd');

  // Already selected → show a removable recipient pill.
  if (ctx.forwardTarget) {
    const u = findDirUser(ctx.directory, ctx.forwardTarget);
    const pill = div('mf-mi3-fwd-pill');
    const initials = (ctx.forwardTargetName || ctx.forwardTarget).split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    pill.innerHTML = `
      <span class="mf-mi3-fwd-pill-avatar">${escapeHtml(initials)}</span>
      <span class="mf-mi3-fwd-pill-info">
        <span class="mf-mi3-fwd-pill-name">${escapeHtml(ctx.forwardTargetName || ctx.forwardTarget)}</span>
        <span class="mf-mi3-fwd-pill-meta">${escapeHtml(u ? `${u.roleName} · ${u.email}` : ctx.forwardTarget)}</span>
      </span>`;
    pill.appendChild(btn('mf-mi3-fwd-pill-x', ic('x', 14), () => ctx.onForwardClear()));
    wrap.appendChild(pill);
    return wrap;
  }

  // Search box (filters the tree in-DOM, no re-render → keeps focus)
  const searchWrap = div('mf-mi3-fwd-search');
  searchWrap.innerHTML = `${ic('search', 14)}<input type="text" class="mf-mi3-fwd-search-input" placeholder="${T('inbox.search_people', 'Search people or departments…')}" autocomplete="off">`;
  const searchInput = searchWrap.querySelector('input') as HTMLInputElement;
  wrap.appendChild(searchWrap);

  const tree = div('mf-mi3-fwd-tree');
  if (ctx.dirLoading || !ctx.directory) {
    tree.innerHTML = `<div class="mf-mi3-fwd-loading">${T('inbox.loading_people', 'Loading directory…')}</div>`;
  } else if (!ctx.directory.length) {
    tree.innerHTML = `<div class="mf-mi3-fwd-loading">${T('inbox.no_people', 'No people available.')}</div>`;
  } else {
    ctx.directory.forEach((group) => {
      const grpEl = div('mf-mi3-fwd-dept');
      const head = div('mf-mi3-fwd-dept-hd');
      head.innerHTML = `${ic('users', 13)}<span>${escapeHtml(group.name)}</span><span class="mf-mi3-fwd-dept-count">${group.userCount}</span>`;
      grpEl.appendChild(head);
      group.users.forEach((u) => {
        const initials = (u.displayName || u.userName).split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
        const row = btn('mf-mi3-fwd-user', '', () => ctx.onForwardSelect(u.userName, u.displayName || u.userName));
        row.setAttribute('data-search', `${u.displayName} ${u.userName} ${u.email} ${group.name}`.toLowerCase());
        row.innerHTML = `
          <span class="mf-mi3-fwd-user-avatar">${escapeHtml(initials)}</span>
          <span class="mf-mi3-fwd-user-info">
            <span class="mf-mi3-fwd-user-name">${escapeHtml(u.displayName || u.userName)}</span>
            <span class="mf-mi3-fwd-user-meta">${escapeHtml(`${group.name} · ${u.email}`)}</span>
          </span>`;
        grpEl.appendChild(row);
      });
      tree.appendChild(grpEl);
    });
  }
  wrap.appendChild(tree);

  // In-DOM filter (no re-render): hide non-matching user rows + empty depts.
  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    tree.querySelectorAll<HTMLElement>('.mf-mi3-fwd-dept').forEach((dept) => {
      let visible = 0;
      dept.querySelectorAll<HTMLElement>('.mf-mi3-fwd-user').forEach((row) => {
        const match = !q || (row.getAttribute('data-search') || '').includes(q);
        row.style.display = match ? '' : 'none';
        if (match) visible++;
      });
      dept.style.display = visible ? '' : 'none';
    });
  });
  setTimeout(() => { try { searchInput.focus(); } catch { /* noop */ } }, 0);

  return wrap;
}

function findDirUser(directory: DirectoryGroup[] | null, userName: string) {
  if (!directory) return null;
  for (const g of directory) {
    const u = g.users.find((x) => x.userName === userName);
    if (u) return u;
  }
  return null;
}

function buildDetailTabDetails(task: InboxTaskItem, loading: boolean): HTMLElement {
  const wrap = div('mf-mi3-detail-content');

  // Submitter card
  const card = div('mf-mi3-detail-card');
  const initials = task.submitter.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  card.innerHTML = `
    <div class="mf-mi3-detail-avatar">${initials}</div>
    <div class="mf-mi3-detail-avatar-info">
      <p class="mf-mi3-detail-avatar-name">${escapeHtml(task.submitter)}</p>
      ${task.submitterEmail ? `<p class="mf-mi3-detail-avatar-meta">${ic('mail', 14)}${escapeHtml(task.submitterEmail)}</p>` : ''}
      ${task.submitterPhone ? `<p class="mf-mi3-detail-avatar-meta">${ic('phone', 14)}${escapeHtml(task.submitterPhone)}</p>` : ''}
      ${task.submitterDept ? `<p class="mf-mi3-detail-avatar-meta">${ic('building', 14)}${escapeHtml(task.submitterDept)}</p>` : ''}
    </div>
    <div class="mf-mi3-detail-step">
      <p class="mf-mi3-detail-step-label">${T('inbox.current_step', 'Current Step')}</p>
      <p class="mf-mi3-detail-step-value"><span class="mf-mi3-step-dot"></span>${escapeHtml(task.currentStep)}</p>
    </div>
  `;
  wrap.appendChild(card);

  // Form Responses
  if (task.fields.length) {
    const fr = div('mf-mi3-detail-section');
    fr.innerHTML = `<h3 class="mf-mi3-detail-section-title">${ic('fileText', 14)}${T('inbox.form_responses', 'Form Responses')}</h3>`;
    const grid = div('mf-mi3-detail-grid');
    task.fields.forEach((f) => {
      const ft = (f.fieldType || '').toLowerCase();
      const v = f.value;
      // [Field render 2026-06-14] Render by content kind so HTML shows as rich
      // content and images as <img> instead of raw escaped text.
      const isImage = ft === 'image' || ft === 'signature' || isImageUrl(v);
      const isRich = !isImage && (ft === 'html' || ft === 'richtext' || ft === 'rich_text' || ft === 'wysiwyg' || looksLikeHtml(v));
      const wide = f.type === 'long' || isRich || isImage;
      const cell = div('mf-mi3-detail-cell' + (wide ? ' is-wide' : ''));

      let valueHtml: string;
      let kindClass: string;
      if (isImage) {
        valueHtml = `<img class="mf-mi3-cell-img" src="${escapeAttr(v)}" alt="${escapeAttr(f.label)}" loading="lazy" style="max-width:100%;height:auto;border-radius:8px;display:block;margin-top:2px;">`;
        kindClass = ' is-image';
      } else if (isRich) {
        valueHtml = `<div class="mf-mi3-cell-rich">${sanitizeHtml(v)}</div>`;
        kindClass = ' is-rich';
      } else if (isHttpUrl(v)) {
        valueHtml = `<a href="${escapeAttr(v)}" target="_blank" rel="noopener noreferrer">${escapeHtml(v)}</a>`;
        kindClass = '';
      } else if (ft === 'composite' || mfLooksLikeJsonObject(v)) {
        // Composite / structured widget value (Address, Phone parts, Confirm-email…) →
        // clean headline + humanized parts instead of raw JSON.
        valueHtml = mfRenderStructuredValue(v);
        kindClass = ' is-structured';
      } else {
        valueHtml = escapeHtml(v);
        kindClass = '';
      }

      const labelEl = div('mf-mi3-detail-cell-label');
      labelEl.textContent = f.label;
      const valueEl = div('mf-mi3-detail-cell-value' + (f.type === 'amount' ? ' is-amount' : '') + (f.type === 'long' ? ' is-long' : '') + kindClass);
      valueEl.innerHTML = valueHtml;
      mk(cell, labelEl, valueEl);
      grid.appendChild(cell);
    });
    fr.appendChild(grid);
    wrap.appendChild(fr);
  } else if (loading) {
    // Lazy enrichment in flight — show a skeleton where the grid will land.
    const sk = div('mf-mi3-detail-section');
    sk.innerHTML = `<h3 class="mf-mi3-detail-section-title">${ic('fileText', 14)}${T('inbox.form_responses', 'Form Responses')}</h3><div class="mf-mi3-detail-skeleton"><span></span><span></span><span></span><span></span></div>`;
    wrap.appendChild(sk);
  }

  // Attachments
  if (task.attachments.length) {
    const att = div('mf-mi3-detail-section');
    att.innerHTML = `<h3 class="mf-mi3-detail-section-title">${ic('paperclip', 14)}${T('inbox.attachments', 'Attachments')} (${task.attachments.length})</h3>`;
    task.attachments.forEach((a) => {
      const row = div('mf-mi3-detail-attachment');
      row.innerHTML = `<div class="mf-mi3-detail-att-icon">${escapeHtml(a.type)}</div><div class="mf-mi3-detail-att-info"><p>${escapeHtml(a.name)}</p><p>${escapeHtml(a.size)}</p></div>`;
      const dl = el('a', 'mf-mi3-detail-att-dl');
      dl.innerHTML = ic('download', 14);
      if (a.url) {
        (dl as HTMLAnchorElement).href = a.url;
        (dl as HTMLAnchorElement).target = '_blank';
        (dl as HTMLAnchorElement).rel = 'noopener';
        dl.setAttribute('download', a.name);
        dl.setAttribute('title', T('inbox.download', 'Download'));
      }
      row.appendChild(dl);
      att.appendChild(row);
    });
    wrap.appendChild(att);
  }

  // Tags
  if (task.tags.length) {
    const tagWrap = div('mf-mi3-detail-tags');
    tagWrap.innerHTML = `${ic('hash', 14)}${task.tags.map((t) => `<span class="mf-mi3-detail-tag">${escapeHtml(t)}</span>`).join('')}`;
    wrap.appendChild(tagWrap);
  }

  return wrap;
}

function buildDetailTabHistory(task: InboxTaskItem, loading: boolean): HTMLElement {
  const wrap = div('mf-mi3-detail-content');
  if (!task.history.length) {
    if (loading) {
      const sk = div('mf-mi3-detail-skeleton');
      sk.innerHTML = '<span></span><span></span><span></span>';
      wrap.appendChild(sk);
    } else {
      wrap.appendChild(div('mf-mi3-detail-muted', T('inbox.no_history', 'No history yet.')));
    }
    return wrap;
  }
  task.history.forEach((h, i) => {
    const cfg = HISTORY_TYPE_CFG[h.type] || HISTORY_TYPE_CFG.comment;
    const item = div('mf-mi3-detail-hist-item');
    const initials = h.actor.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
    const isLast = i === task.history.length - 1;
    // [§4-7] Spine node = action-type ICON (with ring); a small initials avatar
    // sits in the content header next to the actor (mock model).
    item.innerHTML = `
      <div class="mf-mi3-detail-hist-spine">
        <div class="mf-mi3-detail-hist-avatar ${cfg.color}">${ic(cfg.icon, 14)}</div>
        ${!isLast ? '<div class="mf-mi3-detail-hist-line"></div>' : ''}
      </div>
      <div class="mf-mi3-detail-hist-body">
        <div class="mf-mi3-detail-hist-head">
          <span class="mf-mi3-detail-hist-actor-avatar">${initials}</span>
          <span class="mf-mi3-detail-hist-actor">${escapeHtml(h.actor)}</span>
          <span class="mf-mi3-detail-hist-time">${h.timestamp}</span>
        </div>
        <p class="mf-mi3-detail-hist-action">${escapeHtml(h.action)}</p>
        ${h.note ? `<div class="mf-mi3-detail-hist-note"><p>${ic('stickyNote', 14)}"${escapeHtml(h.note)}"</p></div>` : ''}
      </div>
    `;
    wrap.appendChild(item);
  });
  return wrap;
}

function buildDetailTabWorkflow(task: InboxTaskItem, ctx?: BoardContext): HTMLElement {
  const wrap = div('mf-mi3-detail-content');
  const card = div('mf-mi3-detail-card mf-mi3-wf-card');
  // [§4-5] header row: title + "View Full" ghost link → opens the workflow surface
  const hd = div('mf-mi3-wf-hd');
  hd.innerHTML = `<h3 class="mf-mi3-detail-section-title">${T('inbox.workflow_steps', 'Workflow Steps')}</h3>`;
  const viewFull = btn('mf-mi3-wf-viewfull', `${T('inbox.view_full', 'View Full')}${ic('externalLink', 12)}`, () => { if (ctx) ctx.onOpenInSubmissions(task); });
  hd.appendChild(viewFull);
  card.appendChild(hd);

  const steps = [
    { label: T('inbox.step_submitted', 'Submission Received'), status: 'done' as const, actor: task.submitter, time: task.receivedAt },
    { label: task.currentStep, status: (task.status === 'approved' || task.status === 'done') ? 'done' as const : 'active' as const, actor: task.assignedTo || '—', time: 'Current' },
    { label: T('inbox.step_review', 'Review'), status: 'pending' as const, actor: T('inbox.assigned', 'Assigned'), time: '—' },
    { label: T('inbox.step_final', 'Final Confirmation'), status: 'pending' as const, actor: 'System', time: '—' },
  ];

  steps.forEach((s, i, arr) => {
    const row = div('mf-mi3-detail-wf-step');
    const num = s.status === 'done' ? ic('checkCheck', 14) : String(i + 1);
    row.innerHTML = `
      ${i < arr.length - 1 ? `<div class="mf-mi3-detail-wf-line ${s.status === 'done' ? 'is-done' : ''}"></div>` : ''}
      <div class="mf-mi3-detail-wf-num ${s.status}">${num}</div>
      <div class="mf-mi3-detail-wf-info">
        <div class="mf-mi3-detail-wf-head">
          <span class="mf-mi3-detail-wf-label${s.status === 'pending' ? ' is-muted' : ''}">${escapeHtml(s.label)}</span>
          ${s.status === 'active' ? `<span class="mf-mi3-badge mf-mi3-badge-active">${T('inbox.in_progress', 'In Progress')}</span>` : ''}
        </div>
        <p class="mf-mi3-detail-wf-meta">${escapeHtml(s.actor)} · ${s.time}</p>
      </div>
    `;
    card.appendChild(row);
  });

  wrap.appendChild(card);

  // [§4-6] Return-history callout: header + each return note enumerated
  if (task.returnCount > 0) {
    const callout = div('mf-mi3-detail-wf-callout');
    const head = div('mf-mi3-wf-callout-hd');
    head.innerHTML = `${ic('rotateCcw', 14)}<span>${T('inbox.returned_n_times', 'Returned {n} time{s} — awaiting resubmission', { n: task.returnCount, s: task.returnCount === 1 ? '' : 's' })}</span>`;
    callout.appendChild(head);
    task.history.filter((h) => h.type === 'return').forEach((h) => {
      const row = div('mf-mi3-wf-callout-note');
      row.innerHTML = `<span class="mf-mi3-wf-callout-time">${escapeHtml(h.timestamp)}</span> ${escapeHtml(h.note || h.action)}`;
      callout.appendChild(row);
    });
    wrap.appendChild(callout);
  }

  return wrap;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  Helpers
// ═══════════════════════════════════════════════════════════════════════════════
function getAllTasks(ctx: BoardContext): InboxTaskItem[] {
  if (!ctx.data) return [];
  const raw = [...(ctx.data.incoming || []), ...(ctx.data.inProgress || []), ...(ctx.data.completed || [])];
  return raw.map((t) => {
    const item = adaptTask(t, ctx.data?.forms?.[String(t.formId)]?.title || `Form #${t.formId}`, []);
    item.isStarred = ctx.isStarred(item.id); // session star state lives in index.ts
    // [Inbox redesign 2026-06-12] adaptTask hard-codes returnCount=0/hasAttachment=false;
    // overlay real values from the lazy detail cache for rows already opened so the
    // return-count + paperclip badges appear in the list (full coverage needs a batch endpoint).
    const enr = ctx.enrichLookup?.(t.submissionId);
    if (enr) {
      item.returnCount = enr.returnCount;
      item.hasAttachment = enr.hasAttachment;
      if (enr.tags?.length) item.tags = enr.tags;
    }
    return item;
  });
}

const PRIORITY_RANK: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

function sortTasks(list: InboxTaskItem[], sortBy: InboxSort): InboxTaskItem[] {
  const ts = (t: InboxTaskItem): number => new Date(t.source.createdAt || 0).getTime();
  const due = (t: InboxTaskItem): number => (t.source.dueAt ? new Date(t.source.dueAt).getTime() : Number.MAX_SAFE_INTEGER);
  const arr = list.slice();
  switch (sortBy) {
    case 'oldest': arr.sort((a, b) => ts(a) - ts(b)); break;
    case 'priority': arr.sort((a, b) => (PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority]) || (ts(b) - ts(a))); break;
    case 'due': arr.sort((a, b) => (due(a) - due(b)) || (ts(b) - ts(a))); break;
    case 'status': arr.sort((a, b) => (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || (ts(b) - ts(a))); break;
    case 'form': arr.sort((a, b) => a.form.localeCompare(b.form) || (ts(b) - ts(a))); break;
    case 'submitter': arr.sort((a, b) => a.submitter.localeCompare(b.submitter) || (ts(b) - ts(a))); break;
    case 'newest':
    default: arr.sort((a, b) => ts(b) - ts(a)); break;
  }
  return arr;
}

function countByView(tasks: InboxTaskItem[]): Record<InboxView, number> {
  return {
    inbox: tasks.filter((t) => !['done', 'approved', 'rejected'].includes(t.status)).length,
    assigned: tasks.filter((t) => t.status === 'pending').length,
    forwarded: tasks.filter((t) => t.status === 'forwarded').length,
    completed: tasks.filter((t) => ['done', 'approved', 'rejected'].includes(t.status)).length,
    starred: tasks.filter((t) => t.isStarred).length,
  };
}

function filterTasks(ctx: BoardContext): InboxTaskItem[] {
  const all = getAllTasks(ctx);
  let list: InboxTaskItem[] = [];
  switch (ctx.activeView) {
    case 'inbox': list = all.filter((t) => !['done', 'approved', 'rejected'].includes(t.status)); break;
    case 'assigned': list = all.filter((t) => t.status === 'pending'); break;
    case 'forwarded': list = all.filter((t) => t.status === 'forwarded'); break;
    case 'completed': list = all.filter((t) => ['done', 'approved', 'rejected'].includes(t.status)); break;
    case 'starred': list = all.filter((t) => t.isStarred); break;
  }
  const q = (ctx.searchQuery || '').toLowerCase().trim();
  if (q) {
    list = list.filter((t) =>
      t.subject.toLowerCase().includes(q) ||
      t.submitter.toLowerCase().includes(q) ||
      t.form.toLowerCase().includes(q) ||
      t.snippet.toLowerCase().includes(q),
    );
  }
  if (ctx.priorityFilter && ctx.priorityFilter !== 'all') {
    list = list.filter((t) => t.priority === ctx.priorityFilter);
  }
  // [Inbox redesign 2026-06-12] By-Form filter (keyed on form TITLE) + status filter.
  if (ctx.formFilter) {
    list = list.filter((t) => t.form === ctx.formFilter);
  }
  if (ctx.statusFilter && ctx.statusFilter !== 'all') {
    list = list.filter((t) => t.status === ctx.statusFilter);
  }
  return sortTasks(list, ctx.sortBy);
}

function getFormList(ctx: BoardContext): Array<{ name: string; color: string; count: number }> {
  const tasks = getAllTasks(ctx).filter((t) => !['done', 'approved', 'rejected'].includes(t.status));
  const map = new Map<string, { color: string; count: number }>();
  tasks.forEach((t) => {
    const existing = map.get(t.form);
    if (existing) { existing.count++; }
    else { map.set(t.form, { color: t.formColor, count: 1 }); }
  });
  return Array.from(map.entries()).map(([name, v]) => ({ name, color: v.color, count: v.count }));
}

function getTagList(ctx: BoardContext): string[] {
  const tasks = getAllTasks(ctx);
  const set = new Set<string>();
  tasks.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
  return Array.from(set);
}

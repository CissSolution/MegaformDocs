import type { FieldDef } from './shared';

export type ViewStarterMode = 'listview' | 'list' | 'card';

export interface ViewStarterPresetDefinition {
  id: string;
  mode: ViewStarterMode;
  name: string;
  description: string;
  source: string;
}

export interface ViewStarterPresetPayload extends ViewStarterPresetDefinition {
  selectedFieldKeys: string[];
  listTemplate?: string;
  cardTemplate?: string;
  listViewSettings?: {
    title?: string;
    emptyMessage?: string;
    pageSize?: number;
    enableSearch?: boolean;
    enableSort?: boolean;
    showAddButton?: boolean;
    showRowActions?: boolean;
    fields?: Array<{ key: string; label: string; type: string }>;
    rowTemplate?: string;
    detailTemplate?: string;
  };
}

interface ResolvedFieldSet {
  primary?: FieldDef;
  secondary?: FieldDef;
  body?: FieldDef;
  meta?: FieldDef;
  firstName?: FieldDef;
  lastName?: FieldDef;
  email?: FieldDef;
  phone?: FieldDef;
  subject?: FieldDef;
  level?: FieldDef;
  owner?: FieldDef;
  approver?: FieldDef;
  startDate?: FieldDef;
  endDate?: FieldDef;
  amount?: FieldDef;
  reference?: FieldDef;
  image?: FieldDef;
  signature?: FieldDef;
  status?: FieldDef;
  attachment?: FieldDef;
}

type PresetBuilder = (fields: FieldDef[]) => ViewStarterPresetPayload;

const PRESET_BUILDERS: Record<string, PresetBuilder> = {
  'listview-register': (fields) => buildListViewRegisterPreset(fields),
  'listview-blog': (fields) => buildListViewBlogPreset(fields),
  'listview-inbox': (fields) => buildListViewInboxPreset(fields),
  'listview-tutoring-board': (fields) => buildListViewTutoringBoardPreset(fields),
  'listview-leave-request': (fields) => buildListViewLeaveRequestPreset(fields),
  'listview-proposal-register': (fields) => buildListViewProposalPreset(fields),
  'listview-document-exchange': (fields) => buildListViewDocumentExchangePreset(fields),
  'list-tutoring-register': (fields) => buildListTutoringRegisterPreset(fields),
  'list-register': (fields) => buildListRegisterPreset(fields),
  'list-status': (fields) => buildListStatusPreset(fields),
  'list-compact': (fields) => buildListCompactPreset(fields),
  'card-student-intake': (fields) => buildCardStudentIntakePreset(fields),
  'card-profile': (fields) => buildCardProfilePreset(fields),
  'card-blog': (fields) => buildCardBlogPreset(fields),
  'card-request': (fields) => buildCardRequestPreset(fields),
  'card-leave-request': (fields) => buildCardLeaveRequestPreset(fields),
  'card-proposal': (fields) => buildCardProposalPreset(fields),
  'card-document-exchange': (fields) => buildCardDocumentExchangePreset(fields),
};

const DEFINITIONS: ViewStarterPresetDefinition[] = [
  {
    id: 'listview-register',
    mode: 'listview',
    name: '2sxc Token Register',
    description: 'A clean submission register with a strong first column and a detail article.',
    source: 'Inspired by 2sxc Tokens/List + Tokens/Details',
  },
  {
    id: 'listview-blog',
    mode: 'listview',
    name: '2sxc Blog Feed',
    description: 'A feed-style table row plus a richer detail article for reading longer content.',
    source: 'Inspired by 2sxc Blog App list/detail flow',
  },
  {
    id: 'listview-inbox',
    mode: 'listview',
    name: 'Business Inbox',
    description: 'A work queue layout for approvals, requests, and internal handoff screens.',
    source: 'MegaForm business default using 2sxc list/detail separation',
  },
  {
    id: 'listview-tutoring-board',
    mode: 'listview',
    name: 'Student Requests Board',
    description: 'A polished tutoring intake board with student name, subject, level, contact info, and signature detail.',
    source: 'Starter preset tailored for Tutoring Request Form',
  },
  {
    id: 'listview-leave-request',
    mode: 'listview',
    name: 'Leave Request Queue',
    description: 'A manager inbox for absence requests with date range, approver, and reason-focused detail.',
    source: 'Business starter for leave workflows',
  },
  {
    id: 'listview-proposal-register',
    mode: 'listview',
    name: 'Proposal Register',
    description: 'A proposal tracker with owner, amount, status, and a structured detail article.',
    source: 'Business starter for approvals and commercial proposals',
  },
  {
    id: 'listview-document-exchange',
    mode: 'listview',
    name: 'Document Exchange Register',
    description: 'A document register tuned for incoming/outgoing exchange, references, and attachments.',
    source: 'Business starter for office document exchange',
  },
  {
    id: 'list-tutoring-register',
    mode: 'list',
    name: 'Tutoring Register',
    description: 'A compact tutoring intake register with student, subject, level, and contact in one readable row.',
    source: 'Starter preset tailored for Tutoring Request Form',
  },
  {
    id: 'list-register',
    mode: 'list',
    name: 'Legacy Register',
    description: 'A readable two-column legacy list row with status/date tucked into the cells.',
    source: 'Inspired by 2sxc Tokens/List',
  },
  {
    id: 'list-status',
    mode: 'list',
    name: 'Status Table',
    description: 'A more operational legacy list row suited to request tracking.',
    source: 'MegaForm business default',
  },
  {
    id: 'list-compact',
    mode: 'list',
    name: 'Compact Register',
    description: 'A plain compact legacy list row for narrow spaces.',
    source: 'Minimal MegaForm starter',
  },
  {
    id: 'card-student-intake',
    mode: 'card',
    name: 'Student Intake Card',
    description: 'A warm intake card showing student identity, tutoring needs, contact channels, and signature.',
    source: 'Starter preset tailored for Tutoring Request Form',
  },
  {
    id: 'card-profile',
    mode: 'card',
    name: 'Profile Card',
    description: 'A clean summary card for people, applicants, or simple records.',
    source: 'Inspired by 2sxc list/detail content cards',
  },
  {
    id: 'card-blog',
    mode: 'card',
    name: 'Blog / News Card',
    description: 'A visual card with title, summary, media, and publish metadata.',
    source: 'Inspired by 2sxc Blog App',
  },
  {
    id: 'card-request',
    mode: 'card',
    name: 'Request Summary Card',
    description: 'A business card with status, owner/meta, and short description.',
    source: 'MegaForm request / approval starter',
  },
  {
    id: 'card-leave-request',
    mode: 'card',
    name: 'Leave Request Card',
    description: 'A leave-management card with requester, date window, approver, and short justification.',
    source: 'Business starter for HR and team approval apps',
  },
  {
    id: 'card-proposal',
    mode: 'card',
    name: 'Proposal Review Card',
    description: 'A decision-oriented proposal card with amount, owner, and a concise summary.',
    source: 'Business starter for proposal review flows',
  },
  {
    id: 'card-document-exchange',
    mode: 'card',
    name: 'Document Exchange Card',
    description: 'A compact document card for routing, file tracking, and reference lookup.',
    source: 'Business starter for office document exchange',
  },
];

export function getStarterPresets(mode: ViewStarterMode): ViewStarterPresetDefinition[] {
  return DEFINITIONS.filter((preset) => preset.mode === mode);
}

export function buildStarterPreset(mode: ViewStarterMode, presetId: string, fields: FieldDef[]): ViewStarterPresetPayload | null {
  const preset = DEFINITIONS.find((entry) => entry.mode === mode && entry.id === presetId);
  const builder = PRESET_BUILDERS[presetId];
  if (!preset || !builder) return null;
  return builder(fields);
}

function buildListViewRegisterPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const secondary = chosen.secondary || chosen.meta || fields.find((field) => field.key !== primary?.key);
  const body = chosen.body || secondary;
  const selected = compactFieldKeys(primary?.key, secondary?.key);
  const attachments = buildAttachmentsBlock(chosen.attachment);
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a;line-height:1.35">${fieldToken(primary)}</div>`,
    '    <div style="margin-top:6px;font-size:11px;color:#64748b">',
    '      <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:#eef2ff;color:#4338ca;font-weight:700">{{submission:status}}</span>',
    '      <span style="margin-left:8px">#{{submission:id}}</span>',
    '    </div>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#475569;line-height:1.5">',
    `    ${fieldToken(body)}`,
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">',
    `  <header><h2 style="margin:0;font-size:24px;line-height:1.25">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">',
    '      <span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-weight:700">{{submission:status}}</span>',
    '      <span style="margin-left:10px">Submitted {{submission:date}}</span>',
    '      <span style="margin-left:10px">#{{submission:id}}</span>',
    '    </div>',
    '  </header>',
    `  <section style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(body)}</section>`,
    attachments,
    secondary && secondary.key !== body?.key
      ? `  <aside style="font-size:13px;color:#475569"><strong style="color:#0f172a">${escapeHtml(secondary.label || secondary.key)}:</strong> ${fieldToken(secondary)}</aside>`
      : '',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-register'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Submission register',
      pageSize: 20,
      enableSearch: true,
      enableSort: true,
      showAddButton: true,
      showRowActions: true,
      emptyMessage: 'No submissions have been received yet.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewBlogPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const body = chosen.body || chosen.secondary || fields.find((field) => field.key !== primary?.key);
  const selected = compactFieldKeys(primary?.key, body?.key);
  const hero = chosen.image ? `<div style="margin-top:0;line-height:0">${fieldToken(chosen.image)}</div>` : '';
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:18px;color:#0f172a">',
    hero,
    `  <header><h2 style="margin:0;font-size:26px;line-height:1.2">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">Posted {{submission:date|format=yyyy-MM-dd}} / {{submission:status}}</div>',
    '  </header>',
    `  <section style="font-size:15px;line-height:1.75;color:#334155">${fieldToken(body)}</section>`,
    chosen.meta ? `  <footer style="font-size:12px;color:#64748b">Contact / meta: ${fieldToken(chosen.meta)}</footer>` : '',
    '</article>',
  ].filter(Boolean).join('\n');
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-size:18px;font-weight:700;color:#0f172a;line-height:1.3">${fieldToken(primary)}</div>`,
    '    <div style="margin-top:6px;font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:.05em">{{submission:status}}</div>',
    '  </td>',
    '  <td style="padding:14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#475569;line-height:1.6">',
    `    ${fieldToken(body)}`,
    '  </td>',
    '  <td style="padding:14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].join('\n');
  return {
    ...getDefinition('listview-blog'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Story feed',
      pageSize: 12,
      enableSearch: true,
      enableSort: true,
      showAddButton: false,
      showRowActions: true,
      emptyMessage: 'Nothing has been published yet.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewInboxPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const meta = chosen.meta || chosen.secondary || fields.find((field) => field.key !== primary?.key);
  const selected = compactFieldKeys(primary?.key, meta?.key);
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a;line-height:1.35">${fieldToken(primary)}</div>`,
    meta ? `    <div style="margin-top:6px;font-size:12px;color:#64748b">${fieldToken(meta)}</div>` : '',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    '    <span style="display:inline-block;padding:3px 9px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700">{{submission:status}}</span>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:18px 20px;background:#f8fafc;border:1px solid #dbeafe;border-radius:16px">',
    `  <header><h2 style="margin:0;font-size:22px;color:#0f172a">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">Queue state: {{submission:status}} / Updated {{submission:date}}</div>',
    '  </header>',
    meta ? `  <section style="font-size:14px;color:#334155">${fieldToken(meta)}</section>` : '',
    chosen.body ? `  <section style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</section>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-inbox'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Work inbox',
      pageSize: 25,
      enableSearch: true,
      enableSort: true,
      showAddButton: false,
      showRowActions: true,
      emptyMessage: 'The work queue is empty.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewTutoringBoardPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const studentName = buildStudentNameLine(chosen.firstName, chosen.lastName, chosen.owner, chosen.primary);
  const subjectLine = buildInlinePair(chosen.subject, chosen.level, ' / ');
  const contactLine = buildInlinePair(chosen.email, chosen.phone, ' / ');
  const selected = compactFieldKeys(
    chosen.firstName?.key,
    chosen.lastName?.key,
    chosen.subject?.key,
    chosen.level?.key,
    chosen.email?.key,
    chosen.phone?.key,
    chosen.signature?.key,
  );
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    `    <div style="font-size:16px;font-weight:700;color:#0f172a;line-height:1.3">${studentName}</div>`,
    subjectLine ? `    <div style="margin-top:6px;font-size:12px;color:#475569">${subjectLine}</div>` : '',
    '  </td>',
    '  <td style="padding:14px 16px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    contactLine ? `    <div style="font-size:12px;color:#475569">${contactLine}</div>` : '',
    '    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap">',
    '      <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#ecfeff;color:#155e75;font-size:11px;font-weight:700">{{submission:status}}</span>',
    '      <span style="display:inline-block;padding:3px 10px;border-radius:999px;background:#fef3c7;color:#92400e;font-size:11px;font-weight:700">{{submission:date|format=yyyy-MM-dd}}</span>',
    '    </div>',
    '  </td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:16px;padding:20px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);border:1px solid #dbeafe;border-radius:18px;color:#0f172a;box-shadow:0 12px 28px rgba(15,23,42,.05)">',
    `  <header style="display:grid;gap:8px"><h2 style="margin:0;font-size:26px;line-height:1.2">${studentName}</h2>`,
    '    <div style="display:flex;gap:8px;flex-wrap:wrap;font-size:12px;color:#64748b">',
    chosen.subject ? `      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-weight:700">${fieldToken(chosen.subject)}</span>` : '',
    chosen.level ? `      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f0fdf4;color:#166534;font-weight:700">${fieldToken(chosen.level)}</span>` : '',
    '      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f8fafc;color:#475569;font-weight:700">#{{submission:id}}</span>',
    '    </div>',
    '  </header>',
    '  <section style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px">',
    chosen.email ? `    <div style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Email</div><div style="margin-top:6px;font-size:14px;color:#0f172a">${fieldToken(chosen.email)}</div></div>` : '',
    chosen.phone ? `    <div style="padding:12px 14px;border:1px solid #e2e8f0;border-radius:14px;background:#ffffff"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Phone</div><div style="margin-top:6px;font-size:14px;color:#0f172a">${fieldToken(chosen.phone)}</div></div>` : '',
    '  </section>',
    chosen.signature ? `  <section style="display:grid;gap:8px"><h3 style="margin:0;font-size:13px;color:#0f172a">Signature</h3><div style="padding:12px;border:1px dashed #cbd5e1;border-radius:14px;background:#ffffff">${fieldToken(chosen.signature)}</div></section>` : '',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-tutoring-board'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Tutoring requests',
      pageSize: 20,
      enableSearch: true,
      enableSort: true,
      showAddButton: true,
      showRowActions: true,
      emptyMessage: 'No tutoring requests have been submitted yet.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewLeaveRequestPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || chosen.owner || fields[0];
  const dateLine = buildDateWindowLine(chosen.startDate, chosen.endDate);
  const selected = compactFieldKeys(primary?.key, chosen.startDate?.key, chosen.endDate?.key, chosen.approver?.key, chosen.body?.key);
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a;line-height:1.35">${fieldToken(primary)}</div>`,
    dateLine ? `    <div style="margin-top:6px;font-size:12px;color:#475569">${dateLine}</div>` : '',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    chosen.approver ? `    <div style="font-size:12px;color:#64748b">Approver: ${fieldToken(chosen.approver)}</div>` : '',
    '    <span style="margin-top:6px;display:inline-block;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700">{{submission:status}}</span>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #dbeafe;border-radius:16px;color:#0f172a">',
    `  <header><h2 style="margin:0;font-size:24px;line-height:1.25">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">Leave workflow / {{submission:status}} / Ref #{{submission:id}}</div>',
    '  </header>',
    dateLine ? `  <section style="font-size:14px;color:#334155"><strong>Requested window:</strong> ${dateLine}</section>` : '',
    chosen.approver ? `  <section style="font-size:14px;color:#334155"><strong>Approver:</strong> ${fieldToken(chosen.approver)}</section>` : '',
    chosen.body ? `  <section style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</section>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-leave-request'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Leave requests',
      pageSize: 20,
      enableSearch: true,
      enableSort: true,
      showAddButton: true,
      showRowActions: true,
      emptyMessage: 'No leave requests are waiting right now.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewProposalPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || chosen.reference || fields[0];
  const owner = chosen.owner || chosen.meta || chosen.secondary;
  const amount = chosen.amount ? `<strong>Amount:</strong> ${fieldToken(chosen.amount)}` : '';
  const selected = compactFieldKeys(primary?.key, owner?.key, chosen.amount?.key, chosen.body?.key);
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a;line-height:1.35">${fieldToken(primary)}</div>`,
    owner ? `    <div style="margin-top:6px;font-size:12px;color:#64748b">Owner: ${fieldToken(owner)}</div>` : '',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#334155">',
    amount ? `    <div style="font-size:13px">${amount}</div>` : '',
    '    <div style="margin-top:6px;display:inline-block;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700">{{submission:status}}</div>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">',
    `  <header><h2 style="margin:0;font-size:24px;line-height:1.25">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">Proposal stage / {{submission:status}} / Submitted {{submission:date|format=yyyy-MM-dd}}</div>',
    '  </header>',
    owner ? `  <section style="font-size:14px;color:#334155"><strong>Owner:</strong> ${fieldToken(owner)}</section>` : '',
    amount ? `  <section style="font-size:14px;color:#334155">${amount}</section>` : '',
    chosen.body ? `  <section style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</section>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-proposal-register'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Proposal register',
      pageSize: 20,
      enableSearch: true,
      enableSort: true,
      showAddButton: true,
      showRowActions: true,
      emptyMessage: 'No proposals have been filed yet.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListViewDocumentExchangePreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.reference || chosen.primary || fields[0];
  const owner = chosen.owner || chosen.secondary || chosen.meta;
  const selected = compactFieldKeys(primary?.key, owner?.key, chosen.body?.key, chosen.attachment?.key);
  const rowTemplate = [
    '<tr class="mf-preset-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a;line-height:1.35">${fieldToken(primary)}</div>`,
    owner ? `    <div style="margin-top:6px;font-size:12px;color:#64748b">Handler: ${fieldToken(owner)}</div>` : '',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;vertical-align:top;color:#334155">',
    chosen.body ? `    ${fieldToken(chosen.body)}` : '    {{submission:status}}',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e2e8f0;white-space:nowrap;color:#64748b;font-size:12px">{{submission:date|format=yyyy-MM-dd}}</td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  const detailTemplate = [
    '<article style="display:grid;gap:14px;padding:18px 20px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;color:#0f172a">',
    `  <header><h2 style="margin:0;font-size:24px;line-height:1.25">${fieldToken(primary)}</h2>`,
    '    <div style="margin-top:8px;font-size:12px;color:#64748b">Exchange status / {{submission:status}} / Logged {{submission:date|format=yyyy-MM-dd}}</div>',
    '  </header>',
    owner ? `  <section style="font-size:14px;color:#334155"><strong>Handler:</strong> ${fieldToken(owner)}</section>` : '',
    chosen.body ? `  <section style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</section>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('listview-document-exchange'),
    selectedFieldKeys: selected,
    listViewSettings: buildListViewSettings(selected, fields, {
      title: 'Document exchange',
      pageSize: 25,
      enableSearch: true,
      enableSort: true,
      showAddButton: true,
      showRowActions: true,
      emptyMessage: 'No document exchange records are available.',
      rowTemplate,
      detailTemplate,
    }),
  };
}

function buildListRegisterPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const secondary = chosen.secondary || chosen.body || fields.find((field) => field.key !== primary?.key);
  const selected = compactFieldKeys(primary?.key, secondary?.key);
  const listTemplate = [
    '<tr class="mf-sub-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a">${fieldToken(primary)}</div>`,
    '    <div style="margin-top:6px;font-size:11px;color:#64748b">#{{submission:id}} / {{submission:status}}</div>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#475569;line-height:1.6">',
    `    ${fieldToken(secondary)}`,
    '    <div style="margin-top:6px;font-size:11px;color:#94a3b8">{{submission:date|format=yyyy-MM-dd}}</div>',
    '  </td>',
    '</tr>',
  ].join('\n');
  return {
    ...getDefinition('list-register'),
    selectedFieldKeys: selected,
    listTemplate,
  };
}

function buildListTutoringRegisterPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const studentName = buildStudentNameLine(chosen.firstName, chosen.lastName, chosen.owner, chosen.primary);
  const subjectLine = buildInlinePair(chosen.subject, chosen.level, ' / ');
  const contactLine = buildInlinePair(chosen.email, chosen.phone, ' / ');
  const listTemplate = [
    '<tr class="mf-sub-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a">${studentName}</div>`,
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#334155">',
    subjectLine || 'â€”',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top;color:#475569">',
    contactLine || 'â€”',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;white-space:nowrap;color:#64748b;font-size:12px">{{submission:status}}</td>',
    '</tr>',
  ].join('\n');
  return {
    ...getDefinition('list-tutoring-register'),
    selectedFieldKeys: compactFieldKeys(
      chosen.firstName?.key,
      chosen.lastName?.key,
      chosen.subject?.key,
      chosen.level?.key,
      chosen.email?.key,
      chosen.phone?.key,
    ),
    listTemplate,
  };
}

function buildListStatusPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const statusField = chosen.status || chosen.secondary || fields.find((field) => field.key !== primary?.key);
  const selected = compactFieldKeys(primary?.key, statusField?.key);
  const listTemplate = [
    '<tr class="mf-sub-row">',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    `    <div style="font-weight:700;color:#0f172a">${fieldToken(primary)}</div>`,
    '    <div style="margin-top:6px;font-size:11px;color:#94a3b8">Submitted {{submission:date|format=yyyy-MM-dd}}</div>',
    '  </td>',
    '  <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;vertical-align:top">',
    statusField
      ? `    <div style="display:inline-block;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700">${fieldToken(statusField)}</div>`
      : '    <div style="display:inline-block;padding:3px 9px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700">{{submission:status}}</div>',
    chosen.meta && chosen.meta.key !== statusField?.key ? `    <div style="margin-top:8px;color:#64748b;font-size:12px">${fieldToken(chosen.meta)}</div>` : '',
    '  </td>',
    '</tr>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('list-status'),
    selectedFieldKeys: selected,
    listTemplate,
  };
}

function buildListCompactPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const secondary = chosen.secondary || chosen.body || fields.find((field) => field.key !== primary?.key);
  const tertiary = chosen.meta && chosen.meta.key !== secondary?.key ? chosen.meta : fields.find((field) => field.key !== primary?.key && field.key !== secondary?.key);
  const selected = compactFieldKeys(primary?.key, secondary?.key, tertiary?.key);
  const cells = [primary, secondary, tertiary]
    .filter((field): field is FieldDef => !!field)
    .map((field, index) => [
      `<td style="padding:10px 12px;border-bottom:1px solid #f1f5f9;${index === 0 ? 'font-weight:700;color:#0f172a;' : 'color:#475569;'}">`,
      `  ${fieldToken(field)}`,
      index === 0 ? '  <div style="margin-top:4px;font-size:11px;color:#94a3b8">{{submission:date|format=yyyy-MM-dd}}</div>' : '',
      '</td>',
    ].filter(Boolean).join('\n'))
    .join('\n');
  return {
    ...getDefinition('list-compact'),
    selectedFieldKeys: selected,
    listTemplate: `<tr class="mf-sub-row">\n${cells}\n</tr>`,
  };
}

function buildCardProfilePreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const secondary = chosen.secondary || chosen.meta || fields.find((field) => field.key !== primary?.key);
  const body = chosen.body || secondary;
  const hero = chosen.image
    ? `<div style="margin:-18px -18px 14px;overflow:hidden;border-radius:16px 16px 0 0;background:#e2e8f0">${fieldToken(chosen.image)}</div>`
    : '';
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;box-shadow:0 10px 24px rgba(15,23,42,.06)">',
    hero,
    `  <h3 style="margin:0;font-size:20px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    secondary ? `  <div style="font-size:13px;color:#64748b">${fieldToken(secondary)}</div>` : '',
    body && body.key !== secondary?.key ? `  <div style="font-size:14px;line-height:1.65;color:#334155">${fieldToken(body)}</div>` : '',
    '  <footer style="margin-top:auto;padding-top:10px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b">Submitted {{submission:date|format=yyyy-MM-dd}} / {{submission:status}}</footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-profile'),
    selectedFieldKeys: compactFieldKeys(primary?.key, secondary?.key, body?.key),
    cardTemplate,
  };
}

function buildCardStudentIntakePreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const studentName = buildStudentNameLine(chosen.firstName, chosen.lastName, chosen.owner, chosen.primary);
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:grid;gap:14px;padding:20px;border:1px solid #dbeafe;border-radius:20px;background:linear-gradient(180deg,#ffffff 0%,#f8fafc 100%);box-shadow:0 16px 30px rgba(59,130,246,.08)">',
    `  <header style="display:grid;gap:8px"><h3 style="margin:0;font-size:22px;line-height:1.2;color:#0f172a">${studentName}</h3>`,
    '    <div style="display:flex;gap:8px;flex-wrap:wrap">',
    chosen.subject ? `      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#ede9fe;color:#6d28d9;font-size:11px;font-weight:700">${fieldToken(chosen.subject)}</span>` : '',
    chosen.level ? `      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#dcfce7;color:#166534;font-size:11px;font-weight:700">${fieldToken(chosen.level)}</span>` : '',
    '      <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#f8fafc;color:#475569;font-size:11px;font-weight:700">{{submission:status}}</span>',
    '    </div>',
    '  </header>',
    '  <section style="display:grid;gap:10px">',
    chosen.email ? `    <div style="font-size:14px;color:#334155"><strong style="color:#0f172a">Email:</strong> ${fieldToken(chosen.email)}</div>` : '',
    chosen.phone ? `    <div style="font-size:14px;color:#334155"><strong style="color:#0f172a">Phone:</strong> ${fieldToken(chosen.phone)}</div>` : '',
    '  </section>',
    chosen.signature ? `  <section style="display:grid;gap:8px"><div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em">Signature</div><div style="padding:10px;border:1px dashed #cbd5e1;border-radius:14px;background:#ffffff">${fieldToken(chosen.signature)}</div></section>` : '',
    '  <footer style="display:flex;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid #dbeafe;font-size:12px;color:#64748b"><span>Student intake</span><span>{{submission:date|format=yyyy-MM-dd}}</span></footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-student-intake'),
    selectedFieldKeys: compactFieldKeys(
      chosen.firstName?.key,
      chosen.lastName?.key,
      chosen.subject?.key,
      chosen.level?.key,
      chosen.email?.key,
      chosen.phone?.key,
      chosen.signature?.key,
    ),
    cardTemplate,
  };
}

function buildCardBlogPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const body = chosen.body || chosen.secondary || fields.find((field) => field.key !== primary?.key);
  const hero = chosen.image
    ? `<div style="margin:-18px -18px 14px;overflow:hidden;border-radius:18px 18px 0 0;background:#dbeafe">${fieldToken(chosen.image)}</div>`
    : '<div style="margin:-18px -18px 14px;padding:26px 18px;background:linear-gradient(135deg,#dbeafe,#e0f2fe);color:#1d4ed8;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase">Feature story</div>';
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:flex;flex-direction:column;gap:12px;padding:18px;border:1px solid #dbeafe;border-radius:18px;background:#ffffff;box-shadow:0 12px 28px rgba(37,99,235,.08)">',
    hero,
    `  <h3 style="margin:0;font-size:21px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    `  <div style="font-size:14px;line-height:1.7;color:#475569">${fieldToken(body)}</div>`,
    '  <footer style="margin-top:auto;display:flex;justify-content:space-between;gap:10px;font-size:12px;color:#64748b">',
    '    <span>{{submission:status}}</span>',
    '    <span>{{submission:date|format=yyyy-MM-dd}}</span>',
    '  </footer>',
    '</article>',
  ].join('\n');
  return {
    ...getDefinition('card-blog'),
    selectedFieldKeys: compactFieldKeys(primary?.key, body?.key, chosen.image?.key),
    cardTemplate,
  };
}

function buildCardRequestPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || fields[0];
  const meta = chosen.meta || chosen.secondary || fields.find((field) => field.key !== primary?.key);
  const body = chosen.body || (meta && meta.key !== primary?.key ? meta : fields.find((field) => field.key !== primary?.key && field.key !== meta?.key));
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:grid;gap:12px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;box-shadow:0 8px 20px rgba(15,23,42,.05)">',
    '  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    `    <h3 style="margin:0;font-size:20px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    '    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eef2ff;color:#4338ca;font-size:11px;font-weight:700;white-space:nowrap">{{submission:status}}</span>',
    '  </div>',
    meta ? `  <div style="font-size:13px;color:#64748b">${fieldToken(meta)}</div>` : '',
    body && body.key !== meta?.key ? `  <div style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(body)}</div>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '  <footer style="padding-top:10px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b">Submitted {{submission:date|format=yyyy-MM-dd}} / Ref #{{submission:id}}</footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-request'),
    selectedFieldKeys: compactFieldKeys(primary?.key, meta?.key, body?.key, chosen.attachment?.key),
    cardTemplate,
  };
}

function buildCardLeaveRequestPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || chosen.owner || fields[0];
  const dateLine = buildDateWindowLine(chosen.startDate, chosen.endDate);
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:grid;gap:12px;padding:18px;border:1px solid #dbeafe;border-radius:18px;background:#ffffff;box-shadow:0 10px 24px rgba(37,99,235,.06)">',
    '  <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px">',
    `    <h3 style="margin:0;font-size:20px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    '    <span style="display:inline-block;padding:4px 10px;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:11px;font-weight:700">{{submission:status}}</span>',
    '  </div>',
    dateLine ? `  <div style="font-size:13px;color:#475569">${dateLine}</div>` : '',
    chosen.approver ? `  <div style="font-size:13px;color:#64748b">Approver: ${fieldToken(chosen.approver)}</div>` : '',
    chosen.body ? `  <div style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</div>` : '',
    '  <footer style="padding-top:10px;border-top:1px solid #e0f2fe;font-size:12px;color:#64748b">Requested {{submission:date|format=yyyy-MM-dd}}</footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-leave-request'),
    selectedFieldKeys: compactFieldKeys(primary?.key, chosen.startDate?.key, chosen.endDate?.key, chosen.approver?.key, chosen.body?.key),
    cardTemplate,
  };
}

function buildCardProposalPreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.primary || chosen.reference || fields[0];
  const owner = chosen.owner || chosen.meta || chosen.secondary;
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:grid;gap:12px;padding:18px;border:1px solid #ede9fe;border-radius:18px;background:#ffffff;box-shadow:0 10px 24px rgba(109,40,217,.06)">',
    `  <h3 style="margin:0;font-size:20px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    owner ? `  <div style="font-size:13px;color:#64748b">Owner: ${fieldToken(owner)}</div>` : '',
    chosen.amount ? `  <div style="font-size:18px;font-weight:700;color:#6d28d9">${fieldToken(chosen.amount)}</div>` : '',
    chosen.body ? `  <div style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</div>` : '',
    '  <footer style="display:flex;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid #ede9fe;font-size:12px;color:#64748b"><span>{{submission:status}}</span><span>{{submission:date|format=yyyy-MM-dd}}</span></footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-proposal'),
    selectedFieldKeys: compactFieldKeys(primary?.key, owner?.key, chosen.amount?.key, chosen.body?.key),
    cardTemplate,
  };
}

function buildCardDocumentExchangePreset(fields: FieldDef[]): ViewStarterPresetPayload {
  const chosen = resolveFields(fields);
  const primary = chosen.reference || chosen.primary || fields[0];
  const owner = chosen.owner || chosen.secondary || chosen.meta;
  const cardTemplate = [
    '<article class="mf-sub-card" style="display:grid;gap:12px;padding:18px;border:1px solid #e2e8f0;border-radius:18px;background:#ffffff;box-shadow:0 8px 20px rgba(15,23,42,.05)">',
    `  <h3 style="margin:0;font-size:20px;line-height:1.25;color:#0f172a">${fieldToken(primary)}</h3>`,
    owner ? `  <div style="font-size:13px;color:#64748b">Handler: ${fieldToken(owner)}</div>` : '',
    chosen.body ? `  <div style="font-size:14px;line-height:1.7;color:#334155">${fieldToken(chosen.body)}</div>` : '',
    buildAttachmentsBlock(chosen.attachment),
    '  <footer style="display:flex;justify-content:space-between;gap:12px;padding-top:10px;border-top:1px solid #f1f5f9;font-size:12px;color:#64748b"><span>{{submission:status}}</span><span>{{submission:date|format=yyyy-MM-dd}}</span></footer>',
    '</article>',
  ].filter(Boolean).join('\n');
  return {
    ...getDefinition('card-document-exchange'),
    selectedFieldKeys: compactFieldKeys(primary?.key, owner?.key, chosen.body?.key, chosen.attachment?.key),
    cardTemplate,
  };
}

function buildListViewSettings(
  selectedKeys: string[],
  fields: FieldDef[],
  next: {
    title: string;
    emptyMessage: string;
    pageSize: number;
    enableSearch: boolean;
    enableSort: boolean;
    showAddButton: boolean;
    showRowActions: boolean;
    rowTemplate: string;
    detailTemplate: string;
  },
): NonNullable<ViewStarterPresetPayload['listViewSettings']> {
  return {
    title: next.title,
    emptyMessage: next.emptyMessage,
    pageSize: next.pageSize,
    enableSearch: next.enableSearch,
    enableSort: next.enableSort,
    showAddButton: next.showAddButton,
    showRowActions: next.showRowActions,
    fields: toFieldEntries(selectedKeys, fields),
    rowTemplate: next.rowTemplate,
    detailTemplate: next.detailTemplate,
  };
}

function getDefinition(id: string): ViewStarterPresetDefinition {
  return DEFINITIONS.find((entry) => entry.id === id)!;
}

function resolveFields(fields: FieldDef[]): ResolvedFieldSet {
  return {
    primary: pickField(fields, [/^title$/i, /subject/i, /document/i, /proposal/i, /request/i, /name/i, /full.?name/i]),
    secondary: pickField(fields, [/email/i, /department/i, /owner/i, /assignee/i, /manager/i, /phone/i, /category/i]),
    body: pickField(fields, [/description/i, /summary/i, /body/i, /content/i, /message/i, /notes?/i, /challenge/i], [/textarea/i, /html/i, /rich/i, /memo/i, /multiline/i]),
    meta: pickField(fields, [/email/i, /department/i, /owner/i, /assignee/i, /manager/i, /phone/i, /category/i, /level/i, /type/i]),
    firstName: pickField(fields, [/^first.?name$/i]),
    lastName: pickField(fields, [/^last.?name$/i, /^surname$/i]),
    email: pickField(fields, [/^email$/i, /email/i], [/email/i]),
    phone: pickField(fields, [/^phone$/i, /phone/i, /mobile/i, /tel/i], [/phone/i]),
    subject: pickField(fields, [/^subject$/i, /subject/i, /topic/i, /course/i, /service/i]),
    level: pickField(fields, [/student.?level/i, /^level$/i, /grade/i, /class/i]),
    owner: pickField(fields, [/owner/i, /employee/i, /requester/i, /submitted.?by/i, /first.?name/i, /name/i]),
    approver: pickField(fields, [/approver/i, /manager/i, /reviewer/i]),
    startDate: pickField(fields, [/start.?date/i, /from.?date/i, /^from$/i, /leave.?from/i], [/date/i]),
    endDate: pickField(fields, [/end.?date/i, /to.?date/i, /^to$/i, /leave.?to/i], [/date/i]),
    amount: pickField(fields, [/amount/i, /budget/i, /price/i, /cost/i, /value/i], [/currency/i, /number/i]),
    reference: pickField(fields, [/reference/i, /document.?no/i, /doc.?no/i, /code/i, /number/i]),
    image: pickField(fields, [/image/i, /photo/i, /avatar/i, /logo/i, /signature/i], [/image/i, /photo/i, /signature/i, /avatar/i]),
    signature: pickField(fields, [/signature/i], [/signature/i]),
    status: pickField(fields, [/status/i, /state/i, /stage/i]),
    attachment: pickField(fields, [/attachment/i, /file/i, /document/i], [/file/i, /upload/i]),
  };
}

function pickField(fields: FieldDef[], keyPatterns: RegExp[], typePatterns: RegExp[] = []): FieldDef | undefined {
  for (const field of fields) {
    const key = String(field.key || '');
    const label = String(field.label || '');
    if (keyPatterns.some((pattern) => pattern.test(key) || pattern.test(label))) return field;
  }
  for (const field of fields) {
    const type = String(field.type || '');
    if (typePatterns.some((pattern) => pattern.test(type))) return field;
  }
  return undefined;
}

function compactFieldKeys(...keys: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  keys.forEach((key) => {
    const value = String(key || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out;
}

function toFieldEntries(keys: string[], fields: FieldDef[]): Array<{ key: string; label: string; type: string }> {
  return keys.map((key) => {
    const field = fields.find((entry) => entry.key === key);
    return {
      key,
      label: field?.label || key,
      type: field?.type || '',
    };
  });
}

function fieldToken(field?: FieldDef): string {
  if (!field?.key) return 'â€”';
  return `{{field:${field.key}}}`;
}

function buildAttachmentsBlock(field?: FieldDef): string {
  if (!field?.key) return '';
  return [
    '  <section style="display:grid;gap:8px">',
    `    <h3 style="margin:0;font-size:13px;color:#0f172a">${escapeHtml(field.label || field.key)}</h3>`,
    `    <div style="display:flex;flex-wrap:wrap;gap:8px"><mf-repeat each="file in field:${field.key}"><span style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid #dbeafe;border-radius:999px;background:#eff6ff;color:#1d4ed8;font-size:12px">{{file:fileName}}</span></mf-repeat></div>`,
    '  </section>',
  ].join('\n');
}

function buildDateWindowLine(start?: FieldDef, end?: FieldDef): string {
  const parts: string[] = [];
  if (start?.key) parts.push(fieldToken(start));
  if (end?.key) parts.push(fieldToken(end));
  return parts.filter(Boolean).join(' â†’ ');
}

function buildStudentNameLine(first?: FieldDef, last?: FieldDef, owner?: FieldDef, fallback?: FieldDef): string {
  const parts = compactTemplateParts(fieldToken(first), fieldToken(last));
  if (parts.length) return parts.join(' ');
  if (owner?.key) return fieldToken(owner);
  if (fallback?.key) return fieldToken(fallback);
  return 'Student';
}

function buildInlinePair(first?: FieldDef, second?: FieldDef, separator = ' / '): string {
  return compactTemplateParts(fieldToken(first), fieldToken(second)).join(separator);
}

function compactTemplateParts(...values: string[]): string[] {
  return values
    .map((value) => String(value || '').trim())
    .filter((value) => value && value !== 'â€”');
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}



// Rich choice design catalog ported from:
// form-builder-controls (10)/components/form-builder/rich-selection-controls.tsx
//
// AI may create labels, descriptions, values, and business logic. It must not
// invent rich-choice CSS, icon names, or image URLs. MegaForm assigns those from
// this catalog deterministically so weak models still stay on the design rails.

export type RichChoiceDisplay = 'cards' | 'chips';

export const MOCK_RICH_CHOICE_ICONS = [
  'rocket',
  'ticket',
  'building2',
  'graduation-cap',
  'globe',
  'palette',
  'code',
  'code2',
  'megaphone',
  'music',
  'camera',
  'dumbbell',
  'plane',
  'crown',
  'zap',
  'star',
  'sparkles',
  'calendar',
  'calendar-days',
  'map-pin',
  'clock',
  'user',
  'users',
  'mail',
  'phone',
  'briefcase',
  'file-text',
  'upload',
  'wallet',
  'home',
  'compass',
  'palmtree',
  'tree-palm',
  'waves',
  'mountain',
  'snowflake',
  'heart-handshake',
  'heart',
  'flower2',
  'tree-pine',
  'party-popper',
  'cake',
  'gift',
  'utensils',
  'wine',
  'glass-water',
  'drumstick',
  'salad',
  'pizza',
  'ice-cream',
  'mic2',
  'disc3',
  'tent',
  'pen-line',
  'layout-grid',
  'line-chart',
  'headphones',
  'send',
  'clipboard-list',
] as const;

export type MockRichChoiceIcon = typeof MOCK_RICH_CHOICE_ICONS[number];

export const MOCK_RICH_CHOICE_IMAGES = [
  { key: 'event-hero', url: '/Modules/MegaForm/img/mock/event-hero.png', tags: ['event', 'conference', 'registration', 'webinar', 'signup', 'business'] },
  { key: 'festa-italiana-hero', url: '/Modules/MegaForm/img/mock/festa-italiana-hero.png', tags: ['festa', 'italian', 'italiana', 'italy', 'food', 'pasta', 'pizza', 'wine', 'festival'] },
  { key: 'festa-italiana-texture', url: '/Modules/MegaForm/img/mock/festa-italiana-texture.png', tags: ['italian', 'texture', 'food', 'market', 'festa'] },
  { key: 'party-hero', url: '/Modules/MegaForm/img/mock/party-hero.png', tags: ['party', 'birthday', 'celebration', 'invitation', 'rsvp'] },
  { key: 'party-festival', url: '/Modules/MegaForm/img/mock/party-festival.png', tags: ['festival', 'music', 'party', 'celebration'] },
  { key: 'party-dance', url: '/Modules/MegaForm/img/mock/party-dance.png', tags: ['dance', 'music', 'nightlife', 'party'] },
  { key: 'party-cake', url: '/Modules/MegaForm/img/mock/party-cake.png', tags: ['birthday', 'cake', 'party'] },
  { key: 'australia-hero', url: '/Modules/MegaForm/img/mock/australia-hero.png', tags: ['australia', 'travel', 'trip', 'tour', 'coast', 'beach'] },
  { key: 'australia-coast', url: '/Modules/MegaForm/img/mock/australia-coast.png', tags: ['australia', 'coast', 'beach', 'ocean'] },
  { key: 'australia-city', url: '/Modules/MegaForm/img/mock/australia-city.png', tags: ['australia', 'city', 'sydney', 'urban'] },
  { key: 'australia-outback', url: '/Modules/MegaForm/img/mock/australia-outback.png', tags: ['australia', 'outback', 'adventure'] },
  { key: 'australia-reef', url: '/Modules/MegaForm/img/mock/australia-reef.png', tags: ['australia', 'reef', 'ocean', 'travel'] },
  { key: 'bulgaria-rose-hero', url: '/Modules/MegaForm/img/mock/bulgaria-rose-hero.png', tags: ['bulgaria', 'rose', 'programme', 'youth'] },
  { key: 'bulgaria-mountains', url: '/Modules/MegaForm/img/mock/bulgaria-mountains.png', tags: ['bulgaria', 'mountain', 'nature'] },
  { key: 'bulgaria-plovdiv', url: '/Modules/MegaForm/img/mock/bulgaria-plovdiv.png', tags: ['bulgaria', 'plovdiv', 'city'] },
  { key: 'bulgaria-coast', url: '/Modules/MegaForm/img/mock/bulgaria-coast.png', tags: ['bulgaria', 'coast', 'beach'] },
  { key: 'euro-youth-hero', url: '/Modules/MegaForm/img/mock/euro-youth-hero.png', tags: ['youth', 'europe', 'education', 'programme'] },
  { key: 'euro-youth-side', url: '/Modules/MegaForm/img/mock/euro-youth-side.png', tags: ['youth', 'education', 'side'] },
  { key: 'onboarding-side', url: '/Modules/MegaForm/img/mock/onboarding-side.png', tags: ['onboarding', 'profile', 'team', 'welcome'] },
  { key: 'profile-cover', url: '/Modules/MegaForm/img/mock/profile-cover.png', tags: ['profile', 'cover', 'account'] },
  { key: 'avatar-default', url: '/Modules/MegaForm/img/mock/avatar-default.png', tags: ['avatar', 'profile', 'person'] },
] as const;

export type MockRichChoiceImageUrl = typeof MOCK_RICH_CHOICE_IMAGES[number]['url'];

const LABEL_ICON_HINTS: Array<[RegExp, MockRichChoiceIcon]> = [
  [/\b(vip|premium|deluxe|executive|exclusive|front\s*row|gold|platinum|crown)\b/i, 'crown'],
  [/\b(family|group|team|guests?|members?|crew|reunion|kids)\b/i, 'users'],
  [/\b(pro|professional|plus|power|fast|express|priority|automation)\b/i, 'zap'],
  [/\b(ticket|pass|seat|entry|admission)\b/i, 'ticket'],
  [/\b(starter|start|launch|rocket|beginner|standard|basic|core|general|regular)\b/i, 'rocket'],
  [/\b(enterprise|business|company|corporate|office)\b/i, 'building2'],
  [/\b(support|help|headphone|success)\b/i, 'headphones'],
  [/\b(academy|course|class|training|workshop|education|learn|study|language|school|university)\b/i, 'graduation-cap'],
  [/\b(global|world|international|travel|trip|tour|journey|abroad)\b/i, 'globe'],
  [/\b(city|urban|downtown|harbour|sydney|melbourne|sofia|plovdiv)\b/i, 'building2'],
  [/\b(beach|coast|reef|surf|ocean|sea|water|pool|cairns|varna)\b/i, 'waves'],
  [/\b(mountain|hiking|outback|uluru|red\s*centre|bansko|trail|adventure)\b/i, 'mountain'],
  [/\b(compass|explore|discovery|region|destination)\b/i, 'compass'],
  [/\b(design|art|creative|palette|brand|craft|museum)\b/i, 'palette'],
  [/\b(code|developer|development|programming|tech|api|integration)\b/i, 'code'],
  [/\b(marketing|campaign|announce|press|media|growth)\b/i, 'megaphone'],
  [/\b(music|audio|song|sound|dance|dj|karaoke|festival)\b/i, 'music'],
  [/\b(photo|photography|camera|image|booth)\b/i, 'camera'],
  [/\b(fitness|sport|wellness|health)\b/i, 'dumbbell'],
  [/\b(plane|flight|airline)\b/i, 'plane'],
  [/\b(star|popular|featured|advanced|analytics|best)\b/i, 'star'],
  [/\b(ai|assistant|smart|magic|sparkle)\b/i, 'sparkles'],
  [/\b(calendar|date|schedule|arrival|appointment)\b/i, 'calendar'],
  [/\b(time|clock|duration|slot)\b/i, 'clock'],
  [/\b(location|map|address|venue|place)\b/i, 'map-pin'],
  [/\b(person|profile|attendee|applicant|participant)\b/i, 'user'],
  [/\b(email|mail)\b/i, 'mail'],
  [/\b(phone|call|sms)\b/i, 'phone'],
  [/\b(work|career|job|role|briefcase)\b/i, 'briefcase'],
  [/\b(price|budget|payment|wallet|cost)\b/i, 'wallet'],
  [/\b(home|house|stay|hotel|accommodation|lodging|hostel|airbnb|homestay)\b/i, 'home'],
  [/\b(partnership|partner|handshake|volunteer)\b/i, 'heart-handshake'],
  [/\b(heart|love|like|wellness)\b/i, 'heart'],
  [/\b(rose|flower|floral|garden|nature|cultural)\b/i, 'flower2'],
  [/\b(tree|forest|pine|camp|camping)\b/i, 'tree-pine'],
  [/\b(party|celebration|rsvp|birthday|gala|fiesta|festa)\b/i, 'party-popper'],
  [/\b(cake|birthday|dessert|gelato|ice\s*cream|sweet)\b/i, 'cake'],
  [/\b(gift|present|bonus|perk)\b/i, 'gift'],
  [/\b(food|meal|lunch|dinner|cuisine|cooking|pasta|chef)\b/i, 'utensils'],
  [/\b(wine|drink|bar|cocktail|beer)\b/i, 'wine'],
  [/\b(bbq|meat|grill)\b/i, 'drumstick'],
  [/\b(vegetarian|vegan|salad|halal|kosher|gluten[-\s]*free|dietary)\b/i, 'salad'],
  [/\b(pizza)\b/i, 'pizza'],
  [/\b(microphone|mic|speaker|talk)\b/i, 'mic2'],
  [/\b(vinyl|disc|record)\b/i, 'disc3'],
  [/\b(tent|campground|outdoor)\b/i, 'tent'],
  [/\b(chart|sales|revenue|analytics|report)\b/i, 'line-chart'],
  [/\b(send|submit|paper\s*plane)\b/i, 'send'],
  [/\b(clipboard|checklist|review|confirm)\b/i, 'clipboard-list'],
];

const FIELD_CONTEXT_HINTS: Array<[RegExp, MockRichChoiceIcon]> = [
  [/\b(ticket|pass|event|registration|festival|festa|conference)\b/i, 'ticket'],
  [/\b(plan|tier|package|membership|subscription|pricing)\b/i, 'rocket'],
  [/\b(food|meal|dietary|cuisine|lunch|dinner)\b/i, 'utensils'],
  [/\b(drink|wine|bar|cocktail)\b/i, 'wine'],
  [/\b(workshop|course|class|training|academy|education|language)\b/i, 'graduation-cap'],
  [/\b(region|location|city|destination|travel|trip|tour|journey)\b/i, 'map-pin'],
  [/\b(interests?|tags?|skills?|topics?|preferences?|features?)\b/i, 'palette'],
  [/\b(budget|price|payment|cost)\b/i, 'wallet'],
];

const CARD_FALLBACKS: MockRichChoiceIcon[] = ['rocket', 'zap', 'crown', 'star', 'building2', 'graduation-cap', 'ticket', 'users'];
const CHIP_FALLBACKS: MockRichChoiceIcon[] = ['palette', 'code', 'megaphone', 'music', 'camera', 'dumbbell', 'plane', 'pizza', 'wine', 'salad'];

function optionLabel(opt: any): string {
  return String((opt && (opt.label || opt.title || opt.value)) || '').trim();
}

function slugifyOption(value: string): string {
  return String(value || 'option').trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'option';
}

export function mockCatalogIconForOption(label: string, fieldText: string, index: number, display: RichChoiceDisplay): MockRichChoiceIcon {
  const labelHay = String(label || '');
  const fieldHay = String(fieldText || '');
  for (const [re, icon] of LABEL_ICON_HINTS) {
    if (!re.test(labelHay)) continue;
    if (icon === 'rocket' && /\b(ticket|pass|event|registration|festival|festa|conference)\b/i.test(fieldHay)) return 'ticket';
    if (icon === 'rocket' && /\b(travel|trip|tour|journey|destination)\b/i.test(fieldHay)) return 'globe';
    return icon;
  }
  for (const [re, icon] of FIELD_CONTEXT_HINTS) if (re.test(fieldHay)) return icon;
  const fallbacks = display === 'cards' ? CARD_FALLBACKS : CHIP_FALLBACKS;
  return fallbacks[index % fallbacks.length];
}

export function mockCatalogCardDescription(label: string, fieldText: string, index: number): string {
  const l = label.toLowerCase();
  const f = fieldText.toLowerCase();
  if (/\b(starter|basic|standard|core|general|free)\b/.test(l)) return 'For individuals getting started with the essentials.';
  if (/\b(pro|professional|plus|premium)\b/.test(l)) return 'Advanced tools for growing teams and power users.';
  if (/\b(enterprise|business|corporate)\b/.test(l)) return 'Dedicated support, SSO and unlimited everything.';
  if (/\b(vip)\b/.test(l)) return 'Priority access with premium benefits and extra support.';
  if (/\b(family|group|team)\b/.test(l)) return 'Group-friendly access for multiple participants.';
  if (/\b(plan|membership|subscription)\b/.test(f)) return index === 0 ? 'Essential benefits for getting started.' : 'Expanded access for a richer member experience.';
  if (/\b(ticket|pass|event|festival|festa)\b/.test(f)) return index === 0 ? 'General admission and core event access.' : 'Enhanced event access with added comfort and perks.';
  return `A clear ${label} choice for this form.`;
}

export function mockCatalogBadge(label: string): string {
  return /\b(pro|professional|plus|popular|premium|vip)\b/i.test(label) ? 'Popular' : '';
}

export function enrichRichChoiceOptionsFromCatalog(field: any, display: RichChoiceDisplay): void {
  const options = Array.isArray(field?.options) ? field.options : [];
  if (!options.length) return;
  const fieldText = [field.key, field.label, field.name, field.placeholder].map((v) => String(v || '')).join(' ');
  options.forEach((opt: any, index: number) => {
    if (!opt || typeof opt !== 'object') return;
    const label = optionLabel(opt) || `Option ${index + 1}`;
    if (!opt.value) opt.value = slugifyOption(label);
    if (!opt.label) opt.label = label;
    opt.icon = mockCatalogIconForOption(label, fieldText, index, display);
    delete opt.iconHtml;
    if (display === 'cards') {
      if (!opt.description && !opt.desc && !opt.helpText && !opt.subLabel) opt.description = mockCatalogCardDescription(label, fieldText, index);
      if (!opt.badge) {
        const badge = mockCatalogBadge(label);
        if (badge) opt.badge = badge;
      }
    }
  });
}

export function mockChipOptions(): any[] {
  return [
    { value: 'design', label: 'Design', icon: 'palette' },
    { value: 'code', label: 'Development', icon: 'code' },
    { value: 'marketing', label: 'Marketing', icon: 'megaphone' },
    { value: 'music', label: 'Music', icon: 'music' },
    { value: 'photo', label: 'Photography', icon: 'camera' },
    { value: 'fitness', label: 'Fitness', icon: 'dumbbell' },
    { value: 'travel', label: 'Travel', icon: 'plane' },
  ];
}

export function mockCardOptions(): any[] {
  return [
    { value: 'starter', label: 'Starter', icon: 'rocket', description: 'For individuals getting started with the essentials.', meta: 'Free' },
    { value: 'pro', label: 'Professional', icon: 'zap', description: 'Advanced tools for growing teams and power users.', meta: '$29/mo', badge: 'Popular' },
    { value: 'enterprise', label: 'Enterprise', icon: 'crown', description: 'Dedicated support, SSO and unlimited everything.', meta: 'Custom' },
  ];
}

export function mockCatalogImageForText(text: string, fallbackIndex = 0): MockRichChoiceImageUrl {
  const hay = String(text || '').toLowerCase();
  let best = MOCK_RICH_CHOICE_IMAGES[Math.abs(fallbackIndex) % MOCK_RICH_CHOICE_IMAGES.length];
  let bestScore = -1;
  MOCK_RICH_CHOICE_IMAGES.forEach((img, index) => {
    const score = img.tags.reduce((sum, tag) => sum + (hay.includes(tag) ? 2 : 0), 0) + (hay.includes(img.key.replace(/-/g, ' ')) ? 3 : 0);
    if (score > bestScore || (score === bestScore && index < fallbackIndex)) {
      best = img;
      bestScore = score;
    }
  });
  return best.url;
}

const INVENTED_IMAGE_URL_RE = /https?:\/\/(?:images\.unsplash\.com|source\.unsplash\.com|picsum\.photos|placehold\.co|placeholder\.com|via\.placeholder\.com)[^'"`\s)]+/gi;

export function replaceInventedImageUrlsWithCatalog(input: string, contextText: string): string {
  const s = String(input || '');
  if (!s) return s;
  let i = 0;
  return s.replace(INVENTED_IMAGE_URL_RE, () => mockCatalogImageForText(contextText, i++));
}

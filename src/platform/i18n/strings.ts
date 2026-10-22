// Same [ar, en] pair pattern as passnames' i18n.js. Games add their own dictionaries later.
export const strings = {
  'app.name': ['مجلس', 'Majlis'],
  'group.name': ['شلّتنا', 'Our crew'],
  'lang.switch': ['English', 'عربي'],
  'lang.switchLabel': ['Switch to English', 'التبديل إلى العربية'],

  'home.question': ['وش نلعب الليلة؟', 'What are we playing tonight?'],
  'home.lede': [
    'افتح غرفة، أرسل الكود في الديسكورد، والباقي علينا.',
    'Open a room, drop the code in Discord, we handle the rest.',
  ],
  'home.pick': ['اختر لعبة', 'Pick a game'],

  'join.title': ['عندك كود؟', 'Got a code?'],
  'join.label': ['كود الغرفة', 'Room code'],
  'join.submit': ['ادخل', 'Join'],
  'join.invalid': ['الكود ٩ خانات: حروف إنجليزية وأرقام.', 'Codes are 9 letters and numbers.'],
  'join.notYet': ['الغرف تنفتح في المرحلة الجاية.', 'Rooms open in the next phase.'],

  'game.players': ['{min}–{max} لاعبين', '{min}–{max} players'],
  'game.soon': ['قريبًا', 'Soon'],
  'game.create': ['افتح غرفة', 'Open a room'],
  'game.surface.phone': ['جوال لكل لاعب', 'A phone each'],
  'game.surface.screen': ['شاشة مشتركة', 'Shared TV'],
  'game.surface.host': ['مقدّم من جواله', 'Host on a phone'],

  'footer.admin': ['لوحة المشرف', 'Admin'],
} as const satisfies Record<string, readonly [string, string]>;

export type StringKey = keyof typeof strings;

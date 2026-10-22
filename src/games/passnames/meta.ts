import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'passnames',
  name: { ar: 'باسنيمز', en: 'Passnames' },
  tagline: {
    ar: 'تلميح واحد، فريقان، وبطاقة سوداء تنهي كل شي.',
    en: 'One clue, two teams, and a black card that ends it all.',
  },
  players: [4, 10],
  surfaces: ['phone', 'screen'],
  status: 'ready',
  accent: 'oklch(0.58 0.12 245)',
  settingFields: [
    {
      id: 'mode',
      kind: 'choice',
      label: { ar: 'الوضع', en: 'Mode' },
      options: [
        { value: 'standard', label: { ar: 'عادي ٥×٥', en: 'Standard 5×5' } },
        { value: 'expanded', label: { ar: 'موسّع ٦×٦ + بطاقات أكشن', en: 'Expanded 6×6 + action cards' } },
      ],
    },
    {
      id: 'board',
      kind: 'choice',
      label: { ar: 'البطاقات', en: 'Cards' },
      options: [
        { value: 'words', label: { ar: 'كلمات', en: 'Words' } },
        { value: 'photos', label: { ar: 'صور الشلة', en: 'Our photos' } },
      ],
    },
    { id: 'timerSeconds', kind: 'number', label: { ar: 'وقت التخمين', en: 'Guess timer' }, min: 0, max: 600, step: 10, unit: { ar: 'ثانية (٠ = بدون)', en: 'sec (0 = off)' } },
    { id: 'manualDraw', kind: 'toggle', label: { ar: 'الجاسوس يسحب البطاقات بنفسه', en: 'Spymasters draw cards by hand' } },
  ],
  lobby: {
    teams: [
      { id: 'blue', name: { ar: 'الأزرق', en: 'Blue' }, color: 'var(--team-blue)' },
      { id: 'red', name: { ar: 'الأحمر', en: 'Red' }, color: 'var(--team-red)' },
    ],
    roles: [
      { id: 'spy', name: { ar: 'جاسوس', en: 'Spymaster' }, hint: { ar: 'يشوف الألوان ويعطي التلميح', en: 'Sees the colours, gives the clue' }, max: 1 },
      { id: 'agent', name: { ar: 'عميل', en: 'Agent' }, hint: { ar: 'يخمّن من التلميح', en: 'Guesses from the clue' } },
    ],
    defaultRole: 'agent',
  },
};

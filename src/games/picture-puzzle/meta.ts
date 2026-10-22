import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'picture-puzzle',
  name: { ar: 'فكّها', en: 'Picture Puzzle' },
  tagline: {
    ar: 'صور على الشاشة، فريقين يخمّنون، والمقدّم يوزّع النقاط.',
    en: 'Pictures on the TV, two teams guessing, the host hands out points.',
  },
  players: [3, 20],
  surfaces: ['screen', 'host', 'phone'],
  status: 'ready',
  accent: 'oklch(0.72 0.15 55)',
  settingFields: [
    { id: 'rounds', kind: 'number', label: { ar: 'عدد الألغاز', en: 'Puzzles' }, min: 1, max: 50 },
    { id: 'points', kind: 'number', label: { ar: 'نقاط اللغز', en: 'Points per puzzle' }, min: 1, max: 100, unit: { ar: 'التلميح ينصّفها', en: 'a hint halves it' } },
  ],
  lobby: {
    teams: [
      { id: 'falcons', name: { ar: 'الصقور', en: 'Falcons' }, color: 'oklch(0.8 0.13 78)' },
      { id: 'wolves', name: { ar: 'الذيابة', en: 'Wolves' }, color: 'oklch(0.66 0.1 230)' },
    ],
    roles: [
      { id: 'player', name: { ar: 'لاعب', en: 'Player' } },
      {
        id: 'host',
        name: { ar: 'المقدّم', en: 'Host' },
        hint: { ar: 'يتحكم من جواله ويوزّع النقاط', en: 'Runs the show from their phone' },
        max: 1,
        teamless: true,
      },
    ],
    defaultRole: 'player',
  },
};

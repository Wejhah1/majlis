import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'mafia',
  name: { ar: 'المافيا', en: 'Mafia' },
  tagline: {
    ar: 'في الليل يختفي واحد منّا. في النهار نقرر مين الكذّاب.',
    en: 'At night one of us disappears. By day we decide who is lying.',
  },
  players: [5, 20],
  surfaces: ['phone', 'screen'],
  status: 'ready',
  accent: 'oklch(0.63 0.18 35)',
  settingFields: [],
  lobby: {
    roles: [
      { id: 'player', name: { ar: 'لاعب', en: 'Player' } },
      {
        id: 'narrator',
        name: { ar: 'الراوي', en: 'Narrator' },
        hint: { ar: 'ما يلعب، يشوف كل شي ويدير الجولات', en: 'Does not play; sees everything and runs the rounds' },
        max: 1,
        teamless: true,
      },
    ],
    defaultRole: 'player',
  },
};

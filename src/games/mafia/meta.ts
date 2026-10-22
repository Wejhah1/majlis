import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'mafia',
  name: { ar: 'المافيا', en: 'Mafia' },
  tagline: {
    ar: 'في الليل يختفي واحد منّا. في النهار نقرر مين الكذّاب.',
    en: 'At night one of us disappears. By day we decide who is lying.',
  },
  players: [6, 20],
  surfaces: ['phone', 'screen'],
  status: 'soon',
};

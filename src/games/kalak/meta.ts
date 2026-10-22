import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'kalak',
  name: { ar: 'كَلَك', en: 'Kalak' },
  tagline: {
    ar: 'اكتب جواب غلط يقنعهم، وحاول تلقى الصح بين أكاذيبهم.',
    en: 'Write a fake answer they will believe, then find the real one among their lies.',
  },
  players: [3, 12],
  surfaces: ['phone', 'screen'],
  status: 'ready',
  accent: 'oklch(0.8 0.13 78)',
  settingFields: [],
  lobby: {},
};

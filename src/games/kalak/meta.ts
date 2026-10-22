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
  settingFields: [
    { id: 'rounds', kind: 'number', label: { ar: 'عدد الأسئلة', en: 'Questions' }, min: 1, max: 30 },
    { id: 'writeSeconds', kind: 'number', label: { ar: 'وقت الكتابة', en: 'Writing time' }, min: 0, max: 300, step: 15, unit: { ar: 'ثانية (٠ = بدون)', en: 'sec (0 = off)' } },
    { id: 'voteSeconds', kind: 'number', label: { ar: 'وقت التصويت', en: 'Voting time' }, min: 0, max: 180, step: 10, unit: { ar: 'ثانية (٠ = بدون)', en: 'sec (0 = off)' } },
  ],
  lobby: {},
};

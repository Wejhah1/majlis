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
  settingFields: [
    { id: 'mafiaCount', kind: 'number', label: { ar: 'عدد المافيا', en: 'Mafia count' }, min: 0, max: 6, unit: { ar: '٠ = تلقائي', en: '0 = auto' } },
    { id: 'detective', kind: 'toggle', label: { ar: 'فيه محقق', en: 'Include a Detective' } },
    { id: 'doctor', kind: 'toggle', label: { ar: 'فيه طبيب', en: 'Include a Doctor' } },
    { id: 'witch', kind: 'toggle', label: { ar: 'فيه ساحرة (جرعة حياة وجرعة موت)', en: 'Include a Witch (save & kill potions)' } },
    { id: 'hunter', kind: 'toggle', label: { ar: 'فيه صياد (يطلق رصاصة لما يموت)', en: 'Include a Hunter (last shot on death)' } },
    { id: 'cupid', kind: 'toggle', label: { ar: 'فيه كيوبيد (عشّاق يموتون مع بعض)', en: 'Include Cupid (lovers die together)' } },
    { id: 'elder', kind: 'toggle', label: { ar: 'فيه شايب (ينجو من أول هجوم)', en: 'Include an Elder (survives one attack)' } },
    { id: 'idiot', kind: 'toggle', label: { ar: 'فيه أهبل (ينجو من التصويت مرة)', en: 'Include a Village Idiot (survives one vote)' } },
    { id: 'revealOnDeath', kind: 'toggle', label: { ar: 'ينكشف دور اللي يموت', en: 'Reveal roles on death' } },
    { id: 'nightSeconds', kind: 'number', label: { ar: 'وقت الليل', en: 'Night timer' }, min: 0, max: 600, step: 15, unit: { ar: 'ثانية (٠ = بدون)', en: 'sec (0 = off)' } },
    { id: 'discussSeconds', kind: 'number', label: { ar: 'وقت النقاش (التصويت مقفل)', en: 'Discussion (voting locked)' }, min: 0, max: 1800, step: 30, unit: { ar: 'ثانية (٠ = المشرف يفتح التصويت)', en: 'sec (0 = host opens the vote)' } },
    { id: 'daySeconds', kind: 'number', label: { ar: 'وقت التصويت', en: 'Voting timer' }, min: 0, max: 1800, step: 30, unit: { ar: 'ثانية (٠ = بدون)', en: 'sec (0 = off)' } },
  ],
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

import type { Localized } from '../types';

export type MafiaRole = 'mafia' | 'doctor' | 'detective' | 'villager';

export const ROLES: Record<MafiaRole, { name: Localized; team: 'mafia' | 'town'; blurb: Localized }> = {
  mafia: {
    name: { ar: 'مافيا', en: 'Mafia' },
    team: 'mafia',
    blurb: { ar: 'كل ليلة تختارون مع ربعكم مين يختفي. لا ينكشف أمركم.', en: 'Each night you and your crew choose who disappears. Don’t get caught.' },
  },
  doctor: {
    name: { ar: 'الطبيب', en: 'Doctor' },
    team: 'town',
    blurb: { ar: 'كل ليلة تحمي شخص واحد من المافيا.', en: 'Each night you protect one person from the Mafia.' },
  },
  detective: {
    name: { ar: 'المحقق', en: 'Detective' },
    team: 'town',
    blurb: { ar: 'كل ليلة تحقق مع شخص وتعرف إذا هو مافيا.', en: 'Each night you investigate one person and learn if they are Mafia.' },
  },
  villager: {
    name: { ar: 'مواطن', en: 'Villager' },
    team: 'town',
    blurb: { ar: 'ما عندك قوة إلا لسانك. اكشفوا المافيا بالنهار.', en: 'Your only power is your voice. Find the Mafia by day.' },
  },
};

export const ROLE_ORDER: MafiaRole[] = ['mafia', 'detective', 'doctor', 'villager'];

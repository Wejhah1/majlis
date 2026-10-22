import type { Localized } from '../types';

export type MafiaRole = 'mafia' | 'doctor' | 'detective' | 'witch' | 'hunter' | 'cupid' | 'elder' | 'idiot' | 'villager';

export const ROLES: Record<MafiaRole, { name: Localized; team: 'mafia' | 'town'; blurb: Localized }> = {
  mafia: {
    name: { ar: 'مافيا', en: 'Mafia' },
    team: 'mafia',
    blurb: { ar: 'كل ليلة تختارون مع ربعكم مين يختفي. لا ينكشف أمركم.', en: 'Each night you and your crew choose who disappears. Don’t get caught.' },
  },
  doctor: {
    name: { ar: 'الطبيب', en: 'Doctor' },
    team: 'town',
    blurb: { ar: 'كل ليلة تحمي شخص واحد من المافيا. ما تقدر تحمي نفس الشخص ليلتين ورا بعض.', en: 'Each night you protect one person from the Mafia, never the same person twice in a row.' },
  },
  detective: {
    name: { ar: 'المحقق', en: 'Detective' },
    team: 'town',
    blurb: { ar: 'كل ليلة تحقق مع شخص وتعرف إذا هو مافيا.', en: 'Each night you investigate one person and learn if they are Mafia.' },
  },
  witch: {
    name: { ar: 'الساحرة', en: 'Witch' },
    team: 'town',
    blurb: {
      ar: 'عندك جرعتين طول اللعبة: وحدة تنقذ ضحية المافيا، ووحدة تقتل أي أحد. تشوف مين الضحية كل ليلة.',
      en: 'Two potions for the whole game: one saves the Mafia’s victim, one kills anyone. You see the victim each night.',
    },
  },
  hunter: {
    name: { ar: 'الصياد', en: 'Hunter' },
    team: 'town',
    blurb: { ar: 'إذا متّ بأي طريقة، تطلق آخر رصاصة وتاخذ معك واحد.', en: 'If you die in any way, you fire one last shot and take someone with you.' },
  },
  cupid: {
    name: { ar: 'كيوبيد', en: 'Cupid' },
    team: 'town',
    blurb: {
      ar: 'أول ليلة تختار اثنين يصيرون عشّاق. إذا مات واحد منهم، يموت الثاني من الحزن.',
      en: 'On the first night you make two people lovers. If one dies, the other dies of heartbreak.',
    },
  },
  elder: {
    name: { ar: 'الشايب', en: 'Elder' },
    team: 'town',
    blurb: { ar: 'قوي وعنيد: تنجو من أول هجوم للمافيا. الثاني يقتلك.', en: 'Tough as old boots: you survive the Mafia’s first attack. The second one gets you.' },
  },
  idiot: {
    name: { ar: 'الأهبل', en: 'Village Idiot' },
    team: 'town',
    blurb: {
      ar: 'إذا المدينة صوتت عليك، ينكشف دورك وتعيش، بس ما تقدر تصوّت بعدها.',
      en: 'If the town votes you out, your card is revealed and you live on, but you can’t vote anymore.',
    },
  },
  villager: {
    name: { ar: 'مواطن', en: 'Villager' },
    team: 'town',
    blurb: { ar: 'ما عندك قوة إلا لسانك. اكشفوا المافيا بالنهار.', en: 'Your only power is your voice. Find the Mafia by day.' },
  },
};

export const ROLE_ORDER: MafiaRole[] = ['mafia', 'detective', 'doctor', 'witch', 'hunter', 'cupid', 'elder', 'idiot', 'villager'];

/** Roles that do something at night (everyone else taps a decoy so nobody can tell). */
export const NIGHT_ROLES: MafiaRole[] = ['mafia', 'doctor', 'detective', 'witch', 'cupid'];

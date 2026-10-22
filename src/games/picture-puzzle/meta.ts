import type { GameMeta } from '../types';

export const meta: GameMeta = {
  id: 'picture-puzzle',
  name: { ar: 'فكّها', en: 'Picture Puzzle' },
  tagline: {
    ar: 'صور على الشاشة، فريقين يخمّنون، والمقدّم يوزّع النقاط.',
    en: 'Pictures on the TV, two teams guessing, the host hands out points.',
  },
  players: [2, 20],
  surfaces: ['screen', 'host', 'phone'],
  status: 'soon',
};

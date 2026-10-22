import { lazy, Suspense } from 'react';
import { Home } from './Home';
import { RoomPage } from './RoomPage';
import { useRoute } from './router';
import { TvPage } from './TvPage';

// The dashboard is only for one person per group; keep it out of everyone else's download.
const AdminPage = lazy(() => import('../admin/AdminPage').then((m) => ({ default: m.AdminPage })));

export function App() {
  const route = useRoute();
  switch (route.name) {
    case 'room':
      return <RoomPage key={route.code} code={route.code} />;
    case 'tv':
      return <TvPage key={route.code ?? ''} code={route.code} />;
    case 'admin':
      return (
        <Suspense fallback={null}>
          <AdminPage />
        </Suspense>
      );
    default:
      return <Home initialGame={route.game} />;
  }
}

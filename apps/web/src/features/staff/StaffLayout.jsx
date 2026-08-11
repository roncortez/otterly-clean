import { Outlet, Link } from 'react-router-dom';
import { LogOut, Droplets } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';

/**
 * Estructura del trabajador.
 *
 * Pensada para un teléfono en la mano y a veces con prisa: una sola columna,
 * sin menús, sin nada que distraiga del trabajo actual.
 */
export default function StaffLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-forest-800 text-text-inverse">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/trabajo" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent-500">
              <Droplets className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="font-semibold">{user?.firstName}</span>
          </Link>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-forest-200 transition-colors hover:bg-forest-700 hover:text-white"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4.5" aria-hidden="true" />
          </button>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-2xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

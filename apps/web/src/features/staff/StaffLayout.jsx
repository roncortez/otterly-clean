import { Outlet, Link } from 'react-router-dom';
import { LogOut, Droplets, Sliders, UserRound } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';

/**
 * Estructura del trabajador.
 *
 * Pensada para un teléfono en la mano y a veces con prisa: una sola columna,
 * sin menús, sin nada que distraiga del trabajo actual.
 */
export default function StaffLayout() {
  const { user, logout, hasRole } = useAuth();

  return (
    <div className="min-h-dvh bg-surface">
      {/* Mismo verde profundo que las secciones oscuras de la portada. */}
      <header className="sticky top-0 z-30 bg-forest-900 text-text-inverse">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <Link to="/trabajo" className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent-600">
              <Droplets className="size-4 text-white" aria-hidden="true" />
            </span>
            <span className="font-bold tracking-tight">{user?.firstName}</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link
              to="/mi-perfil"
              className="rounded-full p-2 text-forest-200 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Mi perfil"
              title="Mi perfil"
            >
              <UserRound className="size-4.5" aria-hidden="true" />
            </Link>
            {/* Solo para quien además coordina: ADMIN + STAFF. */}
            {hasRole('ADMIN') ? (
              <Link
                to="/operaciones"
                className="rounded-full p-2 text-forest-200 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Ir a Operaciones"
                title="Ir a Operaciones"
              >
                <Sliders className="size-4.5" aria-hidden="true" />
              </Link>
            ) : null}
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-forest-200 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="safe-bottom mx-auto max-w-2xl px-4 py-5">
        <Outlet />
      </main>
    </div>
  );
}

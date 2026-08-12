import { NavLink, Outlet, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  ClipboardList,
  Users,
  UserCog,
  AlertTriangle,
  LogOut,
  Ticket,
  Sliders,
  ShieldCheck,
  Briefcase,
} from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import BrandMark from '@/shared/ui/BrandMark';
import { cx } from '@/shared/ui';

const NAV = [
  { to: '/operaciones', label: 'Hoy', icon: LayoutDashboard, end: true },
  { to: '/operaciones/solicitudes', label: 'Solicitudes', icon: ClipboardList },
  { to: '/operaciones/trabajadores', label: 'Trabajadores', icon: UserCog },
  { to: '/operaciones/clientes', label: 'Clientes', icon: Users },
  { to: '/operaciones/usuarios', label: 'Usuarios y roles', icon: ShieldCheck },
  { to: '/operaciones/incidencias', label: 'Incidencias', icon: AlertTriangle },
  { to: '/operaciones/cupones', label: 'Cupones', icon: Ticket },
  { to: '/operaciones/configuracion', label: 'Configuración', icon: Sliders },
];

/** Consola de operaciones: barra lateral fija, densidad alta. */
export default function OperationsLayout() {
  const { user, logout, hasRole } = useAuth();

  return (
    <div className="min-h-dvh bg-surface lg:flex">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-surface-raised lg:flex">
        <Link to="/operaciones" className="flex h-16 items-center px-5">
          <BrandMark size="md" subtitle="Operaciones" />
        </Link>

        <nav className="flex-1 space-y-0.5 px-3 py-4">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-forest-50 text-forest-700'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                )
              }
            >
              <Icon className="size-4.5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          {/* Quien tiene los dos roles necesita saltar entre consolas sin
              cerrar sesión: el enlace solo aparece si de verdad puede entrar. */}
          {hasRole('STAFF') ? (
            <Link
              to="/trabajo"
              className="mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
            >
              <Briefcase className="size-4.5" aria-hidden="true" />
              Ir a mis trabajos
            </Link>
          ) : null}

          <div className="flex items-center justify-between gap-2 rounded-lg px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">{user?.firstName}</p>
              <p className="text-xs text-text-subtle">{user?.roles?.join(' · ')}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              className="rounded-lg p-1.5 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised lg:hidden">
        <div className="flex h-14 items-center justify-between px-4">
          <span className="font-semibold text-forest-800">Operaciones</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg p-2 text-text-muted"
            aria-label="Cerrar sesión"
          >
            <LogOut className="size-4.5" aria-hidden="true" />
          </button>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
          {NAV.map(({ to, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap',
                  isActive ? 'bg-forest-50 text-forest-700' : 'text-text-muted',
                )
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

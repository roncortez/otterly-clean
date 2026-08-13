import { NavLink, Outlet, Link } from 'react-router-dom';
import { Home, CalendarCheck, MapPin, LogOut, Plus, Building, UserRound } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import BrandMark from '@/shared/ui/BrandMark';
import { ButtonLink, cx } from '@/shared/ui';

const NAV = [
  { to: '/inicio', label: 'Inicio', icon: Home },
  { to: '/servicios', label: 'Servicios', icon: CalendarCheck },
  { to: '/direcciones', label: 'Direcciones', icon: MapPin },
  { to: '/inmuebles', label: 'Lugares', icon: Building },
];

/**
 * Estructura del cliente.
 * Barra superior en escritorio, barra inferior fija en móvil: la navegación
 * queda al alcance del pulgar, como en la app que vendrá después.
 */
export default function CustomerLayout() {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link to="/inicio">
            <BrandMark size="md" />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cx(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-forest-50 text-forest-700'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            {/* Misma llamada a la acción que en la portada: píldora terracota. */}
            <ButtonLink as={Link} to="/reservar" variant="accent" size="sm" className="hidden sm:inline-flex">
              <Plus className="size-4" aria-hidden="true" />
              Reservar
            </ButtonLink>
            <Link
              to="/mi-perfil"
              className="hidden items-center gap-2 rounded-full px-2 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text md:inline-flex"
            >
              <UserRound className="size-4" aria-hidden="true" />
              {user?.firstName}
            </Link>
            <button
              type="button"
              onClick={logout}
              className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
              aria-label="Cerrar sesión"
            >
              <LogOut className="size-4.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 pb-28 sm:pb-8">
        <Outlet />
      </main>

      {/* Navegación móvil */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised/95 backdrop-blur sm:hidden">
        <div className="grid grid-cols-4">
          {NAV.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                cx(
                  'flex flex-col items-center gap-1 py-2.5 text-xs font-medium transition-colors',
                  isActive ? 'text-forest-700' : 'text-text-subtle',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
          <NavLink
            to="/reservar"
            className="flex flex-col items-center gap-1 py-2.5 text-xs font-medium text-accent-600"
          >
            <Plus className="size-5" aria-hidden="true" />
            Reservar
          </NavLink>
        </div>
      </nav>
    </div>
  );
}

import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { CalendarCheck, LogOut, MapPin, UserRound, Home } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import BrandMark from '@/shared/ui/BrandMark';
import { cx } from '@/shared/ui';
import { experienceForPath, useServiceExperiences } from '@/shared/services';

/**
 * Estructura del cliente.
 *
 * Una sola aplicación con tres experiencias dentro. La barra superior cambia de
 * contenido —y de acento— según el servicio en el que estás, y el conmutador de
 * la izquierda deja saltar entre ellos sin volver al inicio. Fuera de un
 * servicio (inicio, direcciones, historial completo) la navegación es la común
 * y el acento vuelve al verde de la marca.
 *
 * Todo sale de `shared/services`: aquí no hay ninguna lista de enlaces escrita
 * a mano, y añadir una pantalla a un servicio es añadir una fila allí.
 */

/** Navegación cuando no estás dentro de ningún servicio. */
const GLOBAL_NAV = [
  { to: '/inicio', label: 'Inicio', icon: Home, end: true },
  { to: '/servicios', label: 'Mis reservas', icon: CalendarCheck },
  { to: '/direcciones', label: 'Direcciones', icon: MapPin },
];

export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const experiences = useServiceExperiences();
  const current = experienceForPath(pathname);
  const nav = current?.nav ?? GLOBAL_NAV;

  return (
    <div className="min-h-dvh bg-surface" data-service={current?.code ?? undefined}>
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-5">
          <div className="flex min-w-0 items-center gap-3">
            <Link to="/inicio" aria-label="Inicio de Otterly Clean">
              <BrandMark size="md" />
            </Link>
            {current && (
              <span className="hidden items-center gap-1.5 rounded-full bg-service-soft px-3 py-1 text-sm font-semibold text-service-strong sm:inline-flex">
                <current.icon className="size-3.5" aria-hidden="true" />
                {current.label}
              </span>
            )}
          </div>

          <nav className="hidden items-center gap-1 md:flex" aria-label="Secciones">
            {nav.map(({ to, label, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'rounded-full px-3.5 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-service-soft text-service-strong'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-2">
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

        {/* Conmutador de servicio: siempre visible, para no tener que volver
            al inicio solo para cambiar de contexto. */}
        <div className="border-t border-border bg-surface-raised/60">
          <div className="mx-auto flex max-w-6xl items-center gap-1 overflow-x-auto px-5 py-2">
            {experiences.map((experience) => {
              const active = current?.code === experience.code;
              return (
                <Link
                  key={experience.code}
                  to={experience.path}
                  data-service={experience.code}
                  aria-current={active ? 'page' : undefined}
                  className={cx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-service text-white'
                      : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                  )}
                >
                  <experience.icon className="size-3.5" aria-hidden="true" />
                  {experience.label}
                </Link>
              );
            })}
            <span className="mx-1 h-4 w-px shrink-0 bg-border" aria-hidden="true" />
            <NavLink
              to="/servicios"
              className={({ isActive }) =>
                cx(
                  'shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                  isActive
                    ? 'bg-surface-sunken text-text'
                    : 'text-text-muted hover:bg-surface-sunken hover:text-text',
                )
              }
            >
              Todo
            </NavLink>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8 pb-28 md:pb-8">
        <Outlet />
      </main>

      {/* Navegación móvil: la del servicio en el que estás. */}
      <nav
        className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised/95 backdrop-blur md:hidden"
        aria-label="Secciones"
      >
        <div className="flex">
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cx(
                  'flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                  isActive ? 'text-service-strong' : 'text-text-subtle',
                )
              }
            >
              <Icon className="size-5" aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

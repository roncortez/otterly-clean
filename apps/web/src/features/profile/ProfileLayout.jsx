import { NavLink, Outlet, Link } from 'react-router-dom';
import { ArrowLeft, UserRound, MapPin, DoorOpen } from 'lucide-react';
import { useAuth, homePathForRoles } from '@/shared/auth/AuthContext';
import { cx } from '@/shared/ui';

/**
 * Mi perfil, con su propia navegación.
 *
 * Las tres pantallas van en este orden porque es el orden en que se usan, y ese
 * orden explica la relación entre ellas sin tener que escribirla:
 *
 *   Datos personales  →  quién eres
 *   Direcciones       →  dónde estás
 *   Lugares           →  qué limpiamos en esa dirección
 *
 * Primero existe una dirección; después se puede describir el lugar que hay en
 * ella. Antes Direcciones y Lugares colgaban de la navegación principal como dos
 * conceptos globales en paralelo, y nada indicaba que uno depende del otro.
 *
 * Solo Direcciones y Lugares son del cliente. Una trabajadora o una
 * administradora entran aquí a lo suyo —sus datos— y no ven pestañas que no le
 * corresponden.
 */
const TABS = [
  { to: '/mi-perfil', label: 'Datos personales', icon: UserRound, end: true },
  { to: '/mi-perfil/direcciones', label: 'Direcciones', icon: MapPin, role: 'CUSTOMER' },
  { to: '/mi-perfil/lugares', label: 'Lugares para limpieza', icon: DoorOpen, role: 'CUSTOMER' },
];

export default function ProfileLayout() {
  const { user } = useAuth();
  const tabs = TABS.filter((tab) => !tab.role || user?.roles?.includes(tab.role));

  return (
    <div className="min-h-dvh bg-surface">
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          to={homePathForRoles(user?.roles)}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-muted transition-colors hover:text-text"
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Volver
        </Link>

        {tabs.length > 1 && (
          <nav
            className="scrollbar-none mb-7 flex gap-1 overflow-x-auto rounded-full bg-surface-sunken p-1"
            aria-label="Secciones del perfil"
          >
            {tabs.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  cx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-sm transition-colors',
                    isActive
                      ? 'bg-surface-raised font-semibold text-forest-700 shadow-[var(--shadow-card)]'
                      : 'font-medium text-text-muted hover:text-text',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                {label}
              </NavLink>
            ))}
          </nav>
        )}

        <Outlet />
      </div>
    </div>
  );
}

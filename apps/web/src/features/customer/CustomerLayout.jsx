import { useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import { Home, CalendarCheck, LogOut, Sparkles, UserRound, Package } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import BrandMark from '@/shared/ui/BrandMark';
import ServicePicker from '@/shared/services/ServicePicker';
import { Button, ButtonLink, cx } from '@/shared/ui';

/**
 * Navegación principal del cliente.
 *
 * Solo lo que se usa a diario. Direcciones y Lugares estaban aquí y se han
 * movido a Perfil: son configuración de la cuenta —se tocan una vez y se
 * olvidan— y ocupaban dos de los cuatro huecos de la barra inferior compitiendo
 * con lo que sí se mira cada día.
 */
const NAV = [
  { to: '/inicio', label: 'Inicio', icon: Home },
  { to: '/servicios', label: 'Servicios', icon: CalendarCheck },
  { to: '/productos', label: 'Productos', icon: Package },
];

/**
 * Estructura del cliente.
 *
 * Barra superior en escritorio, barra inferior fija en móvil: la navegación
 * queda al alcance del pulgar, como en la app que vendrá después.
 *
 * El mismo marco sirve con sesión y sin ella, porque `/reservar` y `/productos`
 * son públicas: un visitante ve la marca, el selector de servicio y el acceso;
 * un cliente ve además sus pantallas. Sin esto, empezar una reserva sin cuenta
 * significaría salir del producto y volver a entrar, que es justo el salto que
 * hace abandonar.
 */
export default function CustomerLayout() {
  const { user, isAuthenticated, logout } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
          <Link to={isAuthenticated ? '/inicio' : '/'} aria-label="Inicio de Otterly Clean">
            <BrandMark size="md" />
          </Link>

          {isAuthenticated && (
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
          )}

          <div className="flex items-center gap-2">
            {/*
              La llamada principal. Abre el selector aquí mismo en lugar de
              navegar a una pantalla intermedia cuyo único contenido era otro
              botón para abrir este mismo modal.
            */}
            <Button
              variant="accent"
              size="sm"
              className="hidden sm:inline-flex"
              onClick={() => setPickerOpen(true)}
            >
              <Sparkles className="size-4" aria-hidden="true" />
              ¿Qué necesitas?
            </Button>

            {isAuthenticated ? (
              <>
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
                  className="cursor-pointer rounded-full p-2 text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
                  aria-label="Cerrar sesión"
                >
                  <LogOut className="size-4.5" aria-hidden="true" />
                </button>
              </>
            ) : (
              <ButtonLink as={Link} to="/entrar" variant="outline" size="sm">
                Entrar
              </ButtonLink>
            )}
          </div>
        </div>
      </header>

      <main
        className={cx('mx-auto max-w-6xl px-5 py-8', isAuthenticated ? 'pb-28 sm:pb-8' : 'pb-8')}
      >
        <Outlet />
      </main>

      {/* Navegación móvil. Sin sesión no hay adónde ir todavía. */}
      {isAuthenticated && (
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
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex cursor-pointer flex-col items-center gap-1 py-2.5 text-xs font-medium text-accent-600"
            >
              <Sparkles className="size-5" aria-hidden="true" />
              Reservar
            </button>
          </div>
        </nav>
      )}

      <ServicePicker open={pickerOpen} onClose={() => setPickerOpen(false)} />
    </div>
  );
}

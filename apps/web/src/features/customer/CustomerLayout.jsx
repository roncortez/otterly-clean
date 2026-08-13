import { useEffect, useRef } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import { LogOut, UserRound } from 'lucide-react';
import { useAuth } from '@/shared/auth/AuthContext';
import BrandMark from '@/shared/ui/BrandMark';
import { cx } from '@/shared/ui';
import { experienceForPath, navContextForPath, useNavContexts } from '@/shared/services';

/**
 * Estructura del cliente: un solo sistema de navegación, con tres niveles.
 *
 *   OTTERLY CLEAN        ← la marca y la sesión
 *        ↓
 *   LIMPIEZA             ← en qué estás. Cambiar de aquí cambia de contexto.
 *        ↓
 *   Reservar · Mis reservas · Mis espacios     ← lo que se puede hacer ahí
 *
 * Ese orden es el arreglo. Antes la navegación del servicio iba arriba y el
 * conmutador debajo, así que lo que representaba el contexto entero —estoy en
 * Limpieza— parecía un menú secundario colgado de las opciones, y no lo
 * contrario. Ahora el contexto va primero, tiene el peso visual y el color, y
 * sus opciones cuelgan de él en una banda con su mismo acento.
 *
 * "Fuera de un servicio" también es un contexto y se llama Mi cuenta: ahí viven
 * las direcciones y el historial completo, que no son de ningún servicio. Así no
 * hay dos barras compitiendo ni una opción repetida en dos niveles.
 *
 * En móvil los mismos tres niveles se reparten para no apilar barras: marca y
 * sesión arriba, el conmutador justo debajo, y las opciones del contexto abajo,
 * donde llega el pulgar.
 *
 * Todo sale de `shared/services`: aquí no hay ninguna lista de enlaces escrita a
 * mano, y añadir una pantalla a un servicio es añadir una fila allí.
 */
export default function CustomerLayout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();

  const contexts = useNavContexts();
  const service = experienceForPath(pathname);
  const context = navContextForPath(pathname);

  const sections = context.nav ?? [];
  // Un contexto con una sola pantalla no necesita banda: la pantalla ya se
  // titula. Es el caso de Arreglos, que existe pero todavía no tiene flujo.
  const hasSections = sections.length > 1;

  return (
    <div className="min-h-dvh bg-surface" data-service={service?.code ?? undefined}>
      <header className="sticky top-0 z-30 border-b border-border bg-surface-raised/85 backdrop-blur">
        {/* Nivel 1: la marca y quién eres */}
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-5">
          <Link to="/inicio" aria-label="Inicio de Otterly Clean" className="shrink-0">
            <BrandMark size="md" />
          </Link>

          <ContextSwitcher contexts={contexts} current={context} className="hidden md:flex" />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              to="/mi-perfil"
              className="hidden items-center gap-2 rounded-full px-2.5 py-1.5 text-sm text-text-muted transition-colors hover:bg-surface-sunken hover:text-text md:inline-flex"
            >
              <UserRound className="size-4" aria-hidden="true" />
              {user?.firstName}
            </Link>
            <Link
              to="/mi-perfil"
              aria-label="Mi perfil"
              className="rounded-full p-2 text-text-muted transition-colors hover:bg-surface-sunken hover:text-text md:hidden"
            >
              <UserRound className="size-4.5" aria-hidden="true" />
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

        {/* Nivel 2 en móvil: el conmutador, en su propia fila y desplazable */}
        <ContextSwitcher
          contexts={contexts}
          current={context}
          className="scrollbar-none flex overflow-x-auto border-t border-border px-5 py-2 md:hidden"
        />

        {/*
          Nivel 3: las opciones del contexto, con su acento.
          En móvil viven en la barra inferior, así que aquí no se repiten.
        */}
        {hasSections && (
          <div className="hidden border-t border-service-muted bg-service-soft md:block">
            <nav
              className="mx-auto flex max-w-6xl items-center gap-1 px-5 py-1.5"
              aria-label={`Secciones de ${context.label}`}
            >
              {sections.map(({ to, label, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cx(
                      'rounded-full px-3.5 py-1.5 text-sm transition-colors',
                      isActive
                        ? 'bg-surface-raised font-semibold text-service-strong shadow-[var(--shadow-card)]'
                        : 'font-medium text-text-muted hover:bg-surface-raised/60 hover:text-text',
                    )
                  }
                >
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className={cx('mx-auto max-w-6xl px-5 py-8', hasSections ? 'pb-28 md:pb-8' : 'pb-8')}>
        <Outlet />
      </main>

      {/* Las opciones del contexto en móvil: al alcance del pulgar. */}
      {hasSections && (
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface-raised/95 backdrop-blur md:hidden"
          aria-label={`Secciones de ${context.label}`}
        >
          <div className="flex">
            {sections.map(({ to, label, icon: Icon, end }) => (
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
      )}
    </div>
  );
}

/**
 * En qué contexto estás y cómo cambiarlo.
 *
 * El seleccionado va relleno con su propio acento —cada pestaña lleva su
 * `data-service`, así que el color sale del servicio y no de la pantalla— y los
 * demás quedan en texto. Es la única pieza de la cabecera con fondo sólido: si
 * las opciones de dentro también lo tuvieran, volveríamos a tener dos menús del
 * mismo peso.
 */
function ContextSwitcher({ contexts, current, className }) {
  const activeTab = useRef(null);

  /**
   * En móvil la tira se desplaza, y con cuatro contextos el que estás usando
   * puede quedar fuera de la pantalla: "Arreglos" es el último. Se trae a la
   * vista, porque una barra que no muestra dónde estás no sirve para eso.
   * `block: 'nearest'` evita que además mueva la página en vertical.
   */
  useEffect(() => {
    activeTab.current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [current.code]);

  return (
    <nav className={cx('items-center gap-1', className)} aria-label="Servicios">
      {contexts.map((context) => {
        const active = context.code === current.code;
        const Icon = context.icon;

        return (
          <Link
            key={context.slug}
            ref={active ? activeTab : null}
            to={context.path}
            data-service={context.code ?? undefined}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm transition-colors',
              active
                ? 'bg-service font-bold text-white shadow-[var(--shadow-card)]'
                : 'font-medium text-text-muted hover:bg-surface-sunken hover:text-text',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {context.label}
          </Link>
        );
      })}
    </nav>
  );
}

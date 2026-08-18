import { useCallback, useEffect } from 'react';
import { X } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import BrandMark from '@/shared/ui/BrandMark';
import { useConfig } from '@/shared/config/ConfigContext';
import { cx } from '@/shared/ui';

/**
 * Panel de acceso.
 *
 * Antes el login ocupaba la pantalla entera y entrar se sentía como salir de la
 * aplicación. Ahora la página en la que estabas sigue detrás —oscurecida y
 * desenfocada— y el acceso aparece encima como un panel compacto.
 *
 * Se conserva la división en dos mitades que ya tenía: a la izquierda la marca
 * sobre verde profundo, a la derecha el formulario. En móvil la mitad visual se
 * reduce a una franja con el logotipo: dividir en dos una pantalla de 360 px
 * dejaría el formulario sin sitio.
 *
 * El velo es el mismo verde profundo del resto de diálogos (`Modal`), no negro:
 * detrás sigue estando la misma marca.
 */
export default function AuthDialog({ title, description, aside, children, footer }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { company } = useConfig();

  /**
   * Cerrar devuelve a la página de detrás. Si se llegó por enlace directo no hay
   * nada detrás en el historial, y `navigate(-1)` sacaría a la persona del
   * sitio; en ese caso se va a la portada.
   */
  const close = useCallback(() => {
    if (location.state?.background) navigate(-1);
    else navigate('/', { replace: true });
  }, [location.state, navigate]);

  // Cerrar con Esc, igual que cualquier otro diálogo del producto.
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [close]);

  // La página de detrás no debe poder desplazarse mientras el panel está abierto.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div
      className="anim-fade fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-forest-950/70 p-4 backdrop-blur-md"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) close();
      }}
    >
      {/*
        Entra igual que cualquier otro diálogo del producto, y eso es justamente
        lo que se busca: entrar no debe sentirse como salir de la aplicación.
        El panel crece sobre la página que se queda detrás en lugar de sustituir
        la pantalla, y el velo se funde con él.

        No lleva animación de salida: cerrar aquí es navegar hacia atrás, y el
        panel se va con la ruta. Ponerla obligaría a retrasar la navegación, que
        es peor negocio que un cierre instantáneo.
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : 'Acceso'}
        className={cx(
          'anim-pop relative my-auto grid w-full max-w-3xl overflow-hidden rounded-2xl',
          'border border-border bg-surface-raised shadow-[var(--shadow-raised)]',
          'sm:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)]',
        )}
      >
        {/* Mitad visual: en móvil se reduce a una franja para no robar sitio. */}
        <aside className="flex flex-col justify-between gap-6 bg-forest-900 p-6 text-text-inverse sm:p-8">
          <BrandMark size="lg" tone="inverse" />

          <div className="hidden sm:block">
            {aside ?? (
              <>
                <p className="text-xl leading-tight font-extrabold tracking-tight text-balance">
                  Sabes quién entra a tu casa, cuándo llega y cuándo termina.
                </p>
                <p className="mt-3 text-sm text-forest-100">
                  Profesionales contratados y verificados por nosotros.
                </p>
              </>
            )}
          </div>

          {company.address ? (
            <p className="hidden text-xs text-forest-200 sm:block">{company.address}</p>
          ) : null}
        </aside>

        <div className="p-6 sm:p-8">
          <h1 className="text-xl font-extrabold tracking-tight text-text">{title}</h1>
          {description ? <p className="mt-1 text-sm text-text-muted">{description}</p> : null}

          <div className="mt-6">{children}</div>

          {footer ? <div className="mt-5">{footer}</div> : null}
        </div>

        <button
          type="button"
          onClick={close}
          aria-label="Cerrar"
          className="press absolute top-3 right-3 rounded-full p-1.5 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

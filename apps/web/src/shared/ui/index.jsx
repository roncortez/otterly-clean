import { useEffect } from 'react';
import { Loader2, Star, X } from 'lucide-react';

/**
 * Componentes base.
 *
 * Deliberadamente pocos y sin dependencias de librerías de UI: el objetivo es
 * un vocabulario visual pequeño y coherente que se pueda trasladar tal cual a
 * una app móvil más adelante.
 *
 * El lenguaje visual sale de la portada y se aplica igual en todas las
 * consolas, para que nadie sienta que cambió de producto al iniciar sesión:
 *
 *   · Botones en píldora (rounded-full) que se hunden al pulsarlos.
 *   · Verde bosque para navegar y confirmar; terracota solo para la acción
 *     principal y para lo que está pasando ahora.
 *   · Antetítulo en versalitas + titular apretado (font-extrabold tracking-tight).
 *   · Tarjetas rounded-2xl sobre superficie elevada, sin bordes duros.
 *
 * Ningún componente usa la paleta por defecto de Tailwind (slate, emerald,
 * rose…): todo pasa por los tokens de index.css.
 */

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

// --- Botón -----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'bg-forest-700 text-white hover:bg-forest-600 active:bg-forest-800 shadow-sm',
  // La llamada principal: la única que lleva terracota y sombra propia.
  accent: 'bg-accent-600 text-white hover:bg-accent-500 shadow-[var(--shadow-cta)]',
  outline: 'border border-border-strong bg-surface-raised text-text hover:bg-surface-sunken',
  ghost: 'text-text-muted hover:bg-surface-sunken hover:text-text',
  danger: 'border border-danger/25 bg-danger-soft text-danger hover:bg-danger hover:text-white',
  // Sobre fondos verde profundo (hero, cabeceras, panel de acceso).
  inverse:
    'border border-white/20 bg-white/10 text-white backdrop-blur-md hover:bg-white/20',
};

const BUTTON_SIZES = {
  sm: 'h-9 px-4 text-sm gap-1.5',
  md: 'h-11 px-5 text-sm gap-2',
  lg: 'h-13 px-7 text-base gap-2',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      className={cx(
        'inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-all',
        'active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

/**
 * Mismo botón, pero navegando. Se usa con `as={Link}` para que un enlace de
 * react-router no tenga que copiar las clases a mano.
 */
export function ButtonLink({ as: Tag = 'a', variant = 'primary', size = 'md', className, children, ...props }) {
  return (
    <Tag
      className={cx(
        'inline-flex cursor-pointer items-center justify-center rounded-full font-semibold transition-all active:scale-95',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

// --- Contenedores ----------------------------------------------------------

export function Card({ as: Tag = 'div', className, children, ...props }) {
  return (
    <Tag
      className={cx(
        'rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-card)]',
        className,
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

export function CardHeader({ title, description, action, className }) {
  return (
    <div className={cx('flex items-start justify-between gap-4 px-5 pt-5', className)}>
      <div className="min-w-0">
        <h2 className="text-base font-bold tracking-tight text-text">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/**
 * Antetítulo en versalitas verdes. Es la firma tipográfica de la portada y
 * ordena igual de bien una sección de la consola que una del sitio público.
 */
export function Eyebrow({ className, children }) {
  return (
    <span
      className={cx(
        'text-xs font-semibold tracking-[0.14em] text-forest-700 uppercase',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function PageHeader({ title, description, action, eyebrow }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1.5 block">{eyebrow}</Eyebrow>}
        <h1 className="text-2xl font-extrabold tracking-tight text-text sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}

/**
 * Encabezado centrado de las secciones largas de la portada. Mismo ritmo que
 * PageHeader (antetítulo → titular → apoyo), solo cambia el eje.
 */
export function SectionHeading({ eyebrow, title, description, inverse = false, className }) {
  return (
    <div className={cx('text-center', className)}>
      {eyebrow && (
        <Eyebrow className={inverse ? 'text-forest-200' : undefined}>{eyebrow}</Eyebrow>
      )}
      <h2
        className={cx(
          'mt-2 text-3xl font-extrabold tracking-tight sm:text-4xl',
          inverse ? 'text-white' : 'text-text',
        )}
      >
        {title}
      </h2>
      {description && (
        <p
          className={cx(
            'mx-auto mt-3 max-w-xl text-sm leading-relaxed',
            inverse ? 'text-forest-100' : 'text-text-muted',
          )}
        >
          {description}
        </p>
      )}
    </div>
  );
}

// --- Estado y retroalimentación --------------------------------------------

const BADGE_TONES = {
  neutral: 'bg-surface-sunken text-text-muted border-border',
  forest: 'bg-forest-50 text-forest-700 border-forest-100',
  accent: 'bg-accent-50 text-accent-700 border-accent-200',
  success: 'bg-success-soft text-success border-success/20',
  warning: 'bg-warning-soft text-warning border-warning/20',
  danger: 'bg-danger-soft text-danger border-danger/20',
  info: 'bg-info-soft text-info border-info/20',
};

export function Badge({ tone = 'neutral', className, children }) {
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/**
 * Tono del estado de una orden.
 * Terracota = está pasando ahora. Verde = terminó bien. Rojo = necesita
 * atención. Es la única señal de color que el usuario tiene que aprender.
 */
export function statusTone(status) {
  if (['COMPLETED', 'DELIVERED'].includes(status)) return 'success';
  if (['CANCELLED', 'NO_ACCESS', 'INCIDENT_REPORTED', 'ISSUE_REPORTED'].includes(status)) {
    return 'danger';
  }
  if (status === 'REQUIRES_REVIEW') return 'warning';
  if (['REQUESTED', 'PENDING_ASSIGNMENT', 'PICKUP_SCHEDULED'].includes(status)) return 'neutral';
  return 'accent';
}

export function StatusBadge({ status, label }) {
  const tone = statusTone(status);
  const isLive = tone === 'accent';

  return (
    <Badge tone={tone}>
      <span
        className={cx('size-1.5 rounded-full bg-current', isLive && 'pulse-dot')}
        aria-hidden="true"
      />
      {label ?? status}
    </Badge>
  );
}

export function Spinner({ label = 'Cargando' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-text-muted">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center">
      {Icon && (
        <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-text-subtle">
          <Icon className="size-5" aria-hidden="true" />
        </span>
      )}
      <p className="font-medium text-text">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-text-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'danger', title, children }) {
  const tones = {
    danger: 'border-danger/20 bg-danger-soft text-danger',
    warning: 'border-warning/20 bg-warning-soft text-warning',
    info: 'border-info/20 bg-info-soft text-info',
    success: 'border-success/20 bg-success-soft text-success',
  };

  return (
    <div className={cx('rounded-xl border px-4 py-3 text-sm', tones[tone])} role="alert">
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cx(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
    </div>
  );
}

// --- Superposiciones --------------------------------------------------------

const MODAL_SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
};

/**
 * Diálogo modal.
 *
 * Existe porque cada pantalla que necesitaba uno se lo pintaba a mano, y cada
 * copia se desviaba un poco: otro velo, otro radio, y ninguna cerraba con Esc.
 * El velo es verde profundo, no negro: sigue siendo la misma marca detrás.
 */
export function Modal({ open, onClose, title, description, size = 'md', children, footer }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-forest-950/60 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose?.();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cx(
          'relative flex max-h-[calc(100dvh-2rem)] w-full flex-col overflow-hidden rounded-2xl border border-border bg-surface-raised shadow-[var(--shadow-raised)]',
          MODAL_SIZES[size] ?? MODAL_SIZES.md,
        )}
      >
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="absolute top-4 right-4 cursor-pointer rounded-full p-1.5 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        )}

        {(title || description) && (
          <div className="shrink-0 px-6 pt-6 pr-14">
            {title && <h2 className="text-base font-bold tracking-tight text-text">{title}</h2>}
            {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
          </div>
        )}

        <div className="min-h-0 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex shrink-0 justify-end gap-2 border-t border-border bg-surface-sunken/60 px-6 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Formularios -----------------------------------------------------------

export function Field({ label, hint, error, required, children, className }) {
  return (
    <label className={cx('block', className)}>
      <span className="mb-1.5 flex items-baseline gap-1 text-sm font-medium text-text">
        {label}
        {required && <span className="text-accent-600">*</span>}
      </span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-text-subtle">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  );
}

/**
 * El aspecto de un control de formulario, en un solo sitio.
 *
 * Se exporta porque hay controles que no pueden ser un `<Input>` —el buscador
 * del mapa lleva su propio `role="combobox"` y su panel de resultados— y antes
 * se copiaban las clases a ojo. Cada copia se desviaba un poco: otro fondo, otra
 * altura, otro anillo de foco, y la diferencia solo se veía usando la
 * aplicación. Importar la constante es lo que mantiene esos casos alineados sin
 * obligarles a usar el componente.
 *
 * La altura va aparte (`CONTROL_HEIGHT`) porque los textarea no la llevan.
 */
export const CONTROL_CLASS =
  'w-full rounded-xl border border-border bg-surface-raised px-3.5 text-sm text-text ' +
  'transition-colors placeholder:text-text-subtle ' +
  'focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15 ' +
  'disabled:bg-surface-sunken disabled:text-text-subtle disabled:cursor-not-allowed';

export const CONTROL_HEIGHT = 'h-11';

export function Input({ className, ...props }) {
  return <input className={cx(CONTROL_CLASS, CONTROL_HEIGHT, className)} {...props} />;
}

export function Textarea({ className, rows = 3, ...props }) {
  return <textarea rows={rows} className={cx(CONTROL_CLASS, 'py-2.5', className)} {...props} />;
}

export function Select({ className, children, ...props }) {
  return (
    <select className={cx(CONTROL_CLASS, 'h-11 pr-8', className)} {...props}>
      {children}
    </select>
  );
}

export function Checkbox({ label, description, className, ...props }) {
  return (
    <label className={cx('flex cursor-pointer items-start gap-3', className)}>
      <input
        type="checkbox"
        className="mt-0.5 size-4.5 shrink-0 rounded border-border-strong text-forest-600 focus:ring-forest-500/25"
        {...props}
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-text">{label}</span>
        {description && <span className="block text-xs text-text-muted">{description}</span>}
      </span>
    </label>
  );
}

/**
 * La estrella de «predeterminada».
 *
 * Marca cuál es la dirección —o el lugar— que se usa por defecto, y es la misma
 * pieza en las dos pantallas porque es la misma regla: hay exactamente una, se
 * cambia marcando otra, y desmarcar no existe (lo impone el backend; ver
 * `addressService` y `propertyService`).
 *
 * La estrella de la predeterminada se pinta y se queda. Antes desaparecía justo
 * al marcarla —el botón solo se dibujaba en las demás—, así que la única fila
 * sin estrella era precisamente la que estaba elegida: se leía como que ahí no
 * había nada marcado. Ahora la elegida es la llena, y sobre ella el botón queda
 * inerte porque no hay ninguna acción que ofrecer.
 */
export function DefaultStar({ isDefault, onSelect, label }) {
  return (
    <button
      type="button"
      onClick={isDefault ? undefined : onSelect}
      disabled={isDefault}
      aria-pressed={isDefault}
      className={cx(
        'rounded-full p-2 transition-colors',
        isDefault
          ? 'cursor-default text-accent-500'
          : 'cursor-pointer text-text-subtle hover:bg-surface-sunken hover:text-accent-500',
      )}
      aria-label={
        isDefault
          ? `${label} es la predeterminada`
          : `Marcar ${label} como predeterminada`
      }
      title={isDefault ? 'Predeterminada' : 'Marcar como predeterminada'}
    >
      <Star className={cx('size-4', isDefault && 'fill-current')} aria-hidden="true" />
    </button>
  );
}

/**
 * Selector de opción en tarjeta. Se usa en el asistente de reserva: elegir
 * entre limpieza estándar y profunda merece más que un desplegable.
 *
 * Lo seleccionado se marca con el acento del servicio en el que estás. Fuera de
 * un servicio ese acento es el verde de la marca, así que se ve igual que
 * siempre sin que ninguna pantalla tenga que decidirlo.
 */
export function OptionCard({ selected, title, description, meta, disabled, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'w-full cursor-pointer rounded-xl border p-4 text-left transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected
          ? 'border-service bg-service-soft ring-2 ring-service/20'
          : 'border-border bg-surface-raised hover:border-border-strong hover:bg-surface-sunken',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{title}</p>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
        {meta && <span className="shrink-0 text-sm font-semibold text-service-strong tnum">{meta}</span>}
      </div>
    </button>
  );
}

export function Divider({ className }) {
  return <hr className={cx('border-0 border-t border-border', className)} />;
}

/** Par etiqueta/valor para las pantallas de detalle. */
export function DataRow({ label, children, className }) {
  if (children === null || children === undefined || children === '') return null;
  return (
    <div className={cx('flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5', className)}>
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className="text-right text-sm font-medium text-text">{children}</dd>
    </div>
  );
}

import { Loader2 } from 'lucide-react';

/**
 * Componentes base.
 *
 * Deliberadamente pocos y sin dependencias de librerías de UI: el objetivo es
 * un vocabulario visual pequeño y coherente que se pueda trasladar tal cual a
 * una app móvil más adelante.
 */

export function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

// --- Botón -----------------------------------------------------------------

const BUTTON_VARIANTS = {
  primary: 'bg-forest-600 text-white hover:bg-forest-700 active:bg-forest-800 shadow-sm',
  accent: 'bg-accent-600 text-white hover:bg-accent-700 active:bg-accent-700 shadow-sm',
  outline: 'border border-border-strong bg-surface-raised text-text hover:bg-surface-sunken',
  ghost: 'text-text-muted hover:bg-surface-sunken hover:text-text',
  danger: 'border border-danger/25 bg-danger-soft text-danger hover:bg-danger hover:text-white',
};

const BUTTON_SIZES = {
  sm: 'h-9 px-3 text-sm gap-1.5',
  md: 'h-11 px-4 text-sm gap-2',
  lg: 'h-13 px-6 text-base gap-2',
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
        'inline-flex items-center justify-center rounded-xl font-medium transition-colors',
        'disabled:cursor-not-allowed disabled:opacity-50',
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
        <h2 className="text-base font-semibold text-text">{title}</h2>
        {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, description, action, eyebrow }) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-text-subtle uppercase">
            {eyebrow}
          </p>
        )}
        <h1 className="text-2xl font-semibold text-text sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-text-muted">{description}</p>}
      </div>
      {action}
    </header>
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

const CONTROL_CLASS =
  'w-full rounded-xl border border-border bg-surface-raised px-3.5 text-sm text-text ' +
  'transition-colors placeholder:text-text-subtle ' +
  'focus:border-forest-500 focus:outline-none focus:ring-2 focus:ring-forest-500/15 ' +
  'disabled:bg-surface-sunken disabled:text-text-subtle';

export function Input({ className, ...props }) {
  return <input className={cx(CONTROL_CLASS, 'h-11', className)} {...props} />;
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
 * Selector de opción en tarjeta. Se usa en el asistente de reserva: elegir
 * entre limpieza estándar y profunda merece más que un desplegable.
 */
export function OptionCard({ selected, title, description, meta, disabled, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      aria-pressed={selected}
      className={cx(
        'w-full rounded-xl border p-4 text-left transition-all',
        'disabled:cursor-not-allowed disabled:opacity-50',
        selected
          ? 'border-forest-500 bg-forest-50 ring-2 ring-forest-500/20'
          : 'border-border bg-surface-raised hover:border-border-strong hover:bg-surface-sunken',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{title}</p>
          {description && <p className="mt-0.5 text-sm text-text-muted">{description}</p>}
        </div>
        {meta && <span className="shrink-0 text-sm font-semibold text-forest-700 tnum">{meta}</span>}
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

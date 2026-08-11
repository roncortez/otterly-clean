import { Check, AlertTriangle } from 'lucide-react';
import { cx } from '@/shared/ui';
import { formatDateTime } from '@/shared/format';

/**
 * Timeline del servicio.
 *
 * Es el componente central del producto. El cliente casi nunca está en casa
 * mientras se ejecuta el servicio, así que esta lista es su única ventana a lo
 * que ocurre dentro: qué ya pasó y a qué hora, qué está ocurriendo ahora y qué
 * falta. Por eso incluye los pasos futuros y no solo el historial.
 *
 *   ✓ Servicio solicitado          10:04
 *   ✓ Profesional asignado         11:00
 *   ● Limpieza en progreso         08:35   <- único elemento animado
 *   ○ Limpieza finalizada
 */
export function StatusTimeline({ steps, locale = 'es-EC' }) {
  if (!steps?.length) return null;

  return (
    <ol className="relative">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;
        const isDone = step.state === 'DONE';
        const isCurrent = step.state === 'CURRENT';
        const isException = step.state === 'EXCEPTION';

        return (
          <li key={`${step.status}-${index}`} className="relative flex gap-3.5 pb-5 last:pb-0">
            {/* Línea de conexión entre hitos */}
            {!isLast && (
              <span
                aria-hidden="true"
                className={cx(
                  'absolute top-6 left-[11px] w-px',
                  'h-[calc(100%-1rem)]',
                  isDone ? 'bg-forest-300' : 'bg-border',
                )}
              />
            )}

            <span
              aria-hidden="true"
              className={cx(
                'relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                isDone && 'border-forest-600 bg-forest-600 text-white',
                isCurrent && 'pulse-dot border-accent-500 bg-accent-500 text-white',
                isException && 'border-danger bg-danger text-white',
                step.state === 'PENDING' && 'border-border-strong bg-surface-raised',
              )}
            >
              {isDone && <Check className="size-3.5" strokeWidth={3} />}
              {isCurrent && <span className="size-2 rounded-full bg-white" />}
              {isException && <AlertTriangle className="size-3.5" strokeWidth={2.5} />}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <p
                  className={cx(
                    'text-sm',
                    isCurrent && 'font-semibold text-text',
                    isDone && 'font-medium text-text',
                    isException && 'font-semibold text-danger',
                    step.state === 'PENDING' && 'text-text-subtle',
                  )}
                >
                  {step.label}
                </p>
                {step.at && (
                  <time
                    className="text-xs text-text-subtle tnum"
                    dateTime={new Date(step.at).toISOString()}
                  >
                    {formatDateTime(step.at, locale)}
                  </time>
                )}
              </div>
              {step.note && <p className="mt-1 text-sm text-text-muted">{step.note}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

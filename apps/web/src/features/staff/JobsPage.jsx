import { Link } from 'react-router-dom';
import { CalendarCheck, MapPin, Clock, ChevronRight } from 'lucide-react';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { Alert, Card, EmptyState, Spinner, StatusBadge, cx } from '@/shared/ui';
import { SERVICE_ICONS, SERVICE_LABELS } from '@/shared/ui/ServiceCard';
import { formatTimeWindow, formatLongDate } from '@/shared/format';

/**
 * Trabajos del día.
 *
 * El trabajador NO puede buscar trabajos disponibles: solo ve lo que
 * Operaciones le asignó. La API ya lo garantiza; aquí simplemente no existe
 * ninguna pantalla de búsqueda.
 */
export default function JobsPage() {
  const { data, loading, error } = useApiQuery('/staff/jobs/today');

  if (loading) return <Spinner label="Cargando tus trabajos" />;
  if (error) return <Alert tone="danger">{error}</Alert>;

  const today = data?.today ?? [];
  const upcoming = data?.upcoming ?? [];

  return (
    <div className="space-y-7">
      <header>
        <p className="text-sm text-text-muted capitalize">{formatLongDate(new Date())}</p>
        <h1 className="mt-0.5 text-2xl font-extrabold tracking-tight text-text">
          {today.length === 0
            ? 'Sin trabajos hoy'
            : `${today.length} trabajo${today.length > 1 ? 's' : ''} hoy`}
        </h1>
      </header>

      {today.length === 0 ? (
        <EmptyState
          icon={CalendarCheck}
          title="No tienes trabajos asignados hoy"
          description="Cuando la empresa te asigne uno, aparecerá aquí."
        />
      ) : (
        <div className="stagger space-y-3">
          {today.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </div>
      )}

      {upcoming.length > 0 && (
        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-[0.14em] text-forest-700 uppercase">
            Próximos
          </h2>
          <div className="stagger space-y-3">
            {upcoming.map((job) => (
              <JobCard key={job.id} job={job} showDate />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function JobCard({ job, showDate = false }) {
  const Icon = SERVICE_ICONS[job.serviceType] ?? CalendarCheck;
  const needsAction = ['ASSIGNED'].includes(job.status);

  return (
    <Card
      as={Link}
      to={`/trabajo/${job.id}`}
      interactive
      className={cx(
        // El trabajador usa esto con el teléfono en la mano y a veces con prisa:
        // el hundimiento al tocar es la confirmación de que la pulsación entró,
        // antes de que la pantalla siguiente termine de cargar.
        'press group block',
        needsAction && 'border-accent-300 ring-2 ring-accent-500/15',
      )}
    >
      <div className="flex items-start gap-3.5 p-4">
        <span
          className={cx(
            'flex size-11 shrink-0 items-center justify-center rounded-xl',
            needsAction ? 'bg-accent-100 text-accent-700' : 'bg-forest-50 text-forest-600',
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-text">{SERVICE_LABELS[job.serviceType]}</p>
            <StatusBadge status={job.status} label={job.statusLabel} />
          </div>

          <p className="mt-1.5 flex items-center gap-1.5 text-sm text-text-muted tnum">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            {showDate && <span className="capitalize">{formatLongDate(job.scheduledDate)} · </span>}
            {formatTimeWindow(job.scheduledWindowStart, job.scheduledWindowEnd)}
          </p>

          <p className="mt-1 flex items-center gap-1.5 text-sm text-text-subtle">
            <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {[job.streetLine1, job.neighborhood].filter(Boolean).join(' · ')}
            </span>
          </p>

          {needsAction && (
            <p className="mt-2 text-sm font-medium text-accent-700">Toca para confirmar</p>
          )}
        </div>

        <ChevronRight
          className="nudge size-5 shrink-0 self-center text-text-subtle"
          aria-hidden="true"
        />
      </div>
    </Card>
  );
}

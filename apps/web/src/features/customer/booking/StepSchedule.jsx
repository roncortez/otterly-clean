import { useMemo } from 'react';
import { Clock, CalendarOff } from 'lucide-react';
import { Alert, Field, Input, OptionCard, Spinner } from '@/shared/ui';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { toDateInput, addDays, formatLongDate, formatTime } from '@/shared/format';

/**
 * Paso 3: cuándo.
 *
 * Las franjas vienen de la configuración regional y la disponibilidad, de los
 * bloqueos de agenda que Operaciones haya puesto. Ocultar aquí un horario
 * cerrado es cortesía: el backend vuelve a comprobarlo al confirmar, porque
 * esta pantalla no es una barrera de seguridad.
 */
export default function StepSchedule({ booking, update, timeWindows }) {
  const { minLeadTimeHours } = useConfig();

  // El backend exige antelación mínima; el formulario no ofrece fechas que
  // vaya a rechazar.
  const minDate = toDateInput(addDays(minLeadTimeHours >= 24 ? 1 : 0));
  const maxDate = toDateInput(addDays(60));

  const availabilityQuery = useApiQuery('/catalog/availability', {
    params: { serviceType: booking.serviceType, from: minDate, to: maxDate },
  });

  // Index por fecha: la búsqueda se repite en cada render del selector.
  const daysByDate = useMemo(() => {
    const days = availabilityQuery.data?.days ?? [];
    return new Map(days.map((day) => [day.date, day]));
  }, [availabilityQuery.data]);

  const day = daysByDate.get(booking.scheduledDate);
  const windowsForDay = day?.windows ?? null;

  const isBlocked = (code) => {
    if (!windowsForDay) return false;
    return windowsForDay.find((window) => window.code === code)?.available === false;
  };

  const blockedReason = (code) =>
    windowsForDay?.find((window) => window.code === code)?.reason ?? null;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-semibold text-text">¿Cuándo te viene bien?</h2>
        <p className="mt-1 text-text-muted">
          Reservamos con al menos {minLeadTimeHours} horas de antelación.
        </p>
      </div>

      <Field label="Fecha" required>
        <Input
          type="date"
          required
          min={minDate}
          max={maxDate}
          value={booking.scheduledDate}
          onChange={(event) => update({ scheduledDate: event.target.value })}
        />
      </Field>

      {booking.scheduledDate ? (
        <p className="-mt-4 text-sm text-text-muted capitalize">
          {formatLongDate(booking.scheduledDate)}
        </p>
      ) : null}

      {day?.fullyBlocked ? (
        <Alert tone="warning" title="Ese día no tenemos agenda disponible">
          Elige otra fecha: seguimos aceptando reservas para los días siguientes.
        </Alert>
      ) : null}

      <div>
        <p className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-text">
          <Clock className="size-4 text-text-subtle" aria-hidden="true" />
          Franja horaria
        </p>

        {availabilityQuery.loading ? (
          <Spinner label="Comprobando disponibilidad" />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-3">
            {timeWindows.map((window) => {
              const blocked = isBlocked(window.code);
              const reason = blockedReason(window.code);

              return (
                <OptionCard
                  key={window.code}
                  selected={booking.windowCode === window.code}
                  disabled={blocked}
                  onSelect={() => update({ windowCode: window.code })}
                  title={window.label}
                  description={
                    blocked
                      ? (reason ?? 'No disponible')
                      : `${formatTime(window.startTime)} – ${formatTime(window.endTime)}`
                  }
                />
              );
            })}
          </div>
        )}

        {availabilityQuery.error ? (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-text-subtle">
            <CalendarOff className="size-4" aria-hidden="true" />
            No pudimos comprobar la disponibilidad. Puedes continuar: lo verificamos al confirmar.
          </p>
        ) : (
          <p className="mt-3 text-sm text-text-subtle">
            {booking.serviceType === 'LAUNDRY'
              ? 'Pasamos a recoger dentro de esta franja. La entrega la coordinamos después.'
              : 'El profesional llega dentro de esta franja.'}
          </p>
        )}
      </div>
    </div>
  );
}

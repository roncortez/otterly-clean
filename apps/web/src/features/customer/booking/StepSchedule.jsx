import { Clock } from 'lucide-react';
import { Field, Input, OptionCard } from '@/shared/ui';
import { useConfig } from '@/shared/config/ConfigContext';
import { toDateInput, addDays, formatLongDate, formatTime } from '@/shared/format';

/** Paso 3: cuándo. Las ventanas horarias vienen de la configuración regional. */
export default function StepSchedule({ booking, update, timeWindows }) {
  const { minLeadTimeHours } = useConfig();

  // El backend exige antelación mínima; el formulario no ofrece fechas que
  // vaya a rechazar.
  const minDate = toDateInput(addDays(minLeadTimeHours >= 24 ? 1 : 0));

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
          value={booking.scheduledDate}
          onChange={(event) => update({ scheduledDate: event.target.value })}
        />
      </Field>

      {booking.scheduledDate && (
        <p className="-mt-4 text-sm text-text-muted capitalize">
          {formatLongDate(booking.scheduledDate)}
        </p>
      )}

      <div>
        <p className="mb-2.5 flex items-center gap-1.5 text-sm font-medium text-text">
          <Clock className="size-4 text-text-subtle" aria-hidden="true" />
          Franja horaria
        </p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {timeWindows.map((window) => (
            <OptionCard
              key={window.code}
              selected={booking.windowCode === window.code}
              onSelect={() => update({ windowCode: window.code })}
              title={window.label}
              description={`${formatTime(window.startTime)} – ${formatTime(window.endTime)}`}
            />
          ))}
        </div>
        <p className="mt-3 text-sm text-text-subtle">
          {booking.serviceType === 'LAUNDRY'
            ? 'Pasamos a recoger dentro de esta franja. La entrega la coordinamos después.'
            : 'El profesional llega dentro de esta franja.'}
        </p>
      </div>
    </div>
  );
}

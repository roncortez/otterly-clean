import { Spinner, Divider } from '@/shared/ui';
import { useConfig } from '@/shared/config/ConfigContext';
import { formatLongDate, formatTime } from '@/shared/format';

/**
 * Paso 6: resumen.
 * El precio lo calcula el backend, no el navegador: es la misma cifra que se
 * guardará en la orden.
 */
export default function StepSummary({ booking, service, addresses, pricing, money, timeWindows }) {
  const { taxLabel, freeCancellationHours } = useConfig();

  const plan = service?.plans.find((entry) => entry.id === booking.planId);
  const address = addresses.find((entry) => entry.id === booking.addressId);
  const window = timeWindows.find((entry) => entry.code === booking.windowCode);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-text">Revisa antes de confirmar</h2>
        <p className="mt-1 text-text-muted">Podrás cancelar sin costo si cambias de planes.</p>
      </div>

      <dl className="divide-y divide-border">
        <Row label="Servicio" value={plan?.name} />
        <Row label="Cuándo" value={formatLongDate(booking.scheduledDate)} capitalize />
        <Row
          label="Franja"
          value={window ? `${formatTime(window.startTime)} – ${formatTime(window.endTime)}` : '—'}
        />
        <Row
          label={booking.serviceType === 'LAUNDRY' ? 'Recogemos en' : 'Dirección'}
          value={
            address
              ? [address.street_line1, address.neighborhood, address.city]
                  .filter(Boolean)
                  .join(' · ')
              : '—'
          }
        />
        {booking.serviceType === 'CLEANING' && (
          <>
            <Row
              label="Espacio"
              value={`${booking.cleaning.bedrooms} hab · ${booking.cleaning.bathrooms} baños`}
            />
            <Row label="Duración" value={`${booking.durationMinutes / 60} horas`} />
            <Row
              label="Estarás en casa"
              value={booking.cleaning.customerPresent ? 'Sí' : 'No, sigo desde la app'}
            />
          </>
        )}
        {booking.serviceType === 'LAUNDRY' && (
          <>
            <Row label="Bolsas" value={`${booking.laundry.estimatedBags}`} />
            <Row
              label="Lavado"
              value={`${
                { COLD: 'Agua fría', WARM: 'Agua tibia', HOT: 'Agua caliente' }[
                  booking.laundry.washTemperature
                ]
              }${booking.laundry.useFabricSoftener ? ' · con suavizante' : ' · sin suavizante'}`}
            />
          </>
        )}
      </dl>

      <Divider />

      {!pricing ? (
        <Spinner label="Calculando el total" />
      ) : (
        <div className="rounded-xl bg-surface-sunken p-5">
          <dl className="space-y-2">
            {pricing.lines.map((line, index) => (
              <div key={`${line.code}-${index}`} className="flex justify-between gap-4 text-sm">
                <dt className="text-text-muted">{line.label}</dt>
                <dd className="font-medium text-text tnum">{money(line.amount)}</dd>
              </div>
            ))}

            {pricing.discount > 0 && (
              <div className="flex justify-between gap-4 text-sm text-success">
                <dt>Descuento</dt>
                <dd className="font-medium tnum">−{money(pricing.discount)}</dd>
              </div>
            )}

            <div className="flex justify-between gap-4 border-t border-border pt-2 text-sm">
              <dt className="text-text-muted">Subtotal</dt>
              <dd className="font-medium text-text tnum">{money(pricing.subtotal)}</dd>
            </div>

            {pricing.tax > 0 && (
              <div className="flex justify-between gap-4 text-sm">
                <dt className="text-text-muted">
                  {taxLabel} ({Math.round(pricing.taxRate * 100)}%)
                </dt>
                <dd className="font-medium text-text tnum">{money(pricing.tax)}</dd>
              </div>
            )}

            <div className="flex items-baseline justify-between gap-4 border-t border-border-strong pt-3">
              <dt className="font-semibold text-text">Total</dt>
              <dd className="text-xl font-semibold text-forest-700 tnum">{money(pricing.total)}</dd>
            </div>
          </dl>

          <p className="mt-4 text-xs text-text-subtle">
            El pago se coordina directamente con la empresa. Cancelación sin costo hasta{' '}
            {freeCancellationHours} horas antes.
            {booking.serviceType === 'LAUNDRY' &&
              ' El total puede ajustarse según el peso real al recibir la ropa.'}
          </p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, capitalize }) {
  return (
    <div className="flex flex-wrap justify-between gap-x-6 gap-y-1 py-2.5">
      <dt className="text-sm text-text-muted">{label}</dt>
      <dd className={`text-right text-sm font-medium text-text ${capitalize ? 'capitalize' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  );
}

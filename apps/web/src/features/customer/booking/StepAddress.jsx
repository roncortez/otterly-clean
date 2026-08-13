import { Link } from 'react-router-dom';
import { MapPin, Plus } from 'lucide-react';
import { cx } from '@/shared/ui';

/** Paso 4: dónde. Solo se eligen direcciones ya guardadas del cliente. */
export default function StepAddress({ booking, update, addresses }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          {booking.serviceType === 'LAUNDRY' ? '¿Dónde recogemos?' : '¿Dónde es el servicio?'}
        </h2>
        <p className="mt-1 text-text-muted">Elige una de tus direcciones guardadas.</p>
      </div>

      <div className="space-y-2.5">
        {addresses.map((address) => {
          const selected = booking.addressId === address.id;
          return (
            <button
              key={address.id}
              type="button"
              onClick={() => update({ addressId: address.id })}
              aria-pressed={selected}
              className={cx(
                'flex w-full cursor-pointer items-start gap-3.5 rounded-xl border p-4 text-left transition-all',
                selected
                  ? 'border-forest-500 bg-forest-50 ring-2 ring-forest-500/20'
                  : 'border-border hover:border-border-strong hover:bg-surface-sunken',
              )}
            >
              <span
                className={cx(
                  'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                  selected ? 'bg-forest-600 text-white' : 'bg-surface-sunken text-text-muted',
                )}
              >
                <MapPin className="size-4.5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="font-medium text-text">{address.label}</span>
                  {address.is_default && (
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted">
                      Predeterminada
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-text-muted">
                  {[address.street_line1, address.street_line2].filter(Boolean).join(' y ')}
                </span>
                <span className="block text-sm text-text-subtle">
                  {[address.neighborhood, address.city].filter(Boolean).join(' · ')}
                </span>
                {address.reference && (
                  <span className="mt-1 block text-sm text-text-subtle italic">
                    {address.reference}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>

      <Link
        to="/direcciones"
        className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar otra dirección
      </Link>
    </div>
  );
}

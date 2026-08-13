import { useState } from 'react';
import { MapPin, Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiAction } from '@/shared/api/useApiQuery';
import { Alert, cx } from '@/shared/ui';
import AddressForm from '../AddressForm';

/**
 * Dónde recogemos la ropa.
 *
 * Lavandería solo necesita la dirección: recogemos y entregamos donde vivas, sin
 * entrar en la casa, así que aquí no se pregunta nada de la vivienda. Es la
 * misma lista de direcciones de la cuenta, la que comparten todos los servicios.
 *
 * Si todavía no hay ninguna, se añade aquí mismo con el formulario de siempre en
 * lugar de mandar a la persona a otra pantalla y hacerla volver.
 */
export default function StepAddress({ booking, update, addresses, selectedAddress, reloadAddresses }) {
  const { busy, error, execute } = useApiAction();
  const [adding, setAdding] = useState(addresses.length === 0);

  async function createAddress(payload) {
    await execute(() => api.post('/customer/addresses', payload), {
      onSuccess: (response) => {
        setAdding(false);
        update({ addressId: response.data.address.id });
        reloadAddresses?.();
      },
    });
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          {booking.serviceType === 'LAUNDRY' ? '¿Dónde recogemos?' : '¿Dónde es el servicio?'}
        </h2>
        <p className="mt-1 text-text-muted">
          {addresses.length === 0
            ? 'Necesitamos una dirección para asignar un profesional de tu zona.'
            : 'Elige una de tus direcciones guardadas.'}
        </p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      {adding ? (
        <AddressForm
          submitting={busy}
          submitLabel="Guardar dirección"
          onSubmit={createAddress}
          onCancel={addresses.length === 0 ? undefined : () => setAdding(false)}
        />
      ) : (
        <>
          <div className="space-y-2.5">
            {addresses.map((address) => {
              const selected = selectedAddress?.id === address.id;
              return (
                <button
                  key={address.id}
                  type="button"
                  onClick={() => update({ addressId: address.id })}
                  aria-pressed={selected}
                  className={cx(
                    'flex w-full items-start gap-3.5 rounded-xl border p-4 text-left transition-all',
                    selected
                      ? 'border-service bg-service-soft ring-2 ring-service/20'
                      : 'border-border hover:border-border-strong hover:bg-surface-sunken',
                  )}
                >
                  <span
                    className={cx(
                      'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
                      selected ? 'bg-service text-white' : 'bg-surface-sunken text-text-muted',
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

          <button
            type="button"
            onClick={() => setAdding(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
          >
            <Plus className="size-4" aria-hidden="true" />
            Agregar otra dirección
          </button>
        </>
      )}
    </div>
  );
}

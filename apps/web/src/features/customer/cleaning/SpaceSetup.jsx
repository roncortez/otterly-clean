import { useState } from 'react';
import { Check } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiAction } from '@/shared/api/useApiQuery';
import { Alert, cx } from '@/shared/ui';
import AddressForm from '../AddressForm';
import HomeProfileForm from './HomeProfileForm';

/**
 * Dar de alta un espacio: primero dónde queda, después qué limpiamos ahí.
 *
 * Son dos preguntas y una sola secuencia, no dos acciones paralelas. Cuando
 * "Añadir dirección" y "Añadir inmueble" eran dos botones al mismo nivel, nada
 * decía cuál venía antes ni qué relación tenían; puestos en orden, la jerarquía
 * se explica sola: no se puede describir las habitaciones de un lugar que
 * todavía no está en el mapa.
 *
 * La numeración está aquí porque hay una secuencia real, y solo por eso.
 *
 * Se usa igual desde "Mis espacios" y desde el asistente de reserva, con los
 * mismos dos formularios de siempre: la dirección es `AddressForm` —la que ya
 * conoce el mapa y el formato de cada región— y la ficha es `HomeProfileForm`.
 * Ninguno se duplica para esto.
 */
export default function SpaceSetup({ onCancel, onDone, addressTitle = '¿Dónde queda?' }) {
  const { busy, error, execute } = useApiAction();
  // Mientras no hay dirección estamos en el paso 1; en cuanto existe, en el 2.
  const [address, setAddress] = useState(null);

  async function createAddress(payload) {
    await execute(() => api.post('/customer/addresses', payload), {
      onSuccess: (response) => setAddress(response.data.address),
    });
  }

  async function saveProfile(payload) {
    await execute(() => api.patch(`/customer/addresses/${address.id}/cleaning-profile`, payload), {
      onSuccess: () => onDone?.(address.id),
    });
  }

  return (
    <div className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      <section>
        <StepLabel number={1} title={addressTitle} done={Boolean(address)} />
        {address ? (
          <p className="mt-1 pl-9 text-sm text-text-muted">
            {[address.label, address.street_line1, address.neighborhood].filter(Boolean).join(' · ')}
          </p>
        ) : (
          <div className="mt-4">
            <AddressForm
              submitting={busy}
              submitLabel="Continuar"
              onSubmit={createAddress}
              onCancel={onCancel}
            />
          </div>
        )}
      </section>

      <section className={cx(!address && 'opacity-40')}>
        <StepLabel number={2} title="¿Qué limpiamos ahí?" muted={!address} />
        <p className="mt-1 pl-9 text-sm text-text-muted">
          Se guarda con el lugar. No volveremos a preguntártelo en cada reserva.
        </p>

        {address && (
          <div className="mt-4">
            <HomeProfileForm
              busy={busy}
              submitLabel="Guardar espacio"
              onSubmit={saveProfile}
              onCancel={() => onDone?.(address.id)}
              cancelLabel="Lo completo después"
            />
          </div>
        )}
      </section>
    </div>
  );
}

function StepLabel({ number, title, done = false, muted = false }) {
  return (
    <p className="flex items-center gap-3">
      <span
        className={cx(
          'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold',
          done && 'bg-service text-white',
          !done && !muted && 'bg-service-soft text-service-strong',
          muted && 'bg-surface-sunken text-text-subtle',
        )}
        aria-hidden="true"
      >
        {done ? <Check className="size-3.5" strokeWidth={3} /> : number}
      </span>
      <span className={cx('font-semibold', muted ? 'text-text-subtle' : 'text-text')}>{title}</span>
    </p>
  );
}

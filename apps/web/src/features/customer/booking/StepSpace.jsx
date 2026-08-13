import { useState } from 'react';
import { DoorOpen, Pencil, Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiAction } from '@/shared/api/useApiQuery';
import { Alert, Badge, Button, cx } from '@/shared/ui';
import HomeProfileForm, {
  AccessSecretBadge,
  accessMethodLabel,
  homeProfileSummary,
} from '../cleaning/HomeProfileForm';
import SpaceSetup from '../cleaning/SpaceSetup';

/**
 * ¿Dónde vamos a limpiar?
 *
 * Se elige un espacio ya descrito y con eso queda dicho todo lo del lugar:
 * cuántas habitaciones, cuántos baños, cómo se entra, si hay mascotas. Antes
 * este paso solo elegía la dirección y los datos de la casa se volvían a pedir
 * dos pasos más adelante, con lo cual registrar el espacio no servía de nada.
 *
 * Lo que sí se ofrece es corregir: la ficha se abre aquí mismo —el mismo
 * formulario de "Mis espacios", no una copia— y lo que se guarda queda en el
 * espacio, no solo en esta reserva. Si el lugar todavía no está descrito, se
 * describe antes de continuar; si no existe, se crea sin salir del asistente.
 */
export default function StepSpace({ update, addresses, selectedAddress, reloadAddresses, areaUnit }) {
  const { busy, error, execute } = useApiAction();
  const [adding, setAdding] = useState(addresses.length === 0);
  const [correcting, setCorrecting] = useState(false);

  const profile = selectedAddress?.cleaningProfile ?? null;
  const needsProfile = Boolean(selectedAddress) && !profile?.complete;
  const showForm = correcting || needsProfile;

  async function saveProfile(payload) {
    await execute(() => api.patch(`/customer/addresses/${selectedAddress.id}/cleaning-profile`, payload), {
      onSuccess: () => {
        setCorrecting(false);
        reloadAddresses?.();
      },
    });
  }

  if (adding) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">Un espacio nuevo</h2>
          <p className="mt-1 text-text-muted">
            {addresses.length === 0
              ? 'Empecemos por el lugar que vamos a limpiar.'
              : 'Se guardará en tus espacios para las próximas veces.'}
          </p>
        </div>

        <SpaceSetup
          addressTitle="¿Dónde queda?"
          onCancel={addresses.length === 0 ? undefined : () => setAdding(false)}
          onDone={async (addressId) => {
            setAdding(false);
            update({ addressId });
            reloadAddresses?.();
          }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">¿Dónde vamos a limpiar?</h2>
        <p className="mt-1 text-text-muted">Elige uno de tus espacios.</p>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}

      <div className="space-y-2.5">
        {addresses.map((address) => {
          const selected = selectedAddress?.id === address.id;
          const summary = homeProfileSummary(address.cleaningProfile, areaUnit);

          return (
            <button
              key={address.id}
              type="button"
              onClick={() => {
                update({ addressId: address.id });
                setCorrecting(false);
              }}
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
                <DoorOpen className="size-4.5" aria-hidden="true" />
              </span>

              <span className="min-w-0">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text">{address.label}</span>
                  {address.is_default && (
                    <span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] text-text-muted">
                      Predeterminada
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block text-sm text-text-muted">
                  {[address.street_line1, address.neighborhood, address.city]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
                <span className="mt-0.5 block text-sm text-text-subtle">
                  {address.cleaningProfile?.complete
                    ? summary.join(' · ')
                    : 'Sin datos todavía: te los pedimos abajo.'}
                </span>
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
        Añadir otro espacio
      </button>

      {selectedAddress && (
        <div className="rounded-xl border border-border bg-surface-sunken/60 p-4">
          {showForm ? (
            <>
              <p className="font-semibold text-text">
                {needsProfile ? `¿Qué limpiamos en ${selectedAddress.label}?` : 'Corregir los datos del espacio'}
              </p>
              <p className="mt-0.5 mb-4 text-sm text-text-muted">
                Se guarda en el espacio: la próxima reserva ya lo trae.
              </p>
              <HomeProfileForm
                key={selectedAddress.id}
                profile={profile}
                busy={busy}
                submitLabel="Guardar y seguir"
                onSubmit={saveProfile}
                onCancel={needsProfile ? undefined : () => setCorrecting(false)}
              />
            </>
          ) : (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-text">Lo que ya sabemos de {selectedAddress.label}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {homeProfileSummary(profile, areaUnit).map((part) => (
                    <Badge key={part} tone="neutral">
                      {part}
                    </Badge>
                  ))}
                  <Badge tone="neutral">{accessMethodLabel(profile.accessMethod)}</Badge>
                  {profile.hasAccessSecret && <AccessSecretBadge />}
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setCorrecting(true)}>
                <Pencil className="size-4" aria-hidden="true" />
                Corregir
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

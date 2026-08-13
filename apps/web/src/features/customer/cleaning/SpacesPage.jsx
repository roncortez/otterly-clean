import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Check, DoorOpen, MapPin, Pencil, Plus, X } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Badge, Button, Card, EmptyState, Input, PageHeader, Spinner } from '@/shared/ui';
import HomeProfileForm, {
  AccessSecretBadge,
  accessMethodLabel,
  homeProfileSummary,
} from './HomeProfileForm';
import SpaceSetup from './SpaceSetup';

/**
 * Mis espacios: los lugares que limpiamos y lo que sabemos de cada uno.
 *
 * Se llamaba "Mi hogar", en singular, y una persona tiene su departamento, la
 * casa de sus padres y a veces una oficina. Aquí cada espacio se llama como su
 * dueña quiera —el nombre es el de la dirección, y se cambia desde esta misma
 * tarjeta— para que la lista no sea "Casa, Casa, Casa".
 *
 * Un espacio no es una entidad nueva al lado de la dirección: **es** una
 * dirección con su ficha de limpieza. Por eso la dirección se ve arriba, en
 * gris, y lo que se edita aquí es lo que hace falta para limpiar ahí. Cambiar
 * dónde está el lugar sigue siendo cosa de Direcciones, en la cuenta.
 */
export default function SpacesPage() {
  const { areaUnit } = useConfig();
  const [searchParams, setSearchParams] = useSearchParams();

  const addressQuery = useApiQuery('/customer/addresses');
  const { busy, error: actionError, execute } = useApiAction();

  // Qué nombre se está cambiando y si se está dando de alta un espacio nuevo.
  const [renaming, setRenaming] = useState(null);
  const [adding, setAdding] = useState(false);

  const addresses = addressQuery.data?.addresses ?? [];
  const error = addressQuery.error ?? actionError;

  /**
   * Nombres que se repiten.
   *
   * Quien ya tenía direcciones las tiene llamadas "Casa", porque el sistema lo
   * ponía por él. No se le inventa un nombre —no sabemos cuál es—, pero se le
   * dice cuáles no se distinguen para que pueda arreglarlo en un clic.
   */
  const repeated = new Set(
    addresses
      .map((address) => address.label)
      .filter((label, index, all) => all.indexOf(label) !== index),
  );

  /**
   * Qué tarjeta tiene el formulario abierto.
   *
   * Se puede llegar desde una dirección concreta ("¿qué limpiamos aquí?"), así
   * que mientras nadie haya abierto ni cerrado nada manda la URL. Se deriva
   * durante el render en lugar de copiarse con un efecto: así no hay un instante
   * en que la tarjeta esté cerrada antes de abrirse sola.
   */
  const requested = searchParams.get('espacio');
  const [opened, setOpened] = useState(undefined);
  const editing = opened === undefined ? (requested ? Number(requested) : null) : opened;

  function closeAll() {
    setOpened(null);
    setRenaming(null);
    if (requested) setSearchParams({}, { replace: true });
  }

  async function saveProfile(addressId, payload) {
    await execute(() => api.patch(`/customer/addresses/${addressId}/cleaning-profile`, payload), {
      onSuccess: () => {
        closeAll();
        addressQuery.reload();
      },
    });
  }

  async function saveName(addressId, label) {
    const clean = label.trim();
    if (!clean) return;
    await execute(() => api.patch(`/customer/addresses/${addressId}`, { label: clean }), {
      onSuccess: () => {
        setRenaming(null);
        addressQuery.reload();
      },
    });
  }

  if (addressQuery.loading) return <Spinner label="Cargando tus espacios" />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Limpieza"
        title="Mis espacios"
        description="Cada lugar que limpiamos, con lo que necesitamos saber para hacerlo. Se guarda una vez y tus reservas lo reutilizan."
        action={
          !adding && (
            <Button onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Añadir espacio
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {adding && (
        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-bold tracking-tight text-text">Un espacio nuevo</h2>
          <SpaceSetup
            onCancel={() => setAdding(false)}
            onDone={() => {
              setAdding(false);
              addressQuery.reload();
            }}
          />
        </Card>
      )}

      {addresses.length === 0 && !adding ? (
        <EmptyState
          icon={DoorOpen}
          title="Todavía no tienes espacios"
          description="Un espacio es un lugar tuyo —tu casa, una oficina, el departamento que alquilas— con los datos que necesitamos para limpiarlo."
          action={
            <Button variant="accent" onClick={() => setAdding(true)}>
              Añadir mi primer espacio
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          {addresses.map((address) => {
            const profile = address.cleaningProfile;
            const isEditing = editing === address.id;

            return (
              <Card key={address.id} className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-service-soft text-service-strong">
                      <DoorOpen className="size-4.5" aria-hidden="true" />
                    </span>

                    <div className="min-w-0">
                      {renaming === address.id ? (
                        <NameEditor
                          initial={address.label}
                          busy={busy}
                          onSave={(label) => saveName(address.id, label)}
                          onCancel={() => setRenaming(null)}
                        />
                      ) : (
                        <p className="flex items-center gap-1.5 font-semibold text-text">
                          {address.label}
                          <button
                            type="button"
                            onClick={() => setRenaming(address.id)}
                            className="rounded-full p-1 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
                            aria-label={`Cambiar el nombre de ${address.label}`}
                            title="Cambiar el nombre"
                          >
                            <Pencil className="size-3.5" aria-hidden="true" />
                          </button>
                        </p>
                      )}

                      {/* La dirección: dónde está el lugar, no qué se limpia ahí. */}
                      <p className="mt-0.5 flex items-start gap-1.5 text-sm text-text-muted">
                        <MapPin className="mt-0.5 size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                        {[address.street_line1, address.neighborhood, address.city]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      {repeated.has(address.label) && renaming !== address.id && (
                        <button
                          type="button"
                          onClick={() => setRenaming(address.id)}
                          className="mt-1.5 text-xs font-medium text-accent-700 hover:underline"
                        >
                          Tienes otro espacio con este nombre: ponle uno propio
                        </button>
                      )}
                    </div>
                  </div>

                  {!isEditing && (
                    <Button
                      size="sm"
                      variant={profile?.complete ? 'outline' : 'accent'}
                      onClick={() => setOpened(address.id)}
                    >
                      {profile?.complete ? 'Editar datos' : 'Completar datos'}
                    </Button>
                  )}
                </div>

                {!isEditing &&
                  (profile?.complete ? (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {homeProfileSummary(profile, areaUnit).map((part) => (
                        <Badge key={part} tone="neutral">
                          {part}
                        </Badge>
                      ))}
                      <Badge tone="neutral">{accessMethodLabel(profile.accessMethod)}</Badge>
                      {profile.hasAccessSecret && <AccessSecretBadge />}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-text-subtle">
                      Sin datos todavía. Cuéntanos cuántas habitaciones y baños tiene, y cómo se
                      entra, para poder reservar aquí sin repetirlo cada vez.
                    </p>
                  ))}

                {isEditing && (
                  <div className="mt-5 border-t border-border pt-5">
                    <HomeProfileForm
                      profile={profile}
                      busy={busy}
                      submitLabel="Guardar"
                      onSubmit={(payload) => saveProfile(address.id, payload)}
                      onCancel={closeAll}
                    />
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {addresses.length > 0 && (
        <p className="mt-6 text-sm text-text-subtle">
          ¿Te mudaste o hay que corregir la calle?{' '}
          <Link to="/direcciones" className="font-medium text-service-strong hover:underline">
            Edítalo en tus direcciones
          </Link>
          , que son las mismas que usa lavandería.
        </p>
      )}
    </div>
  );
}

/** Cambiar el nombre de un espacio: es el de su dirección, y se edita aquí. */
function NameEditor({ initial, busy, onSave, onCancel }) {
  const [value, setValue] = useState(initial);

  return (
    <div className="flex items-center gap-1.5">
      <Input
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-label="Nombre del espacio"
        placeholder="Mi departamento"
        className="h-9 max-w-56"
        autoFocus
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave(value);
          if (event.key === 'Escape') onCancel();
        }}
      />
      <Button size="sm" loading={busy} onClick={() => onSave(value)} aria-label="Guardar el nombre">
        <Check className="size-4" aria-hidden="true" />
      </Button>
      <Button size="sm" variant="ghost" onClick={onCancel} aria-label="Descartar el nombre">
        <X className="size-4" aria-hidden="true" />
      </Button>
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Home, KeyRound, MapPin, PawPrint, Plus } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  Textarea,
} from '@/shared/ui';

/**
 * Los datos del hogar, por dirección.
 *
 * Antes esto era "Inmuebles": una lista paralela con su propia calle, su propia
 * ciudad y su propio código de puerta, que no llegaba a ninguna reserva. El
 * cliente escribía dos veces la misma casa y el trabajador no veía ninguno de
 * esos datos.
 *
 * Ahora la dirección es la única entidad —es lo que comparten limpieza,
 * lavandería y cualquier servicio futuro— y esto es su ficha de limpieza:
 * cuántas habitaciones, cómo se entra, si hay mascotas. Se rellena sola al
 * reservar y aquí se corrige.
 */

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'HOUSE', label: 'Casa' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const ACCESS_METHODS = [
  { value: 'CUSTOMER_OPENS', label: 'Yo abro la puerta', needsSecret: false },
  { value: 'CONCIERGE', label: 'Portería o recepción', needsSecret: false },
  { value: 'DOOR_CODE', label: 'Código de puerta', needsSecret: true },
  { value: 'KEY', label: 'Llave escondida', needsSecret: true },
  { value: 'LOCKBOX', label: 'Caja de seguridad', needsSecret: true },
  { value: 'OTHER', label: 'Otro', needsSecret: false },
];

const EMPTY_PROFILE = {
  propertyType: 'APARTMENT',
  bedrooms: 1,
  bathrooms: 1,
  hasPets: false,
  petInstructions: '',
  accessMethod: 'CUSTOMER_OPENS',
  accessInstructions: '',
  parkingInstructions: '',
  notes: '',
};

export default function HomeProfilePage() {
  const { areaUnit } = useConfig();
  const addressQuery = useApiQuery('/customer/addresses');
  const { busy, error: actionError, execute } = useApiAction();

  const [editing, setEditing] = useState(null); // id de la dirección en edición
  const [form, setForm] = useState(EMPTY_PROFILE);

  const addresses = addressQuery.data?.addresses ?? [];
  const error = addressQuery.error ?? actionError;

  function startEditing(address) {
    const profile = address.cleaningProfile;
    setEditing(address.id);
    setForm({
      ...EMPTY_PROFILE,
      ...(profile
        ? {
            propertyType: profile.propertyType ?? EMPTY_PROFILE.propertyType,
            bedrooms: profile.bedrooms ?? EMPTY_PROFILE.bedrooms,
            bathrooms: profile.bathrooms ?? EMPTY_PROFILE.bathrooms,
            areaValue: profile.areaValue ?? '',
            hasPets: profile.hasPets ?? false,
            petInstructions: profile.petInstructions ?? '',
            accessMethod: profile.accessMethod ?? EMPTY_PROFILE.accessMethod,
            accessInstructions: profile.accessInstructions ?? '',
            parkingInstructions: profile.parkingInstructions ?? '',
            notes: profile.notes ?? '',
          }
        : {}),
      // El código guardado no vuelve del servidor: se escribe uno nuevo o se
      // deja en blanco para conservar el que ya hay.
      accessSecret: '',
    });
  }

  async function handleSubmit(event, addressId) {
    event.preventDefault();

    const payload = {
      propertyType: form.propertyType,
      bedrooms: Number(form.bedrooms) || 0,
      bathrooms: Number(form.bathrooms) || 0,
      areaValue: form.areaValue === '' || form.areaValue === undefined ? null : Number(form.areaValue),
      areaUnit,
      hasPets: form.hasPets,
      petInstructions: form.petInstructions || null,
      accessMethod: form.accessMethod,
      accessInstructions: form.accessInstructions || null,
      parkingInstructions: form.parkingInstructions || null,
      notes: form.notes || null,
    };

    // Solo se envía si se escribió algo: mandar cadena vacía significaría
    // "bórralo", y guardar el resto de la ficha no puede borrar la clave.
    if (form.accessSecret) payload.accessSecret = form.accessSecret;

    await execute(() => api.patch(`/customer/addresses/${addressId}/cleaning-profile`, payload), {
      onSuccess: () => {
        setEditing(null);
        addressQuery.reload();
      },
    });
  }

  if (addressQuery.loading) return <Spinner label="Cargando tus direcciones" />;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        eyebrow="Limpieza"
        title="Mi hogar"
        description="Lo que sabemos de cada casa donde limpiamos. Se guarda con la dirección y rellena tu próxima reserva."
        action={
          <ButtonLink as={Link} to="/direcciones" variant="outline" size="sm">
            <Plus className="size-4" aria-hidden="true" />
            Añadir dirección
          </ButtonLink>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="Todavía no tienes direcciones"
          description="Los datos del hogar se guardan con la dirección, así que empieza por añadir una."
          action={
            <ButtonLink as={Link} to="/direcciones" variant="accent">
              Añadir mi dirección
            </ButtonLink>
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
                      <Home className="size-4.5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                      <p className="font-semibold text-text">{address.label}</p>
                      <p className="mt-0.5 text-sm text-text-muted">
                        {[address.street_line1, address.neighborhood].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                  </div>

                  {!isEditing && (
                    <Button size="sm" variant="outline" onClick={() => startEditing(address)}>
                      {profile ? 'Editar' : 'Completar'}
                    </Button>
                  )}
                </div>

                {!isEditing &&
                  (profile ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Badge tone="neutral">
                        {PROPERTY_TYPES.find((type) => type.value === profile.propertyType)?.label ??
                          profile.propertyType}
                      </Badge>
                      <Badge tone="neutral">
                        {profile.bedrooms} hab · {profile.bathrooms} baños
                      </Badge>
                      {profile.areaValue && (
                        <Badge tone="neutral">
                          {profile.areaValue} {profile.areaUnit ?? areaUnit}
                        </Badge>
                      )}
                      {profile.hasPets && (
                        <Badge tone="forest">
                          <PawPrint className="size-3.5" aria-hidden="true" />
                          Con mascotas
                        </Badge>
                      )}
                      {profile.hasAccessSecret && (
                        <Badge tone="warning">
                          <KeyRound className="size-3.5" aria-hidden="true" />
                          Acceso guardado y cifrado
                        </Badge>
                      )}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-text-subtle">
                      Sin datos todavía. Se completan solos con tu primera reserva de limpieza aquí.
                    </p>
                  ))}

                {isEditing && (
                  <form
                    onSubmit={(event) => handleSubmit(event, address.id)}
                    className="mt-5 space-y-5 border-t border-border pt-5"
                  >
                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field label="Tipo">
                        <Select
                          value={form.propertyType}
                          onChange={(event) => setForm({ ...form, propertyType: event.target.value })}
                        >
                          {PROPERTY_TYPES.map((type) => (
                            <option key={type.value} value={type.value}>
                              {type.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                      <Field label="Habitaciones">
                        <Input
                          type="number"
                          min="0"
                          max="20"
                          value={form.bedrooms}
                          onChange={(event) => setForm({ ...form, bedrooms: event.target.value })}
                        />
                      </Field>
                      <Field label="Baños">
                        <Input
                          type="number"
                          min="0"
                          max="20"
                          value={form.bathrooms}
                          onChange={(event) => setForm({ ...form, bathrooms: event.target.value })}
                        />
                      </Field>
                    </div>

                    <Field label={`Tamaño aproximado (${areaUnit})`} hint="Opcional.">
                      <Input
                        type="number"
                        min="1"
                        value={form.areaValue ?? ''}
                        onChange={(event) => setForm({ ...form, areaValue: event.target.value })}
                        placeholder="95"
                      />
                    </Field>

                    <Field label="¿Cómo entra el profesional?">
                      <Select
                        value={form.accessMethod}
                        onChange={(event) => setForm({ ...form, accessMethod: event.target.value })}
                      >
                        {ACCESS_METHODS.map((method) => (
                          <option key={method.value} value={method.value}>
                            {method.label}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    {ACCESS_METHODS.find((method) => method.value === form.accessMethod)
                      ?.needsSecret && (
                      <div className="space-y-3">
                        <Alert tone="info" title="Se guarda cifrado">
                          Solo lo ve el profesional que confirmó tu servicio, y queda registrado quién
                          lo consultó y cuándo.
                        </Alert>
                        <Field
                          label={form.accessMethod === 'DOOR_CODE' ? 'Código' : 'Dónde está la llave'}
                          hint={
                            profile?.hasAccessSecret
                              ? 'Ya tienes uno guardado: escribe aquí solo si cambió.'
                              : undefined
                          }
                        >
                          <Input
                            value={form.accessSecret ?? ''}
                            onChange={(event) => setForm({ ...form, accessSecret: event.target.value })}
                            placeholder={form.accessMethod === 'DOOR_CODE' ? '4821#' : 'Bajo la maceta…'}
                            autoComplete="off"
                          />
                        </Field>
                      </div>
                    )}

                    <Field label="Instrucciones para llegar y entrar">
                      <Textarea
                        value={form.accessInstructions}
                        onChange={(event) =>
                          setForm({ ...form, accessInstructions: event.target.value })
                        }
                        placeholder="Edificio Torre Azul, timbre 5B."
                      />
                    </Field>

                    <Field label="Estacionamiento" hint="Opcional.">
                      <Input
                        value={form.parkingInstructions}
                        onChange={(event) =>
                          setForm({ ...form, parkingInstructions: event.target.value })
                        }
                        placeholder="Visitas en el subsuelo 1"
                      />
                    </Field>

                    <Checkbox
                      label="Hay mascotas en casa"
                      description="Así el profesional llega preparado."
                      checked={form.hasPets}
                      onChange={(event) => setForm({ ...form, hasPets: event.target.checked })}
                    />

                    {form.hasPets && (
                      <Field label="Algo que debamos saber de ellas">
                        <Input
                          value={form.petInstructions}
                          onChange={(event) =>
                            setForm({ ...form, petInstructions: event.target.value })
                          }
                          placeholder="Rocky es amistoso pero no debe salir al pasillo."
                        />
                      </Field>
                    )}

                    <div className="flex gap-2">
                      <Button type="submit" loading={busy}>
                        Guardar
                      </Button>
                      <Button type="button" variant="ghost" onClick={() => setEditing(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </form>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

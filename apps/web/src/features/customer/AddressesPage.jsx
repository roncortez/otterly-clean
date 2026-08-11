import { useState } from 'react';
import { MapPin, Plus, Trash2, Star } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
} from '@/shared/ui';

/**
 * Direcciones del cliente.
 *
 * El formulario se construye a partir de la configuración regional: los campos
 * y sus etiquetas ("Provincia" en Ecuador, "State" en EE.UU.) llegan del
 * backend. Cambiar de país no requiere tocar este archivo.
 */
export default function AddressesPage() {
  const { region, addressLabel, addressFields, isAddressFieldRequired } = useConfig();

  const [showForm, setShowForm] = useState(false);

  const addressQuery = useApiQuery('/customer/addresses');
  const zonesQuery = useApiQuery('/catalog/zones');
  const { busy: saving, error: actionError, execute } = useApiAction();

  const addresses = addressQuery.data?.addresses ?? [];
  const zones = zonesQuery.data?.zones ?? [];
  const loading = addressQuery.loading || zonesQuery.loading;
  const error = addressQuery.error ?? zonesQuery.error ?? actionError;

  const [form, setForm] = useState(emptyForm());

  function emptyForm() {
    return {
      label: 'Casa',
      street_line1: '',
      street_line2: '',
      neighborhood: '',
      city: '',
      administrative_area: '',
      postal_code: '',
      reference: '',
      zoneId: '',
      isDefault: false,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();

    await execute(
      () =>
        api.post('/customer/addresses', {
          label: form.label,
          streetLine1: form.street_line1,
          streetLine2: form.street_line2 || null,
          neighborhood: form.neighborhood || null,
          city: form.city,
          administrativeArea: form.administrative_area || null,
          postalCode: form.postal_code || null,
          reference: form.reference || null,
          zoneId: form.zoneId ? Number(form.zoneId) : null,
          isDefault: form.isDefault,
        }),
      {
        onSuccess: () => {
          setForm(emptyForm());
          setShowForm(false);
          addressQuery.reload();
        },
      },
    );
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Quitar esta dirección? Los servicios anteriores la conservan.')) return;
    await execute(() => api.delete(`/customer/addresses/${id}`), {
      onSuccess: addressQuery.reload,
    });
  }

  async function handleSetDefault(id) {
    await execute(() => api.patch(`/customer/addresses/${id}`, { isDefault: true }), {
      onSuccess: addressQuery.reload,
    });
  }

  if (loading) return <Spinner />;

  const fields = addressFields();

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Tus direcciones"
        description="Dónde prestamos el servicio o recogemos tu ropa."
        action={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Agregar
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {showForm && (
        <Card className="mb-6 p-5 sm:p-6">
          <h2 className="mb-5 text-lg font-semibold text-text">Nueva dirección</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Field label="Nombre" hint="Para reconocerla rápido." required>
              <Input
                required
                value={form.label}
                onChange={(event) => setForm({ ...form, label: event.target.value })}
                placeholder="Casa, Oficina…"
              />
            </Field>

            {/* Los campos y sus etiquetas los define la región */}
            {fields
              .filter((field) => field !== 'reference')
              .map((field) => (
                <Field
                  key={field}
                  label={addressLabel(field)}
                  required={isAddressFieldRequired(field)}
                >
                  <Input
                    required={isAddressFieldRequired(field)}
                    value={form[field] ?? ''}
                    onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  />
                </Field>
              ))}

            <Field label={addressLabel('reference')} hint="Cómo reconocer el lugar al llegar.">
              <Input
                value={form.reference}
                onChange={(event) => setForm({ ...form, reference: event.target.value })}
                placeholder="Edificio Torre Azul, departamento 5B"
              />
            </Field>

            {zones.length > 0 && (
              <Field label="Zona" hint="Nos ayuda a asignar un profesional cercano.">
                <Select
                  value={form.zoneId}
                  onChange={(event) => setForm({ ...form, zoneId: event.target.value })}
                >
                  <option value="">Sin especificar</option>
                  {zones.map((zone) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Checkbox
              label="Usar como predeterminada"
              checked={form.isDefault}
              onChange={(event) => setForm({ ...form, isDefault: event.target.checked })}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saving}>
                Guardar dirección
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(emptyForm());
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {addresses.length === 0 && !showForm ? (
        <EmptyState
          icon={MapPin}
          title="Todavía no tienes direcciones"
          description="Agrega una para poder reservar tu primer servicio."
          action={<Button onClick={() => setShowForm(true)}>Agregar dirección</Button>}
        />
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <Card key={address.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3.5">
                  <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-forest-50 text-forest-600">
                    <MapPin className="size-4.5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium text-text">
                      {address.label}
                      {address.is_default && (
                        <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-700">
                          Predeterminada
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-sm text-text-muted">
                      {[address.street_line1, address.street_line2].filter(Boolean).join(' y ')}
                    </p>
                    <p className="text-sm text-text-subtle">
                      {[address.neighborhood, address.city, address.administrative_area]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                    {address.reference && (
                      <p className="mt-1 text-sm text-text-subtle italic">{address.reference}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 gap-1">
                  {!address.is_default && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(address.id)}
                      className="rounded-lg p-2 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-forest-600"
                      aria-label="Marcar como predeterminada"
                      title="Marcar como predeterminada"
                    >
                      <Star className="size-4" aria-hidden="true" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleDelete(address.id)}
                    className="rounded-lg p-2 text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    aria-label="Quitar dirección"
                    title="Quitar"
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {region && (
        <p className="mt-6 text-center text-xs text-text-subtle">
          Operamos en {region.name}. Los campos se ajustan al formato local.
        </p>
      )}
    </div>
  );
}

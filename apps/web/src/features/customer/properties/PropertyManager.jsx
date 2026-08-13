import React, { useState } from 'react';
import { Plus, Trash2, Key, MapPin, Building } from 'lucide-react';
import api from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '@/shared/ui';
import AddressForm from '../AddressForm';

/**
 * Lugares del cliente.
 *
 * Un lugar es la dirección y el perfil de la residencia que vive en ella. La
 * dirección (calle, punto en el mapa, cobertura) se guarda en el libro de
 * direcciones y el inmueble la referencia: nunca se copia el texto. Por eso al
 * registrar un lugar se elige una dirección guardada o se crea una nueva con el
 * mismo formulario de Direcciones. El código de acceso se cifra en el servidor
 * y solo se comparte el día del servicio.
 */
const PROPERTY_TYPES = [
  { value: 'HOUSE', label: 'Casa' },
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const EMPTY_FORM = {
  name: '',
  propertyType: 'APARTMENT',
  bedrooms: 1,
  bathrooms: 1,
  accessCode: '',
  notes: '',
};

const TYPE_LABELS = Object.fromEntries(PROPERTY_TYPES.map(({ value, label }) => [value, label]));

export default function PropertyManager() {
  const propertiesQuery = useApiQuery('/customer/properties');
  const addressesQuery = useApiQuery('/customer/addresses');

  const properties = propertiesQuery.data?.properties ?? [];
  const addresses = addressesQuery.data?.addresses ?? [];
  const loading = propertiesQuery.loading || addressesQuery.loading;

  // null = formulario cerrado; 'property' = campos del lugar; 'address' =
  // crear la direccion nueva primero (despues se vuelve al lugar).
  const [view, setView] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProperties = propertiesQuery.reload;
  const loadAddresses = addressesQuery.reload;

  function openModal() {
    setError('');
    setView('property');
    setForm(EMPTY_FORM);
    setSelectedAddressId('');
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post('/customer/properties', {
        name: form.name.trim(),
        propertyType: form.propertyType,
        bedrooms: Number(form.bedrooms) || 1,
        bathrooms: Number(form.bathrooms) || 1,
        accessCode: form.accessCode.trim() || null,
        notes: form.notes.trim() || null,
        addressId: selectedAddressId || null,
      });
      setView(null);
      setForm(EMPTY_FORM);
      loadProperties();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error guardando lugar.');
    } finally {
      setSaving(false);
    }
  }

  async function handleCreateAddress(addressPayload) {
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/customer/addresses', addressPayload);
      const created = res.data.address;
      loadAddresses();
      setSelectedAddressId(String(created.id));
      setView('property');
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error guardando la dirección.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Seguro de eliminar este lugar?')) return;
    try {
      setError('');
      await api.delete(`/customer/properties/${id}`);
      loadProperties();
    } catch {
      setError('No se pudo eliminar el lugar.');
    }
  }

  if (loading) return <Spinner label="Cargando lugares" />;

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        title="Mis lugares"
        description="Tus casas, departamentos u oficinas vinculados a tus direcciones, con los códigos de acceso cifrados."
        action={
          <Button variant="accent" onClick={openModal}>
            <Plus className="size-4" aria-hidden="true" />
            Añadir lugar
          </Button>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {properties.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No tienes lugares registrados"
          description="Agrega uno para agilizar tus reservas futuras: al reservar, los datos del lugar quedan precargados para confirmar."
          action={
            <Button variant="accent" onClick={openModal}>
              <Plus className="size-4" aria-hidden="true" />
              Añadir lugar
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {properties.map((prop) => (
            <Card key={prop.id} className="relative p-5 transition-shadow hover:shadow-[var(--shadow-raised)]">
              <button
                type="button"
                onClick={() => handleDelete(prop.id)}
                className="absolute top-3 right-3 rounded-full p-1.5 text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                aria-label={`Eliminar ${prop.name}`}
                title="Eliminar"
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </button>

              <h3 className="pr-8 text-sm font-bold tracking-tight text-text">{prop.name}</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                {TYPE_LABELS[prop.propertyType] ?? prop.propertyType} · {prop.bedrooms} hab. ·{' '}
                {prop.bathrooms} baño
              </p>

              <div className="mt-4 space-y-2 text-xs">
                {prop.address ? (
                  <div className="flex items-center gap-1.5 text-text-muted">
                    <MapPin className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                    <span>
                      {prop.address.label}: {prop.address.streetLine1}, {prop.address.city}
                    </span>
                  </div>
                ) : (
                  <p className="text-text-subtle">Sin dirección vinculada.</p>
                )}
                {prop.accessCode && (
                  <div className="flex w-fit items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 font-medium text-forest-700">
                    <Key className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Código de acceso: {prop.accessCode}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={view !== null}
        onClose={() => setView(null)}
        title={view === 'address' ? 'Nueva dirección' : 'Registrar nuevo lugar'}
        description={
          view === 'address'
            ? 'Guarda primero la dirección; luego vinculamos el lugar.'
            : 'El lugar queda vinculado a una dirección para que tus reservas queden precargadas.'
        }
        size="xl"
        footer={
          view === 'property' ? (
            <>
              <Button type="button" variant="ghost" onClick={() => setView(null)}>
                Cancelar
              </Button>
              <Button type="submit" form="property-form" variant="accent" loading={saving}>
                Guardar lugar
              </Button>
            </>
          ) : null
        }
      >
        {view === 'address' ? (
          <AddressForm
            submitting={saving}
            error={error}
            submitLabel="Guardar dirección"
            onSubmit={handleCreateAddress}
            onCancel={() => setView('property')}
          />
        ) : (
          <form id="property-form" onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div>
                <Alert tone="danger">{error}</Alert>
              </div>
            )}

            <Field label="Nombre identificativo" hint="Mi casa, Dpto Cumbayá, Oficina…" required>
              <Input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Tipo de lugar">
                <Select
                  value={form.propertyType}
                  onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                >
                  {PROPERTY_TYPES.map(({ value, label }) => (
                    <option key={value} value={value}>
                      {label}
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
                  onChange={(e) => setForm({ ...form, bedrooms: e.target.value })}
                />
              </Field>

              <Field label="Baños">
                <Input
                  type="number"
                  min="0"
                  max="20"
                  value={form.bathrooms}
                  onChange={(e) => setForm({ ...form, bathrooms: e.target.value })}
                />
              </Field>
            </div>

            <Field
              label="Dirección del lugar"
              hint="Las direcciones se gestionan en la pestaña Direcciones."
              required
            >
              <div className="flex gap-2">
                <Select
                  required
                  value={selectedAddressId}
                  onChange={(e) => setSelectedAddressId(e.target.value)}
                >
                  <option value="" disabled>
                    Elige una dirección…
                  </option>
                  {addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label} · {address.street_line1}, {address.city}
                    </option>
                  ))}
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => {
                    setError('');
                    setView('address');
                  }}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  Nueva
                </Button>
              </div>
            </Field>

            <Field label="Código de puerta o alarma" hint="Se guarda cifrado con AES-256.">
              <Input
                type="text"
                placeholder="Clave 1234# / llave en conserjería"
                value={form.accessCode}
                onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
              />
            </Field>
          </form>
        )}
      </Modal>
    </div>
  );
}

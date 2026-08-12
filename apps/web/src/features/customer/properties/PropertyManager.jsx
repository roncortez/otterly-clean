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

const EMPTY_FORM = {
  name: '',
  propertyType: 'Studio',
  bedrooms: 1,
  bathrooms: 1,
  streetAddress: '',
  dependentLocality: '',
  locality: 'Quito',
  administrativeArea: 'Pichincha',
  accessCode: '',
  notes: '',
};

const PROPERTY_TYPES = [
  { value: 'Studio', label: 'Estudio / suite' },
  { value: '1 Bedroom', label: '1 dormitorio' },
  { value: '2 Bedrooms', label: '2 dormitorios' },
  { value: '3 Bedrooms', label: '3 dormitorios' },
  { value: '4+ Bedrooms', label: '4+ dormitorios' },
  { value: 'Office', label: 'Oficina' },
];

export default function PropertyManager() {
  // La lectura pasa por useApiQuery: deriva `loading` comparando lo pedido con
  // lo resuelto, en lugar de escribirlo con un setState dentro del efecto.
  const propertiesQuery = useApiQuery('/customer/properties');
  const properties = propertiesQuery.data?.properties ?? [];
  const loading = propertiesQuery.loading;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProperties = propertiesQuery.reload;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      setError('');
      await api.post('/customer/properties', form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadProperties();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error guardando inmueble.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Seguro de eliminar este inmueble?')) return;
    try {
      setError('');
      await api.delete(`/customer/properties/${id}`);
      loadProperties();
    } catch {
      setError('No se pudo eliminar el inmueble.');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tu cuenta"
        title="Mis inmuebles"
        description="Tus casas, departamentos u oficinas, con los códigos de acceso cifrados."
        action={
          <Button variant="accent" onClick={() => setShowModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Añadir inmueble
          </Button>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner label="Cargando inmuebles" />
      ) : properties.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No tienes inmuebles registrados"
          description="Agrega uno para agilizar tus reservas futuras."
          action={
            <Button variant="accent" onClick={() => setShowModal(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Añadir inmueble
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
                {prop.property_type} ({prop.bedrooms} hab. / {prop.bathrooms} baño)
              </p>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex items-center gap-1.5 text-text-muted">
                  <MapPin className="size-3.5 shrink-0 text-text-subtle" aria-hidden="true" />
                  <span>
                    {prop.street_address}, {prop.locality}
                  </span>
                </div>
                {prop.access_code && (
                  <div className="flex w-fit items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 font-medium text-forest-700">
                    <Key className="size-3.5 shrink-0" aria-hidden="true" />
                    <span>Código de acceso: {prop.access_code}</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Registrar nuevo inmueble"
        description="Guardamos el código de puerta cifrado y solo se comparte el día del servicio."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="property-form" variant="accent" loading={saving}>
              Guardar inmueble
            </Button>
          </>
        }
      >
        <form id="property-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nombre identificativo" hint="Mi casa, Dpto Cumbayá, Oficina…" required>
            <Input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de inmueble">
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

            <Field label="Dirección" required>
              <Input
                type="text"
                required
                placeholder="Calle principal y secundaria"
                value={form.streetAddress}
                onChange={(e) => setForm({ ...form, streetAddress: e.target.value })}
              />
            </Field>
          </div>

          <Field label="Código de puerta o alarma" hint="Se guarda cifrado con AES-256.">
            <Input
              type="text"
              placeholder="Clave 1234# / llave en conserjería"
              value={form.accessCode}
              onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
            />
          </Field>
        </form>
      </Modal>
    </div>
  );
}

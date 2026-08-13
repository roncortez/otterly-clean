import React, { useState } from 'react';
import { Plus, Trash2, Edit2, MapPin, Building, ShieldCheck } from 'lucide-react';
import api from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Spinner,
} from '@/shared/ui';
import PropertyForm from '../PropertyForm';

const PROPERTY_TYPES = [
  { value: 'HOUSE', label: 'Casa' },
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const TYPE_LABELS = Object.fromEntries(PROPERTY_TYPES.map(({ value, label }) => [value, label]));

export default function PropertyManager() {
  const propertiesQuery = useApiQuery('/customer/properties');
  const addressesQuery = useApiQuery('/customer/addresses');

  const properties = propertiesQuery.data?.properties ?? [];
  const loading = propertiesQuery.loading || addressesQuery.loading;

  const [isOpen, setIsOpen] = useState(false);
  const [selectedProperty, setSelectedProperty] = useState(null);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadProperties = propertiesQuery.reload;
  const loadAddresses = addressesQuery.reload;

  function openCreateModal() {
    setError('');
    setSelectedProperty(null);
    setIsOpen(true);
  }

  function openEditModal(prop) {
    setError('');
    setSelectedProperty(prop);
    setIsOpen(true);
  }

  async function handleSave(propertyPayload, addressPayload) {
    setSaving(true);
    setError('');
    try {
      if (selectedProperty) {
        // Edit mode:
        // 1. PATCH property
        // 2. PATCH address
        await Promise.all([
          api.patch(`/customer/properties/${selectedProperty.id}`, propertyPayload),
          api.patch(`/customer/addresses/${selectedProperty.addressId}`, addressPayload),
        ]);
      } else {
        // Create mode:
        // POST property with embedded address
        await api.post('/customer/properties', {
          ...propertyPayload,
          address: addressPayload,
        });
      }
      setIsOpen(false);
      loadProperties();
      loadAddresses();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error guardando lugar.');
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
        description="Gestiona la configuración física, dirección, mascotas y accesos de tus inmuebles de forma segura."
        action={
          <Button variant="accent" onClick={openCreateModal}>
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
          description="Agrega uno para dejar configurada tu dirección y detalles de acceso de una sola vez."
          action={
            <Button variant="accent" onClick={openCreateModal}>
              <Plus className="size-4" aria-hidden="true" />
              Añadir lugar
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {properties.map((prop) => (
            <Card key={prop.id} className="relative p-5 transition-shadow hover:shadow-[var(--shadow-raised)]">
              <div className="absolute top-3 right-3 flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => openEditModal(prop)}
                  className="cursor-pointer rounded-full p-1.5 text-text-subtle transition-colors hover:bg-surface-sunken hover:text-text"
                  aria-label={`Editar ${prop.name}`}
                  title="Editar"
                >
                  <Edit2 className="size-4" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(prop.id)}
                  className="cursor-pointer rounded-full p-1.5 text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                  aria-label={`Eliminar ${prop.name}`}
                  title="Eliminar"
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </button>
              </div>

              <h3 className="pr-16 text-sm font-bold tracking-tight text-text">{prop.name}</h3>
              <p className="mt-0.5 text-xs text-text-muted">
                {TYPE_LABELS[prop.propertyType] ?? prop.propertyType} · {prop.bedrooms} hab. ·{' '}
                {prop.bathrooms} {prop.bathrooms === 1 ? 'baño' : 'baños'}
              </p>

              <div className="mt-4 space-y-2 text-xs">
                {prop.address ? (
                  <div className="flex items-start gap-1.5 text-text-muted">
                    <MapPin className="size-3.5 mt-0.5 shrink-0 text-text-subtle" aria-hidden="true" />
                    <span>
                      {prop.address.streetLine1}
                      {prop.address.streetLine2 ? `, ${prop.address.streetLine2}` : ''}
                      {`, ${prop.address.city}`}
                    </span>
                  </div>
                ) : (
                  <p className="text-text-subtle">Sin dirección vinculada.</p>
                )}

                {prop.hasAccessCode && (
                  <div className="flex w-fit items-center gap-1.5 rounded-full bg-forest-50 px-2.5 py-1 font-medium text-forest-700">
                    <ShieldCheck className="size-3.5 shrink-0 text-forest-600" aria-hidden="true" />
                    <span>✓ Código de acceso guardado</span>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={isOpen}
        onClose={() => setIsOpen(false)}
        title={selectedProperty ? 'Editar lugar' : 'Registrar nuevo lugar'}
        description="Toda la configuración del inmueble y el acceso se guardará permanentemente en tu cuenta."
        size="xl"
      >
        <PropertyForm
          property={selectedProperty}
          submitting={saving}
          error={error}
          onSubmit={handleSave}
          onCancel={() => setIsOpen(false)}
        />
      </Modal>
    </div>
  );
}

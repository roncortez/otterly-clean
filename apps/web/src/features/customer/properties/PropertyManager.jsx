import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Trash2, Edit2, MapPin, Building, ShieldCheck } from 'lucide-react';
import api from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import {
  Alert,
  Button,
  ButtonLink,
  Card,
  DefaultStar,
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
  const addresses = addressesQuery.data?.addresses ?? [];
  const loading = propertiesQuery.loading || addressesQuery.loading;

  /*
    Un lugar vive en una dirección, y solo cabe uno por dirección. Si todas las
    que tiene están ya ocupadas —o no tiene ninguna—, no hay dónde poner otro
    lugar, así que en vez de abrir un formulario que no se va a poder guardar se
    dice lo que falta.
  */
  const freeAddresses = addresses.filter((address) => !address.property);

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

  /**
   * Guardar el lugar.
   *
   * La dirección ya no se escribe aquí, se elige: llega su id y el lugar se
   * ata a ella. Antes esta función editaba de paso el texto de la dirección
   * (`PATCH /customer/addresses/...`), y eso hacía que corregir el número de
   * baños de un lugar reescribiese una dirección que se usa también para
   * lavandería. Cada cosa se edita donde vive.
   */
  async function handleSave(propertyPayload, addressId) {
    setSaving(true);
    setError('');
    try {
      const payload = { ...propertyPayload, addressId };
      if (selectedProperty) {
        await api.patch(`/customer/properties/${selectedProperty.id}`, payload);
      } else {
        await api.post('/customer/properties', payload);
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

  /** Alta de dirección desde el formulario de lugar. Misma API que Direcciones. */
  async function handleCreateAddress(payload) {
    const res = await api.post('/customer/addresses', payload);
    await loadAddresses();
    return res.data.address;
  }

  async function handleSetDefault(id) {
    setError('');
    try {
      await api.patch(`/customer/properties/${id}`, { isDefault: true });
      loadProperties();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'No se pudo cambiar el lugar predeterminado.');
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
          freeAddresses.length > 0 && (
            <Button variant="accent" onClick={openCreateModal}>
              <Plus className="size-4" aria-hidden="true" />
              Añadir lugar
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {freeAddresses.length === 0 && (
        <div className="mb-5">
          <Alert
            tone="info"
            title={
              addresses.length === 0
                ? 'Primero registra una dirección'
                : 'Todas tus direcciones ya tienen lugar'
            }
          >
            {addresses.length === 0
              ? 'Un lugar describe lo que limpiamos —habitaciones, acceso, mascotas— y vive en una dirección tuya. Registra la dirección y vuelve aquí para describir el lugar.'
              : 'Cada dirección admite un lugar y las tuyas ya lo tienen. Agrega otra dirección si quieres registrar un inmueble más.'}
            <span className="mt-3 block">
              <ButtonLink as={Link} to="/mi-perfil/direcciones" size="sm">
                <MapPin className="size-4" aria-hidden="true" />
                Ir a Direcciones
              </ButtonLink>
            </span>
          </Alert>
        </div>
      )}

      {properties.length === 0 ? (
        <EmptyState
          icon={Building}
          title="No tienes lugares registrados"
          description="Agrega uno para dejar configurada tu dirección y detalles de acceso de una sola vez."
          action={
            freeAddresses.length > 0 && (
              <Button variant="accent" onClick={openCreateModal}>
                <Plus className="size-4" aria-hidden="true" />
                Añadir lugar
              </Button>
            )
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
                <DefaultStar
                  isDefault={prop.isDefault}
                  onSelect={() => handleSetDefault(prop.id)}
                  label={prop.name}
                />
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

              <h3 className="flex flex-wrap items-center gap-2 pr-24 text-sm font-bold tracking-tight text-text">
                {prop.name}
                {prop.isDefault && (
                  <span className="rounded-full bg-forest-50 px-2 py-0.5 text-[11px] font-medium text-forest-700">
                    Predeterminado
                  </span>
                )}
              </h3>
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
          addresses={addresses}
          submitting={saving}
          error={error}
          onSubmit={handleSave}
          onCreateAddress={handleCreateAddress}
          onCancel={() => setIsOpen(false)}
        />
      </Modal>
    </div>
  );
}

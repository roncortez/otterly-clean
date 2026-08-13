import { useState } from 'react';
import { MapPin, Plus, Building } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { Alert, Field, Input, Modal, Select, cx } from '@/shared/ui';
import AddressForm from '../AddressForm';
import StepInstructions from './StepInstructions';

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'HOUSE', label: 'Casa' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const TYPE_LABELS = {
  HOUSE: 'Casa',
  APARTMENT: 'Departamento',
  SUITE: 'Suite',
  OFFICE: 'Oficina',
};

/**
 * Paso 2: dónde y cómo.
 *
 * En limpieza, dirección y espacio se tratan como una sola cosa: el lugar. Se
 * elige (o se agrega) la dirección y el formulario del espacio se pide siempre,
 * precargado con el inmueble guardado de esa dirección si lo hay; al confirmar
 * se crea o se reemplaza. El acceso se deja al final. La fecha y la franja
 * viven en el paso 3.
 */
export default function StepPlace(props) {
  const { booking } = props;
  const isCleaning = booking.serviceType === 'CLEANING';

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          {isCleaning ? '¿Tu lugar?' : '¿Dónde y cómo?'}
        </h2>
        <p className="mt-1 text-text-muted">
          {isCleaning
            ? 'La dirección, el espacio y cómo entra el profesional.'
            : 'La dirección donde pasamos a recoger tu ropa y cómo la coordinamos.'}
        </p>
      </div>

      <AddressSection {...props} />

      {isCleaning && <PropertySection {...props} />}

      <AccessSection {...props} />
    </div>
  );
}

function AddressSection({ booking, update, addresses, reloadAddresses }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // El relleno de identidad y acceso con el inmueble de la dirección lo hace el
  // asistente cuando cambia la dirección elegida (ver BookingWizard): aquí solo
  // se cambia la selección.
  function handleSelect(address) {
    update({ addressId: address.id });
  }

  async function handleCreate(payload) {
    setSaving(true);
    setError('');
    try {
      const res = await api.post('/customer/addresses', payload);
      const created = res.data.address;
      await reloadAddresses();
      update({ addressId: created.id });
      setAdding(false);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-text">Dirección</p>
      <div className="space-y-2.5">
        {addresses.map((address) => (
          <AddressCard
            key={address.id}
            address={address}
            selected={booking.addressId === address.id}
            onSelect={() => handleSelect(address)}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => setAdding(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
      >
        <Plus className="size-4" aria-hidden="true" />
        Agregar otra dirección
      </button>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Nueva dirección"
        description="Se guarda con su ubicación y queda disponible para tus próximas reservas."
      >
        <AddressForm
          submitting={saving}
          error={error}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
          submitLabel="Guardar dirección"
        />
      </Modal>
    </div>
  );
}

function AddressCard({ address, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cx(
        'flex w-full cursor-pointer items-start gap-3.5 rounded-xl border p-4 text-left transition-all',
        selected
          ? 'border-forest-500 bg-forest-50 ring-2 ring-forest-500/20'
          : 'border-border hover:border-border-strong hover:bg-surface-sunken',
      )}
    >
      <span
        className={cx(
          'mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg',
          selected ? 'bg-forest-600 text-white' : 'bg-surface-sunken text-text-muted',
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
          <span className="mt-1 block text-sm text-text-subtle italic">{address.reference}</span>
        )}
        {address.property && (
          <span className="mt-2 flex items-center gap-1.5 text-xs font-medium text-forest-700">
            <Building className="size-3.5 shrink-0" aria-hidden="true" />
            {address.property.name} · {TYPE_LABELS[address.property.propertyType] ?? address.property.propertyType} ·{' '}
            {address.property.bedrooms} hab. · {address.property.bathrooms} baño
          </span>
        )}
      </span>
    </button>
  );
}

function PropertySection({ savedProperty, propertyDraft, setPropertyDraft, updateDetail }) {
  const replacing = Boolean(savedProperty);

  // La identidad del espacio viaja doble: en el borrador (para crear o
  // reemplazar el inmueble) y en el detalle de la orden (snapshot del servicio).
  const setDraft = (patch) => {
    setPropertyDraft((current) => ({ ...current, ...patch }));
    updateDetail('cleaning', patch);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-4 rounded-xl border border-border bg-surface-sunken/40 p-4">
        <div className="space-y-2">
          <p className="text-sm font-semibold text-text">
            {replacing ? 'Reemplazar lugar' : 'Agregar lugar'}
          </p>
          {replacing ? (
            <Alert tone="info" title="Ya tienes un lugar en esta dirección">
              Los datos nuevos reemplazan a {savedProperty.name} al confirmar, y quedan para tus
              próximas reservas.
            </Alert>
          ) : (
            <p className="text-xs text-text-subtle">
              El lugar queda vinculado a esta dirección para tus próximas reservas.
            </p>
          )}
        </div>

        <Field label="Nombre" hint="Obligatorio.">
          <Input
            value={propertyDraft.name}
            onChange={(event) => setDraft({ name: event.target.value })}
            placeholder="Mi departamento"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Tipo de lugar" required>
            <Select
              value={propertyDraft.propertyType}
              onChange={(event) => setDraft({ propertyType: event.target.value })}
            >
              {PROPERTY_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Habitaciones" required>
            <Input
              type="number"
              min="0"
              max="20"
              value={propertyDraft.bedrooms}
              onChange={(event) => setDraft({ bedrooms: Number(event.target.value) || 0 })}
            />
          </Field>

          <Field label="Baños" required>
            <Input
              type="number"
              min="0"
              max="20"
              value={propertyDraft.bathrooms}
              onChange={(event) => setDraft({ bathrooms: Number(event.target.value) || 0 })}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

function AccessSection(props) {
  const { booking } = props;
  const isCleaning = booking.serviceType === 'CLEANING';

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium text-text">
          {isCleaning ? 'Acceso y detalles' : 'Instrucciones de recogida'}
        </p>
        <p className="mt-0.5 text-xs text-text-subtle">
          {isCleaning
            ? 'Esto se guarda con tu lugar para las próximas reservas.'
            : 'Cuanto más claro esté, menos posibilidad de que algo se trate mal.'}
        </p>
      </div>
      <StepInstructions {...props} embedded />
    </div>
  );
}

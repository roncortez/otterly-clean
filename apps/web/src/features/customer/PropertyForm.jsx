import { useMemo, useState } from 'react';
import { MapPin, Plus, ShieldCheck } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  Field,
  Input,
  OptionCard,
  Select,
  Textarea,
  Divider,
  cx,
} from '@/shared/ui';
import AddressForm from './AddressForm';

const PROPERTY_TYPES = [
  { value: 'HOUSE', label: 'Casa' },
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const ACCESS_METHODS = [
  { value: 'CONCIERGE', label: 'Portería o recepción', needsSecret: false },
  { value: 'DOOR_CODE', label: 'Código de puerta', needsSecret: true },
  { value: 'KEY', label: 'Llave', needsSecret: true },
  { value: 'LOCKBOX', label: 'Caja de seguridad', needsSecret: true },
  { value: 'OTHER', label: 'Otro', needsSecret: false },
];

/**
 * En qué dirección está este lugar.
 *
 * Se elige entre las que el cliente ya tiene guardadas. Cuando no tiene
 * ninguna disponible no se le enseña un formulario de dirección disfrazado: se
 * le dice lo que falta —una dirección— y se le da el camino para registrarla.
 */
function AddressPicker({ addresses, selectedId, onSelect, onCreate }) {
  if (addresses.length === 0) {
    return (
      <Alert tone="info" title="Primero necesitas una dirección">
        Un lugar es lo que limpiamos —habitaciones, acceso, mascotas— y vive en una dirección
        tuya. Registra la dirección y podrás describir el lugar sobre ella.
        {onCreate && (
          <span className="mt-3 block">
            <Button type="button" size="sm" onClick={onCreate}>
              <Plus className="size-4" aria-hidden="true" />
              Registrar dirección
            </Button>
          </span>
        )}
      </Alert>
    );
  }

  return (
    <div className="space-y-2.5">
      <p className="text-xs font-semibold tracking-wider text-text-subtle uppercase">Dirección</p>

      {addresses.map((address) => {
        const selected = address.id === selectedId;
        return (
          <button
            key={address.id}
            type="button"
            onClick={() => onSelect(address.id)}
            aria-pressed={selected}
            className={cx(
              'press flex w-full cursor-pointer items-start gap-3.5 rounded-xl border p-4 text-left',
              'transition-[background-color,border-color,box-shadow]',
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
              <span className="flex flex-wrap items-center gap-2">
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
                {[address.neighborhood, address.city, address.administrative_area]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
              {!address.latitude && (
                <span className="mt-1 block text-xs text-warning-700">
                  Sin punto en el mapa: edítala en Direcciones para marcarlo.
                </span>
              )}
            </span>
          </button>
        );
      })}

      {onCreate && (
        <button
          type="button"
          onClick={onCreate}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong py-3 text-sm font-medium text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
        >
          <Plus className="size-4" aria-hidden="true" />
          Registrar otra dirección
        </button>
      )}
    </div>
  );
}

/**
 * Un lugar del cliente: qué es el inmueble, cómo se entra y en qué dirección
 * está.
 *
 * LA DIRECCIÓN SE ELIGE, NO SE ESCRIBE. Este formulario tenía dentro su propia
 * copia del formulario de direcciones —calle, sector, ciudad, provincia—, sin
 * mapa y sin las reglas regionales. El resultado era que la misma casa se
 * tecleaba dos veces, en dos pantallas que no se parecían, y la del lugar salía
 * siempre peor: sin coordenada, el profesional no tiene con qué llegar. Ahora se
 * escoge una de las direcciones ya guardadas, y registrar una nueva abre el
 * formulario de direcciones de verdad (`AddressForm`, con su mapa), no una
 * imitación.
 *
 * @param {Array}    addresses        direcciones del cliente (`/customer/addresses`)
 * @param {Function} onSubmit         (propertyPayload, addressId)
 * @param {Function} onCreateAddress  (payload) => dirección creada; sin ella no
 *                                    se ofrece dar de alta una desde aquí
 */
export default function PropertyForm({
  property = null,
  addresses = [],
  submitting = false,
  error = null,
  onSubmit,
  onCreateAddress,
  onCancel,
}) {
  /**
   * Las direcciones donde cabe este lugar.
   *
   * Solo hay un lugar por dirección (índice único, migración 005), así que las
   * que ya tienen otro no se ofrecen: elegirlas fallaría al guardar. La del
   * lugar que se está editando sí, claro.
   */
  const available = useMemo(
    () => addresses.filter((entry) => !entry.property || entry.property.id === property?.id),
    [addresses, property?.id],
  );

  const [addressId, setAddressId] = useState(
    () =>
      property?.addressId ??
      (available.find((entry) => entry.is_default) ?? available[0])?.id ??
      null,
  );

  // Alta de dirección sin salir de aquí. Sustituye a este formulario en lugar
  // de anidarse: dos <form> uno dentro de otro no es HTML válido.
  const [creatingAddress, setCreatingAddress] = useState(false);
  const [addressError, setAddressError] = useState('');
  const [savingAddress, setSavingAddress] = useState(false);

  const [propForm, setPropForm] = useState(() => ({
    name: property?.name ?? '',
    propertyType: property?.propertyType ?? 'APARTMENT',
    bedrooms: property?.bedrooms ?? 1,
    bathrooms: property?.bathrooms ?? 1,

    customerPresent: property?.customerPresent ?? true,
    accessMethod: property?.accessMethod ?? 'CUSTOMER_OPENS',
    accessInstructions: property?.accessInstructions ?? '',
    parkingInstructions: property?.parkingInstructions ?? '',
    accessCode: '',

    hasPets: Boolean(property?.hasPets),
    pets:
      property?.pets?.length > 0
        ? property.pets
        : [{ type: '', count: 1 }],
    petInstructions: property?.petInstructions ?? '',

    notes: property?.notes ?? '',
  }));

  const updateProp = (key, value) => {
    setPropForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  async function handleCreateAddress(payload) {
    setSavingAddress(true);
    setAddressError('');
    try {
      const created = await onCreateAddress(payload);
      if (created?.id) setAddressId(created.id);
      setCreatingAddress(false);
    } catch (err) {
      setAddressError(
        err.response?.data?.error?.message || 'No se pudo guardar la dirección.',
      );
    } finally {
      setSavingAddress(false);
    }
  }

  function handlePresenceChange(customerPresent) {
    setPropForm((current) => ({
      ...current,
      customerPresent,
      accessMethod: customerPresent
        ? 'CUSTOMER_OPENS'
        : current.accessMethod === 'CUSTOMER_OPENS'
          ? ''
          : current.accessMethod,
      accessCode: customerPresent ? '' : current.accessCode,
    }));
  }

  function handleAccessMethodChange(value) {
    setPropForm((current) => ({
      ...current,
      accessMethod: value,
      accessCode: '',
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    // Sin dirección no hay lugar: el backend lo rechaza igual, y aquí se nota
    // antes y con el botón, no con un error rojo después de rellenarlo todo.
    if (!addressId) return;

    const accessCodeValue = propForm.accessCode.trim();

    const accessCodePayload = accessCodeValue
      ? accessCodeValue
      : property?.hasAccessCode
        ? undefined
        : null;

    const propertyPayload = {
      name: propForm.name.trim(),
      propertyType: propForm.propertyType,
      bedrooms: Number(propForm.bedrooms),
      bathrooms: Number(propForm.bathrooms),

      customerPresent: propForm.customerPresent,
      accessMethod: propForm.customerPresent
        ? 'CUSTOMER_OPENS'
        : propForm.accessMethod,

      accessInstructions:
        propForm.accessInstructions.trim() || null,

      parkingInstructions:
        propForm.parkingInstructions.trim() || null,

      hasPets: propForm.hasPets,

      pets: propForm.hasPets
        ? propForm.pets
        : [],

      petInstructions: propForm.hasPets
        ? propForm.petInstructions.trim() || null
        : null,

      notes: propForm.notes.trim() || null,

      ...(accessCodePayload !== undefined && {
        accessCode: accessCodePayload,
      }),
    };

    onSubmit(propertyPayload, addressId);
  }

  const selectedMethod = ACCESS_METHODS.find(
    (method) => method.value === propForm.accessMethod,
  );

  /*
    Dar de alta la dirección ocupa la pantalla entera en vez de convivir con el
    resto del formulario: es el mismo `AddressForm` de la pestaña Direcciones,
    con su buscador y su mapa, y necesita el sitio. Al guardar se vuelve aquí
    con la nueva ya elegida.
  */
  if (creatingAddress) {
    return (
      <div className="space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-text">Nueva dirección</h3>
          <p className="mt-0.5 text-xs text-text-muted">
            Se guardará en tus direcciones y quedará elegida para este lugar.
          </p>
        </div>

        <AddressForm
          submitting={savingAddress}
          error={addressError}
          onSubmit={handleCreateAddress}
          onCancel={available.length > 0 ? () => setCreatingAddress(false) : onCancel}
        />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* 1. TU LUGAR */}
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-bold text-forest-700">
            1
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text">
              Tu lugar
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Datos del inmueble y dirección.
            </p>
          </div>
        </div>

        <div className="space-y-4 pl-0 sm:pl-10">
          <Field
            label="Nombre del lugar"
            hint="Ej. Mi departamento, Casa de mamá..."
            required
          >
            <Input
              required
              value={propForm.name}
              onChange={(event) =>
                updateProp('name', event.target.value)
              }
              placeholder="Mi departamento"
            />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Tipo">
              <Select
                value={propForm.propertyType}
                onChange={(event) =>
                  updateProp(
                    'propertyType',
                    event.target.value,
                  )
                }
              >
                {PROPERTY_TYPES.map((type) => (
                  <option
                    key={type.value}
                    value={type.value}
                  >
                    {type.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Dormitorios">
              <Input
                type="number"
                min="0"
                max="20"
                value={propForm.bedrooms}
                onChange={(event) =>
                  updateProp(
                    'bedrooms',
                    event.target.value,
                  )
                }
              />
            </Field>

            <Field label="Baños">
              <Input
                type="number"
                min="0"
                max="20"
                value={propForm.bathrooms}
                onChange={(event) =>
                  updateProp(
                    'bathrooms',
                    event.target.value,
                  )
                }
              />
            </Field>
          </div>

          <AddressPicker
            addresses={available}
            selectedId={addressId}
            onSelect={setAddressId}
            onCreate={onCreateAddress ? () => setCreatingAddress(true) : null}
          />
        </div>
      </section>

      <Divider />

      {/* 2. ACCESO */}
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-bold text-forest-700">
            2
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text">
              Acceso
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Cómo llegará e ingresará el profesional.
            </p>
          </div>
        </div>

        <div className="space-y-4 pl-0 sm:pl-10">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <OptionCard
              selected={
                propForm.customerPresent === true
              }
              onSelect={() =>
                handlePresenceChange(true)
              }
              title="Sí, estaré presente"
              description="Recibiré al profesional."
            />

            <OptionCard
              selected={
                propForm.customerPresent === false
              }
              onSelect={() =>
                handlePresenceChange(false)
              }
              title="No estaré presente"
              description="Necesitará otra forma de acceso."
            />
          </div>

          {!propForm.customerPresent && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-sunken/40 p-4">
              <Field
                label="¿Cómo ingresará el profesional?"
                required
              >
                <Select
                  required
                  value={propForm.accessMethod}
                  onChange={(event) =>
                    handleAccessMethodChange(
                      event.target.value,
                    )
                  }
                >
                  <option value="" disabled>
                    Selecciona una opción...
                  </option>

                  {ACCESS_METHODS.map((method) => (
                    <option
                      key={method.value}
                      value={method.value}
                    >
                      {method.label}
                    </option>
                  ))}
                </Select>
              </Field>

              {selectedMethod?.needsSecret && (
                <div className="space-y-3">
                  <Alert tone="info">
                    <div className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 size-4 shrink-0" />

                      <p className="text-xs">
                        Esta información se almacena de
                        forma segura y se utiliza únicamente
                        para facilitar el acceso.
                      </p>
                    </div>
                  </Alert>

                  <Field
                    label={
                      propForm.accessMethod ===
                        'DOOR_CODE'
                        ? 'Código de acceso'
                        : propForm.accessMethod ===
                          'LOCKBOX'
                          ? 'Código o ubicación de la caja'
                          : 'Ubicación de la llave'
                    }
                    hint="Opcional. Puedes proporcionarlo después."
                  >
                    <Input
                      type="text"
                      autoComplete="off"
                      value={propForm.accessCode}
                      onChange={(event) =>
                        updateProp(
                          'accessCode',
                          event.target.value,
                        )
                      }
                      placeholder={
                        property?.hasAccessCode
                          ? 'Información guardada. Escribe una nueva para cambiarla.'
                          : ''
                      }
                    />
                  </Field>
                </div>
              )}

              <Field
                label="Instrucciones de acceso"
                hint="Opcional. Piso, portería, timbre, etc."
              >
                <Textarea
                  rows={2}
                  value={
                    propForm.accessInstructions
                  }
                  onChange={(event) =>
                    updateProp(
                      'accessInstructions',
                      event.target.value,
                    )
                  }
                  placeholder="Ej. Preguntar en recepción por el departamento 402."
                />
              </Field>
            </div>
          )}

          <Field
            label="Estacionamiento"
            hint="Opcional. Indica dónde puede parquear el profesional."
          >
            <Input
              value={propForm.parkingInstructions}
              onChange={(event) =>
                updateProp(
                  'parkingInstructions',
                  event.target.value,
                )
              }
              placeholder="Ej. Parqueadero de visitas #3 o en la calle."
            />
          </Field>
        </div>
      </section>

      <Divider />

      {/* 3. INFORMACIÓN PARA EL SERVICIO */}
      <section className="space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-forest-100 text-xs font-bold text-forest-700">
            3
          </div>

          <div>
            <h3 className="text-sm font-semibold text-text">
              Información para el servicio
            </h3>
            <p className="mt-0.5 text-xs text-text-muted">
              Información útil para realizar la limpieza.
            </p>
          </div>
        </div>

        <div className="space-y-4 pl-0 sm:pl-10">
          <Checkbox
            label="Hay mascotas en este lugar"
            description="Así el profesional puede llegar preparado."
            checked={propForm.hasPets}
            onChange={(event) =>
              updateProp(
                'hasPets',
                event.target.checked,
              )
            }
          />

          {propForm.hasPets && (
            <div className="space-y-3 rounded-xl border border-border bg-surface-sunken/40 p-4">

              <Field
                label="¿Algo que debamos saber sobre ellas?"
                hint="Opcional."
              >
                <Input
                  value={propForm.petInstructions}
                  onChange={(event) =>
                    updateProp(
                      'petInstructions',
                      event.target.value,
                    )
                  }
                  placeholder="Ej. El perro se asusta con la aspiradora."
                />
              </Field>
            </div>
          )}

          <Field
            label="¿Hay algo importante que debamos saber?"
            hint="Opcional. Objetos delicados, tipo de piso o alguna indicación especial."
          >
            <Textarea
              rows={3}
              value={propForm.notes}
              onChange={(event) =>
                updateProp(
                  'notes',
                  event.target.value,
                )
              }
              placeholder="Ej. No mover el jarrón de la sala y limpiar el piso de madera solo con paño húmedo."
            />
          </Field>
        </div>
      </section>

      <div className="flex justify-end gap-3 border-t border-border pt-5">
        {onCancel && (
          <Button
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            Cancelar
          </Button>
        )}

        <Button
          type="submit"
          variant="accent"
          loading={submitting}
          disabled={!addressId}
        >
          {property
            ? 'Guardar cambios'
            : 'Añadir lugar'}
        </Button>
      </div>
    </form>
  );
}
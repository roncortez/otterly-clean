import { useState } from 'react';
import { PawPrint, ShieldCheck } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';
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
} from '@/shared/ui';

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

export default function PropertyForm({
  property = null,
  submitting = false,
  error = null,
  onSubmit,
  onCancel,
}) {
  const { addressLabel, isAddressFieldRequired, region } = useConfig();

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

  const [addressForm, setAddressForm] = useState(() => ({
    streetLine1: property?.address?.streetLine1 ?? '',
    streetLine2: property?.address?.streetLine2 ?? '',
    unit: property?.address?.unit ?? '',
    neighborhood: property?.address?.neighborhood ?? '',
    city: property?.address?.city ?? '',
    administrativeArea: property?.address?.administrativeArea ?? '',
    postalCode: property?.address?.postalCode ?? '',
    reference: property?.address?.reference ?? '',
  }));

  const updateProp = (key, value) => {
    setPropForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const updateAddress = (key, value) => {
    setAddressForm((current) => ({
      ...current,
      [key]: value,
    }));
  };

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

    const addressPayload = {
      label: propForm.name.trim() || 'Mi lugar',

      streetLine1: addressForm.streetLine1.trim(),
      streetLine2: addressForm.streetLine2.trim() || null,
      unit: addressForm.unit.trim() || null,

      neighborhood:
        addressForm.neighborhood.trim() || null,

      city: addressForm.city.trim(),

      administrativeArea:
        addressForm.administrativeArea.trim() || null,

      postalCode:
        addressForm.postalCode.trim() || null,

      reference:
        addressForm.reference.trim() || null,

      isDefault:
        property?.address?.isDefault ??
        property?.address?.is_default ??
        false,
    };

    onSubmit(propertyPayload, addressPayload);
  }

  const selectedMethod = ACCESS_METHODS.find(
    (method) => method.value === propForm.accessMethod,
  );

  const showPostalCode =
    region?.address?.postalCodeRequired ||
    Boolean(addressForm.postalCode);

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

          <div className="rounded-xl border border-border bg-surface-sunken/40 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-subtle">
              Dirección
            </p>

            <div className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Calle principal"
                  required={isAddressFieldRequired(
                    'street_address',
                  )}
                >
                  <Input
                    required={isAddressFieldRequired(
                      'street_address',
                    )}
                    value={addressForm.streetLine1}
                    onChange={(event) =>
                      updateAddress(
                        'streetLine1',
                        event.target.value,
                      )
                    }
                    placeholder="Av. Amazonas"
                  />
                </Field>

                <Field label="Calle secundaria">
                  <Input
                    value={addressForm.streetLine2}
                    onChange={(event) =>
                      updateAddress(
                        'streetLine2',
                        event.target.value,
                      )
                    }
                    placeholder="Eloy Alfaro"
                  />
                </Field>
              </div>

              <Field
                label="Edificio, casa, torre o departamento"
                hint="Opcional."
              >
                <Input
                  value={addressForm.unit}
                  onChange={(event) =>
                    updateAddress(
                      'unit',
                      event.target.value,
                    )
                  }
                  placeholder="Torre B, Dpto 402"
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={addressLabel(
                    'dependent_locality',
                  )}
                >
                  <Input
                    value={addressForm.neighborhood}
                    onChange={(event) =>
                      updateAddress(
                        'neighborhood',
                        event.target.value,
                      )
                    }
                    placeholder="Barrio / Sector"
                  />
                </Field>

                <Field
                  label={addressLabel('locality')}
                  required={isAddressFieldRequired(
                    'locality',
                  )}
                >
                  <Input
                    required={isAddressFieldRequired(
                      'locality',
                    )}
                    value={addressForm.city}
                    onChange={(event) =>
                      updateAddress(
                        'city',
                        event.target.value,
                      )
                    }
                  />
                </Field>

                <Field
                  label={addressLabel(
                    'administrative_area',
                  )}
                  required={isAddressFieldRequired(
                    'administrative_area',
                  )}
                >
                  <Input
                    required={isAddressFieldRequired(
                      'administrative_area',
                    )}
                    value={
                      addressForm.administrativeArea
                    }
                    onChange={(event) =>
                      updateAddress(
                        'administrativeArea',
                        event.target.value,
                      )
                    }
                  />
                </Field>

                {showPostalCode && (
                  <Field
                    label="Código postal"
                    required={isAddressFieldRequired(
                      'postal_code',
                    )}
                  >
                    <Input
                      required={isAddressFieldRequired(
                        'postal_code',
                      )}
                      value={addressForm.postalCode}
                      onChange={(event) =>
                        updateAddress(
                          'postalCode',
                          event.target.value,
                        )
                      }
                    />
                  </Field>
                )}
              </div>

              <Field
                label="Referencia"
                hint="Opcional. Ayuda a encontrar el lugar."
              >
                <Input
                  value={addressForm.reference}
                  onChange={(event) =>
                    updateAddress(
                      'reference',
                      event.target.value,
                    )
                  }
                  placeholder="Portón negro junto a la farmacia"
                />
              </Field>
            </div>
          </div>
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
        >
          {property
            ? 'Guardar cambios'
            : 'Añadir lugar'}
        </Button>
      </div>
    </form>
  );
}
import { useState, useEffect } from 'react';
import { MapPin, Plus, Building, Edit2, ShieldCheck, PawPrint } from 'lucide-react';
import api, { errorMessage } from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { Alert, Field, Input, Modal, Select, Button, Card, cx, Spinner, Checkbox, OptionCard, Textarea, Divider } from '@/shared/ui';
import AddressForm from '../AddressForm';
import StepInstructions from './StepInstructions';
import PropertyForm from '../PropertyForm';

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

const ACCESS_METHODS = [
  { value: 'CUSTOMER_OPENS', label: 'Yo abro la puerta', needsSecret: false },
  { value: 'CONCIERGE', label: 'Portería o recepción', needsSecret: false },
  { value: 'DOOR_CODE', label: 'Código de puerta', needsSecret: true },
  { value: 'KEY', label: 'Llave escondida', needsSecret: true },
  { value: 'LOCKBOX', label: 'Caja de seguridad', needsSecret: true },
  { value: 'OTHER', label: 'Otro', needsSecret: false },
];
const ACCESS_LABELS = Object.fromEntries(ACCESS_METHODS.map(({ value, label }) => [value, label]));

function formatAddress(address) {
  if (!address) return 'Sin direccion vinculada';
  return [address.streetLine1, address.streetLine2, address.neighborhood, address.city]
    .filter(Boolean)
    .join(' - ');
}

function petsLabel(prop) {
  if (prop.hasPets === null || prop.hasPets === undefined) return 'Mascotas sin confirmar';
  if (!prop.hasPets) return 'Sin mascotas';
  const firstPet = prop.pets?.[0];
  if (!firstPet?.type) return 'Con mascotas';
  return `${firstPet.count ?? 1} ${firstPet.type}`;
}

export default function StepPlace(props) {
  const { booking } = props;
  const isCleaning = booking.serviceType === 'CLEANING';
  const isKits = booking.serviceType === 'KITS';

  if (isCleaning) {
    return <CleaningPlaceSection {...props} />;
  }

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          {isKits ? '¿Dónde entregamos?' : '¿Dónde y cómo?'}
        </h2>
        <p className="mt-1 text-text-muted">
          {isKits
            ? 'La dirección donde recibirás tu kit.'
            : 'La dirección donde pasamos a recoger tu ropa y cómo la coordinamos.'}
        </p>
      </div>

      <AddressSection {...props} />

      {!isKits && <AccessSection {...props} />}
    </div>
  );
}
function ReplacePropertyModal({
  open,
  onClose,
  properties,
  selectedPropertyId,
  onSelect,
  onCreate,
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Reemplazar lugar"
      description="Selecciona otro de tus lugares para esta reserva."
      size="lg"
    >
      <div className="space-y-3">
        {properties.map((prop) => {
          const selected =
            prop.id === selectedPropertyId;

          return (
            <button
              key={prop.id}
              type="button"
              onClick={() => onSelect(prop)}
              className={cx(
                'w-full rounded-xl border p-4 text-left transition-all',
                selected
                  ? 'border-forest-500 bg-forest-50 ring-2 ring-forest-500/20'
                  : 'border-border hover:border-border-strong hover:bg-surface-sunken',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cx(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    selected
                      ? 'bg-forest-600 text-white'
                      : 'bg-surface-sunken text-text-muted',
                  )}
                >
                  <Building className="size-4" />
                </span>

                <div className="min-w-0">
                  <p className="font-semibold text-text">
                    {prop.name}
                  </p>

                  <p className="mt-0.5 text-sm text-text-muted">
                    {TYPE_LABELS[
                      prop.propertyType
                    ] ?? prop.propertyType}
                    {' · '}
                    {prop.bedrooms} hab.
                    {' · '}
                    {prop.bathrooms}{' '}
                    {prop.bathrooms === 1
                      ? 'baño'
                      : 'baños'}
                  </p>

                  <p className="mt-1 text-xs text-text-subtle">
                    {formatAddress(prop.address)}
                  </p>

                  {selected && (
                    <p className="mt-2 text-xs font-semibold text-forest-700">
                      Lugar actual
                    </p>
                  )}
                </div>
              </div>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onCreate}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-4 text-sm font-semibold text-text-muted transition-colors hover:bg-surface-sunken hover:text-text"
        >
          <Plus className="size-4" />
          Registrar otro lugar
        </button>
      </div>
    </Modal>
  );
}

function CleaningPlaceSection({
  booking,
  update,
  updateDetail,
  registerOnNext,
  addresses,
  reloadAddresses,
}) {
  const { isAuthenticated } = useAuth();
  // Un visitante todavía no tiene lugares guardados y pedirlos devolvería 401.
  // Describe su casa aquí y se guarda al confirmar, cuando ya hay cuenta.
  const { data, loading, reload } = useApiQuery(isAuthenticated ? '/customer/properties' : null);
  const properties = data?.properties ?? [];

  const [propertyModalOpen, setPropertyModalOpen] = useState(false);
  const [replaceModalOpen, setReplaceModalOpen] = useState(false);
  const [editingProperty, setEditingProperty] = useState(null);

  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savePermanently, setSavePermanently] = useState(true);

  /**
   * El lugar predeterminado del cliente.
   *
   * Es suyo y no se deriva del de la dirección: alguien puede recibir la ropa en
   * la oficina —dirección predeterminada— y querer que la limpieza empiece
   * siempre en su casa. El backend garantiza que hay exactamente uno mientras
   * exista algún lugar (migración 012 y propertyService), así que aquí basta con
   * leerlo.
   */
  const defaultProperty = properties.find((prop) => prop.isDefault === true) ?? null;

  const selectedProp =
    properties.find((prop) => prop.id === booking.propertyId) ?? null;

  const isAccessMissing =
    selectedProp &&
    (selectedProp.accessMethod === null ||
      selectedProp.accessMethod === undefined);

  const isPetsMissing =
    selectedProp &&
    (selectedProp.hasPets === null ||
      selectedProp.hasPets === undefined);

  const isIncomplete =
    selectedProp && (isAccessMissing || isPetsMissing);

  function handleSelectProperty(prop) {
    update({
      propertyId: prop.id,
      addressId: prop.addressId,
      cleaning: {
        ...booking.cleaning,

        propertyType: prop.propertyType,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,

        accessMethod: prop.accessMethod ?? '',
        accessInstructions: prop.accessInstructions || '',
        parkingInstructions: prop.parkingInstructions || '',
        customerPresent: prop.customerPresent ?? true,

        hasPets: prop.hasPets ?? false,
        pets: prop.pets ?? [],
        petsSecured: prop.petsSecured ?? null,
        petInstructions: prop.petInstructions || '',

        delicateItems: prop.delicateItems || '',
      },
    });
  }

  /*
   * Preseleccionar automáticamente el lugar predeterminado.
   *
   * Solo ocurre si todavía no existe un propertyId en esta reserva.
   * De esta forma, si el usuario pulsa "Reemplazar lugar",
   * su elección no será sobrescrita por el predeterminado.
   */
  useEffect(() => {
    if (
      !loading &&
      !booking.propertyId &&
      defaultProperty
    ) {
      handleSelectProperty(defaultProperty);
    }
  }, [loading, booking.propertyId, defaultProperty]);

  /*
   * Si no existe predeterminado pero solo hay un lugar,
   * podemos seleccionarlo automáticamente.
   *
   * Si existen varios y ninguno es predeterminado,
   * no asumimos cuál usar.
   */
  useEffect(() => {
    if (
      !loading &&
      !booking.propertyId &&
      !defaultProperty &&
      properties.length === 1
    ) {
      handleSelectProperty(properties[0]);
    }
  }, [
    loading,
    booking.propertyId,
    defaultProperty,
    properties,
  ]);

  /*
   * Completar permanentemente datos antiguos si el usuario
   * decide guardarlos.
   */
  useEffect(() => {
    if (!registerOnNext) return;

    registerOnNext(async () => {
      if (selectedProp && isIncomplete && savePermanently) {
        try {
          const patchPayload = {
            ...(isAccessMissing && {
              accessMethod: booking.cleaning.accessMethod,
              customerPresent: booking.cleaning.customerPresent,
              accessInstructions:
                booking.cleaning.accessInstructions || null,
              parkingInstructions:
                booking.cleaning.parkingInstructions || null,

              // Solo enviar si realmente existe.
              ...(booking.cleaning.accessSecret
                ? {
                  accessCode:
                    booking.cleaning.accessSecret,
                }
                : {}),
            }),

            ...(isPetsMissing && {
              hasPets: booking.cleaning.hasPets,

              pets: booking.cleaning.hasPets
                ? booking.cleaning.pets
                : [],

              petsSecured: booking.cleaning.hasPets
                ? booking.cleaning.petsSecured
                : null,

              petInstructions: booking.cleaning.hasPets
                ? booking.cleaning.petInstructions || null
                : null,
            }),
          };

          await api.patch(
            `/customer/properties/${selectedProp.id}`,
            patchPayload,
          );

          await reload();
        } catch (err) {
          console.error(
            'Error guardando datos del lugar:',
            err,
          );
        }
      }

      return true;
    });

    return () => {
      registerOnNext(null);
    };
  }, [
    selectedProp,
    isIncomplete,
    savePermanently,
    booking.cleaning,
    registerOnNext,
    isAccessMissing,
    isPetsMissing,
    reload,
  ]);

  function handleOpenCreate() {
    setError('');
    setEditingProperty(null);
    setPropertyModalOpen(true);
  }

  function handleOpenEdit(prop) {
    setError('');
    setEditingProperty(prop);
    setPropertyModalOpen(true);
  }

  function handleOpenReplace() {
    setReplaceModalOpen(true);
  }

  function handleReplace(prop) {
    handleSelectProperty(prop);
    setReplaceModalOpen(false);
  }

  /** Alta de dirección desde el formulario de lugar. Misma API que Direcciones. */
  async function handleCreateAddress(payload) {
    const res = await api.post('/customer/addresses', payload);
    await reloadAddresses();
    return res.data.address;
  }

  /**
   * Guardar el lugar.
   *
   * La dirección llega elegida (su id), no escrita: el formulario ya no tiene
   * su propia copia de los campos de calle y ciudad. Ver `PropertyForm`.
   */
  async function handleFormSubmit(propertyPayload, addressId) {
    setSubmitting(true);
    setError('');

    try {
      let propId;
      const payload = { ...propertyPayload, addressId };

      if (editingProperty) {
        propId = editingProperty.id;
        await api.patch(`/customer/properties/${editingProperty.id}`, payload);
      } else {
        const res = await api.post('/customer/properties', payload);
        propId = res.data.property.id;
      }

      setPropertyModalOpen(false);

      await reload();
      await reloadAddresses();

      /*
       * Si acaba de crear un lugar desde el proceso de reserva,
       * utilizar ese lugar en esta reserva.
       *
       * Esto NO significa convertirlo automáticamente
       * en el predeterminado permanente.
       */
      if (propId) {
        const freshData = await api.get(
          '/customer/properties',
        );

        const freshProp =
          freshData.data.properties.find(
            (prop) => prop.id === propId,
          );

        if (freshProp) {
          handleSelectProperty(freshProp);
        }
      }
    } catch (err) {
      setError(
        err.response?.data?.error?.message ||
        'Error guardando el lugar.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Spinner label="Cargando tu lugar..." />
    );
  }

  /*
   * Usuario nuevo: no tiene ningún lugar.
   */
  if (properties.length === 0) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text">
              ¿En qué lugar realizamos la limpieza?
            </h2>

            <p className="mt-1 text-sm text-text-muted">
              Registra tu lugar para continuar con la
              reserva.
            </p>
          </div>

          <Card className="flex flex-col items-center justify-center border-2 border-dashed p-8 text-center">
            <Building className="mb-3 size-10 text-text-muted" />

            <p className="font-semibold text-text">
              No tienes lugares registrados
            </p>

            <p className="mt-1 mb-5 max-w-sm text-sm text-text-muted">
              Guarda la dirección y la información del
              inmueble para reutilizarla en tus próximas
              reservas.
            </p>

            <Button
              variant="accent"
              onClick={handleOpenCreate}
            >
              <Plus className="size-4" />
              Registrar primer lugar
            </Button>
          </Card>
        </div>

        <Modal
          open={propertyModalOpen}
          onClose={() =>
            setPropertyModalOpen(false)
          }
          title="Registrar nuevo lugar"
          description="Dirección, acceso y datos importantes del lugar."
          size="xl"
        >
          <PropertyForm
            property={null}
            addresses={addresses}
            onCreateAddress={handleCreateAddress}
            submitting={submitting}
            error={error}
            onSubmit={handleFormSubmit}
            onCancel={() =>
              setPropertyModalOpen(false)
            }
          />
        </Modal>
      </>
    );
  }

  /*
   * Tiene varias propiedades pero ninguna predeterminada.
   *
   * En vez de escoger una arbitrariamente, le pedimos
   * seleccionar una.
   */
  if (!selectedProp) {
    return (
      <>
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-text">
              ¿En qué lugar realizamos la limpieza?
            </h2>

            <p className="mt-1 text-sm text-text-muted">
              No tienes un lugar predeterminado.
              Selecciona el que utilizarás para esta
              reserva.
            </p>
          </div>

          <Button
            variant="accent"
            onClick={handleOpenReplace}
          >
            <Building className="size-4" />
            Seleccionar lugar
          </Button>
        </div>

        <ReplacePropertyModal
          open={replaceModalOpen}
          onClose={() =>
            setReplaceModalOpen(false)
          }
          properties={properties}
          selectedPropertyId={booking.propertyId}
          onSelect={handleReplace}
          onCreate={() => {
            setReplaceModalOpen(false);
            handleOpenCreate();
          }}
        />

        <Modal
          open={propertyModalOpen}
          onClose={() =>
            setPropertyModalOpen(false)
          }
          title="Registrar nuevo lugar"
          description="Dirección, acceso y datos importantes del lugar."
          size="xl"
        >
          <PropertyForm
            property={null}
            addresses={addresses}
            onCreateAddress={handleCreateAddress}
            submitting={submitting}
            error={error}
            onSubmit={handleFormSubmit}
            onCancel={() =>
              setPropertyModalOpen(false)
            }
          />
        </Modal>
      </>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          ¿En qué lugar realizamos la limpieza?
        </h2>

        <p className="mt-1 text-sm text-text-muted">
          Utilizaremos este lugar para tu reserva.
        </p>
      </div>

      {/*
        Ya NO mostramos properties.map(...).

        Mostramos directamente toda la información
        del lugar seleccionado/predeterminado.
      */}
      <SelectedPropertyPanel
        prop={selectedProp}
        onEdit={() =>
          handleOpenEdit(selectedProp)
        }
      />

      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        onClick={handleOpenReplace}
      >
        <Building className="size-4" />
        Reemplazar lugar
      </Button>

      {/* Datos incompletos */}
      {isIncomplete && (
        <Card className="space-y-4 border-warning/30 bg-warning-soft/20 p-5">
          <div className="flex items-start gap-2.5">
            <Building className="mt-0.5 size-5 shrink-0 text-warning-700" />

            <div>
              <h3 className="text-sm font-bold text-warning-800">
                Completa algunos datos para continuar
              </h3>

              <p className="mt-0.5 text-xs leading-relaxed text-warning-700">
                Necesitamos algunos datos adicionales
                para realizar el servicio de forma
                segura.
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-2">
            {isAccessMissing && (
              <div className="space-y-4 rounded-xl border border-warning/10 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text">
                  Acceso
                </p>

                <div>
                  <p className="mb-2 text-xs font-medium text-text">
                    ¿Estarás en casa?
                  </p>

                  <div className="grid gap-2.5 sm:grid-cols-2">
                    <OptionCard
                      selected={
                        booking.cleaning
                          .customerPresent === true
                      }
                      onSelect={() =>
                        updateDetail('cleaning', {
                          customerPresent: true,
                          accessMethod:
                            'CUSTOMER_OPENS',
                        })
                      }
                      title="Sí, estaré"
                      description="Recibes al profesional personalmente."
                    />

                    <OptionCard
                      selected={
                        booking.cleaning
                          .customerPresent === false
                      }
                      onSelect={() =>
                        updateDetail('cleaning', {
                          customerPresent: false,
                        })
                      }
                      title="No estaré"
                      description="Indica cómo podrá ingresar."
                    />
                  </div>
                </div>

                {booking.cleaning
                  .customerPresent === false && (
                    <Field label="¿Cómo ingresará el profesional?">
                      <Select
                        value={
                          booking.cleaning
                            .accessMethod || ''
                        }
                        onChange={(event) =>
                          updateDetail('cleaning', {
                            accessMethod:
                              event.target.value,
                          })
                        }
                      >
                        <option value="" disabled>
                          Elige un método...
                        </option>

                        {ACCESS_METHODS.filter(
                          (method) =>
                            method.value !==
                            'CUSTOMER_OPENS',
                        ).map((option) => (
                          <option
                            key={option.value}
                            value={option.value}
                          >
                            {option.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}

                {ACCESS_METHODS.find(
                  (method) =>
                    method.value ===
                    booking.cleaning.accessMethod,
                )?.needsSecret && (
                    <Field
                      label={
                        booking.cleaning
                          .accessMethod ===
                          'DOOR_CODE'
                          ? 'Código de entrada'
                          : 'Ubicación de llave'
                      }
                      hint="Opcional. También puedes proporcionarlo más adelante."
                    >
                      <Input
                        value={
                          booking.cleaning
                            .accessSecret || ''
                        }
                        onChange={(event) =>
                          updateDetail('cleaning', {
                            accessSecret:
                              event.target.value,
                          })
                        }
                      />
                    </Field>
                  )}

                <Field
                  label="Instrucciones de acceso"
                  hint="Piso, recepción, timbre u otra información útil."
                >
                  <Textarea
                    value={
                      booking.cleaning
                        .accessInstructions || ''
                    }
                    onChange={(event) =>
                      updateDetail('cleaning', {
                        accessInstructions:
                          event.target.value,
                      })
                    }
                  />
                </Field>
              </div>
            )}

            {isPetsMissing && (
              <div className="space-y-4 rounded-xl border border-warning/10 bg-white/70 p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-text">
                  Mascotas
                </p>

                <Checkbox
                  label="Hay mascotas en este lugar"
                  description="Así el profesional llega preparado."
                  checked={
                    booking.cleaning.hasPets
                  }
                  onChange={(event) =>
                    updateDetail('cleaning', {
                      hasPets:
                        event.target.checked,
                    })
                  }
                />

                {booking.cleaning.hasPets && (
                  <div className="space-y-4 rounded-xl border bg-surface-sunken p-4">
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Tipo">
                        <Input
                          value={
                            booking.cleaning
                              .pets?.[0]?.type ??
                            ''
                          }
                          onChange={(event) =>
                            updateDetail(
                              'cleaning',
                              {
                                pets: [
                                  {
                                    ...(
                                      booking
                                        .cleaning
                                        .pets?.[0] ??
                                      {
                                        count: 1,
                                      }
                                    ),
                                    type:
                                      event.target
                                        .value,
                                  },
                                ],
                              },
                            )
                          }
                          placeholder="Perro, gato…"
                        />
                      </Field>

                      <Field label="Cuántas">
                        <Input
                          type="number"
                          min="1"
                          max="20"
                          value={
                            booking.cleaning
                              .pets?.[0]
                              ?.count ?? 1
                          }
                          onChange={(event) =>
                            updateDetail(
                              'cleaning',
                              {
                                pets: [
                                  {
                                    ...(
                                      booking
                                        .cleaning
                                        .pets?.[0] ??
                                      {
                                        type: '',
                                      }
                                    ),
                                    count:
                                      Number(
                                        event.target
                                          .value,
                                      ) || 1,
                                  },
                                ],
                              },
                            )
                          }
                        />
                      </Field>
                    </div>

                    <Field label="Algo que debamos saber">
                      <Input
                        value={
                          booking.cleaning
                            .petInstructions ||
                          ''
                        }
                        onChange={(event) =>
                          updateDetail(
                            'cleaning',
                            {
                              petInstructions:
                                event.target
                                  .value,
                            },
                          )
                        }
                      />
                    </Field>
                  </div>
                )}
              </div>
            )}
          </div>

          <Divider />

          <Checkbox
            label="Guardar estos datos en mi lugar"
            description="Los reutilizaremos en futuras reservas."
            checked={savePermanently}
            onChange={(event) =>
              setSavePermanently(
                event.target.checked,
              )
            }
          />
        </Card>
      )}

      {/* Seleccionar otro lugar para ESTA reserva */}
      <ReplacePropertyModal
        open={replaceModalOpen}
        onClose={() =>
          setReplaceModalOpen(false)
        }
        properties={properties}
        selectedPropertyId={selectedProp.id}
        onSelect={handleReplace}
        onCreate={() => {
          setReplaceModalOpen(false);
          handleOpenCreate();
        }}
      />

      {/* Formulario único crear / editar */}
      <Modal
        open={propertyModalOpen}
        onClose={() =>
          setPropertyModalOpen(false)
        }
        title={
          editingProperty
            ? 'Editar lugar'
            : 'Registrar nuevo lugar'
        }
        description="Dirección, acceso y datos importantes del lugar."
        size="xl"
      >
        <PropertyForm
          property={editingProperty}
          addresses={addresses}
          onCreateAddress={handleCreateAddress}
          submitting={submitting}
          error={error}
          onSubmit={handleFormSubmit}
          onCancel={() =>
            setPropertyModalOpen(false)
          }
        />
      </Modal>
    </div>
  );
}

function SelectedPropertyPanel({ prop, onEdit }) {
  const method = prop.accessMethod
    ? (ACCESS_LABELS[prop.accessMethod] ?? prop.accessMethod)
    : 'Metodo de acceso sin confirmar';
  const hasAddressReference = Boolean(prop.address?.reference);
  const hasOperationalNotes = Boolean(prop.parkingInstructions || prop.delicateItems || prop.notes);

  return (
    <Card className="border-forest-100 bg-forest-50/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-[0.14em] text-forest-700 uppercase">
            Lugar elegido
          </p>
          <h3 className="mt-1 flex items-center gap-2 text-base font-bold tracking-tight text-text">
            <Building className="size-4.5 shrink-0 text-forest-700" aria-hidden="true" />
            {prop.name}
          </h3>
          <p className="mt-0.5 text-sm text-text-muted">
            {TYPE_LABELS[prop.propertyType] ?? prop.propertyType} · {prop.bedrooms} hab. ·{' '}
            {prop.bathrooms} {prop.bathrooms === 1 ? 'baño' : 'baños'}
          </p>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={onEdit}>
          <Edit2 className="size-4" aria-hidden="true" />
          Editar lugar
        </Button>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <DetailLine icon={MapPin} label="Direccion" value={formatAddress(prop.address)} />
        <DetailLine icon={ShieldCheck} label="Acceso" value={method} />
        <DetailLine icon={PawPrint} label="Mascotas" value={petsLabel(prop)} />
        <DetailLine
          icon={ShieldCheck}
          label="Codigo"
          value={prop.hasAccessCode ? 'Codigo de acceso guardado' : 'Sin codigo guardado'}
        />
      </dl>

      {(hasAddressReference || hasOperationalNotes) && (
        <div className="mt-4 space-y-2 rounded-xl border border-forest-100 bg-surface-raised/80 p-3 text-xs text-text-muted">
          {hasAddressReference && <p><span className="font-medium text-text">Referencia:</span> {prop.address.reference}</p>}
          {prop.parkingInstructions && <p><span className="font-medium text-text">Estacionamiento:</span> {prop.parkingInstructions}</p>}
          {prop.delicateItems && <p><span className="font-medium text-text">Cuidado especial:</span> {prop.delicateItems}</p>}
          {prop.notes && <p><span className="font-medium text-text">Notas:</span> {prop.notes}</p>}
        </div>
      )}
    </Card>
  );
}

function DetailLine({ icon: Icon, label, value }) {
  return (
    <div className="flex min-w-0 items-start gap-2.5">
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg bg-surface-raised text-forest-700">
        <Icon className="size-3.5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs font-medium text-text-subtle">{label}</dt>
        <dd className="mt-0.5 break-words text-text-muted">{value || 'Sin informacion'}</dd>
      </div>
    </div>
  );
}

function AddressSection({ booking, update, addresses, reloadAddresses }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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
      <p className="text-sm font-medium text-text">Lugar</p>
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
        Agregar un lugar
      </button>

      <Modal
        open={adding}
        onClose={() => setAdding(false)}
        title="Nueva dirección"
        description="Registra la dirección exacta en el mapa."
        size="xl"
      >
        <AddressForm
          submitting={saving}
          error={error}
          onSubmit={handleCreate}
          onCancel={() => setAdding(false)}
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
      </span>
    </button>
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

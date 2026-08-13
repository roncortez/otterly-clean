import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Sparkles, Shirt, Package } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Button, Card, Modal, Spinner, cx } from '@/shared/ui';
import { toDateInput, addDays } from '@/shared/format';

import StepService from './StepService';
import StepConfigure from './StepConfigure';
import StepPlace from './StepPlace';
import StepSchedule from './StepSchedule';
import StepSummary from './StepSummary';

/**
 * Asistente de reserva, en tres pasos.
 *
 * Se pide una cosa por pantalla en lugar de un formulario largo: la reserva de
 * limpieza necesita más de veinte datos y presentarlos juntos hace abandonar.
 * El patrón es Qué / Dónde y cómo / Cuándo: el servicio, el lugar (dirección,
 * espacio y acceso como una sola cosa) y la fecha. La revisión y el precio
 * viven en un modal antes de confirmar, porque ya no son un paso más sino el
 * último control antes de comprometerse.
 */

/** Tipos que el asistente sabe configurar. Los define el dominio, no la UI. */
const KNOWN_SERVICE_TYPES = ['CLEANING', 'LAUNDRY', 'KITS'];

const STEPS = [
  { id: 'service',   label: 'Tu servicio' },
  { id: 'configure', label: 'Cómo lo quieres' },
  { id: 'place',     label: 'Dónde y cómo' },
  { id: 'schedule',  label: 'Cuándo' },
];

const INITIAL_PROPERTY_DRAFT = {
  name: '',
  propertyType: 'APARTMENT',
  bedrooms: 1,
  bathrooms: 1,
};

const INITIAL_CLEANING = {
  cleaningType: 'STANDARD',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  areaValue: '',
  priorityAreas: [],
  suppliesProvidedBy: 'COMPANY',
  fragrancePreference: '',
  customerPresent: true,
  accessMethod: 'CUSTOMER_OPENS',
  accessInstructions: '',
  accessSecret: '',
  parkingInstructions: '',
  hasPets: false,
  pets: [],
  petsSecured: null,
  petInstructions: '',
  delicateItems: '',
  specialInstructions: '',
};

const INITIAL_LAUNDRY = {
  serviceVariant: 'WASH_AND_FOLD',
  estimatedBags: 1,
  estimatedWeight: 6,
  billingMode: 'PER_WEIGHT',
  washTemperature: 'COLD',
  detergentPreference: 'STANDARD',
  useFabricSoftener: true,
  useBleach: false,
  separateColors: true,
  dryingPreference: 'MACHINE',
  hangDryItems: '',
  delicateItems: '',
  doNotProcessItems: '',
  pickupInstructions: '',
  specialInstructions: '',
};

const INITIAL_KITS = {
  quantity: 1,
  deliveryInstructions: '',
  specialInstructions: '',
};

export default function BookingWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { money, timeWindows, weightUnit, areaUnit } = useConfig();

  const [stepIndex, setStepIndex] = useState(0);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pricing, setPricing] = useState(null);

  const catalogQuery = useApiQuery('/catalog/services');
  const addressQuery = useApiQuery('/customer/addresses');

  const catalog = catalogQuery.data?.services ?? null;
  // Referencia estable: si no, cada render crearía un array nuevo y las
  // dependencias de los useMemo que lo usan cambiarían siempre.
  const addresses = useMemo(() => addressQuery.data?.addresses ?? [], [addressQuery.data]);
  const loading = catalogQuery.loading || addressQuery.loading;

  const { busy: submitting, error: actionError, setError, execute } = useApiAction();
  const error = catalogQuery.error ?? addressQuery.error ?? actionError;

  const [booking, setBooking] = useState(() => {
    const rawParam = searchParams.get('servicio') || searchParams.get('service');
    const paramUpper = rawParam ? rawParam.toUpperCase() : null;
    const serviceType = paramUpper && KNOWN_SERVICE_TYPES.includes(paramUpper)
      ? paramUpper
      : null;
    return {
      serviceType,
      planId: null,
      extraCodes: [],
      scheduledDate: toDateInput(addDays(2)),
      windowCode: '',
      addressId: null,
      durationMinutes: 180,
      customerNotes: '',
      cleaning: INITIAL_CLEANING,
      laundry: INITIAL_LAUNDRY,
      kits: INITIAL_KITS,
    };
  });

  const [showServiceModal, setShowServiceModal] = useState(false);

  const update = (patch) => setBooking((current) => ({ ...current, ...patch }));
  const updateDetail = (key, patch) =>
    setBooking((current) => ({ ...current, [key]: { ...current[key], ...patch } }));


  // En limpieza el lugar se pide siempre dentro del asistente: rellena identidad
  // y acceso desde el inmueble guardado de la dirección o desde los valores por
  // defecto, y al confirmar se crea o se reemplaza el guardado.
  const [propertyDraft, setPropertyDraft] = useState(INITIAL_PROPERTY_DRAFT);

  // Si el servicio preseleccionado ya no se ofrece (Operaciones lo desactivó),
  // se cae al primero disponible en lugar de dejar el asistente bloqueado.
  const service = useMemo(() => {
    if (!catalog?.length) return undefined;
    return catalog.find((entry) => entry.code === booking.serviceType) ?? catalog[0];
  }, [catalog, booking.serviceType]);

  /**
   * Los valores por defecto se derivan durante el render en lugar de
   * escribirse con un efecto. Así no hay un instante en que el formulario
   * muestre "sin seleccionar" antes de corregirse solo.
   */
  const windows = timeWindows();

  const selectedPlanId = useMemo(() => {
    if (booking.planId && service?.plans.some((plan) => plan.id === booking.planId)) {
      return booking.planId;
    }
    return service?.plans[0]?.id ?? null;
  }, [booking.planId, service]);

  const selectedWindowCode = booking.windowCode || windows[0]?.code || '';

  const selectedAddressId = useMemo(() => {
    if (booking.addressId && addresses.some((address) => address.id === booking.addressId)) {
      return booking.addressId;
    }
    return (addresses.find((address) => address.is_default) ?? addresses[0])?.id ?? null;
  }, [booking.addressId, addresses]);

  // La dirección efectivamente elegida y el inmueble que vive en ella (si hay):
  // le dice al paso de lugar si puede rellenar con datos ya guardados.
  const selectedAddress = useMemo(
    () => addresses.find((address) => address.id === selectedAddressId) ?? null,
    [addresses, selectedAddressId],
  );
  const savedProperty = selectedAddress?.property ?? null;

  // Al elegir una dirección (o al aterrizar en la que viene por defecto) se
  // llena el formulario del lugar con lo guardado en ella; si no tiene inmueble
  // se dejan los valores por defecto para que no queden datos de otra casa. Se
  // ajusta durante el render solo cuando cambia la dirección: editar después no
  // se pisa, y volver a tocar la misma dirección no resetea lo ya corregido.
  const [prefilledAddressId, setPrefilledAddressId] = useState(null);
  if (selectedAddressId !== prefilledAddressId && booking.serviceType === 'CLEANING') {
    setPrefilledAddressId(selectedAddressId);
    const identity = {
      propertyType: savedProperty?.propertyType ?? 'APARTMENT',
      bedrooms: savedProperty?.bedrooms ?? 1,
      bathrooms: savedProperty?.bathrooms ?? 1,
    };
    setPropertyDraft({ name: savedProperty?.name ?? '', ...identity });
    updateDetail('cleaning', {
      ...identity,
      accessMethod: savedProperty?.accessMethod ?? 'CUSTOMER_OPENS',
      accessSecret: savedProperty?.accessCode ?? '',
      accessInstructions: savedProperty?.accessInstructions ?? '',
      parkingInstructions: savedProperty?.parkingInstructions ?? '',
      customerPresent: savedProperty?.customerPresent ?? true,
      hasPets: savedProperty?.hasPets ?? false,
      pets: savedProperty?.pets ?? [],
      petsSecured: savedProperty?.petsSecured ?? null,
      petInstructions: savedProperty?.petInstructions ?? '',
      delicateItems: savedProperty?.delicateItems ?? '',
    });
  }

  // Estado efectivo: lo que el usuario eligió, ya resuelto con los defectos.
  const effective = useMemo(
    () => ({
      ...booking,
      serviceType: service?.code ?? booking.serviceType,
      planId: selectedPlanId,
      windowCode: selectedWindowCode,
      addressId: selectedAddressId,
    }),
    [booking, service, selectedPlanId, selectedWindowCode, selectedAddressId],
  );

  const pricingInput = useMemo(() => {
    if (effective.serviceType === 'CLEANING') return { durationMinutes: effective.durationMinutes };
    // KITS usa FIXED: el motor no necesita ningun input adicional.
    if (effective.serviceType === 'KITS') return {};
    const plan = service?.plans.find((entry) => entry.id === effective.planId);
    if (plan?.pricing_model === 'PER_BAG') return { bagCount: effective.laundry.estimatedBags };
    if (plan?.pricing_model === 'PER_ITEM') {
      return { itemCount: effective.laundry.estimatedBags * 10 };
    }
    return { estimatedWeight: effective.laundry.estimatedWeight };
  }, [effective, service]);

  const currentStep = STEPS[stepIndex];

  // El precio siempre lo calcula el backend: el frontend no replica reglas.
  // Se pide al abrir el modal de confirmación; la clave serializada evita
  // repetir la consulta mientras no cambie nada relevante.
  const quoteKey =
    confirmOpen && effective.planId
      ? JSON.stringify({
          planId: effective.planId,
          extraCodes: effective.extraCodes,
          pricingInput,
        })
      : null;

  useEffect(() => {
    if (!quoteKey) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post('/customer/quote', JSON.parse(quoteKey));
        if (!cancelled) setPricing(data.pricing);
      } catch (requestError) {
        if (!cancelled) setError(errorMessage(requestError));
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteKey]);

  const canContinue = useMemo(() => {
    switch (currentStep.id) {
      case 'service':
        return Boolean(effective.planId);
      case 'configure':
        // Todos los campos de configure tienen valores por defecto; siempre se puede avanzar.
        return true;
      case 'place': {
        if (!effective.addressId) return false;
        if (effective.serviceType === 'CLEANING') {
          const identityReady =
            Boolean(propertyDraft.propertyType) &&
            Number(propertyDraft.bedrooms) >= 0 &&
            Number(propertyDraft.bathrooms) >= 0;
          return identityReady && Boolean(propertyDraft.name.trim());
        }
        return true;
      }
      case 'schedule':
        return Boolean(effective.scheduledDate) && Boolean(effective.windowCode);
      default:
        return true;
    }
  }, [currentStep.id, effective, propertyDraft]);

  async function handleSubmit() {
    const request = async () => {
      // La identidad del espacio siempre sale del formulario del paso; al
      // confirmar se persiste como lugar de la dirección (se crea o se
      // reemplaza) y la orden la referencia, para que el orden en que se
      // eligieron las direcciones no filtre datos de otra casa al snapshot.
      const identity = {
        propertyType: propertyDraft.propertyType,
        bedrooms: Number(propertyDraft.bedrooms) || 0,
        bathrooms: Number(propertyDraft.bathrooms) || 0,
      };

      // En limpieza el lugar siempre se persiste: se crea si la dirección no
      // tiene inmueble o se reemplaza si ya tiene uno.
      let propertyId = null;
      if (effective.serviceType === 'CLEANING') {
        const cleaning = effective.cleaning;
        const propertyPayload = {
          name: propertyDraft.name.trim(),
          propertyType: propertyDraft.propertyType,
          bedrooms: Number(propertyDraft.bedrooms) || 0,
          bathrooms: Number(propertyDraft.bathrooms) || 0,
          accessCode: cleaning.accessSecret || null,
          accessMethod: cleaning.accessMethod,
          accessInstructions: cleaning.accessInstructions || null,
          parkingInstructions: cleaning.parkingInstructions || null,
          customerPresent: cleaning.customerPresent,
          hasPets: cleaning.hasPets,
          pets: cleaning.hasPets ? cleaning.pets : [],
          petsSecured: cleaning.hasPets ? cleaning.petsSecured : null,
          petInstructions: cleaning.petInstructions || null,
          delicateItems: cleaning.delicateItems || null,
        };
        if (savedProperty) {
          const propertyRes = await api.patch(
            `/customer/properties/${savedProperty.id}`,
            propertyPayload,
          );
          propertyId = propertyRes.data.property.id;
        } else {
          const propertyRes = await api.post('/customer/properties', {
            ...propertyPayload,
            addressId: effective.addressId,
          });
          propertyId = propertyRes.data.property.id;
        }
      }

      const payload = {
        planId: effective.planId,
        addressId: effective.addressId,
        propertyId,
        scheduledDate: effective.scheduledDate,
        windowCode: effective.windowCode,
        extraCodes: effective.extraCodes,
        pricingInput,
        customerNotes: effective.customerNotes || null,
      };

      if (effective.serviceType === 'CLEANING') {
        const { areaValue, pets, petsSecured, ...rest } = effective.cleaning;
        return api.post('/customer/orders/cleaning', {
          ...payload,
          cleaning: {
            ...rest,
            ...identity,
            areaValue: areaValue === '' ? null : Number(areaValue),
            areaUnit,
            pets: rest.hasPets ? pets : [],
            petsSecured: rest.hasPets ? petsSecured : null,
          },
        });
      }
      if (effective.serviceType === 'LAUNDRY') {
        return api.post('/customer/orders/laundry', {
          ...payload,
          laundry: { ...effective.laundry, weightUnit },
        });
      }
      if (effective.serviceType === 'KITS') {
        return api.post('/customer/orders/kits', {
          ...payload,
          kits: { ...effective.kits },
        });
      }
    };

    await execute(request, {
      onSuccess: (response) =>
        navigate(`/servicios/${response.data.order.id}`, { replace: true }),
    });
  }

  if (loading) return <Spinner label="Preparando tu reserva" />;

  if (!booking.serviceType) {
    return (
      <div className="mx-auto max-w-xl text-center py-16 px-4">
        <div className="mb-6 flex justify-center">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-forest-50 text-forest-600 shadow-md">
            <Sparkles className="size-8 animate-pulse text-forest-600" />
          </span>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-text">
          ¿Qué necesitas hoy?
        </h1>
        <p className="mt-3 text-base text-text-muted max-w-md mx-auto">
          Comienza tu reserva seleccionando uno de nuestros servicios profesionales a domicilio.
        </p>

        <div className="mt-8">
          <Button
            size="lg"
            variant="accent"
            className="px-8 py-4 text-base font-bold shadow-lg transition-transform hover:scale-105"
            onClick={() => setShowServiceModal(true)}
          >
            Comenzar reserva
          </Button>
        </div>

        {/* Modal de Selección de Servicio */}
        <Modal
          open={showServiceModal}
          onClose={() => setShowServiceModal(false)}
          title="Selecciona un servicio"
          description="Elige el servicio que deseas solicitar hoy."
          size="lg"
        >
          <div className="grid gap-4 py-4 sm:grid-cols-3">
            <button
              type="button"
              className="flex flex-col items-center p-6 rounded-xl border border-border bg-surface hover:bg-surface-sunken hover:border-forest-400 transition-all text-center gap-3 cursor-pointer"
              onClick={() => {
                update({ serviceType: 'CLEANING', planId: null, extraCodes: [] });
                setShowServiceModal(false);
                setStepIndex(0);
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Sparkles className="size-6" />
              </span>
              <div>
                <span className="block font-bold text-text">Limpieza</span>
                <span className="mt-1 block text-xs text-text-muted">Residencial completa</span>
              </div>
            </button>

            <button
              type="button"
              className="flex flex-col items-center p-6 rounded-xl border border-border bg-surface hover:bg-surface-sunken hover:border-forest-400 transition-all text-center gap-3 cursor-pointer"
              onClick={() => {
                update({ serviceType: 'LAUNDRY', planId: null, extraCodes: [] });
                setShowServiceModal(false);
                setStepIndex(0);
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Shirt className="size-6" />
              </span>
              <div>
                <span className="block font-bold text-text">Lavandería</span>
                <span className="mt-1 block text-xs text-text-muted">Ropa impecable</span>
              </div>
            </button>

            <button
              type="button"
              className="flex flex-col items-center p-6 rounded-xl border border-border bg-surface hover:bg-surface-sunken hover:border-forest-400 transition-all text-center gap-3 cursor-pointer"
              onClick={() => {
                update({ serviceType: 'KITS', planId: null, extraCodes: [] });
                setShowServiceModal(false);
                setStepIndex(0);
              }}
            >
              <span className="flex size-12 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
                <Package className="size-6" />
              </span>
              <div>
                <span className="block font-bold text-text">Kits</span>
                <span className="mt-1 block text-xs text-text-muted">Insumos de limpieza</span>
              </div>
            </button>
          </div>
        </Modal>
      </div>
    );
  }

  const stepProps = {
    booking: effective,
    update,
    updateDetail,
    service,
    catalog,
    addresses,
    savedProperty,
    propertyDraft,
    setPropertyDraft,
    reloadAddresses: addressQuery.reload,
    money,
    weightUnit,
    areaUnit,
    timeWindows: windows,
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progreso: numerado porque la reserva sí es una secuencia real */}
      <ol className="mb-8 flex items-center gap-1.5" aria-label="Progreso de la reserva">
        {STEPS.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <li key={step.id} className="flex flex-1 flex-col gap-1.5">
              <span
                className={cx(
                  'h-1 rounded-full transition-colors',
                  done && 'bg-forest-500',
                  active && 'bg-accent-500',
                  !done && !active && 'bg-border',
                )}
              />
              <span
                className={cx(
                  'hidden text-[11px] font-medium sm:block',
                  active ? 'text-accent-700' : 'text-text-subtle',
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => {
            if (stepIndex === 0) {
              update({ serviceType: null });
            } else {
              setStepIndex(stepIndex - 1);
            }
          }}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          Atrás
        </Button>
      </div>
      <Card className="p-5 sm:p-7">
        {currentStep.id === 'service'   && <StepService   {...stepProps} />}
        {currentStep.id === 'configure' && <StepConfigure {...stepProps} />}
        {currentStep.id === 'place'     && <StepPlace     {...stepProps} />}
        {currentStep.id === 'schedule'  && <StepSchedule  {...stepProps} />}
      </Card>

      <div className="mt-6 flex justify-end">
        {stepIndex < STEPS.length - 1 ? (
          <Button size="lg" disabled={!canContinue} onClick={() => setStepIndex(stepIndex + 1)}>
            Continuar
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button size="lg" variant="accent" disabled={!canContinue} onClick={() => setConfirmOpen(true)}>
            <Check className="size-4" aria-hidden="true" />
            Revisar y confirmar
          </Button>
        )}
      </div>

      <Modal
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirma tu reserva"
        description="Revisa el resumen y el precio; el pago se coordina directamente con la empresa."
        size="lg"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              Atrás
            </Button>
            <Button variant="accent" loading={submitting} onClick={handleSubmit}>
              <Check className="size-4" aria-hidden="true" />
              Confirmar reserva
            </Button>
          </>
        }
      >
        {actionError && (
          <div className="mb-4">
            <Alert tone="danger">{actionError}</Alert>
          </div>
        )}
        <StepSummary {...stepProps} pricing={pricing} compact />
      </Modal>
    </div>
  );
}

export { STEPS, Sparkles, Shirt };

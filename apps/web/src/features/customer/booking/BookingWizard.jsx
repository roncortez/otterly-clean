import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Sparkles, Shirt } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Button, ButtonLink, Card, Spinner, cx } from '@/shared/ui';
import { toDateInput, addDays } from '@/shared/format';

import StepService from './StepService';
import StepConfigure from './StepConfigure';
import StepSchedule from './StepSchedule';
import StepAddress from './StepAddress';
import StepInstructions from './StepInstructions';
import StepSummary from './StepSummary';

/**
 * Asistente de reserva.
 *
 * Se pide una cosa por pantalla en lugar de un formulario largo: la reserva de
 * limpieza necesita más de veinte datos y presentarlos juntos hace abandonar.
 * El paso de resumen muestra el precio calculado por el backend antes de
 * confirmar, para que nadie reserve sin saber cuánto va a pagar.
 */

/** Tipos que el asistente sabe configurar. Los define el dominio, no la UI. */
const KNOWN_SERVICE_TYPES = ['CLEANING', 'LAUNDRY'];

const STEPS = [
  { id: 'service', label: 'Servicio' },
  { id: 'configure', label: 'Detalles' },
  { id: 'schedule', label: 'Fecha' },
  { id: 'address', label: 'Dirección' },
  { id: 'instructions', label: 'Instrucciones' },
  { id: 'summary', label: 'Resumen' },
];

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

export default function BookingWizard() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { money, timeWindows, weightUnit, areaUnit } = useConfig();

  const [stepIndex, setStepIndex] = useState(0);
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

  const [booking, setBooking] = useState(() => ({
    // El servicio puede llegar preseleccionado desde la portada. Se acepta solo
    // si es uno de los tipos conocidos; si el catálogo no lo ofrece, el paso 1
    // lo corrige al primero disponible.
    serviceType: KNOWN_SERVICE_TYPES.includes(searchParams.get('servicio'))
      ? searchParams.get('servicio')
      : 'CLEANING',
    planId: null,
    extraCodes: [],
    scheduledDate: toDateInput(addDays(2)),
    windowCode: '',
    addressId: null,
    durationMinutes: 180,
    customerNotes: '',
    cleaning: INITIAL_CLEANING,
    laundry: INITIAL_LAUNDRY,
  }));

  const update = (patch) => setBooking((current) => ({ ...current, ...patch }));
  const updateDetail = (key, patch) =>
    setBooking((current) => ({ ...current, [key]: { ...current[key], ...patch } }));

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
    const plan = service?.plans.find((entry) => entry.id === effective.planId);
    if (plan?.pricing_model === 'PER_BAG') return { bagCount: effective.laundry.estimatedBags };
    if (plan?.pricing_model === 'PER_ITEM') {
      return { itemCount: effective.laundry.estimatedBags * 10 };
    }
    return { estimatedWeight: effective.laundry.estimatedWeight };
  }, [effective, service]);

  const currentStep = STEPS[stepIndex];
  const isSummary = currentStep.id === 'summary';

  // El precio siempre lo calcula el backend: el frontend no replica reglas.
  // Se pide solo en el resumen; la clave serializada evita repetir la consulta
  // mientras no cambie nada relevante.
  const quoteKey =
    isSummary && effective.planId
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
      case 'schedule':
        return Boolean(effective.scheduledDate && effective.windowCode);
      case 'address':
        return Boolean(effective.addressId);
      default:
        return true;
    }
  }, [currentStep.id, effective]);

  async function handleSubmit() {
    const payload = {
      planId: effective.planId,
      addressId: effective.addressId,
      scheduledDate: effective.scheduledDate,
      windowCode: effective.windowCode,
      extraCodes: effective.extraCodes,
      pricingInput,
      customerNotes: effective.customerNotes || null,
    };

    const request = () => {
      if (effective.serviceType === 'CLEANING') {
        const { areaValue, pets, petsSecured, ...rest } = effective.cleaning;
        return api.post('/customer/orders/cleaning', {
          ...payload,
          cleaning: {
            ...rest,
            areaValue: areaValue === '' ? null : Number(areaValue),
            areaUnit,
            pets: rest.hasPets ? pets : [],
            petsSecured: rest.hasPets ? petsSecured : null,
          },
        });
      }
      return api.post('/customer/orders/laundry', {
        ...payload,
        laundry: { ...effective.laundry, weightUnit },
      });
    };

    await execute(request, {
      onSuccess: (response) =>
        navigate(`/servicios/${response.data.order.id}`, { replace: true }),
    });
  }

  if (loading) return <Spinner label="Preparando tu reserva" />;

  if (addresses.length === 0) {
    return (
      <Card className="p-8 text-center">
        <h1 className="text-xl font-bold tracking-tight text-text">Primero, ¿a dónde vamos?</h1>
        <p className="mx-auto mt-2 max-w-md text-text-muted">
          Necesitamos una dirección para poder asignar un profesional de tu zona.
        </p>
        <ButtonLink as={Link} to="/direcciones" variant="accent" className="mt-6">
          Agregar mi dirección
        </ButtonLink>
      </Card>
    );
  }

  const stepProps = {
    booking: effective,
    update,
    updateDetail,
    service,
    catalog,
    addresses,
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
          onClick={() => (stepIndex === 0 ? navigate(-1) : setStepIndex(stepIndex - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
        </Button>
      </div>
      <Card className="p-5 sm:p-7">
        {currentStep.id === 'service' && <StepService {...stepProps} />}
        {currentStep.id === 'configure' && <StepConfigure {...stepProps} />}
        {currentStep.id === 'schedule' && <StepSchedule {...stepProps} />}
        {currentStep.id === 'address' && <StepAddress {...stepProps} />}
        {currentStep.id === 'instructions' && <StepInstructions {...stepProps} />}
        {currentStep.id === 'summary' && <StepSummary {...stepProps} pricing={pricing} />}
      </Card>

      <div className="mt-6 flex justify-end">
        {stepIndex < STEPS.length - 1 ? (
          <Button size="lg" disabled={!canContinue} onClick={() => setStepIndex(stepIndex + 1)}>
            Continuar
            <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
        ) : (
          <Button size="lg" variant="accent" loading={submitting} onClick={handleSubmit}>
            <Check className="size-4" aria-hidden="true" />
            Confirmar reserva
          </Button>
        )}
      </div>
    </div>
  );
}

export { STEPS, Sparkles, Shirt };

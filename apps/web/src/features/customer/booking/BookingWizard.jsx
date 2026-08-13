import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Button, ButtonLink, Card, Spinner, cx } from '@/shared/ui';
import { toDateInput, addDays } from '@/shared/format';

import StepService from './StepService';
import StepConfigure from './StepConfigure';
import StepSchedule from './StepSchedule';
import StepAddress from './StepAddress';
import StepSpace from './StepSpace';
import StepInstructions from './StepInstructions';
import StepSummary from './StepSummary';

/**
 * Asistente de reserva.
 *
 * Se pide una cosa por pantalla en lugar de un formulario largo, y sobre todo:
 * **solo se pide lo que cambia**. Los datos del lugar —habitaciones, baños, cómo
 * se entra, mascotas— pertenecen al espacio y ya están guardados; aquí se elige
 * cuál es y el backend los toma de su ficha. Lo que este asistente pregunta es
 * de esta visita: qué tipo, cuánto tiempo, qué día, qué priorizar.
 *
 * El paso de resumen muestra el precio calculado por el backend antes de
 * confirmar, para que nadie reserve sin saber cuánto va a pagar.
 *
 * El mismo asistente sirve a los dos servicios que tienen flujo. Cuando se abre
 * desde la experiencia de un servicio (`serviceType`), ese servicio viene dado y
 * el primer paso solo elige el tipo dentro de él. Limpieza pregunta por un
 * espacio y lavandería solo por una dirección, porque lavandería no entra en la
 * casa.
 */

/** Tipos que el asistente sabe configurar. Los define el dominio, no la UI. */
const KNOWN_SERVICE_TYPES = ['CLEANING', 'LAUNDRY'];

/**
 * Lo que se pregunta en cada reserva de limpieza. Nada de esto describe el
 * lugar: eso vive en la ficha del espacio (ver `cleaning/HomeProfileForm`) y el
 * backend lo hereda de ahí (`domain/cleaning/homeProfile.js`).
 */
const INITIAL_CLEANING = {
  cleaningType: 'STANDARD',
  priorityAreas: [],
  suppliesProvidedBy: 'COMPANY',
  fragrancePreference: '',
  customerPresent: true,
  petsSecured: null,
  delicateItems: '',
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

export default function BookingWizard({ serviceType: fixedServiceType = null }) {
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
    // El servicio lo fija la ruta cuando se entra desde su experiencia. El
    // parámetro solo se acepta si es uno de los tipos conocidos; si el catálogo
    // no lo ofrece, el paso 1 lo corrige al primero disponible.
    serviceType:
      fixedServiceType ??
      (KNOWN_SERVICE_TYPES.includes(searchParams.get('servicio'))
        ? searchParams.get('servicio')
        : 'CLEANING'),
    planId: null,
    extraCodes: [],
    scheduledDate: toDateInput(addDays(2)),
    windowCode: '',
    addressId: null,
    durationMinutes: 180,
    customerNotes: '',
    // Solo lo que la persona ha tocado: el resto se deriva durante el render,
    // de los valores por defecto y de la ficha de su casa.
    cleaning: {},
    laundry: {},
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

  // El servicio que realmente se va a reservar, no el que se pidió: los pasos
  // salen de este, así que un servicio desactivado no deja el asistente
  // preguntando por cosas de otro.
  const isCleaning = (service?.code ?? booking.serviceType) === 'CLEANING';

  /**
   * El lugar se pregunta antes que los detalles y no después: de él cuelga todo
   * lo que ya sabemos, así que elegirlo primero es lo que permite no volver a
   * preguntarlo. Limpieza elige un espacio (dirección + su ficha); lavandería,
   * solo la dirección donde recoge.
   */
  const steps = useMemo(
    () => [
      { id: 'service', label: fixedServiceType ? 'Tipo' : 'Servicio' },
      isCleaning ? { id: 'space', label: 'Espacio' } : { id: 'address', label: 'Dirección' },
      { id: 'configure', label: 'Detalles' },
      { id: 'schedule', label: 'Fecha' },
      { id: 'instructions', label: 'El día' },
      { id: 'summary', label: 'Resumen' },
    ],
    [fixedServiceType, isCleaning],
  );

  const goToStep = (id) => {
    const index = steps.findIndex((step) => step.id === id);
    if (index >= 0) setStepIndex(index);
  };

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

  const selectedAddress = useMemo(() => {
    if (booking.addressId) {
      const chosen = addresses.find((address) => address.id === booking.addressId);
      if (chosen) return chosen;
    }
    return addresses.find((address) => address.is_default) ?? addresses[0] ?? null;
  }, [booking.addressId, addresses]);

  // Estado efectivo: lo que el usuario eligió, ya resuelto con los defectos.
  // Los datos del espacio no se copian aquí a propósito: no son de la reserva.
  const effective = useMemo(
    () => ({
      ...booking,
      serviceType: service?.code ?? booking.serviceType,
      planId: selectedPlanId,
      windowCode: selectedWindowCode,
      addressId: selectedAddress?.id ?? null,
      cleaning: { ...INITIAL_CLEANING, ...booking.cleaning },
      laundry: { ...INITIAL_LAUNDRY, ...booking.laundry },
    }),
    [booking, service, selectedPlanId, selectedWindowCode, selectedAddress],
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

  const currentStep = steps[stepIndex];
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
      case 'space':
        // No basta con elegir el lugar: hay que saber qué se limpia ahí. Es lo
        // único que el asistente exige del espacio, y se completa en el paso.
        return Boolean(selectedAddress?.cleaningProfile?.complete);
      default:
        return true;
    }
  }, [currentStep.id, effective, selectedAddress]);

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
        /**
         * Solo lo de esta visita. Lo del lugar —habitaciones, baños, acceso,
         * mascotas— no viaja: el backend lo toma de la ficha del espacio, que es
         * donde vive. Reenviarlo desde aquí era lo que obligaba a preguntarlo
         * otra vez para tener algo que enviar.
         */
        const { petsSecured, ...visit } = effective.cleaning;
        const hasPets = Boolean(selectedAddress?.cleaningProfile?.hasPets);

        return api.post('/customer/orders/cleaning', {
          ...payload,
          cleaning: { ...visit, petsSecured: hasPets ? petsSecured : null },
        });
      }
      return api.post('/customer/orders/laundry', {
        ...payload,
        laundry: { ...effective.laundry, weightUnit },
      });
    };

    await execute(request, {
      onSuccess: (response) => navigate(`/servicios/${response.data.order.id}`, { replace: true }),
    });
  }

  if (loading) return <Spinner label="Preparando tu reserva" />;

  /**
   * Sin direcciones no hay pantalla de "vuelve cuando tengas una": el propio
   * paso del lugar la da de alta aquí mismo. Salir del asistente para volver a
   * entrar era fricción que no aportaba nada.
   */
  const stepProps = {
    booking: effective,
    update,
    updateDetail,
    goToStep,
    service,
    catalog,
    addresses,
    selectedAddress,
    reloadAddresses: addressQuery.reload,
    money,
    weightUnit,
    areaUnit,
    timeWindows: windows,
    lockedService: Boolean(fixedServiceType),
  };

  return (
    <div className="mx-auto max-w-2xl">
      {/* Progreso: numerado porque la reserva sí es una secuencia real */}
      <ol className="mb-8 flex items-center gap-1.5" aria-label="Progreso de la reserva">
        {steps.map((step, index) => {
          const done = index < stepIndex;
          const active = index === stepIndex;
          return (
            <li key={step.id} className="flex flex-1 flex-col gap-1.5">
              <span
                className={cx(
                  'h-1 rounded-full transition-colors',
                  done && 'bg-service',
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

      <Card className="p-5 sm:p-7">
        {currentStep.id === 'service' && <StepService {...stepProps} />}
        {currentStep.id === 'space' && <StepSpace {...stepProps} />}
        {currentStep.id === 'address' && <StepAddress {...stepProps} />}
        {currentStep.id === 'configure' && <StepConfigure {...stepProps} />}
        {currentStep.id === 'schedule' && <StepSchedule {...stepProps} />}
        {currentStep.id === 'instructions' && <StepInstructions {...stepProps} />}
        {currentStep.id === 'summary' && <StepSummary {...stepProps} pricing={pricing} />}
      </Card>

      <div className="mt-6 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          onClick={() => (stepIndex === 0 ? navigate(-1) : setStepIndex(stepIndex - 1))}
        >
          <ArrowLeft className="size-4" aria-hidden="true" />
          {stepIndex === 0 ? 'Cancelar' : 'Atrás'}
        </Button>

        {stepIndex < steps.length - 1 ? (
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

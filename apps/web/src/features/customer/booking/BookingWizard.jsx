import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, LogIn, RotateCcw, Sparkles, Shirt } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import ServicePicker from '@/shared/services/ServicePicker';
import { clearDraft, hasProgress, loadDraft, saveDraft } from '@/shared/booking/draft';
import { Alert, Button, Card, Modal, Spinner, cx } from '@/shared/ui';
import { toDateInput, addDays, formatRelative } from '@/shared/format';

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


const INITIAL_CLEANING = {
  cleaningType: 'STANDARD',
  propertyType: 'APARTMENT',
  bedrooms: 2,
  bathrooms: 1,
  areaValue: '',
  priorityAreas: [],
  suppliesProvidedBy: 'COMPANY',
  // Código del catálogo de fragancias; null = sin preferencia.
  fragrancePreference: null,
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
  // Código del catálogo de fragancias; null = sin preferencia.
  fragranceCode: null,
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

/**
 * Rehidrata un borrador sobre una reserva nueva.
 *
 * La mezcla tiene que entrar en `cleaning`, `laundry` y `kits`, no quedarse en
 * el primer nivel: un borrador guardado ayer no conoce los campos que se
 * añadieron hoy, y sustituir el objeto entero dejaba la reserva sin ellos
 * —`priorityAreas` sin array, `pets` sin lista— hasta reventar al pintar el
 * paso. Lo guardado manda sobre el valor inicial; lo que no guardó, lo pone el
 * inicial.
 */
function restoreBooking(saved) {
  const base = emptyBooking(saved.serviceType);
  const merged = { ...base, ...saved };

  for (const key of ['cleaning', 'laundry', 'kits']) {
    merged[key] = { ...base[key], ...(saved[key] ?? {}) };
  }

  return merged;
}

function emptyBooking(serviceType) {
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
}

export default function BookingWizard() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { money, timeWindows, weightUnit, areaUnit } = useConfig();
  const { isAuthenticated } = useAuth();

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pricing, setPricing] = useState(null);
  const onNextHandlerRef = useRef(null);

  const registerOnNext = useCallback((fn) => {
    onNextHandlerRef.current = fn;
  }, []);

  const catalogQuery = useApiQuery('/catalog/services');
  // Sin sesión no hay direcciones que pedir, y pedirlas devolvería 401. El
  // visitante crea la suya dentro del asistente (ver StepPlace).
  const addressQuery = useApiQuery(isAuthenticated ? '/customer/addresses' : null);

  const catalog = catalogQuery.data?.services ?? null;
  // Referencia estable: si no, cada render crearía un array nuevo y las
  // dependencias de los useMemo que lo usan cambiarían siempre.
  const addresses = useMemo(() => addressQuery.data?.addresses ?? [], [addressQuery.data]);
  const loading = catalogQuery.loading || addressQuery.loading;

  const { busy: submitting, error: actionError, setError, execute } = useApiAction();
  const error = catalogQuery.error ?? addressQuery.error ?? actionError;

  /**
   * El servicio pedido por la URL. Es lo que distingue "vengo a reservar una
   * limpieza" de "vengo a seguir con lo que estaba", y por eso manda sobre el
   * borrador: pulsar Lavandería en el selector no puede devolverte una limpieza
   * a medias.
   */
  const requestedService = useMemo(() => {
    const raw = searchParams.get('servicio') || searchParams.get('service');
    const upper = raw ? raw.toUpperCase() : null;
    return upper && KNOWN_SERVICE_TYPES.includes(upper) ? upper : null;
  }, [searchParams]);

  /**
   * El borrador recuperado, si lo hay y si sirve para lo que se ha venido a
   * hacer.
   *
   * Se lee una sola vez, al montar: si se releyera en cada render, guardar el
   * borrador provocaría recargarlo y el formulario se pelearía consigo mismo.
   *
   * «Sirve» es dos cosas. Que no contradiga el servicio pedido por la URL
   * —pulsar Lavandería no puede devolver una limpieza a medias— y que tenga
   * algo dentro: un borrador que no se distingue de una reserva recién
   * empezada no es progreso, y anunciarlo era lo que hacía salir el aviso cada
   * vez que alguien empezaba a reservar.
   */
  const [savedDraft] = useState(() => {
    const draft = loadDraft();
    if (!draft) return null;
    if (requestedService && draft.booking.serviceType !== requestedService) return null;
    if (!hasProgress(draft.booking, emptyBooking(draft.booking.serviceType))) {
      clearDraft();
      return null;
    }
    return draft;
  });

  const [booking, setBooking] = useState(() =>
    savedDraft ? restoreBooking(savedDraft.booking) : emptyBooking(requestedService),
  );

  // Retomar de verdad es volver al paso en que se quedó, no al primero.
  const [stepIndex, setStepIndex] = useState(() => savedDraft?.stepIndex ?? 0);

  // Abierto de entrada: llegar a /reservar sin servicio es justamente venir a
  // elegirlo.
  const [showServiceModal, setShowServiceModal] = useState(true);
  const [draftNotice, setDraftNotice] = useState(Boolean(savedDraft));

  /**
   * El borrador se guarda solo, en cuanto hay algo que guardar.
   *
   * Cubre los dos casos: el visitante que va a iniciar sesión antes de
   * confirmar, y el cliente que recarga, navega a otra pantalla o vuelve al día
   * siguiente. Los secretos de acceso no entran; de eso se encarga `saveDraft`.
   *
   * Una reserva intacta no se guarda. Guardarla no salvaba nada —no hay nada
   * escrito que perder— y a cambio dejaba en el navegador un borrador que la
   * siguiente visita tenía que ofrecerse a descartar.
   */
  useEffect(() => {
    if (hasProgress(booking, emptyBooking(booking.serviceType))) saveDraft(booking, stepIndex);
  }, [booking, stepIndex]);

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
        if (effective.serviceType === 'CLEANING') {
          if (!effective.propertyId) return false;
          const cl = effective.cleaning;
          const hasAccess = cl.accessMethod !== undefined && cl.accessMethod !== null;
          const hasPetsVal = cl.hasPets !== undefined && cl.hasPets !== null;
          return hasAccess && hasPetsVal;
        }
        return Boolean(effective.addressId);
      }
      case 'schedule':
        return Boolean(effective.scheduledDate) && Boolean(effective.windowCode);
      default:
        return true;
    }
  }, [currentStep.id, effective]);

  /**
   * Empezar de cero.
   *
   * Existe porque un borrador guardado no puede ser una condena: si el cliente
   * viene a pedir otra cosa, seguir con lo de la semana pasada sería la
   * aplicación decidiendo por él. Borra también lo guardado, no solo la
   * pantalla, para que no reaparezca al recargar.
   */
  function discardDraft() {
    clearDraft();
    setBooking(emptyBooking(requestedService ?? booking.serviceType));
    setStepIndex(0);
    setDraftNotice(false);
    setPricing(null);
  }

  /**
   * Ir a iniciar sesión sin salir de la reserva.
   *
   * `background` mantiene el asistente detrás del panel de acceso, y
   * `redirectTo` trae de vuelta aquí al entrar en lugar de al inicio. El
   * borrador ya está guardado por el efecto de arriba, así que al volver el
   * formulario se recompone solo.
   */
  function goToLogin() {
    saveDraft(booking, stepIndex);
    navigate('/entrar', {
      state: { background: location, redirectTo: `${location.pathname}${location.search}` },
    });
  }

  async function handleSubmit() {
    const request = async () => {
      const propertyId = effective.propertyId || null;

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
      onSuccess: (response) => {
        // La reserva ya existe en el servidor: el borrador ha cumplido y
        // conservarlo solo serviría para reaparecer sobre la siguiente.
        clearDraft();
        navigate(`/servicios/${response.data.order.id}`, { replace: true });
      },
    });
  }

  if (loading) return <Spinner label="Preparando tu reserva" />;

  /**
   * Sin servicio elegido no hay asistente que mostrar, solo la pregunta.
   *
   * Antes esto era una pantalla intermedia con un titular y un botón
   * «Comenzar reserva» cuyo único efecto era abrir este mismo modal. El paso
   * sobraba: ahora el selector se abre directamente y, si se cierra sin elegir,
   * se vuelve de donde se vino.
   */
  if (!booking.serviceType) {
    return (
      <ServicePicker
        open={showServiceModal}
        onClose={() => {
          setShowServiceModal(false);
          navigate(isAuthenticated ? '/inicio' : '/');
        }}
      />
    );
  }

  const stepProps = {
    booking: effective,
    update,
    updateDetail,
    service,
    catalog,
    addresses,
    reloadAddresses: addressQuery.reload,
    money,
    weightUnit,
    areaUnit,
    timeWindows: windows,
    registerOnNext,
  };

  async function handleNext() {
    if (onNextHandlerRef.current) {
      const ok = await onNextHandlerRef.current();
      if (!ok) return;
    }
    setStepIndex(stepIndex + 1);
  }

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

      {/*
        Se ha recuperado una reserva a medias. Se avisa en lugar de restaurarla
        en silencio: encontrarse el formulario relleno sin saber por qué es
        desconcertante, y quien venía a pedir otra cosa necesita una salida.
      */}
      {draftNotice && (
        <div className="mb-5">
          <Alert tone="info" title="Retomamos donde lo dejaste">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Guardamos lo que habías empezado
                {savedDraft?.savedAt ? ` ${formatRelative(savedDraft.savedAt)}` : ''}. Por
                seguridad no guardamos los códigos de acceso: tendrás que escribirlos otra vez.
              </span>
              <span className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setDraftNotice(false)}>
                  Continuar
                </Button>
                <Button size="sm" variant="outline" onClick={discardDraft}>
                  <RotateCcw className="size-3.5" aria-hidden="true" />
                  Empezar de nuevo
                </Button>
              </span>
            </div>
          </Alert>
        </div>
      )}

      <div className="mb-4">
        <Button
          variant="ghost"
          onClick={() => {
            if (stepIndex === 0) {
              update({ serviceType: null });
              setShowServiceModal(true);
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
          <Button size="lg" disabled={!canContinue} onClick={handleNext}>
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

      {/*
        El único punto del flujo donde hace falta una sesión.

        Hasta aquí un visitante ha podido elegir servicio, describir su casa y
        escoger fecha sin registrarse. Ahora sí: crear la orden exige saber de
        quién es, y el backend lo exige igualmente (`RequireRole` no protege
        esta pantalla, pero `POST /customer/orders/*` sí). No se crea ninguna
        orden anónima que luego haya que reclamar.
      */}
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
            {isAuthenticated ? (
              <Button variant="accent" loading={submitting} onClick={handleSubmit}>
                <Check className="size-4" aria-hidden="true" />
                Confirmar reserva
              </Button>
            ) : (
              <Button variant="accent" onClick={goToLogin}>
                <LogIn className="size-4" aria-hidden="true" />
                Inicia sesión para reservar
              </Button>
            )}
          </>
        }
      >
        {actionError && (
          <div className="mb-4">
            <Alert tone="danger">{actionError}</Alert>
          </div>
        )}

        {!isAuthenticated && (
          <div className="mb-4">
            <Alert tone="info" title="Solo falta identificarte">
              Tus datos no se perderán: al entrar volvemos justo a esta pantalla con todo lo que
              has rellenado. Por seguridad no guardamos los códigos de acceso.
            </Alert>
          </div>
        )}
        <StepSummary {...stepProps} pricing={pricing} compact />
      </Modal>
    </div>
  );
}

export { STEPS, Sparkles, Shirt };

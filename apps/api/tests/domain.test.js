'use strict';

/**
 * Pruebas del dominio puro: sin base de datos, sin HTTP.
 * Son las reglas de negocio que deben cumplirse siempre.
 */

const { cleaningStateMachine } = require('../src/domain/cleaning/stateMachine');
const { laundryStateMachine } = require('../src/domain/laundry/stateMachine');
const { calculatePrice, PRICING_MODELS } = require('../src/domain/pricing/pricing');
const { buildTimeline } = require('../src/domain/shared/timeline');
const { evaluateCancellation, assertValidSchedule } = require('../src/domain/shared/policies');
const { getRegion } = require('../src/config/regions');
const { ROLES } = require('../src/domain/shared/roles');

const EC = getRegion('EC');
const US = getRegion('US');

describe('Maquina de estados de limpieza', () => {
  it('permite el camino feliz completo', () => {
    const path = [
      ['REQUESTED', 'PENDING_ASSIGNMENT', ROLES.ADMIN],
      ['PENDING_ASSIGNMENT', 'ASSIGNED', ROLES.ADMIN],
      ['ASSIGNED', 'CONFIRMED', ROLES.STAFF],
      ['CONFIRMED', 'ON_THE_WAY', ROLES.STAFF],
      ['ON_THE_WAY', 'ARRIVED', ROLES.STAFF],
      ['ARRIVED', 'IN_PROGRESS', ROLES.STAFF],
      ['IN_PROGRESS', 'COMPLETED', ROLES.STAFF],
    ];

    for (const [from, to, role] of path) {
      expect(() => cleaningStateMachine.assertTransition(from, to, role)).not.toThrow();
    }
  });

  it('rechaza saltos arbitrarios', () => {
    expect(() => cleaningStateMachine.assertTransition('REQUESTED', 'COMPLETED', ROLES.ADMIN)).toThrow(
      /Transicion no permitida/,
    );
    expect(() => cleaningStateMachine.assertTransition('ASSIGNED', 'IN_PROGRESS', ROLES.STAFF)).toThrow();
  });

  it('impide que el trabajador se asigne trabajos a si mismo', () => {
    // Solo ADMIN puede mover la orden a ASSIGNED.
    expect(() =>
      cleaningStateMachine.assertTransition('PENDING_ASSIGNMENT', 'ASSIGNED', ROLES.STAFF),
    ).toThrow(/no puede ejecutar/);
  });

  it('impide que el cliente manipule el progreso operativo', () => {
    expect(() => cleaningStateMachine.assertTransition('ARRIVED', 'IN_PROGRESS', ROLES.CUSTOMER)).toThrow();
    expect(() => cleaningStateMachine.assertTransition('IN_PROGRESS', 'COMPLETED', ROLES.CUSTOMER)).toThrow();
  });

  it('deja cancelar al cliente solo antes de que empiece el trabajo', () => {
    expect(() => cleaningStateMachine.assertTransition('CONFIRMED', 'CANCELLED', ROLES.CUSTOMER)).not.toThrow();
    // Con el profesional ya en camino, la cancelacion es decision de la empresa.
    expect(() => cleaningStateMachine.assertTransition('ON_THE_WAY', 'CANCELLED', ROLES.CUSTOMER)).toThrow();
    expect(() => cleaningStateMachine.assertTransition('ON_THE_WAY', 'CANCELLED', ROLES.ADMIN)).not.toThrow();
  });

  it('trata los estados finales como inmutables', () => {
    expect(cleaningStateMachine.isTerminal('COMPLETED')).toBe(true);
    expect(cleaningStateMachine.isTerminal('CANCELLED')).toBe(true);
    expect(() => cleaningStateMachine.assertTransition('COMPLETED', 'IN_PROGRESS', ROLES.ADMIN)).toThrow(
      /estado final/,
    );
  });

  it('permite retomar tras una incidencia', () => {
    expect(() =>
      cleaningStateMachine.assertTransition('IN_PROGRESS', 'INCIDENT_REPORTED', ROLES.STAFF),
    ).not.toThrow();
    expect(() =>
      cleaningStateMachine.assertTransition('INCIDENT_REPORTED', 'IN_PROGRESS', ROLES.STAFF),
    ).not.toThrow();
  });

  it('expone solo las transiciones permitidas a cada rol', () => {
    const staffOptions = cleaningStateMachine.allowedTransitions('ARRIVED', ROLES.STAFF);
    expect(staffOptions.map((t) => t.to)).toContain('IN_PROGRESS');
    expect(staffOptions.map((t) => t.to)).not.toContain('CANCELLED');

    const customerOptions = cleaningStateMachine.allowedTransitions('ARRIVED', ROLES.CUSTOMER);
    expect(customerOptions).toHaveLength(0);
  });
});

describe('Maquina de estados de lavanderia', () => {
  it('recorre la cadena logistica completa', () => {
    const chain = [
      'REQUESTED',
      'PICKUP_SCHEDULED',
      'ASSIGNED',
      'PICKUP_CONFIRMED',
      'PICKED_UP',
      'RECEIVED',
      'PROCESSING',
      'WASHING',
      'DRYING',
      'FOLDING',
      'READY_FOR_DELIVERY',
      'OUT_FOR_DELIVERY',
      'DELIVERED',
      'COMPLETED',
    ];

    for (let i = 0; i < chain.length - 1; i += 1) {
      expect(() =>
        laundryStateMachine.assertTransition(chain[i], chain[i + 1], ROLES.ADMIN),
      ).not.toThrow();
    }
  });

  it('no deja al cliente cancelar una vez recogida la ropa', () => {
    expect(() =>
      laundryStateMachine.assertTransition('PICKUP_CONFIRMED', 'CANCELLED', ROLES.CUSTOMER),
    ).not.toThrow();
    // Ya tenemos su ropa: cancelar pasa a ser decision de Operaciones.
    expect(() =>
      laundryStateMachine.assertTransition('PICKED_UP', 'CANCELLED', ROLES.CUSTOMER),
    ).toThrow();
  });

  it('permite reintentar una entrega fallida', () => {
    expect(() =>
      laundryStateMachine.assertTransition('OUT_FOR_DELIVERY', 'READY_FOR_DELIVERY', ROLES.STAFF),
    ).not.toThrow();
  });
});

describe('Motor de precios', () => {
  it('cobra por hora respetando el minimo del plan (modelo Quito)', () => {
    const plan = {
      name: 'Limpieza estandar',
      pricing_model: PRICING_MODELS.PER_HOUR,
      base_amount: 1100,
      config: { minimumHours: 2 },
    };

    // 3 horas: 3 x 11.00 = 33.00
    const tresHoras = calculatePrice({ plan, input: { durationMinutes: 180 }, region: EC });
    expect(tresHoras.subtotal).toBe(3300);
    expect(tresHoras.tax).toBe(495); // IVA 15%
    expect(tresHoras.total).toBe(3795);

    // 1 hora pedida, pero el minimo son 2: se cobran 2.
    const unaHora = calculatePrice({ plan, input: { durationMinutes: 60 }, region: EC });
    expect(unaHora.subtotal).toBe(2200);
  });

  it('cobra plano por tamano (modelo EE.UU.) sin cambiar de motor', () => {
    const plan = {
      name: 'Standard cleaning',
      pricing_model: PRICING_MODELS.FLAT_BY_SIZE,
      base_amount: 0,
      config: { tiers: { '2BR': 14000 } },
    };

    const result = calculatePrice({ plan, input: { sizeTier: '2BR' }, region: US });
    expect(result.subtotal).toBe(14000);
    // El sales tax por defecto es 0 hasta configurar la zona.
    expect(result.tax).toBe(0);
    expect(result.total).toBe(14000);
  });

  it('cobra por peso con minimo facturable', () => {
    const plan = {
      name: 'Lavado y doblado',
      pricing_model: PRICING_MODELS.PER_WEIGHT,
      base_amount: 250,
      config: { unit: 'kg', minimumUnits: 4 },
    };

    expect(calculatePrice({ plan, input: { weight: 8 }, region: EC }).subtotal).toBe(2000);
    // 2 kg reales, pero el minimo son 4 kg.
    expect(calculatePrice({ plan, input: { weight: 2 }, region: EC }).subtotal).toBe(1000);
  });

  it('suma tareas adicionales al subtotal', () => {
    const plan = { name: 'x', pricing_model: PRICING_MODELS.PER_HOUR, base_amount: 1100, config: {} };
    const result = calculatePrice({
      plan,
      input: { durationMinutes: 120 },
      extras: [
        { code: 'CLEAN-OVEN', label: 'Horno', amount: 800 },
        { code: 'CLEAN-WINDOWS', label: 'Ventanas', amount: 900 },
      ],
      region: EC,
    });

    expect(result.subtotal).toBe(2200 + 800 + 900);
    expect(result.lines).toHaveLength(3);
  });

  it('nunca deja el subtotal en negativo por un descuento excesivo', () => {
    const plan = { name: 'x', pricing_model: PRICING_MODELS.FIXED, base_amount: 1000, config: {} };
    const result = calculatePrice({ plan, region: EC, discountAmount: 99999 });

    expect(result.discount).toBe(1000);
    expect(result.subtotal).toBe(0);
    expect(result.total).toBe(0);
  });

  it('marca los servicios que requieren cotizacion previa', () => {
    const plan = { name: 'Arreglo', pricing_model: PRICING_MODELS.QUOTE, base_amount: 0, config: {} };
    const result = calculatePrice({ plan, region: EC });

    expect(result.requiresQuote).toBe(true);
    expect(result.total).toBe(0);
  });

  it('exige los datos que el modelo de precio necesita', () => {
    const plan = { name: 'x', pricing_model: PRICING_MODELS.PER_HOUR, base_amount: 1100, config: {} };
    expect(() => calculatePrice({ plan, input: {}, region: EC })).toThrow(/duracion/);
  });
});

describe('Timeline del cliente', () => {
  it('marca pasos completados, actual y pendientes', () => {
    const timeline = buildTimeline({
      stateMachine: cleaningStateMachine,
      currentStatus: 'IN_PROGRESS',
      history: [
        { to_status: 'REQUESTED', created_at: new Date('2026-08-01T10:00:00Z') },
        { to_status: 'PENDING_ASSIGNMENT', created_at: new Date('2026-08-01T10:01:00Z') },
        { to_status: 'ASSIGNED', created_at: new Date('2026-08-01T11:00:00Z') },
        { to_status: 'CONFIRMED', created_at: new Date('2026-08-01T11:05:00Z') },
        { to_status: 'ON_THE_WAY', created_at: new Date('2026-08-02T08:00:00Z') },
        { to_status: 'ARRIVED', created_at: new Date('2026-08-02T08:30:00Z') },
        { to_status: 'IN_PROGRESS', created_at: new Date('2026-08-02T08:35:00Z') },
      ],
    });

    const current = timeline.find((step) => step.state === 'CURRENT');
    expect(current.status).toBe('IN_PROGRESS');

    // Lo que ya paso lleva su marca de tiempo.
    expect(timeline.find((s) => s.status === 'ARRIVED').state).toBe('DONE');
    expect(timeline.find((s) => s.status === 'ARRIVED').at).toBeTruthy();

    // Lo que falta aparece como pendiente, para que el cliente sepa que viene.
    expect(timeline.find((s) => s.status === 'COMPLETED').state).toBe('PENDING');
  });

  it('muestra los estados excepcionales de forma explicita', () => {
    const timeline = buildTimeline({
      stateMachine: cleaningStateMachine,
      currentStatus: 'NO_ACCESS',
      history: [
        { to_status: 'REQUESTED', created_at: new Date() },
        { to_status: 'NO_ACCESS', created_at: new Date(), note: 'Nadie abrio' },
      ],
    });

    const exception = timeline.find((step) => step.state === 'EXCEPTION');
    expect(exception.status).toBe('NO_ACCESS');
    expect(exception.note).toBe('Nadie abrio');
  });
});

function formatLocalDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

describe('Politicas de reserva y cancelacion', () => {
  it('exige la antelacion minima de la region', () => {
    const enUnaHora = new Date(Date.now() + 3600_000);
    expect(() =>
      assertValidSchedule({
        scheduledDate: formatLocalDate(enUnaHora),
        windowStart: `${String(enUnaHora.getHours()).padStart(2, '0')}:00`,
        region: EC,
      }),
    ).toThrow(/antelacion/);
  });

  it('distingue cancelacion a tiempo de cancelacion tardia', () => {
    const manana = new Date(Date.now() + 48 * 3600_000);
    const aTiempo = evaluateCancellation({
      order: { scheduled_date: formatLocalDate(manana), scheduled_window_start: '08:00' },
      region: EC,
    });
    expect(aTiempo.late).toBe(false);

    const enDosHoras = new Date(Date.now() + 2 * 3600_000);
    const tardia = evaluateCancellation({
      order: {
        scheduled_date: formatLocalDate(enDosHoras),
        scheduled_window_start: `${String(enDosHoras.getHours()).padStart(2, '0')}:00`,
      },
      region: EC,
    });
    expect(tardia.late).toBe(true);
  });

  it('aplica el umbral de cada region', () => {
    // Ecuador 24 h, EE.UU. 48 h: la misma orden se juzga distinto.
    expect(EC.booking.freeCancellationHours).toBe(24);
    expect(US.booking.freeCancellationHours).toBe(48);
  });
});

describe('Configuracion regional', () => {
  it('no asume Ecuador en el formato de direccion', () => {
    expect(EC.address.labels.administrative_area).toBe('Provincia');
    expect(US.address.labels.administrative_area).toBe('State');
    expect(EC.address.postalCodeRequired).toBe(false);
    expect(US.address.required).toContain('postal_code');
  });

  it('separa moneda de region', () => {
    // Ambas usan USD hoy, pero el impuesto y las unidades difieren.
    expect(EC.currency.code).toBe('USD');
    expect(US.currency.code).toBe('USD');
    expect(EC.tax.rate).toBe(0.15);
    expect(US.tax.rate).toBe(0);
    expect(EC.units.weight).toBe('kg');
    expect(US.units.weight).toBe('lb');
  });
});

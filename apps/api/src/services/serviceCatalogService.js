'use strict';

const { db } = require('../db');
const serviceSettingsRepo = require('../db/repositories/serviceSettingsRepository');
const catalogRepo = require('../db/repositories/catalogRepository');
const audit = require('./auditService');
const { SERVICE_DEFINITIONS, getServiceDefinition } = require('../domain/shared/serviceTypes');
const { MODEL_PARAMETERS } = require('../domain/pricing/pricing');
const { DomainError, NotFoundError, ValidationError } = require('../domain/errors');

/**
 * Catalogo de servicios: dominio + configuracion comercial.
 *
 * Hay dos preguntas distintas que antes se confundian en una sola bandera:
 *
 *   implemented  ->  ¿existe el flujo en el codigo? (maquina de estados, tabla
 *                    de detalle, endpoint de reserva). Lo decide el dominio.
 *   active       ->  ¿lo estamos ofreciendo ahora? Lo decide Operaciones desde
 *                    la pantalla de configuracion.
 *
 * Un servicio solo se puede reservar si cumple las dos. Asi se puede apagar
 * limpieza un fin de semana sin tocar codigo, y arreglo de prendas puede
 * administrarse ya aunque su flujo aun no exista.
 */

/** Vista combinada de un tipo de servicio. */
function combine(definition, settings) {
  return {
    code: definition.code,
    // El nombre y la descripcion que ve el cliente los pone Operaciones; los
    // del dominio quedan como respaldo si nunca se configuraron.
    label: settings?.display_name ?? definition.label,
    description: settings?.description ?? definition.description,
    customerInfo: settings?.customer_info ?? null,
    icon: settings?.icon ?? null,
    imageUrl: settings?.image_url ?? null,
    displayOrder: settings?.display_order ?? 0,
    addressModel: definition.addressModel,
    implemented: definition.enabled,
    active: Boolean(settings?.active),
    // Reservable = implementado y ofrecido. Es lo unico que el frontend
    // necesita mirar para decidir si muestra el boton de reservar.
    bookable: definition.enabled && Boolean(settings?.active),
  };
}

async function listAll(tx = db) {
  const settings = await serviceSettingsRepo.list(tx);
  const byType = new Map(settings.map((row) => [row.service_type, row]));

  return Object.values(SERVICE_DEFINITIONS)
    .map((definition) => combine(definition, byType.get(definition.code)))
    .sort((a, b) => a.displayOrder - b.displayOrder || a.code.localeCompare(b.code));
}

/** Servicios que un cliente puede reservar hoy, con sus planes y extras. */
async function listBookable(regionCode) {
  const services = (await listAll()).filter((service) => service.bookable);

  return Promise.all(
    services.map(async (service) => ({
      ...service,
      plans: await catalogRepo.listPlans({ serviceType: service.code, regionCode }),
      extras: await catalogRepo.listExtras({ serviceType: service.code, regionCode }),
    })),
  );
}

/**
 * Vista de administracion: los tres servicios, ofrecidos o no, con sus planes
 * (incluidos los inactivos) y el descriptor del modelo de precio de cada plan.
 */
async function listForOperations(regionCode) {
  const services = await listAll();

  return Promise.all(
    services.map(async (service) => ({
      ...service,
      plans: (
        await catalogRepo.listPlans({
          serviceType: service.code,
          regionCode,
          includeInactive: true,
        })
      ).map((plan) => ({
        ...plan,
        pricing: MODEL_PARAMETERS[plan.pricing_model] ?? null,
      })),
    })),
  );
}

/**
 * Exige que el servicio se pueda reservar. Se llama al crear una orden, no solo
 * al pintar la pantalla: desactivar un servicio tiene que cerrar tambien la
 * puerta de la API.
 */
async function assertBookable(serviceType, tx = db) {
  const definition = getServiceDefinition(serviceType);

  if (!definition.enabled) {
    throw new DomainError('SERVICE_NOT_AVAILABLE', `${definition.label} todavia no esta disponible`, {
      serviceType,
    });
  }

  const settings = await serviceSettingsRepo.findByType(serviceType, tx);
  if (!settings?.active) {
    throw new DomainError(
      'SERVICE_NOT_ACTIVE',
      `${settings?.display_name ?? definition.label} no esta disponible en este momento`,
      { serviceType },
    );
  }

  return combine(definition, settings);
}

// ---------------------------------------------------------------------------
// Administracion
// ---------------------------------------------------------------------------

async function updateSettings({ serviceType, payload, actor, request }) {
  // Valida que el tipo exista en el dominio antes de tocar la base: no se
  // pueden configurar servicios que el codigo no implementa.
  getServiceDefinition(serviceType);

  const before = await serviceSettingsRepo.findByType(serviceType);
  if (!before) throw new NotFoundError('Configuracion de servicio', serviceType);

  const map = {
    active: 'active',
    displayName: 'display_name',
    description: 'description',
    customerInfo: 'customer_info',
    icon: 'icon',
    imageUrl: 'image_url',
    displayOrder: 'display_order',
  };

  const fields = {};
  for (const [key, column] of Object.entries(map)) {
    if (payload[key] !== undefined) fields[column] = payload[key];
  }

  return db.tx(async (tx) => {
    const after = await serviceSettingsRepo.update(serviceType, fields, actor.id, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.SERVICE_CONFIGURATION_UPDATED,
        entityType: 'service',
        entityId: serviceType,
        before: { active: before.active, displayName: before.display_name },
        after: { active: after.active, displayName: after.display_name },
        request,
      },
      tx,
    );

    return after;
  });
}

/**
 * Deja en `config` unicamente los parametros que el modelo de precio declara.
 *
 * El motor de precios lee `plan.config` sin preguntar. Si la pantalla pudiera
 * escribir claves libres, un `minimunHours` mal escrito se guardaria sin error
 * y el minimo dejaria de aplicarse en silencio: el cliente pagaria de menos y
 * nadie se enteraria. Por eso se valida contra el descriptor del modelo y se
 * descarta todo lo demas.
 */
function normalizePlanConfig(pricingModel, input = {}) {
  const descriptor = MODEL_PARAMETERS[pricingModel];
  if (!descriptor) {
    throw new DomainError('UNKNOWN_PRICING_MODEL', `Modelo de precio desconocido: ${pricingModel}`, {
      pricingModel,
    });
  }

  const issues = [];
  const config = {};

  for (const field of descriptor.fields) {
    const value = input[field.key];
    if (value === undefined || value === null || value === '') continue;

    if (field.type === 'number') {
      const parsed = Number(value);
      if (!Number.isFinite(parsed) || parsed < field.min || parsed > field.max) {
        issues.push({
          path: `config.${field.key}`,
          message: `${field.label}: se espera un numero entre ${field.min} y ${field.max}`,
        });
        continue;
      }
      config[field.key] = parsed;
    }

    if (field.type === 'enum') {
      if (!field.options.includes(value)) {
        issues.push({
          path: `config.${field.key}`,
          message: `${field.label}: valores admitidos ${field.options.join(', ')}`,
        });
        continue;
      }
      config[field.key] = value;
    }

    if (field.type === 'amountMap') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        issues.push({ path: `config.${field.key}`, message: `${field.label}: se espera un mapa de tramos` });
        continue;
      }

      const tiers = {};
      for (const [tier, amount] of Object.entries(value)) {
        const parsed = Number(amount);
        if (!Number.isInteger(parsed) || parsed < 0) {
          issues.push({
            path: `config.${field.key}.${tier}`,
            message: `${field.label}: los importes son enteros en centavos`,
          });
          continue;
        }
        tiers[tier] = parsed;
      }
      config[field.key] = tiers;
    }
  }

  if (issues.length > 0) {
    throw new ValidationError('Los parametros de precio no son validos', issues);
  }

  return { config, descriptor };
}

/**
 * Actualiza los parametros comerciales de un plan.
 *
 * El modelo de precio (`pricing_model`) NO se puede cambiar desde aqui: cada
 * modelo necesita datos distintos del cliente al reservar, asi que cambiarlo
 * romperia las reservas en curso. Es una decision de catalogo, no de pantalla.
 */
async function updatePlan({ serviceType, planId, payload, actor, request }) {
  const plan = await catalogRepo.findPlanById(planId);
  if (!plan || plan.service_type !== serviceType) {
    throw new NotFoundError('Plan de servicio', planId);
  }

  const { config, descriptor } = normalizePlanConfig(plan.pricing_model, payload.config ?? {});

  const fields = {};
  if (payload.name !== undefined) fields.name = payload.name;
  if (payload.description !== undefined) fields.description = payload.description;
  if (payload.active !== undefined) fields.active = payload.active;
  if (payload.displayOrder !== undefined) fields.display_order = payload.displayOrder;
  if (payload.estimatedDurationMinutes !== undefined) {
    fields.estimated_duration_minutes = payload.estimatedDurationMinutes;
  }
  // Los modelos sin importe base (tramos, cotizacion) lo mantienen en cero: no
  // se guarda un numero que el motor nunca va a leer.
  if (payload.baseAmount !== undefined && descriptor.amount) {
    fields.base_amount = payload.baseAmount;
  }
  if (payload.config !== undefined) {
    fields.config = { ...plan.config, ...config };
  }

  return db.tx(async (tx) => {
    const updated = await catalogRepo.updatePlan(planId, fields, tx);

    await audit.record(
      {
        actor,
        action: audit.ACTIONS.SERVICE_PLAN_UPDATED,
        entityType: 'service_plan',
        entityId: planId,
        before: { baseAmount: plan.base_amount, config: plan.config, active: plan.active },
        after: { baseAmount: updated.base_amount, config: updated.config, active: updated.active },
        metadata: { serviceType, code: plan.code },
        request,
      },
      tx,
    );

    return updated;
  });
}

// ---------------------------------------------------------------------------
// Opciones configurables (fragancias, y las que vengan)
// ---------------------------------------------------------------------------

/** Listas de opciones que hoy se sirven al cliente. Ver migracion 014. */
const OPTION_KINDS = Object.freeze({ FRAGRANCE: 'FRAGRANCE' });

/**
 * Opciones de una lista, para pintar un desplegable.
 *
 * Existe para que la fragancia deje de ser un campo de texto libre sin que eso
 * signifique un enum en el codigo: anadir "Vainilla" es una fila, no un
 * despliegue.
 */
async function listOptions({ kind, regionCode, serviceType = null }) {
  const options = await catalogRepo.listOptions({ kind, regionCode, serviceType });
  return options.map((option) => ({
    code: option.code,
    label: option.label,
    description: option.description,
  }));
}

/**
 * Valida un codigo de opcion contra el catalogo y devuelve el que se guardara.
 *
 * Que el codigo exista lo comprueba el catalogo y no un enum de Zod, porque la
 * lista es dato y no codigo. Vacio o ausente es valido -no elegir es una
 * respuesta-; lo que se rechaza es un codigo inventado, que acabaria en la
 * orden como una preferencia que nadie sabe servir.
 */
async function resolveOptionCode({ kind, code, regionCode }) {
  if (code === undefined || code === null || code === '') return null;

  const option = await catalogRepo.findOptionByCode({ kind, code, regionCode });
  if (!option) {
    throw new ValidationError('La opción seleccionada ya no está disponible.', {
      kind,
      code,
    });
  }

  return option.code;
}

module.exports = {
  OPTION_KINDS,
  listAll,
  listBookable,
  listForOperations,
  listOptions,
  resolveOptionCode,
  assertBookable,
  updateSettings,
  updatePlan,
  normalizePlanConfig,
};

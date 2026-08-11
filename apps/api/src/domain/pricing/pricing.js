'use strict';

const { DomainError } = require('../errors');

/**
 * Motor de precios.
 *
 * La investigacion de mercado mostro dos modelos incompatibles:
 *   - Quito: se cobra por hora (~$11/h) o por bloques ("$16 por 2 horas").
 *   - EE.UU.: se cobra plano segun tamano de la vivienda.
 *   - Lavanderia: por peso (Poplin ~$1/lb), por bolsa, o por prenda.
 *
 * Por eso el precio no es una columna sino una estrategia declarada en el
 * catalogo (`service_plans.pricing_model`). Anadir un modelo nuevo es anadir
 * una entrada a MODELS, sin tocar el resto del sistema.
 *
 * Todos los importes se manejan en la unidad menor de la moneda (centavos)
 * como enteros, para no arrastrar errores de coma flotante.
 */

const PRICING_MODELS = Object.freeze({
  PER_HOUR: 'PER_HOUR',
  FLAT_BY_SIZE: 'FLAT_BY_SIZE',
  PER_WEIGHT: 'PER_WEIGHT',
  PER_BAG: 'PER_BAG',
  PER_ITEM: 'PER_ITEM',
  FIXED: 'FIXED',
  QUOTE: 'QUOTE',
});

const round = (n) => Math.round(n);

/**
 * Cada estrategia recibe (plan, input) y devuelve las lineas base del precio.
 * `plan.config` es JSON libre definido por el catalogo.
 */
const MODELS = {
  /** Precio por hora. `input.durationMinutes` obligatorio. */
  [PRICING_MODELS.PER_HOUR]: (plan, input) => {
    const minutes = Number(input.durationMinutes);
    if (!Number.isFinite(minutes) || minutes <= 0) {
      throw new DomainError('PRICING_INPUT_REQUIRED', 'Se requiere la duracion del servicio', {
        field: 'durationMinutes',
      });
    }
    const hours = minutes / 60;
    const minHours = Number(plan.config?.minimumHours ?? 0);
    const billableHours = Math.max(hours, minHours);
    return [
      {
        code: 'BASE',
        label: `${billableHours} h de servicio`,
        quantity: billableHours,
        unitAmount: plan.base_amount,
        amount: round(plan.base_amount * billableHours),
      },
    ];
  },

  /** Precio plano segun tamano. `plan.config.tiers` mapea tamano -> importe. */
  [PRICING_MODELS.FLAT_BY_SIZE]: (plan, input) => {
    const tiers = plan.config?.tiers ?? {};
    const key = input.sizeTier;
    const amount = tiers[key];
    if (amount === undefined) {
      throw new DomainError('PRICING_INPUT_REQUIRED', 'Tamaño de vivienda no soportado', {
        field: 'sizeTier',
        allowed: Object.keys(tiers),
      });
    }
    return [{ code: 'BASE', label: `Tarifa ${key}`, quantity: 1, unitAmount: amount, amount }];
  },

  /**
   * Precio por peso. El peso real se conoce al pesar en planta, no al reservar,
   * asi que se admite una estimacion para mostrar un aproximado al cliente.
   */
  [PRICING_MODELS.PER_WEIGHT]: (plan, input) => {
    const weight = Number(input.weight ?? input.estimatedWeight);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new DomainError('PRICING_INPUT_REQUIRED', 'Se requiere el peso de la ropa', {
        field: 'weight',
      });
    }
    const minimumUnits = Number(plan.config?.minimumUnits ?? 0);
    const billable = Math.max(weight, minimumUnits);
    return [
      {
        code: 'BASE',
        label: `${billable} ${plan.config?.unit ?? 'kg'}`,
        quantity: billable,
        unitAmount: plan.base_amount,
        amount: round(plan.base_amount * billable),
      },
    ];
  },

  [PRICING_MODELS.PER_BAG]: (plan, input) => {
    const bags = Number(input.bagCount);
    if (!Number.isInteger(bags) || bags <= 0) {
      throw new DomainError('PRICING_INPUT_REQUIRED', 'Se requiere la cantidad de bolsas', {
        field: 'bagCount',
      });
    }
    return [
      {
        code: 'BASE',
        label: `${bags} bolsa(s)`,
        quantity: bags,
        unitAmount: plan.base_amount,
        amount: plan.base_amount * bags,
      },
    ];
  },

  [PRICING_MODELS.PER_ITEM]: (plan, input) => {
    const items = Number(input.itemCount);
    if (!Number.isInteger(items) || items <= 0) {
      throw new DomainError('PRICING_INPUT_REQUIRED', 'Se requiere la cantidad de prendas', {
        field: 'itemCount',
      });
    }
    return [
      {
        code: 'BASE',
        label: `${items} prenda(s)`,
        quantity: items,
        unitAmount: plan.base_amount,
        amount: plan.base_amount * items,
      },
    ];
  },

  [PRICING_MODELS.FIXED]: (plan) => [
    { code: 'BASE', label: plan.name, quantity: 1, unitAmount: plan.base_amount, amount: plan.base_amount },
  ],

  /** Servicios que requieren inspeccion previa (arreglo de prendas). */
  [PRICING_MODELS.QUOTE]: () => [],
};

/**
 * Calcula el desglose completo de una orden.
 *
 * @param {object} params
 * @param {object} params.plan       fila de service_plans
 * @param {object} params.input      datos de la orden (duracion, peso, tamano...)
 * @param {Array}  params.extras     tareas adicionales [{code,label,amount,quantity}]
 * @param {object} params.region     configuracion regional (impuesto, moneda)
 * @param {number} params.discountAmount descuento en centavos
 * @returns {{currency:string, lines:Array, subtotal:number, discount:number,
 *            taxRate:number, taxLabel:string, tax:number, total:number,
 *            requiresQuote:boolean}}
 */
function calculatePrice({ plan, input = {}, extras = [], region, discountAmount = 0 }) {
  const model = MODELS[plan.pricing_model];
  if (!model) {
    throw new DomainError('UNKNOWN_PRICING_MODEL', `Modelo de precio desconocido: ${plan.pricing_model}`, {
      pricingModel: plan.pricing_model,
    });
  }

  const requiresQuote = plan.pricing_model === PRICING_MODELS.QUOTE;
  const baseLines = model(plan, input);

  const extraLines = extras.map((extra) => ({
    code: extra.code ?? 'EXTRA',
    label: extra.label,
    quantity: extra.quantity ?? 1,
    unitAmount: extra.amount,
    amount: round(extra.amount * (extra.quantity ?? 1)),
  }));

  const lines = [...baseLines, ...extraLines];
  const gross = lines.reduce((sum, line) => sum + line.amount, 0);

  // El descuento nunca puede dejar el subtotal en negativo.
  const discount = Math.min(Math.max(round(discountAmount), 0), gross);
  const subtotal = gross - discount;

  const taxRate = region.tax.rate;
  const tax = region.tax.includedInDisplayedPrice ? 0 : round(subtotal * taxRate);

  return {
    currency: region.currency.code,
    lines,
    subtotal,
    discount,
    taxRate,
    taxLabel: region.tax.label,
    tax,
    total: subtotal + tax,
    requiresQuote,
  };
}

module.exports = { PRICING_MODELS, calculatePrice };

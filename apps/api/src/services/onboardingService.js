'use strict';

const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const staffRepo = require('../db/repositories/staffRepository');
const customerRepo = require('../db/repositories/customerRepository');
const profileService = require('./profileService');
const audit = require('./auditService');
const { ROLES } = require('../domain/shared/roles');
const { ConflictError } = require('../domain/errors');

/**
 * Onboarding: completar el perfil despues de entrar por primera vez.
 *
 * Dos ideas sostienen todo este modulo:
 *
 * 1. **El onboarding no cuelga de un rol, sino de un perfil.** Una misma
 *    persona puede ser trabajadora y clienta, y cada faceta se completa por
 *    separado. Por eso la marca `onboarding_completed_at` vive en
 *    `staff_profiles` y en `customer_profiles`, no en `users`: con una sola
 *    columna, terminar como trabajador daria por hecho lo del cliente.
 *
 * 2. **Solo se pregunta lo que falta.** Los pasos se calculan contra los datos
 *    que ya hay. Quien se registro con telefono no vuelve a escribirlo, y un
 *    ADMIN que no atiende ni contrata servicios no ve onboarding ninguno.
 *
 * El backend es la fuente de verdad: la pantalla puede saltarse, la marca en
 * base de datos no.
 */

const SCOPES = Object.freeze({ STAFF: 'STAFF', CUSTOMER: 'CUSTOMER' });

/**
 * Orden de resolucion cuando alguien tiene varias facetas pendientes.
 *
 * STAFF primero porque es la que bloquea trabajo real: un trabajador sin
 * presentacion ni foto no puede aparecer ante un cliente.
 */
const SCOPE_PRIORITY = Object.freeze([SCOPES.STAFF, SCOPES.CUSTOMER]);

/**
 * Definicion de los pasos.
 *
 * Cada campo declara donde vive (`key`, que es el mismo nombre que acepta
 * `PATCH /api/me/onboarding`), como pintarlo y si es obligatorio para dar el
 * perfil por completo. Es la unica lista: la pantalla no tiene su propia copia,
 * la pide.
 *
 * No se inventan campos: todos existen ya en el modelo. Documento de identidad,
 * fecha de nacimiento y direccion del trabajador no aparecen porque el dominio
 * no los tiene y el producto todavia no los necesita.
 */
const STEPS = Object.freeze({
  [SCOPES.STAFF]: [
    {
      code: 'PERSONAL',
      title: 'Tu información',
      description: 'Cómo te llamamos y cómo te localizamos.',
      fields: [
        { key: 'firstName', label: 'Nombres', type: 'text', required: true },
        { key: 'lastName', label: 'Apellidos', type: 'text', required: true },
        {
          key: 'phone',
          label: 'Teléfono',
          type: 'phone',
          required: true,
          hint: 'Lo usamos para coordinar los servicios del día.',
        },
      ],
    },
    {
      code: 'PROFESSIONAL',
      title: 'Tu perfil profesional',
      description: 'Esto es lo que ve el cliente antes de abrirte la puerta.',
      fields: [
        {
          key: 'displayName',
          label: 'Nombre de presentación',
          type: 'text',
          required: true,
          hint: 'El cliente ve este nombre, no tu apellido.',
        },
        {
          key: 'bio',
          label: 'Presentación',
          type: 'textarea',
          required: true,
          hint: 'Tu experiencia en una o dos frases.',
        },
        {
          key: 'skills',
          label: 'Habilidades',
          type: 'tags',
          required: false,
          hint: 'Planchado, limpieza de vidrios, cuidado de alfombras…',
        },
      ],
    },
    {
      code: 'PHOTO',
      title: 'Tu foto',
      description: 'Una cara conocida en la puerta tranquiliza más que un texto.',
      fields: [{ key: 'photo', label: 'Foto de perfil', type: 'photo', required: false }],
    },
  ],

  [SCOPES.CUSTOMER]: [
    {
      code: 'CONTACT',
      title: 'Tu información',
      description: 'Lo necesitamos para coordinar el día del servicio.',
      fields: [
        { key: 'firstName', label: 'Nombres', type: 'text', required: true },
        { key: 'lastName', label: 'Apellidos', type: 'text', required: true },
        {
          key: 'phone',
          label: 'Teléfono',
          type: 'phone',
          required: true,
          hint: 'Te avisamos por aquí cuando el profesional va en camino.',
        },
        {
          key: 'taxId',
          label: 'Cédula o RUC',
          type: 'text',
          required: false,
          hint: 'Solo si quieres factura.',
        },
      ],
    },
    {
      code: 'ADDRESS',
      title: 'Dónde prestamos el servicio',
      description: 'Marca el punto exacto en el mapa y corrige la dirección si hace falta.',
      // Este paso no se guarda con PATCH: usa las direcciones del cliente, que
      // ya tienen sus propias reglas (zona de cobertura, una predeterminada).
      fields: [{ key: 'address', label: 'Dirección principal', type: 'address', required: true }],
    },
    {
      code: 'PREFERENCES',
      title: 'Últimos detalles',
      description: 'Opcional, puedes cambiarlo cuando quieras.',
      fields: [
        { key: 'photo', label: 'Foto de perfil', type: 'photo', required: false },
        {
          key: 'marketingOptIn',
          label: 'Quiero recibir promociones y novedades',
          type: 'boolean',
          required: false,
        },
      ],
    },
  ],
});

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

function isBlank(value) {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  // Un booleano en false cuenta como pendiente: los unicos campos booleanos
  // obligatorios son de tipo "ya lo hiciste" —tener una direccion registrada—,
  // y ahi false significa exactamente que falta.
  if (typeof value === 'boolean') return value === false;
  return false;
}

/** Valores actuales de los campos del onboarding, con los que se calcula lo que falta. */
async function collectValues({ user, staff, customer, addressCount }) {
  return {
    firstName: user.first_name,
    lastName: user.last_name,
    phone: user.phone,
    displayName: staff?.display_name ?? null,
    bio: staff?.bio ?? null,
    skills: staff?.skills ?? [],
    taxId: customer?.tax_id ?? null,
    taxIdType: customer?.tax_id_type ?? null,
    marketingOptIn: customer?.marketing_opt_in ?? false,
    photo: staff?.photo_url ?? customer?.photo_url ?? null,
    // Booleano, no la direccion: el paso solo pregunta si ya hay alguna.
    address: addressCount > 0,
  };
}

/** Facetas que esta persona tiene y que todavia no ha dado por completas. */
function pendingScopes({ roles, staff, customer }) {
  const pending = [];
  if (roles.includes(ROLES.STAFF) && !staff?.onboarding_completed_at) pending.push(SCOPES.STAFF);
  if (roles.includes(ROLES.CUSTOMER) && !customer?.onboarding_completed_at) {
    pending.push(SCOPES.CUSTOMER);
  }
  return SCOPE_PRIORITY.filter((scope) => pending.includes(scope));
}

function missingFor(scope, values) {
  return STEPS[scope]
    .flatMap((step) => step.fields)
    .filter((field) => field.required && isBlank(values[field.key]))
    .map((field) => field.key);
}

/**
 * Pasos con el estado de cada campo.
 *
 * `pending` es lo que permite que la pantalla pregunte solo lo que falta y
 * muestre lo que ya sabemos como un dato confirmable, en lugar de un formulario
 * que hace repetir lo que la persona ya escribio al registrarse.
 */
function describeSteps(scope, values) {
  if (!scope) return [];

  return STEPS[scope].map((step) => {
    const fields = step.fields.map((field) => ({
      ...field,
      pending: isBlank(values[field.key]),
    }));
    return { ...step, fields, pending: fields.some((field) => field.pending) };
  });
}

/**
 * Estado completo del onboarding de una persona.
 *
 * `pending` es lo unico que mira la guarda de navegacion. Es cierto solo si
 * queda alguna faceta sin marcar Y le falta algun dato obligatorio: si no falta
 * nada, no se molesta a nadie con un formulario vacio.
 */
async function getState(userLike, tx = db) {
  const user = await userRepository.findById(userLike.id, tx);
  const roles = user.roles ?? [];

  const [staff, customer, addresses] = await Promise.all([
    roles.includes(ROLES.STAFF) ? staffRepo.findAdminProfile(user.id, tx) : null,
    roles.includes(ROLES.CUSTOMER) ? customerRepo.find(user.id, tx) : null,
    tx.one(
      'SELECT COUNT(*)::int AS total FROM addresses WHERE user_id = $1 AND archived_at IS NULL',
      [user.id],
    ),
  ]);

  const values = await collectValues({
    user,
    staff,
    customer,
    addressCount: addresses.total,
  });

  const scopes = pendingScopes({ roles, staff, customer });
  const scope = scopes[0] ?? null;
  const missing = scope ? missingFor(scope, values) : [];

  return {
    // Nunca bloquea a quien solo administra: no hay perfil que completar.
    pending: Boolean(scope) && missing.length > 0,
    scope,
    pendingScopes: scopes,
    steps: describeSteps(scope, values),
    values,
    missing,
    completedAt: {
      staff: staff?.onboarding_completed_at ?? null,
      customer: customer?.onboarding_completed_at ?? null,
    },
  };
}

/**
 * Resumen minimo que viaja en la sesion.
 *
 * El frontend necesita saber si tiene que redirigir en cuanto entra, sin una
 * peticion extra. Va dentro del usuario que devuelven login, refresh y /auth/me.
 */
async function summary(user, tx = db) {
  const state = await getState(user, tx);
  return { pending: state.pending, scope: state.scope };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Guarda un avance del onboarding.
 *
 * No tiene reglas propias: reutiliza el mismo camino que el perfil, con la
 * misma separacion entre lo que decide la persona y lo que decide la empresa.
 * Un `roles` o un `serviceTypes` en el cuerpo se rechaza aqui igual que alli.
 */
async function saveProgress({ user, payload, request }) {
  await profileService.updateProfile({ user, payload, request });
  return getState(user);
}

/**
 * Marca la faceta como completa.
 *
 * Se comprueba de nuevo en el servidor que no falte nada obligatorio: la
 * validacion de la pantalla es comodidad, no barrera.
 */
async function complete({ user, request }) {
  return db.tx(async (tx) => {
    const state = await getState(user, tx);

    if (!state.scope) {
      // Nada que completar: se responde el estado en lugar de un error, porque
      // volver a pulsar "Listo" no es un fallo del usuario.
      return state;
    }

    if (state.missing.length > 0) {
      throw new ConflictError('Todavía faltan datos obligatorios de tu perfil', {
        missing: state.missing,
      });
    }

    if (state.scope === SCOPES.STAFF) {
      await staffRepo.updateProfile(user.id, { onboarding_completed_at: new Date() }, tx);
    } else {
      await customerRepo.update(user.id, { onboarding_completed_at: new Date() }, tx);
    }

    await audit.record(
      {
        actor: user,
        action: audit.ACTIONS.ONBOARDING_COMPLETED,
        entityType: 'user',
        entityId: user.id,
        after: { scope: state.scope },
        request,
      },
      tx,
    );

    // Se recalcula: quien es trabajador y cliente a la vez encadena con la
    // siguiente faceta sin pasar por un estado intermedio inconsistente.
    return getState(user, tx);
  });
}

module.exports = { SCOPES, STEPS, getState, summary, saveProgress, complete };

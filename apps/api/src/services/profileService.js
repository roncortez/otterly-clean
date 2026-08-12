'use strict';

const { db } = require('../db');
const userRepository = require('../db/repositories/userRepository');
const staffRepo = require('../db/repositories/staffRepository');
const customerRepo = require('../db/repositories/customerRepository');
const uploadService = require('./uploadService');
const audit = require('./auditService');
const { ROLES } = require('../domain/shared/roles');
const { ForbiddenError } = require('../domain/errors');

/**
 * El perfil de la persona que ha iniciado sesion.
 *
 * Aqui vive la frontera entre lo que alguien puede cambiar de si mismo y lo que
 * solo decide la empresa. La regla es una y se aplica en un unico sitio:
 *
 *   SELF   datos personales y de presentacion: nombre, telefono, como quiere
 *          que le llamen los clientes, su biografia, sus habilidades, su foto.
 *   ADMIN  todo lo que tiene consecuencias operativas o de acceso: roles,
 *          estado de la cuenta, capacidades de servicio (service_types), zonas,
 *          verificacion, antecedentes, codigo de empleado, fecha de alta.
 *
 * Por eso este modulo NO expone ninguna ruta hacia esas columnas: no es que las
 * filtre "por si acaso", es que el mapa `SELF_EDITABLE` no las contiene. Un
 * trabajador no puede darse el rol ADMIN ni ampliarse las capacidades desde
 * aqui aunque las envie en el cuerpo de la peticion.
 */

/**
 * Campos que una persona puede cambiar de si misma.
 *
 * `target` dice en que tabla vive; `roles` restringe el campo a quien tenga ese
 * rol (la biografia solo tiene sentido para quien atiende clientes).
 */
const SELF_EDITABLE = Object.freeze({
  firstName: { target: 'user', column: 'first_name' },
  lastName: { target: 'user', column: 'last_name' },
  phone: { target: 'user', column: 'phone' },
  locale: { target: 'user', column: 'locale' },
  // Como se presenta ante el cliente. Es su nombre de cara al publico, no su
  // identidad legal: por eso lo elige el trabajador.
  displayName: { target: 'staff', column: 'display_name', roles: [ROLES.STAFF] },
  bio: { target: 'staff', column: 'bio', roles: [ROLES.STAFF] },
  // Descriptivo: no decide a quien se le asigna un servicio (eso lo hacen
  // service_types y las zonas, que son del ADMIN).
  skills: { target: 'staff', column: 'skills', roles: [ROLES.STAFF] },
  taxIdType: { target: 'customer', column: 'tax_id_type', roles: [ROLES.CUSTOMER] },
  taxId: { target: 'customer', column: 'tax_id', roles: [ROLES.CUSTOMER] },
  marketingOptIn: { target: 'customer', column: 'marketing_opt_in', roles: [ROLES.CUSTOMER] },
});

const SELF_EDITABLE_KEYS = Object.freeze(Object.keys(SELF_EDITABLE));

function hasRole(user, role) {
  return (user.roles ?? []).includes(role);
}

/** ¿Este campo esta al alcance de esta persona? */
function isEditableBy(user, key) {
  const definition = SELF_EDITABLE[key];
  if (!definition) return false;
  if (!definition.roles) return true;
  return definition.roles.some((role) => hasRole(user, role));
}

// ---------------------------------------------------------------------------
// Lectura
// ---------------------------------------------------------------------------

/**
 * Perfil completo de la persona autenticada.
 *
 * Incluye la ficha de trabajador solo si lo es, y la de cliente solo si lo es.
 * De la ficha de trabajador se devuelve tambien lo administrativo (verificacion,
 * capacidades) porque es SU propia informacion y necesita verla; lo que no
 * puede es cambiarla.
 */
async function getProfile(user, tx = db) {
  const fresh = await userRepository.findById(user.id, tx);

  const [staff, customer] = await Promise.all([
    hasRole(fresh, ROLES.STAFF) ? staffRepo.findAdminProfile(user.id, tx) : null,
    hasRole(fresh, ROLES.CUSTOMER) ? customerRepo.find(user.id, tx) : null,
  ]);

  return {
    user: {
      id: fresh.id,
      email: fresh.email,
      firstName: fresh.first_name,
      lastName: fresh.last_name,
      phone: fresh.phone,
      roles: fresh.roles,
      regionCode: fresh.region_code,
      locale: fresh.locale,
      status: fresh.status,
    },
    staff: staff
      ? {
          displayName: staff.display_name,
          bio: staff.bio,
          skills: staff.skills,
          photoUrl: staff.photo_url,
          // Solo lectura: lo gestiona Operaciones.
          employeeCode: staff.employee_code,
          serviceTypes: staff.service_types,
          verificationStatus: staff.verification_status,
          hiredAt: staff.hired_at,
          active: staff.active,
          onboardingCompletedAt: staff.onboarding_completed_at,
        }
      : null,
    customer: customer
      ? {
          taxIdType: customer.tax_id_type,
          taxId: customer.tax_id,
          marketingOptIn: customer.marketing_opt_in,
          photoUrl: customer.photo_url,
          onboardingCompletedAt: customer.onboarding_completed_at,
        }
      : null,
    photoUrl: staff?.photo_url ?? customer?.photo_url ?? null,
  };
}

// ---------------------------------------------------------------------------
// Escritura
// ---------------------------------------------------------------------------

/**
 * Reparte un payload entre las tablas que toca, descartando lo que no sea
 * modificable por esta persona.
 */
function splitPayload(user, payload) {
  const buckets = { user: {}, staff: {}, customer: {} };
  const rejected = [];

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (!SELF_EDITABLE[key]) {
      rejected.push(key);
      continue;
    }
    if (!isEditableBy(user, key)) {
      rejected.push(key);
      continue;
    }
    const { target, column } = SELF_EDITABLE[key];
    buckets[target][column] = value;
  }

  return { buckets, rejected };
}

/**
 * Aplica un cambio de perfil propio.
 *
 * Un campo desconocido o fuera del alcance de la persona no se ignora en
 * silencio: se responde 400. Ignorarlo dejaria creer al cliente que el cambio
 * se guardo, y ese malentendido es justo el que acaba en "creia que me habia
 * quitado el rol".
 */
async function updateProfile({ user, payload, request, tx = null }) {
  const { buckets, rejected } = splitPayload(user, payload);

  if (rejected.length > 0) {
    throw new ForbiddenError('Hay datos que solo puede modificar la empresa', {
      fields: rejected,
    });
  }

  const touchesSomething = Object.values(buckets).some(
    (bucket) => Object.keys(bucket).length > 0,
  );
  if (!touchesSomething) return getProfile(user, tx ?? db);

  const run = async (t) => {
    if (Object.keys(buckets.user).length > 0) {
      await userRepository.update(user.id, buckets.user, t);
    }
    if (Object.keys(buckets.staff).length > 0) {
      await staffRepo.ensureProfile(user.id, {}, t);
      await staffRepo.updateProfile(user.id, buckets.staff, t);
    }
    if (Object.keys(buckets.customer).length > 0) {
      await customerRepo.ensure(user.id, t);
      await customerRepo.update(user.id, buckets.customer, t);
    }

    await audit.record(
      {
        actor: user,
        action: audit.ACTIONS.PROFILE_UPDATED,
        entityType: 'user',
        entityId: user.id,
        after: { fields: Object.keys(payload) },
        request,
      },
      t,
    );

    return getProfile(user, t);
  };

  return tx ? run(tx) : db.tx(run);
}

// ---------------------------------------------------------------------------
// Foto de perfil
// ---------------------------------------------------------------------------

/**
 * Guarda la foto de perfil.
 *
 * La imagen no toca la base: se sube al almacenamiento y aqui solo quedan la
 * URL y el identificador del archivo. El identificador es lo que permite
 * reemplazarla y borrarla sin dejar huerfanos en la cuenta.
 *
 * La foto se escribe en TODAS las fichas de la persona (trabajador y/o
 * cliente): es la misma cara, y duplicar la decision llevaria a que un
 * ADMIN+STAFF acabe con dos fotos distintas segun por donde entre.
 */
async function setPhoto({ user, file, request }) {
  const [staff, customer] = await Promise.all([
    hasRole(user, ROLES.STAFF) ? staffRepo.findAdminProfile(user.id) : null,
    hasRole(user, ROLES.CUSTOMER) ? customerRepo.find(user.id) : null,
  ]);

  const previousPublicId = staff?.photo_public_id ?? customer?.photo_public_id ?? null;

  const uploaded = await uploadService.uploadProfilePhoto({
    userId: user.id,
    file,
    actor: user,
    request,
  });

  await db.tx(async (tx) => {
    if (hasRole(user, ROLES.STAFF)) {
      await staffRepo.ensureProfile(user.id, {}, tx);
      await staffRepo.updateProfile(
        user.id,
        { photo_url: uploaded.url, photo_public_id: uploaded.publicId },
        tx,
      );
    }
    if (hasRole(user, ROLES.CUSTOMER)) {
      await customerRepo.ensure(user.id, tx);
      await customerRepo.update(
        user.id,
        { photo_url: uploaded.url, photo_public_id: uploaded.publicId },
        tx,
      );
    }

    await audit.record(
      {
        actor: user,
        action: audit.ACTIONS.PROFILE_PHOTO_UPDATED,
        entityType: 'user',
        entityId: user.id,
        after: { publicId: uploaded.publicId },
        request,
      },
      tx,
    );
  });

  // La anterior se borra despues de que la nueva este guardada: si el borrado
  // falla, la persona conserva una foto valida en lugar de quedarse sin ninguna.
  if (previousPublicId && previousPublicId !== uploaded.publicId) {
    await uploadService.removeByPublicId(previousPublicId);
  }

  return { photoUrl: uploaded.url };
}

async function removePhoto({ user, request }) {
  const [staff, customer] = await Promise.all([
    hasRole(user, ROLES.STAFF) ? staffRepo.findAdminProfile(user.id) : null,
    hasRole(user, ROLES.CUSTOMER) ? customerRepo.find(user.id) : null,
  ]);

  const publicId = staff?.photo_public_id ?? customer?.photo_public_id ?? null;

  await db.tx(async (tx) => {
    if (staff) {
      await staffRepo.updateProfile(user.id, { photo_url: null, photo_public_id: null }, tx);
    }
    if (customer) {
      await customerRepo.update(user.id, { photo_url: null, photo_public_id: null }, tx);
    }
    await audit.record(
      {
        actor: user,
        action: audit.ACTIONS.PROFILE_PHOTO_UPDATED,
        entityType: 'user',
        entityId: user.id,
        before: { publicId },
        after: { publicId: null },
        request,
      },
      tx,
    );
  });

  if (publicId) await uploadService.removeByPublicId(publicId);

  return { photoUrl: null };
}

/** Comprobacion explicita para las rutas: nadie edita la foto de otra persona. */
function assertOwnProfile(actor, userId) {
  if (Number(actor.id) !== Number(userId)) {
    throw new ForbiddenError('Solo puedes modificar tu propio perfil');
  }
}

module.exports = {
  SELF_EDITABLE,
  SELF_EDITABLE_KEYS,
  isEditableBy,
  getProfile,
  updateProfile,
  setPhoto,
  removePhoto,
  assertOwnProfile,
};

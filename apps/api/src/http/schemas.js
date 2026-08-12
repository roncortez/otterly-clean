'use strict';

const { z } = require('zod');

/**
 * Esquemas de validación de la API.
 *
 * Se validan en el backend porque el frontend no es una barrera de seguridad.
 * Los enums se mantienen alineados con los CHECK de la base de datos.
 */

const id = z.coerce.number().int().positive();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato esperado: AAAA-MM-DD');
// E.164: hasta 15 dígitos con prefijo de país. Sirve para +593 y +1 por igual.
const phone = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Usa formato internacional, por ejemplo +593991234567')
  .optional()
  .nullable();

const password = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128);

// --- Autenticación ---------------------------------------------------------

const registerSchema = z.object({
  email: z.email('Correo inválido').max(255),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone,
  regionCode: z.enum(['EC', 'US']).optional(),
  locale: z.enum(['es', 'en']).optional(),
});

const loginSchema = z.object({
  email: z.email('Correo inválido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

const refreshSchema = z.object({ refreshToken: z.string().min(1) });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: password,
});

// --- Direcciones -----------------------------------------------------------

const addressSchema = z.object({
  label: z.string().trim().min(1).max(60).default('Casa'),
  regionCode: z.enum(['EC', 'US']).optional(),
  streetLine1: z.string().trim().min(1, 'La calle es obligatoria').max(200),
  streetLine2: z.string().trim().max(200).optional().nullable(),
  neighborhood: z.string().trim().max(120).optional().nullable(),
  city: z.string().trim().min(1, 'La ciudad es obligatoria').max(120),
  administrativeArea: z.string().trim().max(120).optional().nullable(),
  postalCode: z.string().trim().max(20).optional().nullable(),
  reference: z.string().trim().max(500).optional().nullable(),
  latitude: z.number().min(-90).max(90).optional().nullable(),
  longitude: z.number().min(-180).max(180).optional().nullable(),
  zoneId: id.optional().nullable(),
  isDefault: z.boolean().default(false),
});

// --- Detalle de limpieza ---------------------------------------------------

const petSchema = z.object({
  type: z.string().trim().max(40),
  count: z.number().int().min(1).max(20).default(1),
  name: z.string().trim().max(60).optional(),
  behavior: z.string().trim().max(200).optional(),
});

const cleaningDetailSchema = z.object({
  cleaningType: z.enum(['STANDARD', 'DEEP', 'MOVE_IN_OUT', 'POST_CONSTRUCTION']).default('STANDARD'),
  propertyType: z.enum(['HOUSE', 'APARTMENT', 'SUITE', 'OFFICE']).default('APARTMENT'),
  bedrooms: z.number().int().min(0).max(20).default(0),
  bathrooms: z.number().int().min(0).max(20).default(0),
  areaValue: z.number().positive().max(100000).optional().nullable(),
  areaUnit: z.enum(['m2', 'sqft']).optional().nullable(),
  sizeTier: z.string().trim().max(40).optional().nullable(),
  priorityAreas: z.array(z.string().trim().max(60)).max(20).default([]),

  suppliesProvidedBy: z.enum(['COMPANY', 'CUSTOMER']).default('COMPANY'),
  productPreferences: z.array(z.string().trim().max(60)).max(20).default([]),
  fragrancePreference: z.string().trim().max(60).optional().nullable(),

  customerPresent: z.boolean().default(true),
  accessMethod: z
    .enum(['CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER'])
    .default('CUSTOMER_OPENS'),
  accessInstructions: z.string().trim().max(1000).optional().nullable(),
  // Se cifra antes de guardarse. Ver services/crypto.js
  accessSecret: z.string().trim().max(500).optional().nullable(),
  parkingInstructions: z.string().trim().max(500).optional().nullable(),

  hasPets: z.boolean().default(false),
  pets: z.array(petSchema).max(10).default([]),
  petsSecured: z.boolean().optional().nullable(),
  petInstructions: z.string().trim().max(1000).optional().nullable(),

  delicateItems: z.string().trim().max(1000).optional().nullable(),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),
});

// --- Detalle de lavanderia -------------------------------------------------

const laundryDetailSchema = z.object({
  serviceVariant: z.enum(['WASH_AND_FOLD', 'WASH_ONLY', 'IRONING', 'DRY_CLEAN']).default('WASH_AND_FOLD'),
  pickupInstructions: z.string().trim().max(1000).optional().nullable(),
  deliveryDate: isoDate.optional().nullable(),
  deliveryWindowCode: z.string().trim().max(30).optional().nullable(),
  deliveryInstructions: z.string().trim().max(1000).optional().nullable(),

  estimatedBags: z.number().int().min(1).max(50).optional().nullable(),
  estimatedWeight: z.number().positive().max(500).optional().nullable(),
  weightUnit: z.enum(['kg', 'lb']).optional().nullable(),
  billingMode: z.enum(['PER_WEIGHT', 'PER_BAG', 'PER_ITEM', 'FIXED']).default('PER_WEIGHT'),

  washTemperature: z.enum(['COLD', 'WARM', 'HOT']).optional().nullable(),
  detergentPreference: z
    .enum(['STANDARD', 'HYPOALLERGENIC', 'FRAGRANCE_FREE', 'CUSTOMER_PROVIDED'])
    .optional()
    .nullable(),
  useFabricSoftener: z.boolean().default(true),
  useBleach: z.boolean().default(false),
  separateColors: z.boolean().default(true),
  dryingPreference: z.enum(['MACHINE', 'HANG_DRY', 'MIXED']).optional().nullable(),
  foldingPreference: z.string().trim().max(200).optional().nullable(),

  hangDryItems: z.string().trim().max(1000).optional().nullable(),
  delicateItems: z.string().trim().max(1000).optional().nullable(),
  doNotProcessItems: z.string().trim().max(1000).optional().nullable(),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),
});

// --- Ordenes ---------------------------------------------------------------

const pricingInputSchema = z.object({
  durationMinutes: z.number().int().min(30).max(1440).optional(),
  sizeTier: z.string().trim().max(40).optional(),
  weight: z.number().positive().max(500).optional(),
  estimatedWeight: z.number().positive().max(500).optional(),
  bagCount: z.number().int().min(1).max(50).optional(),
  itemCount: z.number().int().min(1).max(500).optional(),
});

const createOrderBase = {
  planId: id,
  addressId: id,
  deliveryAddressId: id.optional().nullable(),
  scheduledDate: isoDate,
  windowCode: z.string().trim().min(1).max(30),
  extraCodes: z.array(z.string().trim().max(40)).max(20).default([]),
  pricingInput: pricingInputSchema.default({}),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
};

const createCleaningOrderSchema = z.object({
  ...createOrderBase,
  cleaning: cleaningDetailSchema,
});

const createLaundryOrderSchema = z.object({
  ...createOrderBase,
  laundry: laundryDetailSchema,
});

const quoteSchema = z.object({
  planId: id,
  extraCodes: z.array(z.string().trim().max(40)).max(20).default([]),
  pricingInput: pricingInputSchema.default({}),
});

const transitionSchema = z.object({
  status: z.string().trim().min(1).max(40),
  note: z.string().trim().max(1000).optional().nullable(),
});

const cancelSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
});

// --- Operaciones -----------------------------------------------------------

const assignSchema = z.object({
  staffId: id,
  role: z.enum(['PRIMARY', 'SUPPORT', 'PICKUP', 'DELIVERY']).default('PRIMARY'),
  notes: z.string().trim().max(500).optional().nullable(),
});

const createStaffSchema = z.object({
  email: z.email('Correo invalido').max(255),
  password,
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone,
  displayName: z.string().trim().max(80).optional(),
  employeeCode: z.string().trim().max(40).optional(),
  bio: z.string().trim().max(1000).optional(),
  photoUrl: z.string().url().max(500).optional(),
  hiredAt: isoDate.optional(),
  skills: z.array(z.string().trim().max(40)).max(30).default([]),
  serviceTypes: z.array(z.enum(['CLEANING', 'LAUNDRY', 'ALTERATION'])).min(1),
  zoneIds: z.array(id).max(50).default([]),
  regionCode: z.enum(['EC', 'US']).optional(),
});

const updateStaffSchema = createStaffSchema
  .omit({ email: true, password: true, serviceTypes: true })
  .extend({
    serviceTypes: z.array(z.enum(['CLEANING', 'LAUNDRY', 'ALTERATION'])).optional(),
    backgroundCheckStatus: z.enum(['NOT_STARTED', 'PENDING', 'CLEARED', 'FLAGGED']).optional(),
  })
  .partial();

const verificationSchema = z.object({
  status: z.enum(['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED']),
});

const incidentSchema = z.object({
  category: z.enum([
    'NO_ACCESS',
    'DAMAGE',
    'MISSING_ITEM',
    'CUSTOMER_ABSENT',
    'UNSAFE_CONDITIONS',
    'INCOMPLETE_SERVICE',
    'EQUIPMENT',
    'OTHER',
  ]),
  severity: z.enum(['LOW', 'MEDIUM', 'HIGH']).default('MEDIUM'),
  description: z.string().trim().min(1, 'Describe lo ocurrido').max(2000),
  attachments: z.array(z.string().url().max(500)).max(10).default([]),
});

const resolveIncidentSchema = z.object({
  status: z.enum(['IN_REVIEW', 'RESOLVED', 'DISMISSED']).default('RESOLVED'),
  resolution: z.string().trim().max(2000).optional().nullable(),
});

// --- Bolsas de lavanderia --------------------------------------------------

const bagSchema = z.object({
  label: z.string().trim().max(60).optional().nullable(),
  weight: z.number().positive().max(100).optional().nullable(),
  weightUnit: z.enum(['kg', 'lb']).optional().nullable(),
  contentsSummary: z.string().trim().max(500).optional().nullable(),
  itemCount: z.number().int().min(1).max(500).optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

const bagStatusSchema = z.object({
  status: z.enum(['REGISTERED', 'PICKED_UP', 'RECEIVED', 'PROCESSING', 'READY', 'DELIVERED', 'LOST']),
  weight: z.number().positive().max(100).optional().nullable(),
});

// --- Configuracion administrable -------------------------------------------

const serviceTypeEnum = z.enum(['CLEANING', 'LAUNDRY', 'ALTERATION']);
const roleEnum = z.enum(['CUSTOMER', 'STAFF', 'ADMIN']);

/**
 * Datos publicos de la empresa.
 *
 * Los enlaces se validan como URL para que no acaben en el frontend cadenas
 * que el navegador interprete de forma rara (`javascript:` y similares). Se
 * admite cadena vacia porque "sin configurar" es un estado legitimo.
 */
const optionalUrl = z.union([z.string().url().max(500), z.literal('')]).optional();
const optionalText = (max) => z.string().trim().max(max).optional();

const companySettingsSchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre comercial es obligatorio').max(120).optional(),
    tagline: optionalText(200),
    logoUrl: optionalUrl,
    iconUrl: optionalUrl,
    // Contacto: se admite vacio para poder retirar un canal.
    phone: z.union([z.string().regex(/^\+[1-9]\d{6,14}$/, 'Usa formato internacional'), z.literal('')]).optional(),
    whatsapp: z.union([z.string().regex(/^\+[1-9]\d{6,14}$/, 'Usa formato internacional'), z.literal('')]).optional(),
    whatsappMessage: optionalText(300),
    telegram: optionalText(120),
    email: z.union([z.email('Correo invalido').max(255), z.literal('')]).optional(),
    address: optionalText(300),
    website: optionalUrl,
    instagram: optionalUrl,
    facebook: optionalUrl,
    supportHours: optionalText(160),
  })
  // Sin campos extra: evita que la pantalla acabe guardando basura en el JSONB.
  .strict();

/**
 * Configuracion comercial de un servicio.
 * El tipo de servicio no viaja en el cuerpo: va en la ruta y siempre es uno de
 * los tres conocidos.
 */
const serviceSettingsSchema = z
  .object({
    active: z.boolean().optional(),
    displayName: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    customerInfo: z.string().trim().max(2000).optional().nullable(),
    icon: z.string().trim().max(60).optional().nullable(),
    imageUrl: z.union([z.string().url().max(500), z.literal('')]).optional().nullable(),
    displayOrder: z.number().int().min(0).max(99).optional(),
  })
  .strict();

/**
 * Parametros comerciales de un plan.
 *
 * `pricing_model` NO esta aqui a proposito: cambiarlo exigiria datos distintos
 * del cliente al reservar. `config` se valida en forma aqui y en contenido en
 * serviceCatalogService, contra el descriptor del modelo real del plan.
 */
const servicePlanSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    // Importes en centavos, enteros: nunca coma flotante para dinero.
    baseAmount: z.number().int().min(0).max(10_000_000).optional(),
    estimatedDurationMinutes: z.number().int().min(0).max(1440).optional().nullable(),
    active: z.boolean().optional(),
    displayOrder: z.number().int().min(0).max(99).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

/** Fecha 'AAAA-MM-DD' o fecha y hora locales 'AAAA-MM-DDTHH:MM'. */
const localDateTime = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/, 'Formato esperado: AAAA-MM-DD o AAAA-MM-DDTHH:MM');

const blackoutSchema = z.object({
  // null / ausente = bloqueo global para todos los servicios.
  serviceType: serviceTypeEnum.optional().nullable(),
  startsAt: localDateTime,
  endsAt: localDateTime.optional().nullable(),
  allDay: z.boolean().default(false),
  reason: z.string().trim().max(300).optional().nullable(),
  regionCode: z.enum(['EC', 'US']).optional(),
});

const updateBlackoutSchema = z.object({
  serviceType: serviceTypeEnum.optional().nullable(),
  startsAt: localDateTime.optional(),
  endsAt: localDateTime.optional().nullable(),
  allDay: z.boolean().optional(),
  reason: z.string().trim().max(300).optional().nullable(),
  active: z.boolean().optional(),
});

const availabilityQuerySchema = z.object({
  serviceType: serviceTypeEnum.optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  region: z.enum(['EC', 'US']).optional(),
});

/**
 * Roles de una persona.
 *
 * Se envia el conjunto completo, no operaciones sueltas: el estado final queda
 * explicito y dos administradores editando a la vez no producen un resultado
 * que ninguno pidio. La proteccion del ultimo ADMIN se aplica en el servicio,
 * dentro de la transaccion.
 */
const updateRolesSchema = z.object({
  roles: z.array(roleEnum).min(1, 'Debes asignar al menos un rol').max(3),
});

const serviceTypeParamSchema = z.object({ serviceType: serviceTypeEnum });

const planParamSchema = z.object({ serviceType: serviceTypeEnum, planId: id });

// --- Consultas -------------------------------------------------------------

const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const orderQuerySchema = paginationSchema.extend({
  serviceType: z.enum(['CLEANING', 'LAUNDRY', 'ALTERATION']).optional(),
  status: z.string().trim().max(40).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  scheduledDate: isoDate.optional(),
  unassignedOnly: z.coerce.boolean().optional(),
  activeOnly: z.coerce.boolean().optional(),
  search: z.string().trim().max(100).optional(),
});

const idParamSchema = z.object({ id });

const userQuerySchema = paginationSchema.extend({
  role: roleEnum.optional(),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']).optional(),
  search: z.string().trim().max(100).optional(),
});

module.exports = {
  idParamSchema,
  paginationSchema,
  orderQuerySchema,
  userQuerySchema,
  companySettingsSchema,
  serviceSettingsSchema,
  servicePlanSchema,
  serviceTypeParamSchema,
  planParamSchema,
  blackoutSchema,
  updateBlackoutSchema,
  availabilityQuerySchema,
  updateRolesSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  addressSchema,
  createCleaningOrderSchema,
  createLaundryOrderSchema,
  quoteSchema,
  transitionSchema,
  cancelSchema,
  assignSchema,
  createStaffSchema,
  updateStaffSchema,
  verificationSchema,
  incidentSchema,
  resolveIncidentSchema,
  bagSchema,
  bagStatusSchema,
};

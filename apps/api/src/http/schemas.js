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

const roleEnum = z.enum(['CUSTOMER', 'STAFF', 'ADMIN']);
const serviceTypeEnum = z.enum(['CLEANING', 'LAUNDRY', 'KITS', 'ALTERATION']);

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

/**
 * Activacion de una cuenta invitada.
 *
 * El token viaja en la ruta y se valida contra su hash; aqui solo se comprueba
 * que tenga la forma que emite `crypto.randomToken` para descartar basura antes
 * de tocar la base.
 */
const invitationTokenParamSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{32,128}$/, 'Invitación no válida'),
});

const acceptInvitationSchema = z.object({ password });

// --- Direcciones -----------------------------------------------------------

/**
 * Direccion del cliente.
 *
 * Dos bloques que no se confunden: la ubicacion (coordenada y referencia del
 * lugar que devolvio el geocodificador) y la direccion escrita, que el cliente
 * corrige a mano porque ningun proveedor conoce urbanizaciones, conjuntos ni
 * "junto al parque".
 */
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
  // Identificador del lugar elegido en el mapa y quien lo emitio. Se conservan
  // como referencia, pero la direccion tiene que seguir sirviendo sin ellos, y
  // por eso ninguno es obligatorio. El nombre no menciona al proveedor de turno:
  // cambiarlo no puede obligar a migrar la base (ver migracion 010).
  providerPlaceId: z.string().trim().max(255).optional().nullable(),
  geocodingProvider: z.string().trim().max(40).toUpperCase().optional().nullable(),
  zoneId: id.optional().nullable(),
  isDefault: z.boolean().default(false),
});

/**
 * Edicion de una direccion.
 *
 * Todo opcional a proposito: corregir el texto sin mover el pin y mover el pin
 * sin reescribir el texto son dos operaciones legitimas y frecuentes.
 */
const updateAddressSchema = z
  .object({
    label: z.string().trim().min(1).max(60).optional(),
    streetLine1: z.string().trim().min(1, 'La calle es obligatoria').max(200).optional(),
    streetLine2: z.string().trim().max(200).optional().nullable(),
    neighborhood: z.string().trim().max(120).optional().nullable(),
    city: z.string().trim().min(1, 'La ciudad es obligatoria').max(120).optional(),
    administrativeArea: z.string().trim().max(120).optional().nullable(),
    postalCode: z.string().trim().max(20).optional().nullable(),
    reference: z.string().trim().max(500).optional().nullable(),
    latitude: z.number().min(-90).max(90).optional().nullable(),
    longitude: z.number().min(-180).max(180).optional().nullable(),
    providerPlaceId: z.string().trim().max(255).optional().nullable(),
    geocodingProvider: z.string().trim().max(40).toUpperCase().optional().nullable(),
    zoneId: id.optional().nullable(),
    isDefault: z.boolean().optional(),
  })
  .strict()
  // Se escribe entero en lugar de derivarlo de `addressSchema` con `.partial()`
  // justamente por esto: alli `label` e `isDefault` tienen valor por defecto, y
  // un PATCH vacio habria "corregido" la etiqueta de la direccion a "Casa".
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que actualizar',
  });

// --- Inmuebles -------------------------------------------------------------

const propertyTypeEnum = z.enum(['HOUSE', 'APARTMENT', 'SUITE', 'OFFICE']);

// Mascota del detalle de limpieza; tambien la usan los inmuebles para guardar
// el perfil persistente de acceso.
const petSchema = z.object({
  type: z.string().trim().max(40),
  count: z.number().int().min(1).max(20).default(1),
  name: z.string().trim().max(60).optional(),
  behavior: z.string().trim().max(200).optional(),
});

/**
 * Lugar de limpieza del cliente.
 *
 * El lugar es el perfil de lo que limpiamos, y vive en una direccion. El
 * domicilio (calle, coordenadas, cobertura) se guarda en `addresses` y aqui
 * solo lo que describe al espacio y el acceso. Por eso se referencia por
 * `addressId` o se crea la direccion al vuelo (campo `address`); el texto
 * nunca se copia. Los campos de acceso espejan cleaning_details: el lugar es el
 * perfil persistente y cada orden copia su snapshot al confirmar.
 */
const propertyAccessFields = {
  // Se cifra antes de guardarse. Ver services/crypto.js
  accessCode: z.string().trim().max(200).optional().nullable(),
  /**
   * Instrucciones fijas del lugar ("el timbre no funciona, llamar al llegar").
   *
   * Se llama igual que en el detalle de la reserva a proposito: es el mismo dato
   * y tener dos nombres para el es lo que hacia que el que escribia el cliente
   * al reservar se perdiera. La columna sigue siendo `properties.notes`; `notes`
   * se acepta como alias heredado por los clientes que aun lo envian.
   */
  specialInstructions: z.string().trim().max(1000).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
  accessMethod: z
    .enum(['CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER'])
    .optional()
    .nullable(),
  accessInstructions: z.string().trim().max(1000).optional().nullable(),
  parkingInstructions: z.string().trim().max(500).optional().nullable(),
  customerPresent: z.boolean().optional(),
  hasPets: z.boolean().optional(),
  pets: z.array(petSchema).max(10).optional(),
  petsSecured: z.boolean().optional().nullable(),
  petInstructions: z.string().trim().max(1000).optional().nullable(),
  delicateItems: z.string().trim().max(1000).optional().nullable(),
  // El tamano es del lugar, no de la visita (ver migracion 012).
  areaValue: z.number().positive().max(100000).optional().nullable(),
  areaUnit: z.enum(['m2', 'sqft']).optional().nullable(),
};

const propertySchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(80),
    propertyType: propertyTypeEnum.default('APARTMENT'),
    bedrooms: z.number().int().min(0).max(20).default(1),
    bathrooms: z.number().int().min(0).max(20).default(1),
    ...propertyAccessFields,
    // Solo sirve para marcarlo; nunca para desmarcarlo. Quitar el
    // predeterminado dejando lugares sin ninguno no es un estado que la
    // aplicacion sepa leer, asi que se cambia marcando otro (ver propertyService).
    isDefault: z.boolean().optional(),
    addressId: id.optional().nullable(),
    address: addressSchema.optional(),
  })
  .refine((value) => value.addressId || value.address, {
    message: 'El lugar necesita una dirección guardada o una dirección nueva',
  });

/**
 * Actualizacion parcial del lugar (PATCH): los mismos campos descriptivos y de
 * acceso, sin `addressId`/`address`. El lugar vive en una direccion y esa
 * pertenencia no se cambia aqui; si hay que moverlo, se crea otro.
 */
const updatePropertySchema = z
  .object({
    name: z.string().trim().min(1, 'El nombre es obligatorio').max(80).optional(),
    propertyType: propertyTypeEnum.optional(),
    bedrooms: z.number().int().min(0).max(20).optional(),
    bathrooms: z.number().int().min(0).max(20).optional(),
    ...propertyAccessFields,
    isDefault: z.boolean().optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'No hay nada que actualizar',
  });

// --- Detalle de limpieza ---------------------------------------------------

/**
 * Detalle de limpieza de una reserva.
 *
 * Dos mitades con reglas distintas, y la frontera la define el dominio
 * (`domain/cleaning/placeProfile.js`), no este archivo:
 *
 *   * **Lo de la visita** (tipo de limpieza, areas prioritarias, si estaras en
 *     casa) se pregunta cada vez y por eso conserva sus valores por defecto.
 *   * **Lo del lugar** (habitaciones, banos, acceso, mascotas) es opcional
 *     *a proposito*: si el cliente ya lo dijo, la reserva no lo repite y el
 *     backend lo toma del lugar guardado. Un `default(0)` aqui volveria a
 *     escribir "cero habitaciones" en cada reserva que no lo mencione, que es
 *     exactamente el fallo que se viene a arreglar.
 *
 * Enviarlos sigue siendo valido: lo que llega manda sobre lo guardado.
 */
const cleaningDetailSchema = z.object({
  // --- De esta visita -----------------------------------------------------
  cleaningType: z
    .enum(['EXPRESS', 'STANDARD', 'DEEP', 'MOVE_IN_OUT', 'POST_CONSTRUCTION'])
    .default('STANDARD'),
  sizeTier: z.string().trim().max(40).optional().nullable(),
  priorityAreas: z.array(z.string().trim().max(60)).max(20).default([]),
  suppliesProvidedBy: z.enum(['COMPANY', 'CUSTOMER']).default('COMPANY'),
  productPreferences: z.array(z.string().trim().max(60)).max(20).default([]),
  /**
   * Codigo del catalogo de fragancias (`catalog_options`, kind FRAGRANCE).
   *
   * Era texto libre de 60 caracteres, y por eso "lavanda", "Lavanda" y "el que
   * huela rico" eran tres preferencias distintas para quien tiene que elegir el
   * producto. No es un enum de Zod porque la lista la administra Operaciones
   * desde la base: el servicio la valida contra el catalogo, que es quien la
   * tiene. Ver migracion 014.
   */
  fragrancePreference: z.string().trim().max(40).optional().nullable(),
  customerPresent: z.boolean().default(true),
  // Si las mascotas estaran encerradas ESE dia; que existan es del espacio.
  petsSecured: z.boolean().optional().nullable(),
  delicateItems: z.string().trim().max(1000).optional().nullable(),

  // --- Del espacio: se heredan de su ficha si no vienen --------------------
  propertyType: z.enum(['HOUSE', 'APARTMENT', 'SUITE', 'OFFICE']).optional(),
  bedrooms: z.number().int().min(0).max(20).optional(),
  bathrooms: z.number().int().min(0).max(20).optional(),
  areaValue: z.number().positive().max(100000).optional().nullable(),
  areaUnit: z.enum(['m2', 'sqft']).optional().nullable(),
  accessMethod: z
    .enum(['CUSTOMER_OPENS', 'KEY', 'DOOR_CODE', 'CONCIERGE', 'LOCKBOX', 'OTHER'])
    .optional(),
  accessInstructions: z.string().trim().max(1000).optional().nullable(),
  // Se cifra antes de guardarse. Ver services/crypto.js
  accessSecret: z.string().trim().max(500).optional().nullable(),
  parkingInstructions: z.string().trim().max(500).optional().nullable(),
  hasPets: z.boolean().optional(),
  pets: z.array(petSchema).max(10).optional(),
  petInstructions: z.string().trim().max(1000).optional().nullable(),
  // Instrucciones fijas del lugar. En la ficha del espacio se llama `notes`.
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
  /**
   * Codigo del catalogo de fragancias (`catalog_options`, kind FRAGRANCE).
   *
   * No es un enum de Zod a proposito: la lista la administra Operaciones desde
   * la base y anadir "Vainilla" no puede exigir un despliegue. La validacion de
   * que el codigo existe y esta activo la hace el servicio contra el catalogo,
   * que es quien tiene la lista; aqui solo se comprueba la forma.
   */
  fragranceCode: z.string().trim().max(40).optional().nullable(),
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
  // Referencia opcional al inmueble persistido. El servidor la valida (que sea
  // del cliente y de la direccion de la orden); si no viene, vincula el que la
  // direccion ya tenga. La identidad del espacio siempre viaja en `cleaning`
  // (snapshot), aqui solo se enlaza para trazabilidad.
  propertyId: id.optional().nullable(),
  deliveryAddressId: id.optional().nullable(),
  scheduledDate: isoDate,
  windowCode: z.string().trim().min(1).max(30),
  extraCodes: z.array(z.string().trim().max(40)).max(20).default([]),
  pricingInput: pricingInputSchema.default({}),
  customerNotes: z.string().trim().max(2000).optional().nullable(),
};

const createCleaningOrderSchema = z.object({
  ...createOrderBase,
  // Reservar en un espacio ya descrito no necesita bloque de detalle: los datos
  // del lugar salen de su ficha y el resto tiene valores por defecto.
  cleaning: cleaningDetailSchema.default({}),
});

const createLaundryOrderSchema = z.object({
  ...createOrderBase,
  laundry: laundryDetailSchema,
});

// --- Detalle de kits -------------------------------------------------------

/**
 * Detalle de una orden de kits de limpieza.
 *
 * El plan ya comunica que kit se eligio (Kit Basico / Kit Completo). Aqui solo
 * se guarda la cantidad y las instrucciones de entrega.
 */
const kitDetailSchema = z.object({
  quantity: z.number().int().min(1).max(20).default(1),
  deliveryInstructions: z.string().trim().max(1000).optional().nullable(),
  specialInstructions: z.string().trim().max(2000).optional().nullable(),
});

const createKitOrderSchema = z.object({
  ...createOrderBase,
  kits: kitDetailSchema,
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

/**
 * Alta de un trabajador.
 *
 * Solo lo que la empresa sabe y decide: a quien contrata, como localizarlo,
 * que roles tiene, que servicios puede atender y si la cuenta esta activa.
 *
 * No hay `password`: la cuenta nace sin contrasena utilizable y se activa con
 * una invitacion. Tampoco hay biografia, foto ni nombre de presentacion: eso lo
 * completa el trabajador en su onboarding, y pedirselo al ADMIN significaba que
 * alguien escribia por el datos que son suyos.
 */
const createStaffFields = z.object({
  email: z.email('Correo invalido').max(255),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  phone,
  roles: z.array(roleEnum).min(1).max(3).optional(),
  employeeCode: z.string().trim().max(40).optional(),
  hiredAt: isoDate.optional(),
  serviceTypes: z.array(serviceTypeEnum).min(1, 'Elige al menos un servicio que pueda atender'),
  zoneIds: z.array(id).max(50).default([]),
  active: z.boolean().default(true),
  regionCode: z.enum(['EC', 'US']).optional(),
});

const createStaffSchema = createStaffFields
  // Estricto: un `password` o un `bio` en el cuerpo no se descartan en
  // silencio. Quien los envia cree que va a fijar la contrasena o la
  // presentacion del trabajador, y tiene que enterarse de que no es asi.
  .strict();

const updateStaffSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone,
    employeeCode: z.string().trim().max(40).optional(),
    hiredAt: isoDate.optional(),
    serviceTypes: z.array(z.enum(['CLEANING', 'LAUNDRY', 'ALTERATION'])).optional(),
    zoneIds: z.array(id).max(50).optional(),
    backgroundCheckStatus: z.enum(['NOT_STARTED', 'PENDING', 'CLEARED', 'FLAGGED']).optional(),
  })
  // Estricto: si llega `bio`, `photoUrl` o `roles` es que alguien espera poder
  // cambiarlos desde aqui, y debe enterarse de que no es asi.
  .strict();

const verificationSchema = z.object({
  status: z.enum(['PENDING', 'IN_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED']),
});

// --- Perfil propio y onboarding --------------------------------------------

/**
 * Lo que una persona puede cambiar de si misma.
 *
 * `.strict()` no es una precaucion cosmetica: es la barrera que hace que
 * `{"roles": ["ADMIN"]}` en el cuerpo de `PATCH /api/me/profile` responda 400 en
 * lugar de guardarse. El servicio vuelve a comprobarlo por rol, porque una sola
 * defensa nunca es suficiente para algo asi.
 */
const selfProfileSchema = z
  .object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    phone,
    locale: z.enum(['es', 'en']).optional(),
    // Solo tiene efecto para quien es STAFF; el servicio lo comprueba.
    displayName: z.string().trim().min(1).max(80).optional(),
    bio: z.string().trim().max(1000).optional().nullable(),
    skills: z.array(z.string().trim().min(1).max(40)).max(30).optional(),
    // Solo para quien es CUSTOMER.
    taxIdType: z.enum(['RUC', 'CEDULA', 'SSN', 'EIN']).optional().nullable(),
    taxId: z.string().trim().max(20).optional().nullable(),
    marketingOptIn: z.boolean().optional(),
  })
  .strict();

const onboardingPatchSchema = selfProfileSchema;

/**
 * Reporte de una incidencia: que paso, contado por quien lo vivio.
 *
 * `severity` NO esta aqui, y es estricto para que su ausencia se note: quien
 * envie una gravedad recibe un 400 en lugar de creer que la fijo. Clasificar es
 * una decision de Operaciones (`classifyIncidentSchema`).
 */
const incidentSchema = z
  .object({
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
    description: z.string().trim().min(1, 'Describe lo ocurrido').max(2000),
    attachments: z.array(z.string().url().max(500)).max(10).default([]),
  })
  .strict();

/** Clasificacion administrativa. Solo cuelga de /api/operations. */
const classifyIncidentSchema = z
  .object({
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    note: z.string().trim().max(500).optional().nullable(),
  })
  .strict();

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

/**
 * Destino de una imagen.
 *
 * Los valores salen del catalogo del servicio de subida, que es cerrado: la
 * carpeta y el nombre del archivo nunca vienen de la peticion.
 */
const { SLOT_CODES } = require('../services/uploadService');
const uploadSlotParamSchema = z.object({ slot: z.enum(SLOT_CODES) });

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
  uploadSlotParamSchema,
  blackoutSchema,
  updateBlackoutSchema,
  availabilityQuerySchema,
  updateRolesSchema,
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  invitationTokenParamSchema,
  acceptInvitationSchema,
  selfProfileSchema,
  onboardingPatchSchema,
  addressSchema,
  updateAddressSchema,
  propertySchema,
  updatePropertySchema,
  createCleaningOrderSchema,
  createLaundryOrderSchema,
  createKitOrderSchema,
  quoteSchema,
  transitionSchema,
  cancelSchema,
  assignSchema,
  createStaffSchema,
  updateStaffSchema,
  verificationSchema,
  incidentSchema,
  classifyIncidentSchema,
  resolveIncidentSchema,
  bagSchema,
  bagStatusSchema,
};

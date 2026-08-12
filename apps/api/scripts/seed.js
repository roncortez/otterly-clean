'use strict';

/**
 * Datos iniciales.
 *
 * Los precios reflejan el mercado real de Quito investigado antes de
 * implementar: la limpieza doméstica se cobra por hora (~$11/h) o en bloques
 * ("$16 por 2 horas"), no plano por tamaño como en EE.UU. Por eso el plan de
 * Ecuador usa PER_HOUR con mínimo de horas, y se deja un plan de ejemplo con
 * FLAT_BY_SIZE en la región US para demostrar que el motor soporta ambos.
 *
 * Importes en centavos.
 */

const bcrypt = require('bcryptjs');
const { db, pgp } = require('../src/db');
const env = require('../src/config/env');

const hash = (plain) => bcrypt.hash(plain, env.auth.bcryptRounds);

async function seedZones(tx) {
  const zones = [
    ['EC', 'UIO-NORTE', 'Quito Norte', 'Quito', 'Pichincha'],
    ['EC', 'UIO-CENTRO', 'Quito Centro', 'Quito', 'Pichincha'],
    ['EC', 'UIO-SUR', 'Quito Sur', 'Quito', 'Pichincha'],
    ['EC', 'UIO-VALLES', 'Valles (Cumbaya, Tumbaco)', 'Quito', 'Pichincha'],
  ];

  for (const [region, code, name, city, area] of zones) {
    await tx.none(
      `INSERT INTO service_zones (region_code, code, name, city, administrative_area)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (region_code, code) DO NOTHING`,
      [region, code, name, city, area],
    );
  }
  return tx.any("SELECT * FROM service_zones WHERE region_code = 'EC'");
}

async function seedPlans(tx) {
  const plans = [
    // --- Ecuador: limpieza por hora -------------------------------------
    {
      service_type: 'CLEANING',
      code: 'EC-CLEAN-STANDARD',
      name: 'Limpieza estándar',
      description:
        'Limpieza de mantenimiento: pisos, baños, cocina, dormitorios y áreas comunes.',
      region_code: 'EC',
      pricing_model: 'PER_HOUR',
      base_amount: 1100, // $11.00 por hora
      config: { minimumHours: 2 },
      estimated_duration_minutes: 180,
      display_order: 1,
    },
    {
      service_type: 'CLEANING',
      code: 'EC-CLEAN-DEEP',
      name: 'Limpieza profunda',
      description:
        'Incluye interior de electrodomésticos, zócalos, ventanas por dentro y acumulación difícil.',
      region_code: 'EC',
      // La investigación muestra que la limpieza profunda cuesta 50-100% más.
      pricing_model: 'PER_HOUR',
      base_amount: 1650, // $16.50 por hora (+50%)
      config: { minimumHours: 3 },
      estimated_duration_minutes: 300,
      display_order: 2,
    },
    {
      service_type: 'CLEANING',
      code: 'EC-CLEAN-MOVE',
      name: 'Limpieza de mudanza',
      description: 'Limpieza intensiva para entrega o recepción de vivienda vacía.',
      region_code: 'EC',
      pricing_model: 'PER_HOUR',
      base_amount: 1800,
      config: { minimumHours: 4 },
      estimated_duration_minutes: 360,
      display_order: 3,
    },

    // --- Ecuador: lavandería --------------------------------------------
    {
      service_type: 'LAUNDRY',
      code: 'EC-LAUNDRY-WASHFOLD',
      name: 'Lavado y doblado',
      description: 'Recogemos, lavamos, secamos, doblamos y entregamos en 48 horas.',
      region_code: 'EC',
      pricing_model: 'PER_WEIGHT',
      base_amount: 250, // $2.50 por kg
      config: { unit: 'kg', minimumUnits: 4 },
      estimated_duration_minutes: null,
      display_order: 1,
    },
    {
      service_type: 'LAUNDRY',
      code: 'EC-LAUNDRY-BAG',
      name: 'Bolsa completa',
      description: 'Precio fijo por bolsa estándar, sin importar el peso exacto.',
      region_code: 'EC',
      pricing_model: 'PER_BAG',
      base_amount: 1400, // $14.00 por bolsa
      config: { bagCapacityKg: 7 },
      display_order: 2,
    },
    {
      service_type: 'LAUNDRY',
      code: 'EC-LAUNDRY-IRON',
      name: 'Planchado',
      description: 'Planchado profesional por prenda.',
      region_code: 'EC',
      pricing_model: 'PER_ITEM',
      base_amount: 90, // $0.90 por prenda
      config: {},
      display_order: 3,
    },

    // --- Arreglo de prendas: definido pero no ofrecido todavía -----------
    {
      service_type: 'ALTERATION',
      code: 'EC-ALTERATION-QUOTE',
      name: 'Arreglo de prendas',
      description: 'Reparación, ajuste y cambio de cierres. Requiere revisión previa.',
      region_code: 'EC',
      pricing_model: 'QUOTE',
      base_amount: 0,
      config: {},
      active: false,
      display_order: 1,
    },

    // --- EE.UU.: demuestra que el motor soporta el otro modelo -----------
    {
      service_type: 'CLEANING',
      code: 'US-CLEAN-STANDARD',
      name: 'Standard cleaning',
      description: 'Flat rate based on home size.',
      region_code: 'US',
      pricing_model: 'FLAT_BY_SIZE',
      base_amount: 0,
      config: {
        tiers: { STUDIO: 9000, '1BR': 11000, '2BR': 14000, '3BR': 18000, '4BR_PLUS': 22000 },
      },
      estimated_duration_minutes: 180,
      display_order: 1,
    },
    {
      service_type: 'LAUNDRY',
      code: 'US-LAUNDRY-WASHFOLD',
      name: 'Wash & fold',
      description: 'Pickup and delivery, priced per pound.',
      region_code: 'US',
      pricing_model: 'PER_WEIGHT',
      base_amount: 199, // $1.99/lb
      config: { unit: 'lb', minimumUnits: 15 },
      display_order: 1,
    },
  ];

  for (const plan of plans) {
    await tx.none(
      `INSERT INTO service_plans
         (service_type, code, name, description, region_code, pricing_model,
          base_amount, config, estimated_duration_minutes, active, display_order)
       VALUES ($[service_type], $[code], $[name], $[description], $[region_code], $[pricing_model],
               $[base_amount], $[config:json], $[estimated_duration_minutes], $[active], $[display_order])
       ON CONFLICT (region_code, code) DO NOTHING`,
      {
        estimated_duration_minutes: null,
        active: true,
        ...plan,
      },
    );
  }
}

async function seedExtras(tx) {
  const extras = [
    ['CLEANING', 'EC', 'CLEAN-OVEN', 'Limpieza de horno', 800, 30],
    ['CLEANING', 'EC', 'CLEAN-FRIDGE', 'Limpieza interior de refrigeradora', 700, 30],
    ['CLEANING', 'EC', 'CLEAN-WINDOWS', 'Ventanas por dentro', 900, 45],
    ['CLEANING', 'EC', 'CLEAN-LAUNDRY', 'Lavado de ropa en casa', 600, 45],
    ['CLEANING', 'EC', 'CLEAN-BALCONY', 'Balcón o terraza', 500, 30],
    ['LAUNDRY', 'EC', 'LAUNDRY-EXPRESS', 'Entrega express 24 horas', 500, 0],
    ['LAUNDRY', 'EC', 'LAUNDRY-HYPO', 'Detergente hipoalergénico', 200, 0],
    ['LAUNDRY', 'EC', 'LAUNDRY-SEPARATE', 'Lavado por separado', 300, 0],
  ];

  for (const [serviceType, region, code, name, amount, minutes] of extras) {
    await tx.none(
      `INSERT INTO service_extras
         (service_type, region_code, code, name, amount, added_duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (region_code, code) DO NOTHING`,
      [serviceType, region, code, name, amount, minutes],
    );
  }
}

/** Los roles viven en user_roles: una persona puede tener varios. */
async function grantRoles(tx, userId, roles) {
  for (const role of roles) {
    await tx.none(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, $2)
       ON CONFLICT (user_id, role) DO NOTHING`,
      [userId, role],
    );
  }
}

async function seedUsers(tx, zones) {
  const zoneByCode = Object.fromEntries(zones.map((z) => [z.code, z.id]));

  // --- Administrador ------------------------------------------------------
  const admin = await tx.oneOrNone(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, region_code, locale)
     VALUES ($1, $2, $3, $4, $5, 'EC', 'es')
     ON CONFLICT DO NOTHING
     RETURNING *`,
    ['admin@otterlyclean.ec', await hash('Admin123!'), 'Maria', 'Salazar', '+593991000001'],
  );
  if (!admin) return; // ya se habia sembrado

  await grantRoles(tx, admin.id, ['ADMIN']);

  // --- Trabajadores -------------------------------------------------------
  const staffSeed = [
    {
      email: 'carla.mendez@otterlyclean.ec',
      first: 'Carla',
      last: 'Mendez',
      phone: '+593991000010',
      code: 'EMP-001',
      bio: 'Cinco años de experiencia en limpieza residencial. Especialista en limpieza profunda.',
      services: ['CLEANING'],
      zones: ['UIO-NORTE', 'UIO-CENTRO'],
      skills: ['limpieza profunda', 'productos ecológicos'],
    },
    {
      email: 'jorge.paredes@otterlyclean.ec',
      first: 'Jorge',
      last: 'Paredes',
      phone: '+593991000011',
      code: 'EMP-002',
      bio: 'Responsable de recogidas y entregas de lavandería en la zona norte.',
      services: ['LAUNDRY'],
      zones: ['UIO-NORTE', 'UIO-VALLES'],
      skills: ['logística', 'manejo de prendas delicadas'],
    },
    {
      email: 'lucia.torres@otterlyclean.ec',
      first: 'Lucía',
      last: 'Torres',
      phone: '+593991000012',
      code: 'EMP-003',
      bio: 'Atiende limpieza y lavandería. Disponible en toda la ciudad.',
      services: ['CLEANING', 'LAUNDRY'],
      zones: ['UIO-NORTE', 'UIO-CENTRO', 'UIO-SUR', 'UIO-VALLES'],
      skills: ['limpieza estándar', 'planchado'],
    },
    // Coordinadora: trabaja en campo y ademas administra. Existe en el seed
    // porque el caso ADMIN + STAFF es real y conviene poder probarlo sin
    // tener que construirlo a mano.
    {
      email: 'paula.rios@otterlyclean.ec',
      first: 'Paula',
      last: 'Ríos',
      phone: '+593991000013',
      code: 'EMP-004',
      bio: 'Coordina la operación diaria y cubre servicios de limpieza.',
      services: ['CLEANING'],
      zones: ['UIO-NORTE', 'UIO-CENTRO'],
      skills: ['coordinación', 'limpieza profunda'],
      roles: ['STAFF', 'ADMIN'],
    },
  ];

  for (const s of staffSeed) {
    const user = await tx.one(
      `INSERT INTO users (email, password_hash, first_name, last_name, phone, region_code, locale)
       VALUES ($1, $2, $3, $4, $5, 'EC', 'es') RETURNING *`,
      [s.email, await hash('Staff123!'), s.first, s.last, s.phone],
    );

    await grantRoles(tx, user.id, s.roles ?? ['STAFF']);

    // `onboarding_completed_at` con valor: estas fichas ya vienen completas, y
    // sin la marca el equipo de ejemplo aterrizaria en el asistente de perfil
    // en lugar de en su panel.
    await tx.none(
      `INSERT INTO staff_profiles
         (user_id, employee_code, display_name, bio, hired_at, verification_status,
          verified_at, verified_by, background_check_status, skills, service_types,
          onboarding_completed_at)
       VALUES ($1, $2, $3, $4, CURRENT_DATE - INTERVAL '6 months', 'VERIFIED',
               NOW(), $5, 'CLEARED', $6, $7, NOW())`,
      [user.id, s.code, s.first, s.bio, admin.id, s.skills, s.services],
    );

    for (const zoneCode of s.zones) {
      await tx.none('INSERT INTO staff_zones (staff_id, zone_id) VALUES ($1, $2)', [
        user.id,
        zoneByCode[zoneCode],
      ]);
    }

    // Disponibilidad de lunes a sábado, 8:00-18:00.
    for (let weekday = 1; weekday <= 6; weekday += 1) {
      await tx.none(
        'INSERT INTO staff_availability (staff_id, weekday, start_time, end_time) VALUES ($1, $2, $3, $4)',
        [user.id, weekday, '08:00', '18:00'],
      );
    }
  }

  // --- Cliente de ejemplo -------------------------------------------------
  const customer = await tx.one(
    `INSERT INTO users (email, password_hash, first_name, last_name, phone, region_code, locale)
     VALUES ($1, $2, $3, $4, $5, 'EC', 'es') RETURNING *`,
    ['cliente@ejemplo.com', await hash('Cliente123!'), 'Andrés', 'Vaca', '+593991000020'],
  );

  await grantRoles(tx, customer.id, ['CUSTOMER']);

  await tx.none(
    `INSERT INTO customer_profiles (user_id, tax_id_type, tax_id, onboarding_completed_at)
     VALUES ($1, $2, $3, NOW())`,
    [customer.id, 'CEDULA', '1712345678'],
  );

  // Con coordenadas: la direccion de ejemplo tiene punto en el mapa, como las
  // que crea el cliente desde la aplicacion.
  await tx.none(
    `INSERT INTO addresses
       (user_id, label, region_code, street_line1, street_line2, neighborhood, city,
        administrative_area, reference, latitude, longitude, zone_id, is_default)
     VALUES ($1, 'Casa', 'EC', $2, $3, $4, 'Quito', 'Pichincha', $5, -0.1807, -78.4870, $6, TRUE)`,
    [
      customer.id,
      'Av. Amazonas N34-120',
      // Calle secundaria sin conector: la interfaz ya une con "y".
      'Av. República',
      'La Carolina',
      'Edificio Torre Azul, departamento 5B. Timbre 5B.',
      zoneByCode['UIO-NORTE'],
    ],
  );
}

async function run() {
  await db.tx(async (tx) => {
    const zones = await seedZones(tx);
    await seedPlans(tx);
    await seedExtras(tx);
    await seedUsers(tx, zones);
  });

  console.log('Datos iniciales cargados.\n');
  console.log('  Cuentas de prueba (contraseñas solo para desarrollo):');
  console.log('    ADMIN     admin@otterlyclean.ec        Admin123!');
  console.log('    STAFF     carla.mendez@otterlyclean.ec Staff123!    (limpieza)');
  console.log('    STAFF     jorge.paredes@otterlyclean.ec Staff123!   (lavandería)');
  console.log('    STAFF     lucia.torres@otterlyclean.ec Staff123!    (ambos)');
  console.log('    ADMIN+STAFF paula.rios@otterlyclean.ec Staff123!    (dos roles)');
  console.log('    CUSTOMER  cliente@ejemplo.com          Cliente123!');
}

run()
  .then(() => pgp.end())
  .catch((error) => {
    console.error('Error sembrando datos:', error);
    pgp.end();
    process.exit(1);
  });

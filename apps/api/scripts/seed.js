'use strict';

/**
 * Datos iniciales.
 *
 * Zonas de cobertura, adicionales y cuentas de prueba. Importes en centavos.
 *
 * LOS PLANES NO ESTÁN AQUÍ. El catálogo comercial lo crea la migración 008 y lo
 * ajusta la 009, y tenerlo además en el seed fue exactamente el problema que
 * arregla la 016: los códigos de los dos sitios no chocaban, así que ninguno
 * sustituía al otro y el cliente acababa viendo "Limpieza estándar" y "Limpieza
 * Estándar" seguidos a precios distintos. El catálogo tiene un solo dueño.
 */

const bcrypt = require('bcryptjs');
const { db, pgp } = require('../src/db');
const env = require('../src/config/env');

const hash = (plain) => bcrypt.hash(plain, env.auth.bcryptRounds);

async function seedZones(tx) {
  const zones = [
    ['EC', 'UIO-NORTE', 'Quito Norte', 'Quito', 'Pichincha', -0.1500, -78.4800, 9.00],
    ['EC', 'UIO-CENTRO', 'Quito Centro', 'Quito', 'Pichincha', -0.2200, -78.5100, 7.00],
    ['EC', 'UIO-SUR', 'Quito Sur', 'Quito', 'Pichincha', -0.2900, -78.5400, 9.00],
    ['EC', 'UIO-VALLES', 'Valles (Cumbaya, Tumbaco)', 'Quito', 'Pichincha', -0.2500, -78.4400, 13.00],
  ];

  for (const [region, code, name, city, area, lat, lon, rad] of zones) {
    await tx.none(
      `INSERT INTO service_zones (region_code, code, name, city, administrative_area, center_latitude, center_longitude, radius_km)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (region_code, code) DO UPDATE
       SET center_latitude = EXCLUDED.center_latitude,
           center_longitude = EXCLUDED.center_longitude,
           radius_km = EXCLUDED.radius_km`,
      [region, code, name, city, area, lat, lon, rad],
    );
  }
  return tx.any("SELECT * FROM service_zones WHERE region_code = 'EC'");
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

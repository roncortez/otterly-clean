# Otterly Clean

Plataforma de servicios a domicilio para Quito, Ecuador. El cliente reserva
limpieza o lavandería, la empresa asigna un trabajador verificado, y el cliente
puede seguir el servicio desde cualquier lugar aunque no esté en casa.

La plataforma **no es un marketplace abierto**: los trabajadores son personal
contratado y verificado por la empresa, y solo Operaciones puede asignarles
trabajo.

## Servicios

| Servicio                | Estado en esta versión                                    |
| ----------------------- | --------------------------------------------------------- |
| Limpieza residencial    | Completo                                                   |
| Lavandería a domicilio  | Completo, con trazabilidad por bolsa                       |
| Arreglo de prendas      | Administrable, pero sin flujo de reserva todavía           |

Los tres son **tipos fijos del dominio**: cada uno tiene su máquina de estados y
su tabla de detalle. Lo que Operaciones administra desde la aplicación es su
capa comercial —si se ofrecen, cómo se presentan y a qué precio—, no cómo
funcionan. Ver [Configuración administrable](docs/ARCHITECTURE.md#configuración-administrable).

## Stack

- **Backend**: Node.js 20+, Express 5, PostgreSQL 18 (pg-promise), Zod, JWT.
- **Frontend**: React 19, Vite 8, JSX, Tailwind CSS v4, React Router 7.
- **Pruebas**: Vitest + Supertest (backend), Playwright disponible para E2E.

## Requisitos

- Node.js 20 o superior
- PostgreSQL 14 o superior

## Puesta en marcha

```bash
# 1. Dependencias (monorepo con workspaces de npm)
npm install

# 2. Variables de entorno
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 3. Generar los secretos del backend y ponerlos en apps/api/.env
node -e "console.log('JWT_SECRET=' + require('crypto').randomBytes(48).toString('hex'))"
node -e "console.log('ENCRYPTION_KEY=' + require('crypto').randomBytes(32).toString('hex'))"

# 4. Crear la base de datos
createdb otterly_clean          # o: psql -U postgres -c "CREATE DATABASE otterly_clean"

# 5. Esquema y datos iniciales
npm run db:migrate
npm run db:seed

# 6. Arrancar (en dos terminales)
npm run dev:api                 # http://localhost:10000
npm run dev:web                 # http://localhost:5173
```

### Imágenes (opcional)

El logo, el icono, la imagen de cada servicio y el banner se suben desde
`/operaciones/configuracion` y se guardan en Cloudinary, organizados por
carpeta. Para habilitarlo, rellena en `apps/api/.env`:

```bash
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Sin esas variables la aplicación funciona igual: los campos de imagen se
degradan a un campo de URL.

El frontend habla con `/api` y Vite lo reenvía al backend, así que en
desarrollo no hay CORS que configurar.

### Cuentas de prueba

Las crea `npm run db:seed`. **Solo para desarrollo.**

| Roles          | Correo                          | Contraseña    | Notas                          |
| -------------- | ------------------------------- | ------------- | ------------------------------ |
| ADMIN          | `admin@otterlyclean.ec`         | `Admin123!`   | Operaciones                    |
| STAFF          | `carla.mendez@otterlyclean.ec`  | `Staff123!`   | Solo limpieza                  |
| STAFF          | `jorge.paredes@otterlyclean.ec` | `Staff123!`   | Solo lavandería                |
| STAFF          | `lucia.torres@otterlyclean.ec`  | `Staff123!`   | Limpieza y lavandería          |
| ADMIN + STAFF  | `paula.rios@otterlyclean.ec`    | `Staff123!`   | Entra a `/operaciones` y a `/trabajo` |
| CUSTOMER       | `cliente@ejemplo.com`           | `Cliente123!` | Con dirección cargada          |

Una persona puede tener **varios roles**. La cuenta de Paula existe justamente
para probar ese caso: la misma sesión abre las dos consolas.

## Comandos

```bash
npm run dev:api        # API con recarga automática
npm run dev:web        # frontend
npm run build          # build de producción del frontend
npm run lint           # lint de ambos paquetes
npm test               # pruebas de ambos paquetes
npm run db:migrate     # aplica migraciones pendientes
npm run db:seed        # datos iniciales
npm run db:reset       # recrea el esquema desde cero y siembra (solo desarrollo)
```

## Estructura

```text
apps/api/
  migrations/            SQL versionado, aplicado por scripts/migrate.js
  scripts/               migrate.js, seed.js
  src/
    config/              región (moneda, impuesto, dirección, teléfono) y entorno
    domain/              LÓGICA PURA: máquinas de estado, precios, políticas
    db/                  conexión y repositorios
    services/            orquestación: transacción + auditoría + notificación
    http/                rutas, middleware, validación con Zod
    notifications/       abstracción de canales (email/SMS/push)
  tests/                 dominio (unitarias) y flujos (integración)
apps/web/
  src/
    shared/              cliente API, sesión, configuración regional, UI, formato
    features/
      auth/              entrar y crear cuenta
      customer/          panel, asistente de reserva, detalle, direcciones
      operations/        panel operativo, solicitudes, trabajadores, incidencias
        configuration/   empresa, servicios, agenda y avisos
      staff/             trabajos del día y detalle (optimizado para móvil)
docs/
  ARCHITECTURE.md        decisiones de diseño y cómo extender
  SECURITY.md            modelo de amenazas y controles
```

## Documentación

- [Arquitectura y decisiones](docs/ARCHITECTURE.md)
- [Seguridad y privacidad](docs/SECURITY.md)

## Estado de esta versión

Funciona de extremo a extremo el flujo que es el corazón del producto:

**Limpieza**: el cliente reserva → Operaciones ve la solicitud sin asignar →
asigna un trabajador → el trabajador confirma, marca en camino, llegó, inició y
finalizó → el cliente ve cada cambio con su marca de tiempo.

**Lavandería**: el cliente agenda la recogida → Operaciones asigna →
recogida, recepción, lavado, secado, doblado, listo, en camino, entregado →
cada bolsa lleva un código derivado de la orden.

**Configuración**: Operaciones cambia desde `/operaciones/configuracion` los
datos de la empresa, si cada servicio se ofrece y a qué precio, y cuándo la
agenda acepta reservas. Todo eso antes exigía tocar código o seeds.

### Preparado pero no implementado

Pagos (el dominio ya modela importe, moneda, impuesto y estado), envío real de
email/SMS/push (existe la abstracción y el registro), geolocalización, códigos
QR en las bolsas, recurrencia, calificaciones y el **flujo de reserva de arreglo
de prendas**: su configuración comercial ya es administrable, pero le faltan la
máquina de estados, el esquema de validación y el endpoint de creación. Ver
[qué falta exactamente](docs/ARCHITECTURE.md#arreglo-de-prendas-qué-falta).

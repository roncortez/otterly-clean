# Arquitectura

Este documento explica **por qué** el sistema está construido así y **cómo
extenderlo**. Para poner el proyecto en marcha, ver el [README](../README.md).

## Idea central

El producto existe para responder una pregunta: *¿qué está pasando en mi casa
ahora mismo?*. El cliente casi nunca está presente mientras se ejecuta el
servicio, y un desconocido entra a su vivienda. Todo lo demás —precios, catálogo,
asignaciones— está al servicio de esa confianza.

De ahí salen tres decisiones que atraviesan el sistema:

1. **La máquina de estados es el núcleo del dominio**, no un campo `status`.
2. **La empresa asigna, el trabajador no elige.** No hay endpoint para buscar
   trabajos disponibles.
3. **Mínimo privilegio en cada respuesta.** Cada rol recibe una proyección
   distinta del mismo pedido.

## Capas del backend

```
http/          Express: rutas, middleware de rol, validación con Zod
  ↓
services/      Orquestación: transacción + auditoría + notificación
  ↓
domain/        LÓGICA PURA. Sin base de datos, sin Express, sin red.
  ↓
db/            pg-promise y repositorios (SQL)
```

La regla que mantiene esto sano: **`domain/` no importa nada de `db/` ni de
`http/`**. Sus pruebas corren sin base de datos y sin servidor
(`tests/domain.test.js`). Si una regla de negocio necesita consultar la base,
va en `services/`, no en `domain/`.

### Por qué las máquinas de estado son declarativas

`domain/shared/stateMachine.js` construye la máquina a partir de una tabla de
transiciones explícita. Si un par `(desde → hacia)` no está declarado, se
rechaza. No hay transición implícita posible.

Cada transición declara además **qué roles pueden ejecutarla**. Esto es lo que
impide, por ejemplo, que un trabajador se asigne trabajo a sí mismo: la
transición `PENDING_ASSIGNMENT → ASSIGNED` solo admite `ADMIN`. La regla vive en
un solo lugar y se aplica igual desde cualquier endpoint.

```js
{ from: 'ARRIVED', to: 'IN_PROGRESS', roles: [STAFF, ADMIN], timestamps: ['started_at'] }
```

El campo `timestamps` hace que marcar un estado registre su hora
automáticamente. Por eso el timeline del cliente tiene marcas de tiempo reales
sin que ningún controlador las escriba a mano.

### Añadir un servicio nuevo

El caso concreto es **arreglo de prendas**, que ya está definido pero no
ofrecido. Para activarlo:

1. Crear `domain/alteration/stateMachine.js` con sus estados.
2. Enlazarla en `domain/shared/serviceTypes.js` y poner `enabled: true`.
3. Rellenar `alteration_details` (la tabla ya existe) y su repositorio.
4. Añadir el esquema de validación y las rutas de creación.

No hay que tocar asignaciones, incidencias, auditoría, notificaciones ni la
consola de Operaciones: todo eso es común a cualquier tipo de servicio.

## Modelo de datos

Una tabla `orders` compartida + una tabla de detalle por servicio:

```
orders ──┬── cleaning_details
         ├── laundry_details ── laundry_bags
         └── alteration_details      (preparada)

orders ──┬── order_status_history    (fuente de verdad del timeline)
         ├── assignments             (incluye reasignaciones)
         ├── incidents
         ├── payments                (modelado, sin integración)
         └── notifications
```

**Por qué una sola tabla de órdenes**: Operaciones necesita una única cola donde
ver todo lo del día, sin importar el servicio. Con tablas separadas, cada
pantalla operativa sería una unión de N consultas y añadir un servicio
significaría tocarlas todas.

**Por qué tablas de detalle separadas**: limpieza y lavandería no comparten casi
ningún campo. Meterlo todo en `orders` daría una tabla con decenas de columnas
nulas y sin restricciones útiles.

### El historial es la fuente de verdad

`order_status_history` guarda cada transición con actor, rol y hora.
`orders.milestones` (JSONB) es una copia desnormalizada para leer rápido. Si
alguna vez discrepan, manda el historial.

Se eligió JSONB en lugar de ~20 columnas `*_at` dispersas porque los hitos
difieren entre servicios y añadir uno nuevo no debería requerir una migración
de esquema.

### Dinero en enteros

Todos los importes se guardan como enteros en la unidad menor de la moneda
(centavos). Nunca `float`. `subtotal_amount = 3300` son $33,00.

## Configuración regional

`config/regions.js` concentra **todo lo que cambia entre países**: moneda,
impuesto, esquema y etiquetas de dirección, teléfono, unidades, tipos de
documento, ventanas horarias y política de cancelación.

El frontend no escribe "Provincia" ni "$" en ningún sitio: los pide a
`GET /api/catalog/config` y construye los formularios con lo que recibe. Ese
endpoint es el contrato que permite pasar de Ecuador a Estados Unidos sin tocar
componentes.

| Aspecto            | Ecuador             | Estados Unidos       |
| ------------------ | ------------------- | -------------------- |
| Impuesto           | IVA 15%             | Sales tax (por zona) |
| Área administrativa| Provincia           | State                |
| Código postal      | Opcional            | Obligatorio          |
| Unidades           | m², kg              | sqft, lb             |
| Cancelación libre  | 24 h                | 48 h                 |

Para habilitar un país nuevo: añadir su entrada en `regions.js` y cargar sus
zonas en `service_zones`.

### Pendiente: zonas horarias

`domain/shared/policies.js` resuelve el instante de inicio en la **hora local
del servidor**. Funciona mientras se opere en una sola zona horaria. Al abrir
Estados Unidos habrá que resolverlo con `region.timezone`; el campo ya está en
la configuración.

## Precios

La investigación de mercado mostró dos modelos incompatibles: en Quito la
limpieza se cobra **por hora** (~$11/h) y en Estados Unidos **plano según el
tamaño** de la vivienda. La lavandería puede ser por peso, por bolsa o por
prenda.

Por eso el precio no es una columna sino una **estrategia** declarada en
`service_plans.pricing_model`, resuelta por `domain/pricing/pricing.js`:

`PER_HOUR` · `FLAT_BY_SIZE` · `PER_WEIGHT` · `PER_BAG` · `PER_ITEM` · `FIXED` · `QUOTE`

Añadir un modelo nuevo es añadir una entrada al mapa `MODELS`. El cálculo lo
hace **siempre el backend**: el asistente de reserva llama a
`POST /api/customer/quote` para mostrar el total, y ese mismo cálculo es el que
se guarda al confirmar.

## Trazabilidad de la lavandería

El riesgo operativo más caro de este negocio es confundir la ropa de dos
clientes. Por eso la bolsa es una entidad desde el primer día
(`laundry_bags`), con un código derivado de la referencia del pedido:

```
OC-2026-001024-B0001
```

El código por sí solo dice a qué pedido pertenece. Hoy se escribe o imprime a
mano; añadir un QR o un código de barras después no requiere cambiar el modelo,
solo generar la imagen a partir de `bag_code`.

## Notificaciones

El dominio emite **eventos** ("el profesional llegó"), no mensajes.
`notifications/events.js` decide destinatarios, canales y textos;
`notifications/index.js` delega el envío a un driver intercambiable.

Hoy solo existe el driver de consola: todo queda registrado en la tabla
`notifications` y las de canal `IN_APP` se marcan como enviadas. Las de EMAIL,
SMS y PUSH quedan en `PENDING` esperando a que exista un driver real.

Emitir una notificación **nunca lanza excepción**: marcar "llegué" tiene que
funcionar aunque el proveedor de correo esté caído.

## Frontend

Enrutado **por audiencia**, no por entidad:

```
/inicio, /reservar, /servicios, /direcciones   → CUSTOMER
/operaciones/*                                  → ADMIN
/trabajo/*                                      → STAFF
```

Así el control de acceso se ve al leer `App.jsx`. El backend revalida todo: el
enrutado solo evita mostrar pantallas que no corresponden.

### Lectura de datos

`shared/api/useApiQuery.js` centraliza el patrón de lectura. `loading` se
**deriva** comparando la consulta pedida con la resuelta, en lugar de escribirse
con un `setState` dentro del efecto; así no hay renders en cascada ni estados de
carga desincronizados.

### Sesión

El access token vive **en memoria** y solo el refresh token se persiste en
`localStorage`. Un XSS que lea `localStorage` no obtiene un token de acceso
vigente, y la sesión se puede revocar desde el servidor. Ante un 401 el cliente
refresca una vez y reintenta la petición original de forma transparente.

## Qué está preparado pero no implementado

| Área              | Qué existe ya                                                    |
| ----------------- | ---------------------------------------------------------------- |
| Pagos             | Tabla `payments`, importes, moneda, impuesto y estado en `orders` |
| Email/SMS/Push    | Abstracción de canal, catálogo de eventos y registro en base      |
| Arreglo de prendas| Tipo de servicio, tabla de detalle y plan (inactivo)              |
| QR / códigos      | `laundry_bags.bag_code` como texto libre                          |
| Geolocalización   | `addresses.latitude/longitude`                                    |
| Multi-país        | `config/regions.js` y `service_zones`                             |
| Disponibilidad    | `staff_availability` (semanal, aún no se cruza al asignar)         |
| Auditoría         | `audit_log` poblado; falta una interfaz de consulta               |

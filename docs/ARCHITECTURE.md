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

### Tipo de servicio ≠ configuración comercial

Son dos preguntas distintas que conviene no mezclar:

| Pregunta                        | Dónde vive                     | Quién la cambia |
| ------------------------------- | ------------------------------ | --------------- |
| ¿Existe el flujo en el código?  | `domain/shared/serviceTypes.js` (`enabled`) | Un desarrollador |
| ¿Lo estamos ofreciendo hoy?     | `service_settings.active`      | Operaciones      |

Un servicio solo es reservable si cumple **las dos**
(`serviceCatalogService.assertBookable`). Así se puede apagar limpieza un fin de
semana sin desplegar, y arreglo de prendas puede administrarse ya aunque su
flujo no exista todavía.

Los **tipos** siguen siendo un conjunto cerrado de tres. No hay endpoint para
crear un cuarto, y es deliberado: un tipo nuevo necesita máquina de estados,
tabla de detalle y flujo de reserva. Eso es código, no una pantalla.

### Añadir un servicio nuevo

El caso concreto es **arreglo de prendas**, que ya está definido pero no
ofrecido. Para activarlo:

1. Crear `domain/alteration/stateMachine.js` con sus estados.
2. Enlazarla en `domain/shared/serviceTypes.js` y poner `enabled: true`.
3. Rellenar `alteration_details` (la tabla ya existe) y su repositorio.
4. Añadir el esquema de validación y las rutas de creación.

No hay que tocar asignaciones, incidencias, auditoría, notificaciones, la
consola de Operaciones ni la configuración comercial: todo eso ya es común a
cualquier tipo de servicio.

### Arreglo de prendas: qué falta

Lo que **ya está** tras esta versión:

- Tipo de servicio declarado en el dominio y validado en toda la API.
- Tabla `alteration_details` y plan `EC-ALTERATION-QUOTE` con modelo `QUOTE`.
- Fila en `service_settings`: Operaciones edita su nombre, descripción, icono,
  orden y texto para el cliente, y puede marcarlo como ofrecido.
- Bloqueos de agenda y auditoría: funcionan igual que para los otros dos.

Lo que **falta** para que un cliente pueda reservarlo:

1. `domain/alteration/stateMachine.js`. El flujo no es como los otros: hay una
   **inspección previa** y el precio no se conoce al reservar, así que necesita
   estados propios (`QUOTE_PENDING`, `QUOTE_SENT`, `QUOTE_APPROVED`…).
2. `alterationDetailSchema` en `http/schemas.js` y el insert de detalle en
   `orderService`.
3. `POST /api/customer/orders/alteration`.
4. Un paso en el asistente de reserva para describir las prendas, y la pantalla
   donde el cliente aprueba o rechaza la cotización.
5. Decidir cómo se cobra tras la inspección: hoy `pricing_model = QUOTE`
   devuelve total 0 y marca `requires_quote`, pero no existe el flujo que
   sustituye ese 0 por el importe real.

Marcarlo como "ofrecido" en la pantalla de configuración **no** lo hace
reservable: la interfaz lo advierte y `assertBookable` lo rechaza igualmente,
porque `enabled` sigue en `false`. Se prefirió eso a inventar un flujo
incompleto para poder tachar la casilla.

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

users ───┬── user_roles              (una persona, varios roles)
         ├── customer_profiles
         └── staff_profiles ── staff_zones, staff_availability

configuración administrable:
  app_settings (clave 'company')     datos públicos de la empresa
  service_settings                   capa comercial de los 3 tipos
  booking_blackouts                  cuándo NO se aceptan reservas
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

### Qué puede editar Operaciones de un precio

`plan.config` es JSON libre para el motor, pero la pantalla de administración no
puede serlo. Si dejara escribir claves arbitrarias, un `minimunHours` mal
escrito se guardaría sin error y el mínimo dejaría de aplicarse **en silencio**:
el cliente pagaría de menos y nadie se enteraría.

Por eso `MODEL_PARAMETERS` (en `domain/pricing/pricing.js`) declara, por modelo,
qué significa el importe base y qué parámetros son editables:

```js
PER_HOUR: {
  amount: { label: 'Precio por hora' },
  fields: [{ key: 'minimumHours', type: 'number', min: 0, max: 24 }],
}
```

Ese descriptor es la única fuente: de él salen a la vez la validación del
backend (`serviceCatalogService.normalizePlanConfig`, que descarta lo que no
pertenece al modelo) y el formulario que ve el administrador. Así no pueden
desincronizarse, y limpieza muestra "mínimo de horas" mientras lavandería
muestra "unidad" y "mínimo facturable" sin que nadie lo escriba dos veces.

El **modelo de precio no se puede cambiar desde la pantalla**: cada modelo pide
datos distintos al cliente al reservar, así que cambiarlo rompería las reservas
en curso.

## Configuración administrable

Antes había datos comerciales escritos en el código: el nombre de la empresa en
cinco pantallas, el WhatsApp en un componente, los servicios de la portada en un
array. Cambiar un teléfono exigía desplegar.

La regla para decidir dónde va cada cosa:

| Tipo de valor            | Ejemplo                                | Dónde vive                  |
| ------------------------ | -------------------------------------- | --------------------------- |
| Regla de dominio         | "solo ADMIN asigna trabajo"            | Código (`domain/`)          |
| Configuración técnica    | `JWT_SECRET`, `CORS_ORIGINS`, `DB_*`   | Variables de entorno        |
| Configuración regional   | moneda, impuesto, etiquetas, ventanas  | `config/regions.js`         |
| Configuración comercial  | teléfono, precios, si un servicio se ofrece | Base de datos, editable |

Solo la última fila llega a la pantalla de configuración. Lo demás sigue fuera
**a propósito**: un impuesto o una ventana horaria cambian con el país, no con
el día, y un secreto no debe poder editarse desde un navegador.

### Dónde se guarda

- **Empresa** → `app_settings`, clave `company`. Se reutiliza la tabla
  clave→JSONB que ya existía para el banner en lugar de crear una tabla de una
  sola fila. `companyService` define los campos válidos y rellena los que
  falten, así que la aplicación arranca aunque la fila no exista.
- **Servicios** → `service_settings`, con `service_type` como clave primaria. No
  es un `BIGSERIAL` justamente para que no se puedan inventar tipos.
- **Agenda** → `booking_blackouts`.

El frontend lo consume todo de `GET /api/catalog/config`, que ya servía la
configuración regional: una sola petición al arrancar, porque son datos que se
necesitan a la vez en el primer render.

### Imágenes

Las imágenes públicas —logo, icono, la de cada servicio y el banner— se **suben**
desde la pantalla de configuración y se guardan en Cloudinary. Lo que se
persiste en la base sigue siendo una URL, así que para el resto del sistema no
cambió nada.

Dos decisiones que hacen que la cuenta no se convierta en un vertedero:

**El destino es un catálogo cerrado**, no una ruta libre (`uploadService.SLOTS`):

```
otterly-clean/marca/logo
otterly-clean/marca/icono
otterly-clean/avisos/banner-inicio
otterly-clean/servicios/{cleaning,laundry,alteration}
```

Ni la carpeta ni el nombre del archivo vienen nunca de la petición: quien sube
elige una etiqueta de la lista. Si la ruta fuese un dato de entrada, cualquiera
con sesión de ADMIN podría escribir en cualquier carpeta de la cuenta —incluida
la de otro proyecto que comparta el mismo Cloudinary— o sobrescribir un archivo
ajeno con un `../`. El nombre del archivo que envía el navegador se descarta
(`use_filename: false`).

**Cada destino tiene un `public_id` fijo** y se sube con `overwrite`. Cambiar el
logo reemplaza el anterior en lugar de dejar copias acumulándose. La URL
resultante incluye la versión que asigna Cloudinary, así que ninguna caché sirve
la imagen vieja.

El formato se comprueba por la **firma binaria** del archivo, no por el
`Content-Type` que declara el navegador —ese dato lo escribe quien hace la
petición—. Se admiten PNG, JPG y WebP; **SVG queda fuera** a propósito: es XML,
admite scripts y no tiene firma binaria que comprobar.

Si no hay credenciales, `uploadService.isEnabled()` devuelve `false` y la
pantalla se degrada a un campo de URL. Un entorno sin Cloudinary sigue
funcionando.

Lo que **no** pasa por aquí: fotos de incidencias y documentos de trabajadores.
Cloudinary sirve por URL pública y esos son datos con control de acceso; darles
almacenamiento exige volver a pensar quién puede verlos.

### Lo que sigue estando en el código, a propósito

- Las máquinas de estado y sus transiciones por rol.
- Los modelos de precio (`PER_HOUR`, `FLAT_BY_SIZE`, …) y qué parámetro admite
  cada uno.
- La antelación mínima y la política de cancelación (`config/regions.js`).
- Los tres tipos de servicio.
- El mapa de iconos del frontend: la configuración guarda un nombre y solo se
  admiten los que el frontend sabe pintar.

## Disponibilidad: dos conceptos que no se mezclan

```
staff_availability   →  "¿cuándo puede trabajar Carla?"
booking_blackouts    →  "¿cuándo acepta reservas la empresa?"
```

Se parecen y no son lo mismo. Cerrar el 25 de diciembre no cambia el horario de
nadie, y que Carla libre el martes no cierra la agenda. Por eso son tablas
distintas y no se consultan juntas.

Un bloqueo tiene un intervalo, un motivo y opcionalmente un `service_type`.
**Si el tipo es `NULL`, el bloqueo es global.**

La decisión vive en `domain/shared/availability.js` como función pura: recibe
los bloqueos ya leídos y responde si el intervalo choca. El solapamiento usa
extremos abiertos (`inicio < finOtro && fin > inicioOtro`), de modo que un
bloqueo de 14:00–17:00 y un servicio de 17:00–20:00 **no** chocan; con `<=` se
perdería una franja útil en cada frontera.

El intervalo que se contrasta es **toda la ventana horaria** del servicio, no su
instante de inicio: así un bloqueo de 14:00 a 17:00 choca con la reserva de
tarde aunque esta empiece a las 13:00.

Tres reglas que definen el comportamiento:

1. **La validación está en el backend.** `orderService.createOrder` llama a
   `availabilityService.assertBookableSlot` antes de escribir nada. Que el
   asistente oculte una franja es cortesía; la petición se puede construir a
   mano.
2. **Bloquear no cancela.** Los pedidos anteriores al bloqueo siguen en pie.
   Cierra reservas nuevas, no rompe compromisos ya adquiridos.
3. **Es temporal por naturaleza.** Al pasar el intervalo la agenda se reabre
   sola, sin que nadie tenga que acordarse. Cerrar hoy nunca impide agendar
   dentro de dos semanas.

El frontend pide `GET /api/catalog/availability` y desactiva las franjas
cerradas, mostrando el motivo. Si esa consulta falla, el asistente deja
continuar y avisa de que se comprobará al confirmar: la respuesta correcta a "no
sé" no es bloquear al cliente.

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

## Roles múltiples

Una persona puede coordinar la operación **y** salir a trabajar. Eso no cabe en
una columna `role` con un `CHECK`, y una lista separada por comas
(`"ADMIN,STAFF"`) sería imposible de consultar e indexar. Se modela como lo que
es: una relación, `user_roles (user_id, role)`.

`users.role` se **eliminó**. Mantener las dos cosas daría dos verdades que
pueden contradecirse; ahora los repositorios devuelven siempre `roles` como
array y ninguna capa superior tiene que acordarse del JOIN.

### El rol efectivo

Con varios roles, "qué puede hacer" ya no basta: hace falta saber **cómo está
actuando ahora**. Alguien con ADMIN + STAFF que abre `/api/staff` debe ver la
proyección del trabajador —sin importes, sin correo del cliente—, no la del
administrador.

Como cada árbol de rutas declara su audiencia, `requireRole` fija el rol
efectivo en `req.user.role` al que esa ruta exige:

```
/api/customer/*    → actúa como CUSTOMER
/api/staff/*       → actúa como STAFF
/api/operations/*  → actúa como ADMIN
```

Así el resto del sistema —proyecciones, máquina de estados, auditoría— sigue
razonando con un solo rol, y aplica el **mínimo privilegio del contexto**, no el
máximo del usuario. Fue lo que permitió introducir roles múltiples sin tocar
`orderService`, `incidentService` ni las máquinas de estado.

La autorización comprueba pertenencia (`hasAnyRole`), nunca igualdad.
`primaryRole` solo se usa para desempatar cuando hay que mostrar un rol o
decidir a qué pantalla entrar.

### El último administrador

`userService.assertNotLastActiveAdmin` impide quitarse el rol ADMIN o
desactivarse si no queda ningún otro administrador activo. Sin ella, un
descuido dejaría la instalación sin nadie capaz de entrar a Operaciones y sin
forma de recuperarla desde la aplicación. Se comprueba **dentro de la
transacción** del cambio, para que dos peticiones simultáneas no se den permiso
la una a la otra.

Se aplica también al desactivar desde la pantalla de trabajadores: alguien
puede ser STAFF y ADMIN a la vez.

### Roles no son capacidades

`STAFF` es un rol: dice que esa persona entra a `/trabajo`. Que atienda limpieza
o lavandería es una **capacidad profesional** y sigue viviendo en
`staff_profiles.service_types`. Son cosas distintas y se editan en pantallas
distintas.

## Frontend

Enrutado **por audiencia**, no por entidad:

```
/inicio, /reservar, /servicios, /direcciones   → CUSTOMER
/operaciones/*                                  → ADMIN
/trabajo/*                                      → STAFF
```

Así el control de acceso se ve al leer `App.jsx`. `RequireRole` comprueba
`user.roles.includes(role)`, de modo que ADMIN + STAFF entra en los dos árboles;
cada consola ofrece un enlace a la otra solo si la persona tiene el rol. El
backend revalida todo: el enrutado solo evita mostrar pantallas que no
corresponden.

### Formularios de configuración

El estado del formulario se **deriva durante el render**, no se copia con un
efecto (`shared/hooks/useEditableForm.js`): mientras nadie ha escrito nada, el
formulario *es* lo que llegó del servidor; en cuanto se toca algo, manda el
borrador. Así un refresco de la consulta no le pisa el texto a quien está
escribiendo, y solo se envían los campos que cambiaron.

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
| Arreglo de prendas| Tipo, tabla de detalle, plan y configuración comercial administrable; falta el flujo |
| QR / códigos      | `laundry_bags.bag_code` como texto libre                          |
| Geolocalización   | `addresses.latitude/longitude`                                    |
| Multi-país        | `config/regions.js` y `service_zones`                             |
| Disponibilidad de personal | `staff_availability` (semanal, aún no se cruza al asignar) |
| Auditoría         | `audit_log` poblado; falta una interfaz de consulta               |

## Deuda conocida

- **Zonas horarias.** Los bloqueos de agenda se guardan como `TIMESTAMPTZ` pero
  se resuelven en la hora local del servidor, igual que el resto del dominio.
  Funciona con una sola zona; al abrir Estados Unidos habrá que resolverlos con
  `region.timezone`, junto con el resto de fechas.
- **Logo por URL.** No se introdujo almacenamiento de archivos solo para esto:
  el logo y las imágenes de servicio son URLs persistidas. Si más adelante hace
  falta subir imágenes, `logoUrl` seguirá siendo el campo; solo cambia quién lo
  rellena.
- **Bloqueos por región.** `booking_blackouts.region_code` existe y se filtra,
  pero la pantalla de Operaciones trabaja siempre con la región del
  administrador.
- **Tramos de `FLAT_BY_SIZE`.** La pantalla edita el importe de los tramos que
  ya existen, no crea tramos nuevos: el asistente de reserva solo sabe pedir los
  tamaños que conoce.
- **Cruce entre bloqueos y disponibilidad del personal.** Son independientes a
  propósito, pero nada avisa hoy de que un día abierto no tenga a nadie
  disponible.

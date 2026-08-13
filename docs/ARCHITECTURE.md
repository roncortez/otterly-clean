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

### Confirmar es el momento que parte el flujo en dos

Una asignación tiene dos estados vivos, y la diferencia entre ellos es todo el
compromiso que existe: `OFFERED` es "te lo hemos ofrecido"; `ACCEPTED` es "dije
que lo haría". De ahí cuelgan cuatro reglas, todas en el backend:

| Antes de confirmar (`OFFERED`)        | Después de confirmar (`ACCEPTED`)      |
| ------------------------------------- | -------------------------------------- |
| Ve el trabajo: qué, cuándo y dónde    | Además, el teléfono del cliente         |
| Sin código de acceso al domicilio     | Puede pedirlo, y queda auditado         |
| No puede reportar incidencias         | Puede reportarlas                       |
| **Puede rechazar la asignación**      | **Ya no**: la reasignación es de Operaciones |

El razonamiento es el mismo en las cuatro: **que la empresa ofrezca un trabajo no
significa que vaya a hacerse**. Repartir el teléfono del cliente y la llave de su
casa entre gente que quizá nunca pise esa vivienda es exactamente lo que el
producto no debe hacer, y una incidencia sobre un servicio que aún no se ha
aceptado no describe nada que haya pasado.

En el otro sentido: una vez confirmado, el cliente ya tiene profesional y hora.
Soltar eso desde la aplicación con un botón convertiría un compromiso en una
sugerencia, así que `declineAssignment` responde 409 y la interfaz lo advierte
**antes** de confirmar, no después. Reasignar sigue siendo posible: lo hace
Operaciones, que además puede avisar al cliente o reagendar.

Al completar el servicio la asignación pasa a `COMPLETED` y se pierden los dos
accesos —teléfono y código—, aunque el trabajador conserve el historial de lo que
hizo. El acceso dura lo que dura el motivo.

### Reportar una incidencia y clasificarla son dos cosas

Quien vive el problema lo cuenta; **cuánto importa lo decide Operaciones**. La
gravedad determina a quién se avisa y qué se compensa: es una decisión de
negocio, no una impresión de quien está en la puerta con prisa.

Por eso `incidents.severity` **nace nulo** —"sin clasificar" es un estado real—,
el esquema del reporte es `.strict()` y rechaza un `severity` en el cuerpo con un
400 en lugar de ignorarlo en silencio, y la clasificación vive en
`PATCH /api/operations/incidents/:id/severity`, dentro del árbol que exige ADMIN.
Cada clasificación queda en `audit_log` con su valor anterior
(`INCIDENT_CLASSIFIED`): quien baje la gravedad de un daño tiene nombre.

El `DEFAULT 'MEDIUM'` que había antes era la peor de las opciones: una gravedad
que nadie eligió, indistinguible de una decidida de verdad.

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
         ├── user_invitations        (alta de cuenta por enlace de un solo uso)
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

Cada **canal** tiene su driver (`notifications/drivers.js`) y cada driver responde
dos preguntas: si hay un proveedor real detrás (`isConfigured`) y cómo fue el
envío (`send`). Hoy solo `IN_APP` tiene proveedor —la consola—; EMAIL, WHATSAPP,
SMS y PUSH quedan en `PENDING` con el motivo (`DRIVER_NOT_CONFIGURED`).

**Un canal sin proveedor nunca marca nada como enviado.** Decir `SENT` de algo
que nadie entregó convierte la bitácora en una mentira y hace imposible detectar
que un aviso no llegó. Integrar WhatsApp Cloud API, Twilio o un proveedor de
correo es escribir su driver: ni el dominio ni las rutas cambian.

Cuando un evento lleva algo que **no debe persistirse** —el enlace de activación
de una invitación, que contiene un token— viaja en el contexto en memoria hasta
el driver, y el cuerpo que se guarda en `notifications` es genérico.

Emitir una notificación **nunca lanza excepción**: marcar "llegué" tiene que
funcionar aunque el proveedor de correo esté caído.

## Alta de cuenta y onboarding

Quién aporta cada dato es una decisión de producto, no un detalle de formulario:

```
ADMIN crea la cuenta          →  contacto, roles, capacidades, zonas, activa
       ↓ invitación (enlace de un solo uso)
La persona activa su cuenta   →  elige su contraseña
       ↓
Onboarding                    →  su presentación, su biografía, su foto
```

Antes el ADMIN tecleaba también la biografía, la foto y la contraseña inicial del
trabajador. Eso significaba que alguien escribía en nombre de otro datos que son
suyos, y que existía una credencial compartida por correo. Ahora la empresa
aporta lo que solo ella sabe y la persona aporta lo suyo.

### Por qué el onboarding cuelga del perfil y no del rol

`onboarding_completed_at` vive en `staff_profiles` y en `customer_profiles`, no
en `users`. Con una sola columna, alguien que es trabajador **y** cliente daría
por completo su perfil de cliente al terminar el de trabajador.

`onboardingService` calcula, para cada persona, qué facetas le faltan
(`pendingScopes`) y devuelve los pasos de la primera, con los valores que ya
tiene. De ahí salen dos propiedades que importan:

- **No se pregunta dos veces.** Quien se registró con teléfono no vuelve a verlo;
  al trabajador no se le pide el nombre que ya puso Operaciones.
- **Quien solo administra no tiene onboarding.** No hay perfil que completar, así
  que `pending` es `false` y nada le bloquea.

Los pasos los define el backend (`STEPS`) y la pantalla los pinta: no hay dos
listas de campos que puedan desincronizarse.

La guarda de navegación vive en `App.jsx` y comprueba el onboarding **antes** que
el rol. Ese orden evita el rebote entre paneles y, sobre todo, el bucle: la
pantalla de onboarding redirige a casa solo cuando el backend dice que ya no hay
nada pendiente.

## Ubicación de las direcciones

Una dirección son dos datos complementarios que **no se sustituyen**:

| Mitad                  | Qué responde                | Quién manda |
| ---------------------- | --------------------------- | ----------- |
| `latitude`, `longitude`, `provider_place_id`, `geocoding_provider` | Dónde está la casa | El mapa |
| `street_line1/2`, `neighborhood`, `city`, `administrative_area`, `reference` | Cómo se describe | El cliente |

Los geocodificadores aciertan con la ciudad y la provincia, y fallan con
urbanizaciones, conjuntos y numeraciones de Quito. Por eso el formulario **no
desaparece** tras elegir el punto: una sugerencia solo se aplica cuando hay una
acción explícita (elegir un resultado, mover el pin, pedir la ubicación actual o
pulsar "usar la dirección del mapa"), y mover el pin no pisa lo que ya se
corrigió a mano.

No se añadieron columnas de número, edificio o departamento: `street_line1` y
`street_line2` ya lo cubren, y duplicarlas obligaría a decidir cuál manda.

### Un espacio es una dirección con su ficha de limpieza

Existía una tabla `properties` con su propia calle, ciudad y provincia, editable
desde una pantalla "Inmuebles". No la miraba ninguna reserva: el cliente escribía
la misma casa dos veces y el trabajador no veía ninguno de esos datos. Dos
modelos de dirección en paralelo, uno de ellos inútil.

Lo que sí aportaba —cuántas habitaciones, cuántos baños, cómo se entra, si hay
mascotas— describe **el lugar** y solo lo usa limpieza. Vive en
`address_cleaning_profiles`, que cuelga de la dirección igual que
`cleaning_details` cuelga de la orden:

```
addresses ──┬── address_cleaning_profiles   (la ficha: qué limpiamos ahí)
            └── orders                      (cada reserva, con su propio detalle)
```

De cara al cliente esas dos mitades juntas son **un espacio**, y así se llaman en
la interfaz (`/limpieza/espacios`). La dirección responde *dónde*; la ficha, *qué
limpiamos ahí*. El nombre del espacio es el `label` de la dirección —el mismo que
elige quien la guarda— y no hay un segundo nombre en paralelo.

Cuatro consecuencias que son el motivo del cambio:

- **La dirección es lo único que comparten los servicios.** Lavandería usa la
  misma sin arrastrar datos que no le importan, y un servicio futuro también.
- **No hay formulario duplicado.** El mismo componente
  (`cleaning/HomeProfileForm`) se usa en "Mis espacios" y dentro del asistente de
  reserva, y los dos guardan en `PATCH /customer/addresses/:id/cleaning-profile`.
- **Reservar no vuelve a preguntar lo del lugar.** El detalle de la orden se
  resuelve en el backend con `homeProfile.resolveHomeFields`: lo que la petición
  dice manda, y lo que no dice sale de la ficha. Antes se rellenaba con ceros
  cuando la petición no lo mencionaba, así que "no repetir datos" dependía de que
  el navegador se acordara de reenviarlos todos —es decir, de volver a
  preguntarlos para tener algo que enviar—.
- **La orden sigue guardando su propia foto.** `cleaning_details` no referencia
  la ficha: si el cliente cambia mañana los datos de su espacio, lo que se acordó
  en una reserva pasada no se reescribe.

#### Qué es del lugar y qué es de la visita

La frontera se declara una sola vez, en `domain/cleaning/homeProfile.js`, y de
ahí la leen los tres sitios que la necesitan: la ficha, la creación de la orden y
la validación (`http/schemas.js`). Una prueba comprueba que los tres conjuntos
siguen coincidiendo, así que un campo nuevo no puede quedarse a medio clasificar.

| Del lugar (se pregunta una vez)                       | De la visita (se pregunta cada vez)                     |
| ----------------------------------------------------- | ------------------------------------------------------- |
| tipo, habitaciones, baños, tamaño                     | tipo de limpieza, duración, áreas prioritarias, extras  |
| cómo se entra, clave de acceso, instrucciones, parqueo | si estarás en casa, si hoy las mascotas quedan aparte   |
| si hay mascotas y cuáles                              | algo delicado que cuidar esta vez, notas del día        |
| instrucciones fijas del lugar (`notes`)                | fecha y franja horaria                                  |

`notes` en la ficha y `special_instructions` en la orden son el mismo dato con dos
nombres heredados: las instrucciones que valen para todas las visitas de ese
lugar. Se unifican en el dominio en lugar de dejar que cada capa invente el suyo.

Una ficha cuenta como completa cuando tiene al menos un baño
(`isHomeProfileComplete`). No es un `completed_at` porque una fila podía existir
con todo a cero —creada de paso por una reserva antigua—, y un lugar sin baños no
es uno a medio describir: es uno que nadie ha descrito. Las habitaciones no
sirven para medirlo, porque una suite tiene cero.

El código de acceso se comporta igual que en una orden: se cifra con AES-256-GCM,
**nunca vuelve en una respuesta** (solo `hasAccessSecret`) y, si el cliente no
escribe uno nuevo al reservar, se copia el texto cifrado tal cual a la orden, sin
descifrarlo por el camino.

La migración 006 traslada los inmuebles existentes: si el cliente ya tenía una
dirección con la misma calle, se fusionan; si no, la dirección se crea a partir
del inmueble. Después, `properties` se elimina —mantenerla habría dejado el
modelo viejo al lado del nuevo.

### El proveedor no da nombre a las columnas

`google_place_id` se renombró a `provider_place_id` y se le añadió
`geocoding_provider` (migración 005) al cambiar el mapa a MapLibre y la
geocodificación a Geoapify. Un nombre de columna que menciona al proveedor de
turno obliga a migrar la base cada vez que ese proveedor cambia, y mezclar
identificadores de dos proveedores en la misma columna sin decir cuál es cuál
los vuelve inservibles: un `place_id` de Google no significa nada en Geoapify.

Los identificadores que ya existían se conservan, etiquetados como `GOOGLE`.
Nada de esto es imprescindible: lo que permite encontrar la casa son las
coordenadas y el texto, y la aplicación funciona con esos campos vacíos.

### Mapa y geocodificación

| Pieza | Quién | Dónde vive |
| ----- | ----- | ---------- |
| Render del mapa, pin arrastrable | MapLibre GL JS | `shared/maps/MapCanvas.jsx` |
| Autocompletado, geocodificación inversa, teselas | Geoapify | `shared/maps/geoapify.js`, `config.js` |

Se pasó de Google Maps Platform a esta combinación por coste: el flujo entero
—buscar, marcar, arrastrar, corregir— cabe en un plan gratuito. La frontera está
en `shared/maps/`: `MapCanvas` es el único archivo que importa MapLibre,
`geoapify.js` el único que conoce la forma de sus respuestas, y `config.js` el
único con URLs y claves. `AddressForm` no sabe nada de ninguno de los dos: recibe
`{ coordinates, placeId, provider, fields, source }` y decide qué hacer con eso.

Un detalle que no se ve venir: MapLibre parsea las teselas en un **web worker
que carga por su cuenta**, construyendo su ruta en tiempo de ejecución. El
empaquetador no puede verla, así que el worker no llega a emitirse y la petición
acaba en 404. El síntoma engaña —mapa gris con sus controles y su atribución,
sin pin y sin ningún error visible, porque el evento `load` no se emite nunca—,
así que la URL se le da explícitamente en `shared/maps/worker.js`.

La cuota se cuida donde se gasta: el buscador espera a que la escritura se
detenga (350 ms), ignora textos de menos de tres caracteres, cancela la petición
anterior, reutiliza los campos que ya trae el resultado elegido en lugar de
volver a preguntar, y la geocodificación inversa se dispara al **soltar** el pin,
nunca durante el arrastre.

Ninguna de las tres piezas es imprescindible: sin clave configurada el selector
se retira entero, si el mapa no carga queda el buscador, y si la geocodificación
inversa falla se conserva la coordenada marcada. En los tres casos la dirección
se escribe a mano.

### Cobertura sin PostGIS

`service_zones` eran etiquetas (ciudad, provincia) y no sabían dónde están. Se
les añadió un círculo —`center_latitude`, `center_longitude`, `radius_km`— en
lugar de polígonos con PostGIS: basta para "Quito y los valles", se calcula con
aritmética (`domain/shared/serviceArea.js`) y no añade una extensión a la base.
Cuando el negocio necesite fronteras reales, se sustituye ese módulo.

Dos reglas deliberadas:

- **Una zona sin círculo no opina**, y si ninguna zona activa lo tiene, no se
  rechaza nada. La restricción aparece cuando Operaciones la configura, no por
  defecto: abrir una ciudad no puede exigir un despliegue.
- **El sesgo del buscador sale de las zonas**, no de una constante
  (`GET /api/catalog/config` → `maps.bias`). Ampliar la cobertura amplía también
  dónde busca el cliente.

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
/inicio, /limpieza/*, /lavanderia/*, /arreglos,
/servicios, /direcciones                        → CUSTOMER
/operaciones/*                                  → ADMIN
/trabajo/*                                      → STAFF
```

Así el control de acceso se ve al leer `App.jsx`. `RequireRole` comprueba
`user.roles.includes(role)`, de modo que ADMIN + STAFF entra en los dos árboles;
cada consola ofrece un enlace a la otra solo si la persona tiene el rol. El
backend revalida todo: el enrutado solo evita mostrar pantallas que no
corresponden.

### Cuatro contextos, una aplicación

Para el cliente, limpieza, lavandería y arreglo de prendas son servicios
distintos: se contratan por motivos distintos y se preguntan cosas distintas. En
la primera versión compartían una sola pantalla con todo mezclado, y el
resultado era que nada parecía diseñado para lo que la persona venía a hacer.

Ahora cada uno tiene su rama de rutas, su navegación y su acento de color. Lo
que **no** se duplicó: la sesión, el cliente HTTP, las direcciones, el detalle
de pedido, el historial global ni los componentes. No hay tres aplicaciones,
tres backends ni tres sistemas de sesión; hay un contexto de servicio.

Ese contexto es una tabla, `shared/services/index.js`:

```js
{ code: 'LAUNDRY', slug: 'lavanderia', path: '/lavanderia', label: 'Lavandería',
  icon: Shirt, nav: [ … ] }
```

De ahí salen la navegación (escritorio y móvil), el conmutador de servicio, los
enlaces de la portada y el color. Añadir una pantalla a un servicio es añadir
una fila; **ninguna pantalla escribe su propia lista de enlaces**.

Junto a los tres servicios hay un cuarto contexto: **Mi cuenta**
(`ACCOUNT_CONTEXT`). "Fuera de un servicio" tiene nombre y navegación propios en
lugar de ser la ausencia de contexto, y eso es lo que permite dibujar un solo
sistema de navegación en vez de dos barras que se pisan.

#### La jerarquía del encabezado

```
OTTERLY CLEAN                                    ← marca y sesión
     ↓
[Mi cuenta] [LIMPIEZA] [Lavandería] [Arreglos]   ← en qué estás (relleno = actual)
     ↓
Resumen · Reservar · Mis reservas · Mis espacios  ← qué se puede hacer ahí
```

El orden es el arreglo: antes la navegación del servicio iba arriba y el
conmutador debajo, así que lo que representaba el contexto entero parecía un menú
secundario colgado de sus propias opciones. Ahora el contexto va primero, lleva su
acento de color relleno, y sus opciones cuelgan de él en una banda con ese mismo
acento —la única con fondo sólido es la pestaña activa; si las opciones también lo
tuvieran, volverían a pesar lo mismo—.

En móvil son los mismos tres niveles repartidos para no apilar barras: marca y
sesión arriba, el conmutador justo debajo (desplazable), y las opciones del
contexto en la barra inferior, donde llega el pulgar. La banda de escritorio no se
repite ahí.

**Cuenta o servicio, nunca las dos cosas.** Ninguna opción aparece en dos
niveles: Direcciones y el historial completo son de la cuenta —una dirección sirve
para limpiar, para recoger ropa y para lo que venga—; Mis espacios es de limpieza,
porque solo limpieza necesita saber cuántos baños tiene un lugar. Un contexto con
una sola pantalla (Arreglos) no dibuja banda: la pantalla ya se titula.

Tres decisiones que lo mantienen simple:

- **Los tipos siguen siendo tres, fijos y conocidos.** La tabla les da nombre y
  ruta, no los inventa: sigue mandando `domain/shared/serviceTypes.js`.
- **Quién decide si se puede reservar es el backend.** `useServiceExperiences`
  cruza la tabla con `GET /api/catalog/config` (`implemented` + `active` →
  `bookable`) y solo entonces aparece un botón de reservar. Arreglo de prendas
  tiene su pantalla y su color, pero no ofrece una reserva que el dominio no
  sabe crear.
- **El asistente de reserva es uno.** `BookingWizard` recibe el servicio de la
  ruta (`serviceType`) y oculta el paso de elegirlo; el resto del flujo es el
  mismo código. Lo único que cambia es el segundo paso: limpieza elige un espacio
  (`StepSpace`) y lavandería una dirección (`StepAddress`), porque lavandería no
  entra en la casa.
- **Nadie sale del asistente para volver a entrar.** Si no hay espacio o no hay
  dirección, se crea ahí mismo con los mismos formularios de siempre
  (`SpaceSetup` encadena `AddressForm` y `HomeProfileForm`); no hay una segunda
  implementación del formulario dentro del wizard.

Las rutas anteriores (`/reservar`, `/reservar?servicio=…`, `/inmuebles`,
`/limpieza/hogar`) siguen existiendo como redirecciones: no se rompe ningún enlace
guardado.

### El seguimiento muestra cinco estados

Una limpieza tiene ocho estados y una lavandería más, y una columna de ocho puntos
deja de leerse de un vistazo: se vuelve un documento. `timelineWindow`
(`shared/ui/timelineWindow.js`) recorta a cinco **alrededor del estado actual**, no
a los cinco primeros: al empezar se ven los primeros, y con el servicio avanzado se
ve el paso anterior, el actual y lo que queda. Lo que se deja fuera se dice ("2
estados antes") y la línea vertical se difumina, así que la lista no se corta en
silencio. En el detalle del servicio se puede desplegar el recorrido completo.

### Identidad visual por servicio

Cada experiencia tiene un acento, y los tres salen de la paleta que ya existía
—verde bosque, salvia y terracota—, para que sigan siendo la misma marca:

| Servicio  | Acento          |
| --------- | --------------- |
| Limpieza  | Verde bosque    |
| Lavandería| Salvia          |
| Arreglos  | Terracota       |

Se resuelve con un atributo y cinco variables CSS (`index.css`):
`[data-service='LAUNDRY']` redefine `--service`, `--service-strong`,
`--service-soft`… y `@theme inline` las expone como `text-service`,
`bg-service-soft`, `border-service`. El contenedor de la experiencia pone el
atributo y **ningún componente escribe el color de un servicio**: una tarjeta de
pedido en una lista mezclada lleva su propio acento con solo declarar
`data-service={order.serviceType}`.

Fuera de un servicio —portada, direcciones, consolas internas— `--service` vale
el verde de la marca, así que esas pantallas se ven exactamente igual que antes
sin tocarlas. No hay más sistema de temas que esto, a propósito.

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

**El refresco es único en vuelo.** La promesa vive en el módulo
(`shared/api/client.js` → `refreshSession`), no en un componente, y todo el que
necesite refrescar espera a la misma: el interceptor de 401, y también el efecto
de arranque que recupera la sesión al cargar la página.

No es una optimización, es lo que hace que recargar funcione. El refresh token
**rota en cada uso**, así que dos llamadas en paralelo con el mismo token
terminan con una rechazada. Y el efecto de arranque de React se ejecuta **dos
veces** en modo estricto: sin deduplicar, la segunda presentaba un token ya
rotado, recibía 401 y cerraba la sesión. El síntoma era exactamente ese —recargar
parecía cerrar sesión— y la causa no estaba en la autenticación, sino en pedir
dos veces lo que solo se puede pedir una.

La otra mitad de la regla: **una sesión solo termina cuando el servidor lo dice**
(401/403). Un servidor caído o una conexión que se corta dejan al usuario fuera
de las pantallas privadas, pero **no borran el refresh token**, para que volver a
cargar cuando haya red baste para entrar. Antes, cualquier fallo de red obligaba
a escribir la contraseña otra vez.

El servidor cierra la carrera por su lado con un **margen de rotación** de 30
segundos (`authService.ROTATION_GRACE_MS`): un token recién rotado se sigue
aceptando ese rato, para que dos pestañas que recargan a la vez no se echen
fuera. Revocar sigue siendo inmediato —ver
[Seguridad](SECURITY.md#rotación-y-margen).

## Qué está preparado pero no implementado

| Área              | Qué existe ya                                                    |
| ----------------- | ---------------------------------------------------------------- |
| Pagos             | Tabla `payments`, importes, moneda, impuesto y estado en `orders` |
| Email/WhatsApp/SMS/Push | Abstracción de canal con drivers, catálogo de eventos y registro en base; falta el proveedor |
| Arreglo de prendas| Tipo, tabla de detalle, plan y configuración comercial administrable; falta el flujo |
| QR / códigos      | `laundry_bags.bag_code` como texto libre                          |
| Geolocalización   | Punto exacto por dirección y cobertura por zona; falta usarlo para navegación y distancias |
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

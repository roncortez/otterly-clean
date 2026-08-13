# Seguridad y privacidad

Los trabajadores entran físicamente a las casas de los clientes. Eso convierte
la seguridad en parte del producto, no en una capa técnica añadida al final.

## Modelo de amenazas

| Amenaza                                                | Control |
| ------------------------------------------------------ | ------- |
| Alguien obtiene un volcado de la base y con él, acceso físico a viviendas | Los códigos de puerta y la ubicación de llaves se cifran con AES-256-GCM |
| Un trabajador consulta datos de clientes que no atiende | Cada consulta se filtra por la asignación viva del trabajador |
| Un trabajador se lleva el teléfono y la llave de casas que quizá nunca atienda | El contacto y el código de acceso solo viajan con la asignación **confirmada**, no con la ofrecida |
| Un trabajador abandona un servicio confirmado desde la aplicación | Rechazar solo es posible mientras la asignación esté en `OFFERED`; después, la reasignación es de Operaciones |
| Quien reporta una incidencia decide su gravedad | `severity` nace nula y solo la fija `PATCH /api/operations/incidents/:id/severity`, que exige `ADMIN` y queda auditado |
| Un cliente ve o modifica pedidos de otro                | Toda lectura y escritura verifica la propiedad del recurso |
| Un trabajador se asigna trabajo a sí mismo              | La transición a `ASSIGNED` solo la admite el rol `ADMIN` |
| Alguien se registra como administrador                  | El registro público fuerza el rol `CUSTOMER`; el rol nunca se acepta del cliente |
| Una contraseña inicial se filtra por correo o WhatsApp   | Nunca se envía ninguna: la cuenta nace sin contraseña utilizable y se activa con un enlace de un solo uso |
| Un enlace de invitación filtrado abre una cuenta meses después | El token caduca, se consume al usarse y emitir uno nuevo revoca el anterior |
| Un trabajador se asigna a sí mismo un rol o una capacidad | El perfil propio es una lista blanca de campos personales; `roles`, `service_types` y verificación no están en ella |
| Alguien enumera las fotos de perfil de la base           | El nombre del archivo lleva un sufijo aleatorio; la referencia vive en la ficha, la URL no se adivina |
| Un token sigue sirviendo tras desactivar a alguien      | Los roles y el estado se releen de la base en cada petición |
| Alguien se queda sin acceso administrativo por error    | No se puede retirar el rol ni desactivar al último `ADMIN` activo |
| Un trabajador cambia precios o cierra la agenda         | Toda la configuración cuelga de `/api/operations` y exige `ADMIN` |
| Un secreto acaba editable desde una pantalla            | La configuración administrable es una lista blanca de campos públicos; el esquema es estricto y rechaza claves desconocidas |
| Alguien sube un archivo ejecutable disfrazado de imagen | Se valida la firma binaria, no el `Content-Type`; SVG no se admite |
| Alguien escribe en una carpeta arbitraria del almacenamiento | El destino es un catálogo cerrado; la ruta nunca viene de la petición |
| No se puede saber quién hizo qué                        | `audit_log` registra actor, acción, antes/después, IP y agente |

## Autenticación

- Contraseñas con **bcrypt**, 12 rondas por defecto (`BCRYPT_ROUNDS`).
- **Access token JWT** de vida corta (15 min) + **refresh token opaco** de vida
  larga, guardado en base de datos **solo como hash SHA-256**. La base nunca
  contiene un token utilizable.
- El refresh token **rota en cada uso**: el anterior se revoca.
- Cambiar la contraseña revoca todas las sesiones abiertas.
- Desactivar a un trabajador revoca sus sesiones.
- Revocar es siempre **inmediato**; solo la rotación tiene margen (ver abajo).
- El login responde el mismo mensaje y consume un tiempo similar tanto si el
  correo no existe como si la contraseña es incorrecta, para no revelar qué
  correos están registrados.

### Invitaciones: cómo entra alguien nuevo

Las cuentas de trabajador las crea Operaciones, y **nunca con una contraseña
inicial**. La cuenta nace con el hash de un valor aleatorio que no conoce nadie,
así que no se puede entrar con ella hasta que su dueño elija su clave.

El acceso llega por un enlace de un solo uso:

```
https://otterlyclean.ec/activar-cuenta?token=<64 hex>
```

- Token de **32 bytes** de `crypto.randomBytes`.
- La base guarda **solo el SHA-256** (`user_invitations.token_hash`), igual que
  con los refresh tokens: un volcado no permite activar ninguna cuenta.
- **Caduca** (`INVITATION_TTL_HOURS`, 72 h por defecto).
- **Se consume al usarse**: aceptar marca `accepted_at` dentro de la misma
  transacción que fija la contraseña, así que no existe un instante con la clave
  puesta y el enlace todavía válido.
- **Emitir una nueva revoca la anterior**, de modo que en todo momento hay como
  mucho un enlace utilizable por persona.
- Aceptar revoca las sesiones abiertas de esa cuenta.
- Token inexistente, caducado o ya usado responden **404 por igual**: esta ruta
  no puede convertirse en un detector de correos registrados.

El enlace **no se guarda en `notifications`**: el cuerpo del aviso es genérico y
la URL con el token viaja solo en memoria hasta el driver. Mientras no exista un
proveedor real de correo o WhatsApp, la respuesta de crear o reenviar la
invitación devuelve el enlace a quien la generó, que es quien ya podía emitirlo.

### Rotación y margen

Rotar el refresh token en cada uso deja una ventana de carrera real: dos
pestañas que recargan a la vez, o dos peticiones que reciben 401 juntas,
presentan el **mismo** token. Una gana y la otra recibía "sesión expirada", que
en la práctica echaba fuera a alguien que no había hecho nada malo.

Se distingue **rotar** de **revocar**:

| Qué pasó                                    | Columnas                       | ¿Sirve todavía? |
| ------------------------------------------- | ------------------------------ | --------------- |
| Se usó para refrescar                       | `revoked_at` + `rotated_at`    | Sí, 30 segundos |
| Cerrar sesión, cambiar contraseña, desactivar la cuenta, aceptar invitación | `revoked_at`, `rotated_at = NULL` | No, en el acto |

El margen (`authService.ROTATION_GRACE_MS`, 30 s) solo se aplica al primer caso,
y `rotated_at` se escribe una única vez: reusar dentro del margen **no** alarga
la ventana. Todas las revocaciones pasan por `authService.revokeAllSessions`,
para que no haya un cuarto sitio donde se olvide retirar el margen.

Es un compromiso consciente: un token robado que se use en los 30 segundos
siguientes a su rotación funciona. A cambio, la sesión de un usuario legítimo no
depende de que dos peticiones suyas no coincidan. El acceso obtenido así dura lo
que dure el access token (15 min) y se corta cerrando sesión o cambiando la
contraseña, que no tienen margen.

### Dónde vive el token en el navegador

El access token se guarda **en memoria**; solo el refresh token se persiste en
`localStorage`. Un XSS que lea `localStorage` no obtiene un token de acceso
vigente y la sesión puede revocarse desde el servidor.

Es un compromiso conocido: la alternativa —cookie `HttpOnly` + `SameSite`—
protege mejor frente a XSS pero complica la futura aplicación móvil. Si el
producto llega a manejar pagos, conviene revisar esta decisión.

## Autorización

Se aplica en tres niveles, y ninguno confía en el anterior:

1. **Ruta**: cada árbol exige un rol (`requireRole`). Todo lo que cuelga de
   `/api/operations` exige `ADMIN`; `/api/staff` exige `STAFF`.
2. **Recurso**: se comprueba la propiedad. Un cliente solo accede a sus
   pedidos; un trabajador solo a los que tiene asignados.
3. **Transición**: la máquina de estados valida que ese rol pueda ejecutar ese
   cambio concreto.

Cuando un recurso existe pero no corresponde al solicitante se responde **404,
no 403**: un 403 confirmaría que el pedido existe.

### Roles múltiples

Una persona puede tener varios roles (`user_roles`). Dos consecuencias para la
seguridad:

- **La autorización comprueba pertenencia, nunca igualdad**: `hasAnyRole`, no
  `role === 'ADMIN'`. El JWT lleva la lista, pero **los roles se releen de la
  base en cada petición**: retirarle ADMIN a alguien surte efecto en la
  siguiente llamada, sin esperar a que caduque su token.
- **El rol efectivo es el de la ruta, no el mayor del usuario.** Alguien con
  ADMIN + STAFF que entra por `/api/staff` recibe la proyección del trabajador:
  sin importes, sin correo del cliente, sin notas internas. Se aplica el mínimo
  privilegio del contexto, no el máximo de la persona.

### El último administrador

No se puede retirar el rol `ADMIN` ni desactivar la cuenta si eso dejaría el
sistema sin ningún administrador activo (`userService.assertNotLastActiveAdmin`).
La comprobación ocurre **dentro de la transacción**, para que dos peticiones
simultáneas no se autoricen mutuamente. Se aplica también al desactivar desde la
pantalla de trabajadores, porque alguien puede ser STAFF y ADMIN a la vez.

Es una protección contra el error humano, no contra un atacante: quien ya tiene
ADMIN puede otorgar el rol a otra cuenta suya. Su valor es evitar dejar la
instalación irrecuperable desde la aplicación.

### Mínimo privilegio en las respuestas

El mismo pedido se proyecta distinto según quién pregunta
(`orderService.projectOrder`):

| Dato                          | CUSTOMER | STAFF | ADMIN |
| ----------------------------- | :------: | :---: | :---: |
| Estado y timeline             | Sí       | Sí    | Sí    |
| Dirección e instrucciones     | Sí       | Sí    | Sí    |
| Coordenada exacta del domicilio | Sí     | Sí    | Sí    |
| Nombre de pila del cliente    | —        | Sí    | Sí    |
| Teléfono del cliente          | Sí       | **Solo tras confirmar** | Sí |
| Apellido y correo del cliente | Sí       | **No**| Sí    |
| Importes y desglose           | Sí       | **No**| Sí    |
| Notas internas                | No       | No    | Sí    |
| Identidad completa del trabajador | **No** | —   | Sí    |
| Verificación y documentos del trabajador | **No** | — | Sí |

### El contacto del cliente llega con el compromiso, no con la asignación

Que Operaciones ofrezca un trabajo a alguien no significa que vaya a hacerlo:
puede rechazarlo, o puede reasignarse. Por eso el teléfono del cliente **no viaja
mientras la asignación esté en `OFFERED`**; aparece al confirmarla (`ACCEPTED`) y
deja de viajar al completar el servicio, cuando la asignación pasa a `COMPLETED`.
Es la misma regla que ya protegía el código de la puerta, que ahora **también
exige asignación confirmada**.

La restricción está en la proyección (`orderService.projectOrder`), no en la
pantalla: el campo no existe en la respuesta, así que no hay nada que revelar
inspeccionando la red. La interfaz solo explica la ausencia.

El mismo límite se aplica a las incidencias: `POST /api/staff/jobs/:id/incidents`
responde 403 mientras el trabajo no esté confirmado, y a rechazar la asignación,
que responde 409 una vez confirmada.

### La coordenada sí viaja

La ubicación exacta que marcó el cliente se entrega a quien tiene que llegar a la
casa. No es una concesión: el trabajador ya recibe la dirección escrita completa,
y darle un punto menos preciso no protege nada —solo hace que llame al cliente
para preguntar dónde es—. Sigue filtrada por asignación viva, como el resto del
pedido.

El cliente solo recibe del profesional lo necesario para confiar: nombre de
presentación, foto, biografía y si está verificado. Nunca su apellido, teléfono
ni su estado de antecedentes.

### Perfil propio frente a datos administrativos

`/api/me` es el único árbol cuyo sujeto no es un rol sino la persona, y su
control de acceso es el más simple posible: **no hay ningún `:id` en sus rutas**,
el recurso es siempre `req.user.id`. No existe forma de pedir ni de escribir el
perfil de otra persona.

Dentro de él, la frontera la define `profileService.SELF_EDITABLE`, una lista
blanca de campos personales:

| Dato                                             | Lo cambia |
| ------------------------------------------------ | --------- |
| Nombres, apellidos, teléfono, idioma              | La persona |
| Nombre de presentación, biografía, habilidades    | La persona (si es STAFF) |
| Foto de perfil                                    | La persona |
| Datos de facturación y preferencias de marketing  | La persona (si es CUSTOMER) |
| **Roles**                                         | ADMIN |
| **Estado de la cuenta (activo/inactivo)**         | ADMIN |
| **Capacidades de servicio (`service_types`)**     | ADMIN |
| **Zonas, verificación, antecedentes, código de empleado, fecha de alta** | ADMIN |

Que `roles` o `service_types` no aparezcan ahí no es un filtro "por si acaso":
es que el mapa no los contiene. Además el esquema Zod es `.strict()`, así que un
`{"roles": ["ADMIN"]}` en el cuerpo responde **400** en lugar de guardarse a
medias, y el servicio vuelve a comprobar por rol antes de escribir. La simetría
también se aplica en el otro sentido: `PATCH /api/operations/staff/:id` ya no
admite `bio`, `photoUrl` ni `displayName`.

### Fotos de perfil

Misma tubería que las imágenes de marca —firma binaria, límite de tamaño, sin
SVG, en memoria y nunca en disco— con dos diferencias:

- **El destino se deriva de la sesión**, no de la petición: la carpeta es fija y
  el nombre se construye con `req.user.id`.
- **El nombre lleva un sufijo aleatorio**. Cloudinary sirve por URL pública, y un
  nombre predecible (`usuario-42`) permitiría recorrer las fotos de toda la base.
  La referencia se guarda en la ficha (`photo_public_id`) y la URL no se adivina.

En la base solo hay referencias: la imagen nunca entra en una columna.

## Datos sensibles de acceso

Los códigos de puerta, claves de alarma y la ubicación de una llave escondida
se cifran con **AES-256-GCM** antes de tocar la base de datos
(`services/crypto.js`). El formato incluye versión, IV y tag de autenticación:

```
v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
```

Reglas de manejo:

- **Nunca** viajan en la respuesta normal de un pedido ni de una dirección. Se
  sustituyen por un booleano `hasAccessSecret`.
- Solo se entregan bajo petición explícita a
  `GET /api/staff/jobs/:id/access-secret`.
- Solo al trabajador que **confirmó** el trabajo. Con la asignación en `OFFERED`
  la petición responde 403: haber recibido un ofrecimiento no es motivo para
  tener la llave de una casa. Al completar el servicio la asignación pasa a
  `COMPLETED` y el acceso se pierde, aunque el trabajador conserve el historial
  del trabajo.
- Cada consulta se registra en `audit_log` con la acción
  `ACCESS_SECRET_VIEWED`.
- El mismo tratamiento se aplica al código guardado en la ficha del hogar
  (`address_cleaning_profiles.access_secret_encrypted`): se cifra igual, no sale
  nunca en una respuesta, y al reservar se copia **ya cifrado** al detalle de la
  orden, sin descifrarlo por el camino.

### Rotación de `ENCRYPTION_KEY`

Cambiar la clave **invalida los secretos ya guardados**: no se podrán descifrar.
Para rotarla hace falta un proceso que descifre con la clave antigua y vuelva a
cifrar con la nueva, escribiendo un prefijo `v2:`. El prefijo de versión existe
justamente para permitirlo.

## Validación de entrada

Toda entrada se valida con **Zod** en el backend antes de llegar a la lógica de
negocio (`http/schemas.js`). El frontend no es una barrera de seguridad: valida
solo para dar buena experiencia.

Las consultas SQL son **siempre parametrizadas**. Donde el SQL se construye de
forma dinámica (filtros, actualizaciones parciales), los nombres de columna
provienen de listas blancas en el código y los valores viajan como parámetros,
nunca interpolados.

## Configuración

Hay dos configuraciones y **no deben mezclarse nunca**.

### Técnica: fuera de la aplicación

| Variable         | Producción                                              |
| ---------------- | ------------------------------------------------------- |
| `JWT_SECRET`     | Obligatoria. El arranque falla si falta                  |
| `ENCRYPTION_KEY` | Obligatoria, 32 bytes en hex. Se rechaza el valor de desarrollo |
| `CORS_ORIGINS`   | Lista explícita de orígenes permitidos                   |
| `DB_SSL`         | `true` cuando la base no esté en la misma red privada    |

Nada de esto es editable desde ninguna pantalla, y no existe endpoint que lo
lea ni lo escriba. La pantalla de configuración **no gestiona secretos**.

### Comercial: administrable y pública

Datos de la empresa, precios, si un servicio se ofrece y cuándo la agenda acepta
reservas. Todo ello es información que ya se muestra en la web pública, así que
exponerla no añade riesgo. Los controles:

- `companyService.FIELDS` es una **lista blanca**: solo esos campos existen.
- El esquema Zod es `.strict()`, así que una clave desconocida —`jwtSecret`,
  por ejemplo— hace fallar la petición con 400 en lugar de guardarse "por si
  acaso" en el JSONB.
- `getPublic()` es el único punto por donde sale la configuración al frontend
  anónimo, para tener un sitio donde recortar la respuesta si algún día se añade
  un campo interno.
- Los enlaces se validan como URL: así no llegan al navegador cadenas con
  esquemas raros (`javascript:`) desde un campo de texto.
- Los parámetros de precio se filtran contra el descriptor del modelo
  (`normalizePlanConfig`); lo que no pertenece al modelo se descarta.
- Los nombres de columna de todas las actualizaciones parciales vienen de listas
  blancas en el código; los valores viajan siempre como parámetros.

Se usa **helmet** para las cabeceras de seguridad y el cuerpo de las peticiones
está limitado a 1 MB.

### Subida de imágenes

Solo `ADMIN`, y solo para imágenes que ya son públicas. Los controles:

- **El destino no es una ruta.** Se elige de un catálogo cerrado
  (`uploadService.SLOTS`); la carpeta y el nombre del archivo los pone el
  servidor. El nombre que envía el navegador se descarta por completo, así que
  un `../../` en el nombre no lleva a ninguna parte.
- **Se comprueba la firma binaria** del archivo, no el `Content-Type` que
  declara el cliente: ese dato se puede falsear. Un `.png` que en realidad es un
  script se rechaza.
- **SVG no se admite.** Es XML, puede contener scripts y no tiene firma binaria
  que verificar. Un logo en SVG hay que convertirlo antes a PNG.
- **En memoria, nunca en disco**: el archivo se reenvía al almacenamiento y no
  toca el sistema de ficheros del servidor, así que no queda una carpeta de
  subidas que alguien pueda acabar sirviendo por error.
- Tamaño limitado (`UPLOAD_MAX_BYTES`, 5 MB por defecto) y un solo archivo por
  petición.
- Cada subida y cada borrado quedan en `audit_log` (`MEDIA_UPLOADED`,
  `MEDIA_DELETED`).

Las credenciales de Cloudinary son **configuración técnica**: viven en variables
de entorno y no se pueden ver ni editar desde ninguna pantalla.

### La clave del mapa

`VITE_GEOAPIFY_API_KEY` la usa el navegador —el mapa de MapLibre pide sus teselas
y el buscador consulta Geoapify desde el cliente—, así que **no es un secreto**:
viaja en cada petición y cualquiera puede leerla. Tratarla como si lo fuera
—esconderla tras el backend— no protegería nada, añadiría un proxy que mantener
y rompería el mapa.

Lo que sí la protege son sus restricciones, y hay que configurarlas en el panel
de Geoapify antes de publicar:

- **Allowed origins/referrers**: solo los dominios de la aplicación. Es lo que
  impide que la clave se use desde otro sitio y agote la cuota.
- **Una clave por entorno**: desarrollo y producción separadas, para poder
  revocar una sin apagar la otra.
- **Alertas de consumo** en el plan gratuito: un pico anómalo es la señal de que
  la clave se está usando fuera de la aplicación.

Aun así no se escribe en el código: llega por variable de entorno, como el resto,
y está encapsulada en `shared/maps/config.js`. Si falta, la pantalla de
direcciones sigue funcionando escribiendo a mano.

Ninguna credencial del backend viaja en variables `VITE_*`: todo lo que empieza
por `VITE_` acaba dentro del paquete que se descarga el navegador. Las claves que
sí son secretas (Cloudinary, JWT, cifrado) siguen viviendo solo en el backend.

El consumo también se cuida por diseño, porque la cuota es finita: el buscador
espera a que la escritura se detenga, ignora textos de menos de tres caracteres,
cancela la petición anterior al escribir otra y **no geocodifica durante el
arrastre del pin**, solo al soltarlo.

### Ubicación de las direcciones

La coordenada que elige el cliente es un dato del negocio, no del proveedor de
mapas: se guarda en `addresses.latitude/longitude` junto al texto que él escribe.
`provider_place_id` y `geocoding_provider` se conservan como referencia, pero
**la dirección tiene que seguir siendo utilizable sin el proveedor**, y las
pruebas lo comprueban. Mostrar una dirección ya guardada no llama a nadie de
fuera.

Que una ubicación sea válida no significa que se atienda. La comprobación contra
las zonas activas ocurre **en el backend**, tanto al guardar la dirección como al
reservar: el aviso del navegador es cortesía, no control. Fuera de cobertura, la
dirección se puede guardar —puede ser la casa de un familiar— pero la reserva se
rechaza con `OUT_OF_SERVICE_AREA`.

## Auditoría

`audit_log` registra las operaciones sensibles: creación de pedidos, cambios de
estado, asignaciones y reasignaciones, cancelaciones, incidencias, consultas de
códigos de acceso, altas y bajas de trabajadores e inicios de sesión fallidos.

También toda la configuración administrativa:

```
COMPANY_SETTINGS_UPDATED        datos públicos de la empresa
SERVICE_CONFIGURATION_UPDATED   se ofrece / cómo se presenta un servicio
SERVICE_PLAN_UPDATED            precios y parámetros del modelo
BOOKING_BLACKOUT_CREATED        cierre de agenda
BOOKING_BLACKOUT_UPDATED
BOOKING_BLACKOUT_DELETED
USER_ROLES_UPDATED              quién concedió o retiró qué rol
USER_STATUS_CHANGED             alta o baja de una cuenta
MEDIA_UPLOADED                  imagen subida, con destino y tamaño
MEDIA_DELETED                   imagen retirada
USER_INVITED                    quién invitó a quién, por qué canal y hasta cuándo
USER_INVITATION_ACCEPTED        cuándo se activó la cuenta
PROFILE_UPDATED                 qué campos cambió alguien de su propio perfil
PROFILE_PHOTO_UPDATED           foto puesta o retirada
ONBOARDING_COMPLETED            perfil dado por completo, con su faceta
INCIDENT_CLASSIFIED             quién puso o cambió la gravedad de una incidencia
```

Los cambios de configuración, de roles y la clasificación de incidencias guardan
`before` y `after`, de modo que se puede reconstruir quién subió un precio, quién
se dio permisos o quién bajó la gravedad de un daño, y cuándo.

La escritura ocurre **dentro de la misma transacción** que la operación
auditada, de modo que no puede existir un cambio sin su rastro.

Todavía **no hay interfaz para consultarlo**: se lee por SQL. Es una limitación
conocida y deliberada de esta versión.

## Pendiente antes de producción

- [ ] **Rotar la `CLOUDINARY_API_SECRET` — prioritario.** La cuenta que usa la
      subida de imágenes es la del proyecto anterior y su secreto pudo
      compartirse por otros medios. Con ese secreto se puede escribir y borrar
      en toda la cuenta, no solo en `otterly-clean/`. Rotarlo en el panel de
      Cloudinary y actualizar el `.env`: no hay nada más que cambiar en el
      código.
- [ ] **Rotar las demás credenciales heredadas** (Telegram, Firebase), aunque ya
      no se usen.
- [ ] Revisar los ~220 archivos sueltos en la raíz de la cuenta de Cloudinary,
      que vienen del proyecto anterior. Lo que sube esta aplicación queda bajo
      `otterly-clean/`; el resto no lo toca nadie y conviene decidir si se
      archiva o se borra.
- [ ] Si el frontend se sirve con una CSP propia, añadir `res.cloudinary.com` a
      `img-src`: si no, las imágenes subidas no se verán en producción.
- [ ] Limitar los intentos de inicio de sesión por IP y por cuenta.
- [ ] Servir todo por HTTPS y marcar `Strict-Transport-Security`.
- [ ] Definir la política de retención: cuánto tiempo se conservan los códigos
      de acceso tras completar un servicio. Hoy se conservan indefinidamente;
      lo razonable es borrarlos al cerrar el pedido.
- [ ] Revisar la decisión de `localStorage` frente a cookies `HttpOnly` si se
      integran pagos.
- [ ] Registro de consentimiento del cliente para el tratamiento de sus datos.

## Cómo reportar un problema

Los hallazgos de seguridad no deberían abrirse como incidencias públicas.
Definir un contacto interno antes de publicar el repositorio.

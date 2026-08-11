# Seguridad y privacidad

Los trabajadores entran físicamente a las casas de los clientes. Eso convierte
la seguridad en parte del producto, no en una capa técnica añadida al final.

## Modelo de amenazas

| Amenaza                                                | Control |
| ------------------------------------------------------ | ------- |
| Alguien obtiene un volcado de la base y con él, acceso físico a viviendas | Los códigos de puerta y la ubicación de llaves se cifran con AES-256-GCM |
| Un trabajador consulta datos de clientes que no atiende | Cada consulta se filtra por la asignación viva del trabajador |
| Un cliente ve o modifica pedidos de otro                | Toda lectura y escritura verifica la propiedad del recurso |
| Un trabajador se asigna trabajo a sí mismo              | La transición a `ASSIGNED` solo la admite el rol `ADMIN` |
| Alguien se registra como administrador                  | El registro público fuerza el rol `CUSTOMER`; el rol nunca se acepta del cliente |
| Un token sigue sirviendo tras desactivar a alguien      | El rol y el estado se releen de la base en cada petición |
| No se puede saber quién hizo qué                        | `audit_log` registra actor, acción, antes/después, IP y agente |

## Autenticación

- Contraseñas con **bcrypt**, 12 rondas por defecto (`BCRYPT_ROUNDS`).
- **Access token JWT** de vida corta (15 min) + **refresh token opaco** de vida
  larga, guardado en base de datos **solo como hash SHA-256**. La base nunca
  contiene un token utilizable.
- El refresh token **rota en cada uso**: el anterior se revoca.
- Cambiar la contraseña revoca todas las sesiones abiertas.
- Desactivar a un trabajador revoca sus sesiones.
- El login responde el mismo mensaje y consume un tiempo similar tanto si el
  correo no existe como si la contraseña es incorrecta, para no revelar qué
  correos están registrados.

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

### Mínimo privilegio en las respuestas

El mismo pedido se proyecta distinto según quién pregunta
(`orderService.projectOrder`):

| Dato                          | CUSTOMER | STAFF | ADMIN |
| ----------------------------- | :------: | :---: | :---: |
| Estado y timeline             | Sí       | Sí    | Sí    |
| Dirección e instrucciones     | Sí       | Sí    | Sí    |
| Nombre del cliente            | —        | Sí    | Sí    |
| Teléfono del cliente          | Sí       | Sí    | Sí    |
| Correo del cliente            | Sí       | **No**| Sí    |
| Importes y desglose           | Sí       | **No**| Sí    |
| Notas internas                | No       | No    | Sí    |
| Identidad completa del trabajador | **No** | —   | Sí    |
| Verificación y documentos del trabajador | **No** | — | Sí |

El cliente solo recibe del profesional lo necesario para confiar: nombre de
presentación, foto, biografía y si está verificado. Nunca su apellido, teléfono
ni su estado de antecedentes.

## Datos sensibles de acceso

Los códigos de puerta, claves de alarma y la ubicación de una llave escondida
se cifran con **AES-256-GCM** antes de tocar la base de datos
(`services/crypto.js`). El formato incluye versión, IV y tag de autenticación:

```
v1:<iv-hex>:<authTag-hex>:<ciphertext-hex>
```

Reglas de manejo:

- **Nunca** viajan en la respuesta normal de un pedido. Se sustituyen por un
  booleano `hasAccessSecret`.
- Solo se entregan bajo petición explícita a
  `GET /api/staff/jobs/:id/access-secret`.
- Solo al trabajador con **asignación viva**. Al completar el servicio la
  asignación pasa a `COMPLETED` y el acceso al secreto se pierde, aunque el
  trabajador conserve el historial del trabajo.
- Cada consulta se registra en `audit_log` con la acción
  `ACCESS_SECRET_VIEWED`.

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

| Variable         | Producción                                              |
| ---------------- | ------------------------------------------------------- |
| `JWT_SECRET`     | Obligatoria. El arranque falla si falta                  |
| `ENCRYPTION_KEY` | Obligatoria, 32 bytes en hex. Se rechaza el valor de desarrollo |
| `CORS_ORIGINS`   | Lista explícita de orígenes permitidos                   |
| `DB_SSL`         | `true` cuando la base no esté en la misma red privada    |

Se usa **helmet** para las cabeceras de seguridad y el cuerpo de las peticiones
está limitado a 1 MB.

## Auditoría

`audit_log` registra las operaciones sensibles: creación de pedidos, cambios de
estado, asignaciones y reasignaciones, cancelaciones, incidencias, consultas de
códigos de acceso, altas y bajas de trabajadores e inicios de sesión fallidos.

La escritura ocurre **dentro de la misma transacción** que la operación
auditada, de modo que no puede existir un cambio sin su rastro.

## Pendiente antes de producción

- [ ] **Rotar las credenciales que estuvieron en el repositorio anterior**
      (Cloudinary, Telegram, Firebase). Aunque los `.env` nunca se comitearon,
      conviene rotarlas si se compartieron por otros medios.
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

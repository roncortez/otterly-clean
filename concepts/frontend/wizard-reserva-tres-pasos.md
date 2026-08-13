# Wizard de reserva en tres pasos

La reserva de limpieza pide más de veinte datos; presentarlos en un formulario largo hace abandonar. La regla es: **una idea por pantalla**, en el orden en que la piensa quien reserva.

## Qué / Dónde y cómo / Cuándo

- **Paso 1 "Tu servicio"**: qué se hace (servicio, plan y detalles del trabajo). Sin datos de lugar ni de acceso.
- **Paso 2 "Dónde y cómo"** (en limpieza, **"¿Tu lugar?"**): dirección, espacio y acceso como una sola decisión. La dirección es la mitad del lugar; el espacio y el acceso la completan.
- **Paso 3 "Cuándo"**: fecha y franja. Al confirmarlo, el botón "Revisar y confirmar" abre un modal con el resumen y el precio.

## La confirmación vive en un modal, no en un paso

El resumen y el precio no son un paso más: son el último control antes de comprometerse. Por eso viven en un modal sobre el paso 3 (`StepSummary` en modo `compact`, que oculta su encabezado porque el modal ya trae su propio título). El precio se pide al backend al abrir el modal (`quoteKey` depende de `confirmOpen`), y el modal tiene sus dos botones: Atrás (cierra) y Confirmar reserva (el único submit del flujo).

## Terminología: Dirección / Inmueble / Lugar

- **Dirección** es la mitad geográfica del lugar (calle, mapa, cobertura): vive en el libro de direcciones.
- **Inmueble** es el perfil persistente de la residencia (identidad **y** acceso) que referencia una dirección: vive en "Mis lugares".
- **Lugar** es la dirección y el inmueble juntos. Solo en el flujo de limpieza se habla de lugar: el paso 2 se titula "¿Tu lugar?" y la sección se llama "Lugares para limpieza" porque muestra dirección + inmueble. En backend y en el resumen, si lo que se muestra es la pareja dirección+inmueble se dice lugar; si es solo el perfil de la residencia, inmueble.

De cara al cliente ha ganado **Lugar**: es la palabra que se ve en la interfaz
(Perfil → "Lugares para limpieza"). "Inmueble" sobrevive donde sigue siendo
preciso —la tabla `properties`, el `propertyId` de la orden— y no se traduce ahí
para no tener dos nombres para la misma fila.

## Reglas que sostienen el flujo

- **En limpieza el lugar se pide siempre.** No hay radio "usar guardado / registrar uno nuevo" ni casilla "guardar para próximas reservas": el inmueble siempre se persiste, porque es el perfil de la residencia (identidad **y** acceso). La orden copia su snapshot al confirmar y la referencia con `propertyId`.
- **El formulario del lugar siempre está visible en limpieza.** Si la dirección tiene inmueble, el bloque dice **"Reemplazar lugar"** y arranca precargado para corregir (no repetir), con un aviso de que el guardado se reemplaza al confirmar (`PATCH /customer/properties/:id`). Si no lo tiene, dice **"Agregar lugar"**, arranca con valores por defecto y crea el inmueble (`POST`). Uno por dirección.
- **El inmueble guardado rellena identidad y acceso; sin inmueble se resetean los defectos.** Al elegir una dirección (o aterrizar en la predeterminada), los datos del inmueble pasan al borrador y al detalle; si la dirección no tiene inmueble, se dejan los valores por defecto para que no queden datos de otra casa. Se ajusta durante el render solo cuando cambia la dirección (`prefilledAddressId`): editar después no se pisa, y volver a tocar la misma dirección no resetea lo corregido.
- **No hay muro de entrada.** Si no hay direcciones, el paso 2 permite crear la primera dentro de un `Modal` (`AddressForm` reutilizado, no inline) y se recarga la lista.
- **Se pide una cosa a la vez, pero cada paso agrupa su tema.** Dentro del paso 2 conviven dirección (tarjetas + modal de alta), espacio (bloque "Agregar/Reemplazar lugar") e instrucciones de acceso (`StepInstructions` embebido); la fecha va en su propio paso porque es otra pregunta.
- **El avance se habilita solo cuando el paso está completo** (`canContinue` derivado en el render, sin efectos): servicio → plan elegido; dónde y cómo → dirección + (limpieza) identidad del espacio con nombre, que es obligatorio porque el lugar siempre se persiste; cuándo → fecha + franja.
- **Un solo submit persiste el lugar.** En limpieza, el submit siempre crea o reemplaza el inmueble de la dirección elegida (junto con su perfil de acceso) y la orden lo referencia con `propertyId`. El backend valida el puntero (pertenencia y dirección) o lo deriva. En lavandería no hay inmueble: la orden solo lleva dirección.

## Entrar al asistente: el selector, no una pantalla intermedia

El botón principal se llama **"¿Qué necesitas?"** y abre el modal de selección
ahí mismo. Antes navegaba a `/reservar`, que mostraba un titular y un botón
"Comenzar reserva" cuyo único efecto era abrir ese mismo modal: un paso que no
preguntaba nada.

El selector ofrece **Limpieza**, **Lavandería** y **Productos**. Las opciones y
sus rutas salen de `shared/services/index.js` y el componente es uno
(`shared/services/ServicePicker`), usado por la portada, la cabecera del cliente
y el propio asistente. Cuando cada sitio llevaba su lista escrita a mano, "Kits"
navegaba al asistente de reserva de otro servicio según desde dónde se pulsara.

Productos no es un servicio reservable: es un catálogo (`/productos`). Por eso su
fila lleva `serviceType: null`, y eso impide que el asistente intente tratarlo
como una reserva.

## El lugar predeterminado viene preseleccionado

Si el cliente ya tiene un lugar marcado como predeterminado, el paso 2 arranca
con él elegido y sus datos cargados. Puede cambiarlo, pero no tiene que elegir
nada para avanzar.

El predeterminado es del lugar, no de la dirección: alguien recibe la ropa en la
oficina —dirección predeterminada— y quiere que la limpieza empiece siempre en su
casa. El backend garantiza que hay exactamente uno mientras exista algún lugar,
así que el frontend solo lo lee (`prop.isDefault`) en lugar de desempatar por
fecha de creación.

## Reservar sin cuenta; la sesión, al final

`/reservar` no exige sesión. Un visitante elige servicio, describe su casa y
escoge fecha; en el modal de confirmación, si no está autenticado, el botón dice
**"Inicia sesión para reservar"** en lugar de "Confirmar reserva", y se le
explica que sus datos no se perderán.

No se crea ninguna orden anónima. El backend sigue exigiendo CUSTOMER autenticado
para `POST /customer/orders/*`; lo que se abre es el formulario.

Al volver de identificarse se vuelve **a esta pantalla** y no al inicio: el
asistente pasa `redirectTo` en el `state` de la navegación y `LoginPage` /
`RegisterPage` lo respetan.

### El borrador

Lo escrito se guarda en `localStorage` (`shared/booking/draft.js`) y cubre dos
casos: el visitante que va a identificarse y el cliente que recarga, navega a
otra pantalla o vuelve al día siguiente.

- **Se avisa, no se restaura en silencio.** Encontrarse el formulario relleno sin
  saber por qué desconcierta, y quien viene a pedir otra cosa necesita una salida:
  hay un botón **"Empezar de nuevo"**.
- **Caduca a las 24 horas.** Una reserva de hace dos semanas ya no describe lo que
  la persona quiere hoy, y la fecha que eligió probablemente ya pasó.
- **Pedir otro servicio manda sobre el borrador.** Pulsar Lavandería en el
  selector no puede devolver una limpieza a medias.
- **Nunca guarda `accessSecret`.** El código de la puerta, la clave de la alarma o
  dónde está la llave se cifran en el servidor y no vuelven jamás en una
  respuesta; escribirlos en claro en el navegador anularía esa garantía. Se vuelve
  a pedir, y es el precio correcto: es el único campo que abre una puerta.

## Por qué tres y no seis

Cada paso tiene un "momento de verdad": elegir qué se hace, decir dónde/cómo, y cuándo. Los seis pasos originales fragmentaban esas decisiones y obligaban a saltar (fecha → dirección → acceso → resumen) cuando el usuario aún no sabía ni dónde. Menos pasos, cada uno con su tema completo, reduce la sensación de trámite y los pasos "vacíos".

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
- **Lugar** es la dirección y el inmueble juntos. Solo en el flujo de limpieza se habla de lugar: el paso 2 se titula "¿Tu lugar?" y la sección de "Mis inmuebles" se llama "Mis lugares" porque muestra dirección + inmueble. En backend y en el resumen, si lo que se muestra es la pareja dirección+inmueble se dice lugar; si es solo el perfil de la residencia, inmueble.

## Reglas que sostienen el flujo

- **En limpieza el lugar se pide siempre.** No hay radio "usar guardado / registrar uno nuevo" ni casilla "guardar para próximas reservas": el inmueble siempre se persiste, porque es el perfil de la residencia (identidad **y** acceso). La orden copia su snapshot al confirmar y la referencia con `propertyId`.
- **El formulario del lugar siempre está visible en limpieza.** Si la dirección tiene inmueble, el bloque dice **"Reemplazar lugar"** y arranca precargado para corregir (no repetir), con un aviso de que el guardado se reemplaza al confirmar (`PATCH /customer/properties/:id`). Si no lo tiene, dice **"Agregar lugar"**, arranca con valores por defecto y crea el inmueble (`POST`). Uno por dirección.
- **El inmueble guardado rellena identidad y acceso; sin inmueble se resetean los defectos.** Al elegir una dirección (o aterrizar en la predeterminada), los datos del inmueble pasan al borrador y al detalle; si la dirección no tiene inmueble, se dejan los valores por defecto para que no queden datos de otra casa. Se ajusta durante el render solo cuando cambia la dirección (`prefilledAddressId`): editar después no se pisa, y volver a tocar la misma dirección no resetea lo corregido.
- **No hay muro de entrada.** Si no hay direcciones, el paso 2 permite crear la primera dentro de un `Modal` (`AddressForm` reutilizado, no inline) y se recarga la lista.
- **Se pide una cosa a la vez, pero cada paso agrupa su tema.** Dentro del paso 2 conviven dirección (tarjetas + modal de alta), espacio (bloque "Agregar/Reemplazar lugar") e instrucciones de acceso (`StepInstructions` embebido); la fecha va en su propio paso porque es otra pregunta.
- **El avance se habilita solo cuando el paso está completo** (`canContinue` derivado en el render, sin efectos): servicio → plan elegido; dónde y cómo → dirección + (limpieza) identidad del espacio con nombre, que es obligatorio porque el lugar siempre se persiste; cuándo → fecha + franja.
- **Un solo submit persiste el lugar.** En limpieza, el submit siempre crea o reemplaza el inmueble de la dirección elegida (junto con su perfil de acceso) y la orden lo referencia con `propertyId`. El backend valida el puntero (pertenencia y dirección) o lo deriva. En lavandería no hay inmueble: la orden solo lleva dirección.

## Por qué tres y no seis

Cada paso tiene un "momento de verdad": elegir qué se hace, decir dónde/cómo, y cuándo. Los seis pasos originales fragmentaban esas decisiones y obligaban a saltar (fecha → dirección → acceso → resumen) cuando el usuario aún no sabía ni dónde. Menos pasos, cada uno con su tema completo, reduce la sensación de trámite y los pasos "vacíos".

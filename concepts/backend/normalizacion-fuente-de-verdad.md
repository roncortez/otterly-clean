# Normalización: un solo origen de verdad para la residencia

La residencia del cliente se describe dos veces si no se cuida: una vez como dirección (dónde) y otra como inmueble (qué tipo de espacio, cuántas habitaciones). Duplicar el texto de la calle en ambos lados crea inconsistencias: el cliente corrige su dirección y el inmueble sigue mostrando la vieja; el asistente de reserva pide datos que ya dio.

La regla es: el inmueble **vive en** una dirección y la referencia con `address_id`. La dirección es la fuente de verdad del texto y de las coordenadas; el inmueble guarda lo que le pertenece: identidad (tipo, habitaciones, baños), el código de acceso cifrado y el **perfil completo de acceso** (método, instrucciones, estacionamiento, mascotas, objetos delicados). Nada se copia.

## Cómo se lee

- Una dirección puede tener **a lo sumo un inmueble** (índice único parcial). Esto hace determinista el pre-relleno: al elegir dirección, hay un único perfil que aplicar.
- El listado de direcciones devuelve su inmueble con `LEFT JOIN LATERAL`, incluyendo el acceso (con el código descifrado), y el listado de inmuebles devuelve la dirección completa. Ambos lados expuestos a la API, ambos proyectados a camelCase.
- El asistente de reserva pide dirección, espacio y acceso **como una sola cosa** (paso "¿Tu lugar?" en limpieza): el formulario del espacio se muestra siempre, precargado con el inmueble de la dirección si lo hay; al confirmar se crea o se reemplaza el inmueble. La identidad del espacio viaja siempre en el snapshot de la orden.

## Cómo se escribe

- Al crear un inmueble se recibe un `addressId` (dirección guardada) o un `address` (se crea al vuelo con las mismas reglas de cobertura). El código de acceso se cifra antes de tocar la base; el texto de la calle nunca entra en `properties`.
- Se actualiza con `PATCH /customer/properties/:id` (solo campos enviados, sin `addressId`/`address`: la pertenencia a la dirección no se edita aquí). El asistente de limpieza lo usa cuando la dirección elegida ya tiene inmueble: lo **reemplaza** en vez de duplicarlo, porque hay un perfil por residencia. El servicio 404 para inmuebles ajenos y devuelve el código descifrado en la respuesta.

## Límite: la orden es un snapshot

La normalización vale para el **catálogo y el perfil**, no para el historial. Una orden guarda en el momento los datos con que se confirmó (dirección copiada, identidad e instrucciones de acceso del inmueble, precio). Si el cliente después edita su inmueble, las órdenes pasadas no cambian: el historial es intocable, el perfil es editable. Confundir esos dos mundos —normalizar la orden con el inmueble actual— rompería la trazabilidad.

Sobre ese snapshot, la orden guarda además un **puntero** `property_id` (nullable, `ON DELETE SET NULL`): vincula "esta orden fue de este inmueble" sin que el detalle deje de ser histórico. El servidor lo valida (debe ser del cliente y de la dirección de la orden) o lo deriva del inmueble que la dirección ya tenga. En limpieza el lugar siempre se persiste, así que el puntero siempre queda seteado; en lavandería no hay inmueble y el puntero queda en nulo: el detalle basta.

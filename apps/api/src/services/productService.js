'use strict';

const catalogRepo = require('../db/repositories/catalogRepository');
const { getRegion } = require('../config/regions');

/**
 * Catalogo de productos.
 *
 * Es un listado, no una tienda: se consulta y ya. No hay carrito, ni reserva de
 * existencias, ni pedido. Cuando lo haya, la orden vivira en `orders` como
 * cualquier otra y este servicio seguira respondiendo a la misma pregunta -que
 * vendemos-, que es la razon de tenerlo separado desde ahora.
 *
 * El precio se sirve en centavos, como todo importe del sistema, y el frontend
 * lo formatea con la moneda de la region (ver `useConfig().money`). Devolverlo
 * ya formateado desde aqui obligaria al backend a conocer el idioma del
 * navegador.
 */

function project(product) {
  return {
    id: product.id,
    code: product.code,
    name: product.name,
    description: product.description,
    amount: product.amount,
    currency: product.currency,
    imageUrl: product.image_url,
    category: product.category,
  };
}

/**
 * Productos activos de una region, agrupados por categoria.
 *
 * La agrupacion se hace aqui y no en React porque es una decision sobre los
 * datos -que hay y como se ordena-, no sobre como se dibujan. Los productos sin
 * categoria caen en un grupo sin nombre en lugar de desaparecer.
 */
async function listForCustomer(regionCode) {
  const region = getRegion(regionCode);
  const products = await catalogRepo.listProducts({ regionCode: region.code });

  const groups = new Map();
  for (const row of products) {
    const key = row.category ?? '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(project(row));
  }

  return {
    regionCode: region.code,
    currency: region.currency,
    products: products.map(project),
    categories: [...groups.entries()].map(([name, items]) => ({ name: name || null, items })),
  };
}

module.exports = { listForCustomer };

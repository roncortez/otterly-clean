const DEFAULT_WHATSAPP_NUMBER = "593996153861";

const getWhatsappNumber = () => (
  process.env.REACT_APP_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER
).replace(/\D/g, "");

const parseIngredients = (ingredients) => {
  if (!ingredients) return [];
  if (Array.isArray(ingredients)) return ingredients;

  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const formatMoney = (value) => Number(value || 0).toFixed(2);

const getCustomerName = (customer = {}) => {
  const name = `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
  return name || "Cliente";
};

const getOrderId = (order = {}) => order.id || order.id_pedido || "";

const getDeliveryText = (order = {}) => {
  if (order.delivery) return order.lugar_envio ? `para entregar en ${order.lugar_envio}` : "para entrega a domicilio";
  return "para retirar";
};

const getItemName = (item = {}) => item.nombre || item.plato || "Producto";

const getLineTotal = (item = {}) => {
  if (item.precio !== undefined && item.precio !== null) return Number(item.precio);
  return Number(item.precio_unitario || 0) * Number(item.cantidad || 0);
};

export const buildOrderWhatsAppMessage = ({ order, customer, details = [], subtotal, shippingCost, discount, couponCode }) => {
  const orderId = getOrderId(order);
  const deliveryText = getDeliveryText(order);
  const customerName = getCustomerName(customer || order);
  const customerPhone = customer?.telefono || order?.telefono || "";

  let message = `Hola, quiero confirmar mi pedido${orderId ? ` #${orderId}` : ""} ${deliveryText}.\n\n`;
  message += `*Datos:*\n`;
  message += `Nombres: ${customerName}\n`;
  if (customerPhone) message += `Teléfono: ${customerPhone}\n`;
  message += `\n*Detalle:*\n`;

  if (details.length > 0) {
    message += details
      .map((item) => {
        const ingredients = parseIngredients(item.ingredientes);
        const ingredientText = ingredients.length > 0
          ? ingredients.map((ingredient) => ingredient.nombre || ingredient).join(", ")
          : "N/A";

        return `${getItemName(item)} (Cantidad: ${item.cantidad}, Precio: $${formatMoney(getLineTotal(item))})\n - Ingredientes: ${ingredientText}`;
      })
      .join("\n");
  } else {
    message += "No se encontraron detalles de pedido.";
  }

  if (subtotal !== undefined) message += `\n\n*Subtotal:* $${formatMoney(subtotal)}`;
  if (shippingCost !== undefined) message += `\n*Envío:* $${formatMoney(shippingCost)}`;
  if (discount && discount > 0) {
    message += `\n*Descuento${couponCode ? ` (${couponCode})` : ""}:* -$${formatMoney(discount)}`;
  }
  message += `\n*Total:* $${formatMoney(order?.total)}\n\n`;
  message += "¡Gracias!";

  return message;
};

export const buildOrderWhatsAppUrl = (options) => {
  const message = buildOrderWhatsAppMessage(options);
  return `https://wa.me/${getWhatsappNumber()}?text=${encodeURIComponent(message)}`;
};

const DEFAULT_WHATSAPP_NUMBER = "12034558417";

const getWhatsappNumber = () => (
  process.env.REACT_APP_WHATSAPP_NUMBER || DEFAULT_WHATSAPP_NUMBER
).replace(/\D/g, "");

const formatMoney = (value) => Number(value || 0).toFixed(2);

const CATEGORY_LABELS = {
  cleaning: "Cleaning",
  laundry: "Laundry",
  repair: "Repair",
};

const PROPERTY_LABELS = {
  1: "Studio",
  2: "1 Bedroom",
  3: "2 Bedrooms",
  4: "3 Bedrooms",
  5: "4+ Bedrooms",
  6: "Small Office (up to 1000 sqft)",
  7: "Large Office (1000+ sqft)",
};

export const buildServiceWhatsAppMessage = ({ order, items = [], customer }) => {
  const categoryName = CATEGORY_LABELS[order.service_type] || order.service_type;
  const customerName = customer
    ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
    : "Customer";

  let message = `Hi, I'd like to request a *${categoryName}* service.\n\n`;
  message += `*Customer Info:*\n`;
  message += `Name: ${customerName}\n`;
  if (customer?.telefono) message += `Phone: ${customer.telefono}\n`;

  if (order.service_type === "cleaning") {
    message += `\n*Service Details:*\n`;
    if (order.property_type_id) {
      message += `Property Type: ${PROPERTY_LABELS[order.property_type_id] || order.property_type_id}\n`;
    }
    if (order.number_of_bedrooms != null) message += `Bedrooms: ${order.number_of_bedrooms}\n`;
    if (order.number_of_bathrooms != null) message += `Bathrooms: ${order.number_of_bathrooms}\n`;
    if (order.has_pets) message += `Pets: Yes\n`;
    if (order.service_address) message += `Address: ${order.service_address}\n`;
    if (order.access_instructions) message += `Access Instructions: ${order.access_instructions}\n`;
    if (order.scheduled_date) message += `Preferred Date: ${order.scheduled_date}\n`;
  }

  if (order.service_type === "laundry" || order.service_type === "repair") {
    message += `\n*Service Details:*\n`;
    if (order.pickup_address) message += `Pickup Address: ${order.pickup_address}\n`;
    if (order.pickup_date) message += `Pickup Date: ${order.pickup_date}\n`;
    if (order.pickup_time_start) message += `Time: ${order.pickup_time_start}${order.pickup_time_end ? ` - ${order.pickup_time_end}` : ""}\n`;
    if (order.delivery_date) message += `Estimated Delivery: ${order.delivery_date}\n`;
    if (order.service_type === "repair" && order.repair_description) {
      message += `Damage Description: ${order.repair_description}\n`;
    }
  }

  if (items.length > 0) {
    message += `\n*Items:*\n`;
    items.forEach((item, i) => {
      const qty = item.quantity || 1;
      const garment = item.garment_type || item.name || "Item";
      const price = item.unit_price ? ` - $${formatMoney(item.unit_price * qty)}` : "";
      message += `${i + 1}. ${garment} x${qty}${price}`;
      if (item.notes) message += ` (${item.notes})`;
      message += "\n";
    });
  }

  if (order.special_instructions) {
    message += `\n*Special Instructions:* ${order.special_instructions}\n`;
  }

  message += `\n*Total Price:* $${formatMoney(order.total)}\n\n`;
  message += "Thank you!";

  return message;
};

export const buildServiceWhatsAppUrl = (options) => {
  const message = buildServiceWhatsAppMessage(options);
  return `https://wa.me/${getWhatsappNumber()}?text=${encodeURIComponent(message)}`;
};

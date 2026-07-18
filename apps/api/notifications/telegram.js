const axios = require("axios");
require("dotenv").config();

async function notifyTelegram(pedido) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_IDS; // un único ID
  if (!token || !chatId) return;

  const detalle = pedido.detalle;

  let mensaje = `¡Hay un nuevo pedido!\n`
  mensaje += `Nro: ${pedido.id}\n`;
  mensaje += `Cliente: ${pedido.nombre} ${pedido.apellido}\n`;
  mensaje += `Hora: ${pedido.hora}\n`;
  mensaje += `Entrega: ${pedido.entrega}\n`;
  mensaje += `Teléfono: ${pedido.telefono}\n`;

  if (detalle.length > 0) {
    mensaje += `Detalle:\n`;
    mensaje += detalle.map(d => {
      const ingredientesLista = Array.isArray(d.ingredientes) && d.ingredientes.length > 0
        ? d.ingredientes.map(ing => ing.nombre).join(', ')
        : 'N/A';

      return `${d.nombre} (Cantidad: ${d.cantidad}, Precio: $${(Number(d.precio)).toFixed(2)})\n` +
        ` - Ingredientes: ${ingredientesLista}\n`;
    })
    .join('\n');         // <- sin comas extra

  }
  else {
    mensaje += `Detalle: N/A\n`;
  }
  mensaje += `\nTotal: $${pedido.total}\n`;

  console.log(pedido);
  await axios.post(`https://api.telegram.org/bot${token}/sendMessage`, {
    chat_id: chatId,
    text: mensaje,
  });
}

module.exports = { notifyTelegram };
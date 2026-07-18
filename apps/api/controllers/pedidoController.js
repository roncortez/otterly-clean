const {
    obtenerPedidos,
    enviarPedido,
    enviarDetallePedido,
    obtenerDetallePedidos,
    obtenerPedidosUsuario,
    obtenerDetalleConRetry,
    obtenerPedidoPorId
} = require('../models/pedidoModel');
const { notifyTelegram } = require("../notifications/telegram"); // <- tu helper
const { getOperationSettings } = require('../models/settingsModel');

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

const getTodayDate = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isValidDateString = (value) => {
    if (!DATE_REGEX.test(value)) return false;
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return false;

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return value === `${year}-${month}-${day}`;
};

const normalizePositiveInt = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

const normalizeOrdersQuery = (query) => {
    const today = getTodayDate();
    const from = typeof query.from === 'string' && query.from.trim() ? query.from.trim() : today;
    const to = typeof query.to === 'string' && query.to.trim() ? query.to.trim() : from;

    if (!isValidDateString(from) || !isValidDateString(to)) {
        const error = new Error('Las fechas deben tener formato YYYY-MM-DD.');
        error.statusCode = 400;
        throw error;
    }

    if (to < from) {
        const error = new Error('La fecha final no puede ser anterior a la fecha inicial.');
        error.statusCode = 400;
        throw error;
    }

    const page = normalizePositiveInt(query.page, DEFAULT_PAGE);
    const requestedLimit = normalizePositiveInt(query.limit, DEFAULT_LIMIT);
    const limit = Math.min(requestedLimit, MAX_LIMIT);

    return { from, to, page, limit };
};

const pedidoController = {
    obtenerPedidos: async (req, res) => {
        try {
            const filtros = normalizeOrdersQuery(req.query);
            const pedidos = await obtenerPedidos(filtros);
            res.json(pedidos);
        } catch (error) {
            console.error('Error al obtener pedidos:', error);
            const statusCode = error.statusCode || 500;
            res.status(statusCode).json({
                error: statusCode === 400 ? error.message : 'Error interno del servidor'
            });
        }
    },

    obtenerPedidosUsuario: async (req, res) => {
        const idCliente = parseInt(req.params.id)
        try {
            const pedidos = await obtenerPedidosUsuario(idCliente);
            res.json(pedidos);
        } catch (error) {
            console.error("Error al obtener los pedidos del usuario")
        }
    },

    obtenerDetallePedidos: async (req, res) => {
        const pedidoId = parseInt(req.params.id)
        try {
            const detallePedido = await obtenerDetallePedidos(pedidoId);
            res.json(detallePedido);
            const pedido = await obtenerPedidoPorId(pedidoId);
            const payload = {
                id: pedidoId,
                detalle: detallePedido,
                cliente: pedido ? `${pedido.first_name} ${pedido.last_name}` : ''
            };
            return payload;
        } catch (error) {
            console.error('Error al obtener pedidos:', error)
        }
    },

    enviarPedido: async (req, res) => {
        const { id_cliente, total, delivery, lugar_envio } = req.body;
        try {
            const operationSettings = await getOperationSettings();

            if (!operationSettings.acceptOrders) {
                return res.status(403).json({ error: 'El negocio no esta aceptando pedidos en este momento.' });
            }

            const pedido = await enviarPedido(id_cliente, total, delivery, lugar_envio);

            console.log('Pedido insertado', pedido);
            res.status(201).json({ pedido: pedido });

            if (!operationSettings.notifyTelegram) return;

            const detalle = await obtenerDetalleConRetry(pedido.id);
            console.log('Detalle pedido', detalle);

            const payload = {
                id: pedido.id,
                nombre: pedido.first_name,
                apellido: pedido.last_name,
                telefono: pedido.telefono,
                hora: pedido.hora,
                total: pedido.total,
                entrega: pedido.delivery ? pedido.lugar_envio : "Retiro",
                detalle: detalle.map(d=>({
                    nombre: d.nombre,
                    ingredientes: d.ingredientes,
                    cantidad: d.cantidad,
                    precio: d.precio,
                }))
            };

            notifyTelegram(payload).catch((notificationError) => {
                console.error('Error al enviar notificacion de Telegram:', notificationError);
            });
        } catch (error) {
            console.error('Error al enviar el pedido:', error);
            res.status(500).json({ error: 'Error al enviar el pedido.' });
        }
    },

    enviarDetallePedido: async (req, res) => {
        console.log('Cuerpo de la solicitud (req.body):', req.body);
        const { pedido_id, menu_id, cantidad, precio, ingredientes } = req.body;
        const ingredientesJson = JSON.stringify(ingredientes);
        try {
            const detallePedido = await enviarDetallePedido(pedido_id, menu_id, cantidad, precio, ingredientesJson);
            res.status(201).json({
                message: 'Detalle del pedido enviado exitosamente',
                detalle_id: detallePedido
            });
        } catch (error) {
            console.error('Error al enviar el detalle del pedido:', error);
        }
    }
};

module.exports = pedidoController;

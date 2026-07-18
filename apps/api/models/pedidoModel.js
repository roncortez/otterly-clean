const db = require('../db');

const obtenerPedidos = async ({ from, to, page, limit }) => {
    try {
        const offset = (page - 1) * limit;
        const query = `SELECT
                p.*,
                c.first_name,
                c.last_name,
                c.email,
                c.telefono,
                to_char(p.fecha_hora, 'YYYY-MM-DD') AS fecha,
                to_char(p.fecha_hora, 'HH24:MI') AS hora
            FROM pedido AS p
            INNER JOIN users AS c ON p.id_cliente = c.id
            WHERE p.fecha_hora >= $1::date
                AND p.fecha_hora < ($2::date + INTERVAL '1 day')
            ORDER BY p.fecha_hora DESC
            LIMIT $3 OFFSET $4`;

        const countQuery = `SELECT COUNT(*)::int AS total
            FROM pedido AS p
            WHERE p.fecha_hora >= $1::date
                AND p.fecha_hora < ($2::date + INTERVAL '1 day')`;

        const [pedidos, countResult] = await db.task(t => t.batch([
            t.any(query, [from, to, limit, offset]),
            t.one(countQuery, [from, to])
        ]));

        const total = countResult.total;

        return {
            data: pedidos,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            },
            filters: { from, to }
        };
    } catch (error) {
        console.log('Error al obtener los pedidos:', error);
        throw error;
    }
}

const obtenerPedidosUsuario = async (id) => {
    try {
        const query = `SELECT
            P.id AS id_pedido,
            P.id_cliente,
            P.fecha_hora,
            P.total,
            P.delivery,
            P.lugar_envio,
            P.lugar_envio_id,
            DP.id AS id_detalle,
            DP.menu_id,
            DP.cantidad,
            ROUND(DP.precio / DP.cantidad, 2) AS precio_unitario,
            DP.precio,
            DP.ingredientes,
            M.id AS id_menu,
            M.nombre AS plato
            FROM pedido AS P
            INNER JOIN detalle_pedidos AS DP ON P.id = DP.pedido_id
            INNER JOIN menu AS M ON DP.menu_id = M.id
            WHERE P.id_cliente = $1`;

        const result = await db.any(query, [id]);

        const pedidosAgrupados = result.reduce((acc, row) => {
            const { id_pedido, id_cliente, fecha_hora, total, delivery, lugar_envio, lugar_envio_id, id_detalle,
                plato, cantidad, precio_unitario, ingredientes } = row;

            const fechaISO = new Date(fecha_hora);
            const fecha = new Date(fecha_hora).toLocaleString("es-ES", {
                weekday: "long",
                year: "numeric",
                month: "numeric",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false
            });

            if (!acc[id_pedido]) {
                acc[id_pedido] = {
                    id_pedido,
                    id_cliente,
                    fecha,
                    fechaISO,
                    total,
                    delivery,
                    lugar_envio,
                    lugar_envio_id,
                    detalles: []
                };
            }

            acc[id_pedido].detalles.push({ id_detalle, plato, cantidad, precio_unitario, ingredientes });
            return acc;
        }, {});

        return Object.values(pedidosAgrupados).sort((a, b) => new Date(b.fechaISO) - new Date(a.fechaISO));
    } catch (error) {
        console.log('Error al obtener los pedidos:', error);
    }
}

const obtenerDetallePedidos = async (id) => {
    try {
        const query = `SELECT detalle_pedidos.*, menu.nombre
            FROM detalle_pedidos
            INNER JOIN menu ON menu.id = detalle_pedidos.menu_id
            WHERE pedido_id = $1`;
        return await db.any(query, [id]);
    } catch (error) {
        console.log('Error al obtener los pedidos:', error);
    }
}

const enviarPedido = async (id_cliente, total, delivery, lugar_envio) => {
    try {
        const query = `
            WITH inserted AS (
                INSERT INTO pedido (id_cliente, total, fecha_hora, delivery, lugar_envio)
                VALUES ($1, $2, CURRENT_TIMESTAMP, $3, $4)
                RETURNING *
            )
            SELECT i.*, to_char(i.fecha_hora, 'HH24:MI') as hora, u.first_name, u.last_name, u.telefono
            FROM inserted i
            INNER JOIN users u ON i.id_cliente = u.id
        `;

        return await db.one(query, [id_cliente, total, delivery, lugar_envio]);
    } catch (error) {
        console.error('Error al crear pedido', error);
        throw new Error('Error al crear');
    }
};

const enviarDetallePedido = async (pedido_id, menu_id, cantidad, precio, ingredientes) => {
    try {
        const query = `INSERT INTO detalle_pedidos (pedido_id, menu_id, cantidad, precio, ingredientes)
        VALUES ($1, $2, $3, $4, $5) RETURNING *`;
        return await db.one(query, [pedido_id, menu_id, cantidad, precio, ingredientes]);
    } catch (error) {
        console.error('Error al enviar el detalle del pedido:', error);
    }
}

const obtenerDetalleConRetry = async (id, intentos = 10, delayMs = 1000) => {
    for (let i = 0; i < intentos; i++) {
        const d = await obtenerDetallePedidos(id);
        if (Array.isArray(d) && d.length) return d;
        await new Promise(r => setTimeout(r, delayMs));
    }
    return [];
};

const obtenerPedidoPorId = async (id) => {
    try {
        const query = `select u.first_name, u.last_name, u.telefono, p.*
        from pedido as p inner join users as u
        on p.id_cliente = u.id
        where p.id = $1`;
        return await db.one(query, [id]);
    } catch (error) {
        console.error('Error al obtener pedido por ID', error);
        throw error;
    }
};

module.exports = {
    enviarPedido,
    enviarDetallePedido,
    obtenerPedidos,
    obtenerPedidosUsuario,
    obtenerDetallePedidos,
    obtenerDetalleConRetry,
    obtenerPedidoPorId
};

const db = require('../db');

const crearCupon = async ({
  codigo,
  descripcion,
  tipo,
  valor,
  uso_maximo,
  uso_por_cliente,
  monto_minimo,
  fecha_inicio,
  fecha_expiracion,
  categorias_permitidas,
  platos_especificos,
  es_automatico,
  creado_por,
}) => {
  try {
    return await db.one(
      `INSERT INTO cupones
        (codigo, descripcion, tipo, valor, uso_maximo, uso_por_cliente, monto_minimo,
         fecha_inicio, fecha_expiracion, categorias_permitidas, platos_especificos,
         es_automatico, creado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        codigo.toUpperCase(),
        descripcion || null,
        tipo,
        valor || 0,
        uso_maximo || 1,
        uso_por_cliente || 1,
        monto_minimo || 0,
        fecha_inicio || new Date(),
        fecha_expiracion || null,
        categorias_permitidas || null,
        platos_especificos || null,
        es_automatico || false,
        creado_por || null,
      ],
    );
  } catch (error) {
    console.error('Error al crear cupón:', error);
    throw new Error('Error al crear cupón');
  }
};

const obtenerCupones = async ({ page = 1, limit = 20, search, tipo, activo } = {}) => {
  try {
    const offset = (page - 1) * limit;
    const values = [];
    const conditions = [];

    if (search) {
      values.push(`%${search}%`);
      const p = `$${values.length}`;
      conditions.push(`(codigo ILIKE ${p} OR descripcion ILIKE ${p})`);
    }

    if (tipo && tipo !== 'all') {
      values.push(tipo);
      conditions.push(`tipo = $${values.length}`);
    }

    if (activo !== undefined && activo !== 'all') {
      values.push(activo === 'true' || activo === true);
      conditions.push(`activo = $${values.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const limitP = `$${values.length + 1}`;
    const offsetP = `$${values.length + 2}`;

    const query = `SELECT * FROM cupones ${whereClause} ORDER BY id DESC LIMIT ${limitP} OFFSET ${offsetP}`;
    const countQuery = `SELECT COUNT(*)::int AS total FROM cupones ${whereClause}`;

    const [cupones, countResult] = await db.task((t) =>
      t.batch([t.any(query, [...values, limit, offset]), t.one(countQuery, values)]),
    );

    return {
      data: cupones,
      pagination: {
        page,
        limit,
        total: countResult.total,
        totalPages: Math.ceil(countResult.total / limit),
      },
    };
  } catch (error) {
    console.error('Error al obtener cupones:', error);
    throw new Error('Error al obtener cupones');
  }
};

const obtenerCuponPorId = async (id) => {
  try {
    return await db.oneOrNone('SELECT * FROM cupones WHERE id = $1', [id]);
  } catch (error) {
    console.error('Error al obtener cupón por ID:', error);
    throw new Error('Error al obtener cupón');
  }
};

const obtenerCuponPorCodigo = async (codigo) => {
  try {
    return await db.oneOrNone('SELECT * FROM cupones WHERE codigo = $1', [codigo.toUpperCase()]);
  } catch (error) {
    console.error('Error al obtener cupón por código:', error);
    throw new Error('Error al obtener cupón');
  }
};

const actualizarCupon = async (id, data) => {
  try {
    const {
      codigo,
      descripcion,
      tipo,
      valor,
      uso_maximo,
      uso_por_cliente,
      monto_minimo,
      fecha_inicio,
      fecha_expiracion,
      categorias_permitidas,
      platos_especificos,
      activo,
    } = data;

    return await db.oneOrNone(
      `UPDATE cupones SET
        codigo = COALESCE($1, codigo),
        descripcion = COALESCE($2, descripcion),
        tipo = COALESCE($3, tipo),
        valor = COALESCE($4, valor),
        uso_maximo = COALESCE($5, uso_maximo),
        uso_por_cliente = COALESCE($6, uso_por_cliente),
        monto_minimo = COALESCE($7, monto_minimo),
        fecha_inicio = COALESCE($8, fecha_inicio),
        fecha_expiracion = $9,
        categorias_permitidas = $10,
        platos_especificos = $11,
        activo = COALESCE($12, activo)
       WHERE id = $13
       RETURNING *`,
      [
        codigo ? codigo.toUpperCase() : null,
        descripcion !== undefined ? descripcion : null,
        tipo || null,
        valor !== undefined ? valor : null,
        uso_maximo !== undefined ? uso_maximo : null,
        uso_por_cliente !== undefined ? uso_por_cliente : null,
        monto_minimo !== undefined ? monto_minimo : null,
        fecha_inicio || null,
        fecha_expiracion !== undefined ? fecha_expiracion : null,
        categorias_permitidas !== undefined ? categorias_permitidas : null,
        platos_especificos !== undefined ? platos_especificos : null,
        activo !== undefined ? activo : null,
        id,
      ],
    );
  } catch (error) {
    console.error('Error al actualizar cupón:', error);
    throw new Error('Error al actualizar cupón');
  }
};

const eliminarCupon = async (id) => {
  try {
    const result = await db.result('DELETE FROM cupones WHERE id = $1', [id]);
    return result.rowCount > 0;
  } catch (error) {
    console.error('Error al eliminar cupón:', error);
    throw new Error('Error al eliminar cupón');
  }
};

const validarCupon = async (codigo, usuarioId, montoPedido, categoriasDelPedido, platosDelPedido) => {
  try {
    const cupon = await obtenerCuponPorCodigo(codigo);
    if (!cupon) return { valido: false, mensaje: 'Cupón no encontrado' };
    if (!cupon.activo) return { valido: false, mensaje: 'Cupón inactivo' };

    const ahora = new Date();
    if (cupon.fecha_inicio && new Date(cupon.fecha_inicio) > ahora) {
      return { valido: false, mensaje: 'Este cupón aún no está disponible' };
    }
    if (cupon.fecha_expiracion && new Date(cupon.fecha_expiracion) < ahora) {
      return { valido: false, mensaje: 'Este cupón ha expirado' };
    }

    if (cupon.uso_maximo && cupon.usos_realizados >= cupon.uso_maximo) {
      return { valido: false, mensaje: 'Este cupón ha alcanzado su límite de uso' };
    }

    if (usuarioId) {
      const usosCliente = await db.oneOrNone(
        'SELECT COUNT(*)::int AS total FROM cupones_uso WHERE cupon_id = $1 AND usuario_id = $2',
        [cupon.id, usuarioId],
      );
      if (usosCliente && usosCliente.total >= cupon.uso_por_cliente) {
        return { valido: false, mensaje: 'Ya has utilizado este cupón el máximo de veces permitido' };
      }
    }

    if (cupon.monto_minimo && montoPedido < Number(cupon.monto_minimo)) {
      return {
        valido: false,
        mensaje: `El pedido mínimo para este cupón es $${Number(cupon.monto_minimo).toFixed(2)}`,
      };
    }

    if (cupon.categorias_permitidas && cupon.categorias_permitidas.length > 0 && categoriasDelPedido) {
      const tieneCategoriaValida = categoriasDelPedido.some((catId) =>
        cupon.categorias_permitidas.includes(catId),
      );
      if (!tieneCategoriaValida) {
        return { valido: false, mensaje: 'Este cupón no aplica para los productos en tu carrito' };
      }
    }

    if (cupon.platos_especificos && cupon.platos_especificos.length > 0 && platosDelPedido) {
      const tienePlatoValido = platosDelPedido.some((platoId) =>
        cupon.platos_especificos.includes(platoId),
      );
      if (!tienePlatoValido) {
        return { valido: false, mensaje: 'Este cupón no aplica para los productos en tu carrito' };
      }
    }

    let descuento = 0;
    if (cupon.tipo === 'porcentaje') {
      descuento = (montoPedido * Number(cupon.valor)) / 100;
    } else if (cupon.tipo === 'monto_fijo') {
      descuento = Math.min(Number(cupon.valor), montoPedido);
    } else if (cupon.tipo === 'envio_gratis') {
      descuento = 0;
    } else if (cupon.tipo === 'bebida_gratis') {
      descuento = 0;
    } else if (cupon.tipo === '2x1') {
      descuento = 0;
    } else if (cupon.tipo === 'combo') {
      descuento = (montoPedido * Number(cupon.valor)) / 100;
    }

    return {
      valido: true,
      cupon,
      descuento: Math.round(descuento * 100) / 100,
      tipo: cupon.tipo,
      valor: Number(cupon.valor),
      mensaje: 'Cupón aplicado correctamente',
    };
  } catch (error) {
    console.error('Error al validar cupón:', error);
    throw new Error('Error al validar cupón');
  }
};

const registrarUso = async (cuponId, usuarioId, pedidoId, descuentoAplicado) => {
  try {
    await db.none(
      `INSERT INTO cupones_uso (cupon_id, usuario_id, pedido_id, descuento_aplicado)
       VALUES ($1, $2, $3, $4)`,
      [cuponId, usuarioId, pedidoId, descuentoAplicado],
    );
    await db.none('UPDATE cupones SET usos_realizados = usos_realizados + 1 WHERE id = $1', [cuponId]);
  } catch (error) {
    console.error('Error al registrar uso de cupón:', error);
    throw new Error('Error al registrar uso de cupón');
  }
};

const asignarCuponAUsuario = async (cuponId, usuarioId) => {
  try {
    return await db.none(
      `INSERT INTO cupones_uso (cupon_id, usuario_id, descuento_aplicado)
       VALUES ($1, $2, 0)
       ON CONFLICT (cupon_id, usuario_id, pedido_id) DO NOTHING`,
      [cuponId, usuarioId],
    );
  } catch (error) {
    console.error('Error al asignar cupón:', error);
    throw new Error('Error al asignar cupón');
  }
};

const asignarCuponATodos = async (cuponId) => {
  try {
    await db.none(
      `INSERT INTO cupones_uso (cupon_id, usuario_id, descuento_aplicado)
       SELECT $1, id, 0 FROM users WHERE role = 'user'
       ON CONFLICT (cupon_id, usuario_id, pedido_id) DO NOTHING`,
      [cuponId],
    );
  } catch (error) {
    console.error('Error al asignar cupón a todos:', error);
    throw new Error('Error al asignar cupón a todos');
  }
};

const obtenerCuponesDeUsuario = async (usuarioId) => {
  try {
    return await db.any(
      `SELECT c.*, cu.descuento_aplicado, cu.pedido_id, cu.used_at
       FROM cupones_uso cu
       JOIN cupones c ON c.id = cu.cupon_id
       WHERE cu.usuario_id = $1
       ORDER BY c.fecha_expiracion ASC NULLS LAST, c.id DESC`,
      [usuarioId],
    );
  } catch (error) {
    console.error('Error al obtener cupones del usuario:', error);
    throw new Error('Error al obtener cupones del usuario');
  }
};

const buscarUsuarios = async (search) => {
  try {
    if (!search) return [];
    return await db.any(
      `SELECT id, first_name, last_name, email FROM users
       WHERE (first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1)
       ORDER BY id DESC LIMIT 20`,
      [`%${search}%`],
    );
  } catch (error) {
    console.error('Error al buscar usuarios:', error);
    throw new Error('Error al buscar usuarios');
  }
};

module.exports = {
  crearCupon,
  obtenerCupones,
  obtenerCuponPorId,
  obtenerCuponPorCodigo,
  actualizarCupon,
  eliminarCupon,
  validarCupon,
  registrarUso,
  asignarCuponAUsuario,
  asignarCuponATodos,
  obtenerCuponesDeUsuario,
  buscarUsuarios,
};

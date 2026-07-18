const {
  crearCupon,
  obtenerCupones,
  obtenerCuponPorId,
  actualizarCupon,
  eliminarCupon,
  validarCupon,
  registrarUso,
  asignarCuponAUsuario,
  asignarCuponATodos,
  obtenerCuponesDeUsuario,
  buscarUsuarios,
} = require('../models/cuponModel');

const cuponController = {
  crear: async (req, res) => {
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
      } = req.body;

      if (!codigo || !tipo) {
        return res.status(400).json({ message: 'Código y tipo son obligatorios' });
      }

      const cupon = await crearCupon({
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
        creado_por: req.user?.id || null,
      });

      res.status(201).json(cupon);
    } catch (error) {
      console.error('Error al crear cupón:', error);
      if (error.message?.includes('duplicate key')) {
        return res.status(409).json({ message: 'Ya existe un cupón con ese código' });
      }
      res.status(500).json({ message: 'Error al crear cupón' });
    }
  },

  listar: async (req, res) => {
    try {
      const { page = 1, limit = 20, search, tipo, activo } = req.query;
      const result = await obtenerCupones({
        page: Number(page),
        limit: Number(limit),
        search,
        tipo,
        activo,
      });
      res.json(result);
    } catch (error) {
      console.error('Error al listar cupones:', error);
      res.status(500).json({ message: 'Error al listar cupones' });
    }
  },

  obtenerPorId: async (req, res) => {
    try {
      const cupon = await obtenerCuponPorId(req.params.id);
      if (!cupon) return res.status(404).json({ message: 'Cupón no encontrado' });
      res.json(cupon);
    } catch (error) {
      console.error('Error al obtener cupón:', error);
      res.status(500).json({ message: 'Error al obtener cupón' });
    }
  },

  actualizar: async (req, res) => {
    try {
      const cupon = await actualizarCupon(req.params.id, req.body);
      if (!cupon) return res.status(404).json({ message: 'Cupón no encontrado' });
      res.json(cupon);
    } catch (error) {
      console.error('Error al actualizar cupón:', error);
      if (error.message?.includes('duplicate key')) {
        return res.status(409).json({ message: 'Ya existe un cupón con ese código' });
      }
      res.status(500).json({ message: 'Error al actualizar cupón' });
    }
  },

  eliminar: async (req, res) => {
    try {
      const eliminado = await eliminarCupon(req.params.id);
      if (!eliminado) return res.status(404).json({ message: 'Cupón no encontrado' });
      res.json({ message: 'Cupón eliminado correctamente' });
    } catch (error) {
      console.error('Error al eliminar cupón:', error);
      res.status(500).json({ message: 'Error al eliminar cupón' });
    }
  },

  validar: async (req, res) => {
    try {
      const { codigo, montoPedido, categorias, platos } = req.body;
      const usuarioId = req.user?.id || null;

      if (!codigo) {
        return res.status(400).json({ message: 'El código del cupón es obligatorio' });
      }

      const resultado = await validarCupon(codigo, usuarioId, montoPedido || 0, categorias, platos);
      res.json(resultado);
    } catch (error) {
      console.error('Error al validar cupón:', error);
      res.status(500).json({ message: 'Error al validar cupón' });
    }
  },

  registrarUsoPostPedido: async (req, res) => {
    try {
      const { cupon_id, pedido_id, descuento } = req.body;
      const usuarioId = req.user?.id;

      if (!cupon_id || !pedido_id) {
        return res.status(400).json({ message: 'cupon_id y pedido_id son obligatorios' });
      }

      await registrarUso(cupon_id, usuarioId, pedido_id, descuento || 0);
      res.json({ message: 'Uso registrado correctamente' });
    } catch (error) {
      console.error('Error al registrar uso:', error);
      res.status(500).json({ message: 'Error al registrar uso' });
    }
  },

  asignarAUsuario: async (req, res) => {
    try {
      const { cupon_id, usuario_id } = req.body;
      if (!cupon_id || !usuario_id) {
        return res.status(400).json({ message: 'cupon_id y usuario_id son obligatorios' });
      }

      await asignarCuponAUsuario(cupon_id, usuario_id);
      res.json({ message: 'Cupón asignado correctamente' });
    } catch (error) {
      console.error('Error al asignar cupón:', error);
      res.status(500).json({ message: 'Error al asignar cupón' });
    }
  },

  asignarATodos: async (req, res) => {
    try {
      const { cupon_id } = req.body;
      if (!cupon_id) {
        return res.status(400).json({ message: 'cupon_id es obligatorio' });
      }

      await asignarCuponATodos(cupon_id);
      res.json({ message: 'Cupón asignado a todos los usuarios' });
    } catch (error) {
      console.error('Error al asignar cupón a todos:', error);
      res.status(500).json({ message: 'Error al asignar cupón a todos' });
    }
  },

  misCupones: async (req, res) => {
    try {
      const usuarioId = req.user?.id;
      if (!usuarioId) {
        return res.status(401).json({ message: 'No autenticado' });
      }
      const cupones = await obtenerCuponesDeUsuario(usuarioId);
      res.json(cupones);
    } catch (error) {
      console.error('Error al obtener cupones del usuario:', error);
      res.status(500).json({ message: 'Error al obtener cupones' });
    }
  },

  buscarUsuarios: async (req, res) => {
    try {
      const { search } = req.query;
      const usuarios = await buscarUsuarios(search);
      res.json(usuarios);
    } catch (error) {
      console.error('Error al buscar usuarios:', error);
      res.status(500).json({ message: 'Error al buscar usuarios' });
    }
  },
};

module.exports = cuponController;

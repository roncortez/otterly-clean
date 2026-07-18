const { obtenerResumenDia } = require('../models/estadisticasModel');

const estadisticasController = {
    
    obtenerResumenDia : async (req, res) => {
        try {
            const fecha = req.params.fecha;
            const estadisticas = await obtenerResumenDia(fecha);
            res.json(estadisticas);
        } catch (error) {
            console.error('Error al obtener estadísticas de pedidos: ', error);
            res.status(500).json({ error: 'Error interno del servidor'});
        }
    }
}

module.exports = estadisticasController;
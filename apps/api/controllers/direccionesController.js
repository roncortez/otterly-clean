const { obtenerDirecciones } = require('../models/direccionesModel');

const direccionesController = {
    obtenerDirecciones: async (req, res) => {
        try {
            const direcciones =  await obtenerDirecciones();
            res.json(direcciones);
        } catch (error) {
            res.status(500).json({message: 'Error al obtener las direcciones'});
        }
    }
};

module.exports = direccionesController;


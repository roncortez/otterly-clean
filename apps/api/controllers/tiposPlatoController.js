const { obtenerTiposPlato } = require('../models/tiposPlatoModel');

const tiposPlatoController = {
    
    obtenerTiposPlato: async (req, res) => {
        try {
            const tiposPlato = await obtenerTiposPlato();
            res.json(tiposPlato);
        } catch (error) {
            console.error('Error al obtener los tipos');
        }
    }

};

module.exports =  tiposPlatoController 
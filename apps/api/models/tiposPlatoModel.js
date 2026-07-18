//tiposPlatoModel.js

const db = require('../db');

const obtenerTiposPlato = async () => {
    try {
        const query = 'SELECT * FROM tipos';
        const tipos = await db.any(query);
        return tipos;
    } catch (error) {
        console.log('Error al obtener los tipos model: ', error);
    }
};

module.exports = {
    obtenerTiposPlato
}
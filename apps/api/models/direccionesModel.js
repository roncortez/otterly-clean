const db = require('../db');

const obtenerDirecciones = async () => {
    try {
        const query = 'SELECT * FROM lugar_envio';
        return await db.any(query);

    } catch (error) {
        console.error('Error al obtener direcciones:', error);
    }
};

module.exports = {
    obtenerDirecciones
}
const db = require('../db');

const getIngredient = async () => {
    try{
        return await db.any('SELECT * FROM ingredientes');
    }
    catch (error) {
        console.error("Error al obtener ingredientes");
    }
}; 

module.exports = {
    getIngredient
}
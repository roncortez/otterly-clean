const { getIngredient } = require('../models/ingredientModel');

const ingredientController = {
    getIngredient: async (req, res) => {
        try {
            const menu = await getIngredient();
            res.json(menu);
            // Envía el menú como respuesta en formato JSON
        }
        catch (error) {
            console.error("Error al obtener el menú")
        }
    }

}

module.exports = ingredientController;


import React, { useEffect, useState, useContext } from "react";
import axios from "axios";
import { CartContext } from "app/context/CartContext";
import Loading from "shared/ui/Loading";

function CustomizationModal({ item, onClose }) {
  const [ingredients, setIngredients] = useState([]);
  const [loading, setLoading] = useState([]);
  const [salsas, setSalsas] = useState([]);
  const [sabores, setSabores] = useState([]);
  const [ensaladas, setEnsaladas] = useState([]);
  const [proteinas, setProteinas] = useState([]);
  const [saboresCocteles, setSaboresCocteles] = useState([]);
  const [proteinasYEnsaladas, setProteinasYEnsaladas] = useState([]);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [selectedCount, setSelectedCount] = useState(0); // Total de ingredientes seleccionados
  const { addToCart } = useContext(CartContext);

  useEffect(() => {
    setLoading(true);
    async function fetchIngredients() {
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/ingredients`,
        );
        const ingredientes = response.data;

        // Filtrar salsas y sabores
        const proteinasFiltradas = ingredientes.filter(
          (ingrediente) => ingrediente.tipo_id === 1,
        );
        const ensaladasFiltradas = ingredientes.filter(
          (ingrediente) => ingrediente.tipo_id === 2,
        );
        const salsasFiltradas = ingredientes.filter(
          (ingrediente) => ingrediente.tipo_id === 3,
        );
        const saboresFiltrados = ingredientes.filter(
          (ingrediente) => ingrediente.tipo_id === 4,
        );
        const saboresCoctelesFiltrados = ingredientes.filter(
          (ingrediente) => ingrediente.activo && ingrediente.tipo_id === 5,
        );

        setProteinas(proteinasFiltradas);
        setEnsaladas(ensaladasFiltradas);
        setSalsas(salsasFiltradas);
        setSabores(saboresFiltrados);
        setSaboresCocteles(saboresCoctelesFiltrados);

        console.log("Proteinas y ensaladas: ", proteinas);
      } catch (error) {
        console.error("Error al obtener los ingredientes:", error);
      } finally {
        setLoading(false);
      }
    }
    fetchIngredients();
  }, []);

  const handleAddToCart = (item) => {
    const ingredientesSeleccionados = Object.values(selectedIngredients).flat();
    const itemWithIngredientes = {
      ...item,
      ingredientes: ingredientesSeleccionados,
    };
    addToCart(itemWithIngredientes);
    onClose(); // Cierra el modal después de agregar al carrito
  };

  // Agrupar ingredientes por tipo
  const groupedIngredients = ingredients.reduce((acc, ingredient) => {
    if (!acc[ingredient.tipo]) {
      acc[ingredient.tipo] = [];
    }
    acc[ingredient.tipo].push(ingredient);
    return acc;
  }, {});

  // Manejo de selección de ingredientes
  const handleCheckboxChange = (ingredient, tipo) => {
    setSelectedIngredients((prevSelected) => {
      const currentSelected = prevSelected[tipo] || [];
      const isSelected = currentSelected.some(
        (item) => item.id === ingredient.id,
      );

      if (isSelected) {
        setSelectedCount((prevCount) => prevCount - 1);
        return {
          ...prevSelected,
          [tipo]: currentSelected.filter((item) => item.id !== ingredient.id),
        };
      }

      if (item.tipo_combinacion === 1 && currentSelected.length >= 2) {
        alert("No puedes seleccionar más opciones de este tipo.");
        return prevSelected;
      }

      if (item.tipo_combinacion === 2) {
        const totalSelected = Object.values(prevSelected).flat().length;
        if (totalSelected >= 2) {
          alert("Solo puedes seleccionar 2 opciones en total.");
          return prevSelected;
        }
      }

      if (item.tipo_combinacion === 3) {
        const totalSelected = Object.values(prevSelected).flat().length;
        if (totalSelected >= 3) {
          alert("Solo puedes seleccionar 3 opciones en total.");
          return prevSelected;
        }
      }

      if (item.tipo_combinacion === 5) {
        const totalSelected = Object.values(prevSelected).flat().length;
        if (totalSelected >= 1) {
          alert("Solo puedes seleccionar 1 opción en total.");
          return prevSelected;
        }
      }

      setSelectedCount((prevCount) => prevCount + 1);
      return {
        ...prevSelected,
        [tipo]: [...currentSelected, ingredient],
      };
    });
  };

  if (loading) return <Loading />;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-lg bg-white sm:w-1/2">
        <div className="flex flex-col gap-5 p-4 sm:p-10">
          <div className="border-b border-gray-300">
            <h2 className="text-xl font-semibold sm:text-2xl">
              Personaliza tu plato
            </h2>
          </div>
          <div className="text-md flex flex-col justify-evenly gap-5 sm:flex-row sm:items-center sm:gap-10">
            <div className="h-1/2 w-full sm:w-1/2">
              <img
                className="h-auto w-full rounded-lg object-cover sm:h-full"
                src={item.image_url}
              />
            </div>
            <div>
              <p className="text-xl font-bold">{item.nombre}</p>
              <p className="opacity-80">{item.descripcion}</p>

              <div className="flex flex-col">
                <p className="my-2 font-bold">
                  Elige entre las siguientes opciones:
                </p>
                {/* Mostrar Proteínas y Ensaladas solo si están permitidas */}
                {item.tipo_ingrediente === 1 && (
                  <div className="ingredients-type-section">
                    <h3 className="font-semibold">Proteínas</h3>
                    <ul className="mb-2">
                      {proteinas.map((ingrediente) => (
                        <li className="" key={ingrediente.id}>
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              value={ingrediente.id}
                              checked={
                                selectedIngredients["proteinas"]?.some(
                                  (item) => item.id === ingrediente.id,
                                ) || false
                              }
                              onChange={() =>
                                handleCheckboxChange(ingrediente, "proteinas")
                              }
                            />
                            {ingrediente.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                    <h3 className="font-semibold">Ensaladas</h3>
                    <ul className="ingredients-list">
                      {ensaladas.map((ingrediente) => (
                        <li key={ingrediente.id} className="">
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              value={ingrediente.id}
                              checked={
                                selectedIngredients["ensaladas"]?.some(
                                  (item) => item.id === ingrediente.id,
                                ) || false
                              }
                              onChange={() =>
                                handleCheckboxChange(ingrediente, "ensaladas")
                              }
                            />
                            {ingrediente.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Mostrar Salsas solo si están permitidas */}
                {item.tipo_ingrediente === 2 && (
                  <div className="ingredients-type-section">
                    <h3 className="font-semibold">Salsas</h3>
                    <ul className="ingredients-list">
                      {salsas.map((ingrediente) => (
                        <li
                          key={ingrediente.id}
                          className="ingredient-list__item"
                        >
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              value={ingrediente.id}
                              checked={
                                selectedIngredients["salsas"]?.some(
                                  (item) => item.id === ingrediente.id,
                                ) || false
                              }
                              onChange={() =>
                                handleCheckboxChange(ingrediente, "salsas")
                              }
                            />
                            {ingrediente.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Mostrar Sabores solo si están permitidos */}
                {item.tipo_ingrediente === 3 && (
                  <div className="ingredients-type-section">
                    <h3>Sabores</h3>
                    <ul className="ingredients-list">
                      {sabores.map((ingrediente) => (
                        <li
                          key={ingrediente.id}
                          className="ingredient-list__item"
                        >
                          <label>
                            <input
                              type="checkbox"
                              value={ingrediente.id}
                              checked={
                                selectedIngredients["sabores"]?.some(
                                  (item) => item.id === ingrediente.id,
                                ) || false
                              }
                              onChange={() =>
                                handleCheckboxChange(ingrediente, "sabores")
                              }
                            />
                            {ingrediente.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.tipo_ingrediente === 5 && (
                  <div className="ingredients-type-section">
                    <h3>Sabores</h3>
                    <ul className="ingredients-list">
                      {saboresCocteles.map((ingrediente) => (
                        <li
                          key={ingrediente.id}
                          className="ingredient-list__item"
                        >
                          <label className="flex gap-2">
                            <input
                              type="checkbox"
                              value={ingrediente.id}
                              checked={
                                selectedIngredients["sabores"]?.some(
                                  (item) => item.id === ingrediente.id,
                                ) || false
                              }
                              onChange={() =>
                                handleCheckboxChange(ingrediente, "sabores")
                              }
                            />
                            {ingrediente.nombre}
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            {/* Deshabilitar el botón si no hay ingredientes seleccionados */}
            <button
              onClick={() => handleAddToCart(item)}
              disabled={selectedCount === 0} // Deshabilitar si no se seleccionan ingredientes
              className={
                selectedCount === 0
                  ? " disabled w-1/3 rounded-lg bg-gray-200 p-2 "
                  : "w-1/3 rounded-lg bg-yellow-300 p-2 p-2 hover:bg-yellow-400 "
              }
            >
              Agregar
            </button>
            <button
              onClick={onClose}
              className="w-1/3 rounded-lg bg-gray-200 p-2"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default CustomizationModal;

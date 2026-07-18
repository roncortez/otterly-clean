import React, { useState, useEffect, useContext } from "react";
import axios from "axios";
import "../../../shared/styles/MenuList.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faPlus } from "@fortawesome/free-solid-svg-icons";
import { CartContext } from "../../../app/context/CartContext";
import CustomizationModal from "../components/CustomizationModal";
import Overlay from "../../../shared/ui/Overlay";
import Loading from "../../../shared/ui/Loading";

function MenuList() {
  const [menuItems, setMenuItems] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [customizingItem, setCustomizingItem] = useState(null);
  const [open, setOpen] = useState(false);
  const [showOverlay, setShowOverlay] = useState(true);
  const [banner, setBanner] = useState(null);
  const { addToCart } = useContext(CartContext);

  useEffect(() => {
    async function fetchMenu() {
      setLoading(true);
      try {
        const response = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/menu`,
        );
        const responseCategorias = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/categorias`,
        );
        const responseBanner = await axios.get(
          `${process.env.REACT_APP_BACKEND_URL}/api/settings/banner`,
        );

        const categoriasOrdenadas = responseCategorias.data.sort(
          (a, b) => a.orden - b.orden,
        );

        setMenuItems(response.data);
        setCategorias(categoriasOrdenadas);
        setBanner(responseBanner.data);
      } catch (error) {
        console.error("Error al obtener el menu:", error);
        setError(
          "Hubo un problema al obtener el menu. Por favor, espera 1 minuto e intenta nuevamente.",
        );
      } finally {
        setLoading(false);
      }
    }

    fetchMenu();
  }, []);

  const groupedMenuItems = menuItems.reduce((acc, item) => {
    if (!acc[item.tipo_id]) {
      acc[item.tipo_id] = [];
    }
    acc[item.tipo_id].push(item);
    return acc;
  }, {});

  const handleAddToCart = (item) => {
    if (item.tipo_combinacion !== 4 && item.tipo_combinacion !== null) {
      setCustomizingItem(item);
    } else {
      addToCart(item);
    }
  };

  const handleCloseModal = () => {
    setCustomizingItem(null);
  };

  if (loading) return <Loading />;

  return (
    <div className="md:p-108 flex flex-col items-center">
      <Overlay
        isOpen={showOverlay && banner?.enabled !== false}
        imageUrl={banner?.imageUrl}
        onClose={() => setShowOverlay(false)}
      />
<h1 className="my-5 text-center font-paytone text-3xl font-bold md:my-10">
        MENÚ
      </h1>
      {error && <p>{error}</p>}

      <div className="">
        {categorias.map((categoria) => (
          <div className="md:mb-20 md:px-60" key={categoria.id}>
            <div className="my-5 flex items-center justify-center space-x-4 md:my-10">
              <h2 className="text-2xl font-semibold">{categoria.nombre}</h2>
              <div className="md:flex-grow md:border-t-2 md:border-gray-300" />
            </div>

            <div className="flex grid grid-cols-1 gap-2 p-4 sm:grid-cols-1 sm:gap-3 md:grid-cols-3 md:p-0 ">
              {groupedMenuItems[categoria.id] &&
              groupedMenuItems[categoria.id].length > 0 ? (
                groupedMenuItems[categoria.id]
                  .filter((item) => item.activo)
                  .map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-4 rounded-lg border-b bg-white sm:gap-6 sm:text-xl "
                    >
                      {item.tipo_id === 5 ? (
                        <div
                          className="flex flex-col items-center
                                      gap-5 p-8"
                        >
                          {/* Aquí defines el diseño especial para el item con id 5 */}
                          <h3 className="text-sm font-semibold sm:text-xl">
                            {item.nombre}
                          </h3>
                          <span className="text-center font-bold">
                            ${item.precio}
                          </span>
                          <button
                            onClick={() => handleAddToCart(item)}
                            className="mx-auto w-1/2 rounded-md
                                        bg-yellow-300 py-2
                                        text-xs hover:bg-yellow-400 
                                        md:text-base"
                          >
                            {item.tipo_combinacion !== 4 &&
                            item.tipo_combinacion !== null
                              ? "Personalizar"
                              : "Agregar"}
                          </button>
                        </div>
                      ) : (
                        <div className="flex md:max-w-sm md:flex-col">
                          {/* Contenedor con alto fijo */}

                          <div class="aspect-square w-1/2 overflow-hidden rounded-lg md:w-full">
                            <img
                              src={item.image_url}
                              alt={item.nombre}
                              className="h-full w-full object-cover"
                            />
                          </div>

                          <div
                            className="flex w-1/2 flex-col items-end justify-evenly 
                                        gap-2 p-6 text-right md:w-full md:items-start md:justify-center
                                        md:gap-5 md:px-6  
                                        md:text-left"
                          >
                            <h3 className="text-sm font-bold sm:text-xl">
                              {item.nombre}
                            </h3>
                            <p
                              className="line-clamp-3 text-xs md:line-clamp-2  md:h-[50px] md:text-base"
                              title={item.descripcion}
                            >
                              {item.descripcion}
                            </p>
                            <span className="text-center">
                              ${item.precio}
                            </span>
                            <button
                              onClick={() => handleAddToCart(item)}
                              className="w-full rounded-md bg-yellow-300 py-2
                                        text-xs hover:bg-yellow-400
                                        md:mx-auto md:w-1/2 
                                        md:text-base"
                            >
                              {item.tipo_combinacion !== 4 &&
                              item.tipo_combinacion !== null
                                ? "Personalizar"
                                : "Agregar"}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
              ) : (
                <div className="col-span-full py-6 text-center text-gray-500">
                  Muy pronto podrás disfrutar de este nuevo plato
                </div>
              )}
            </div>
            <div className="mx-auto my-4 h-0.5 w-1/3 bg-gray-300 md:hidden"></div>
          </div>
        ))}
        {customizingItem && (
          <CustomizationModal
            item={customizingItem}
            onClose={handleCloseModal}
          />
        )}
      </div>
    </div>
  );
}

export default MenuList;

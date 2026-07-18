import React, { useState, useEffect } from "react";
import axios from "axios";
import "../../../shared/styles/Platos.css"; // Ajusta la ruta según sea necesario

const Platos = () => {
  const [platos, setPlatos] = useState([]);
  const [error, setError] = useState("");
  const [tipos, setTipos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isSearched, setIsSearched] = useState(false);
  const [editingPlato, setEditingPlato] = useState(null);
  const [updatedPlato, setUpdatedPlato] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    tipo_id: "",
    image_url: "",
    tipo_combinacion: "",
    tipo_ingrediente: "",
  });

  const handleSearch = async () => {
    if (searchTerm.trim() === "") {
      setPlatos([]);
      setIsSearched(false);
      return;
    }

    try {
      const response = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/search?term=${searchTerm}`,
      );
      setPlatos(response.data);
      setError("");
      setIsSearched(true);
    } catch (error) {
      console.error("Error al buscar:", error);
      setError("Error al buscar platos");
      setIsSearched(true);
    }
  };

  const handleChange = (e) => {
    setSearchTerm(e.target.value);
  };

  const handleEditClick = (plato) => {
    setEditingPlato(plato);
    setUpdatedPlato({
      nombre: plato.nombre,
      descripcion: plato.descripcion,
      precio: plato.precio,
      tipo_id: plato.tipo_id || "",
      image_url: plato.image_url || "",
      tipo_combinacion: plato.tipo_combinacion || "",
      tipo_ingrediente: plato.tipo_ingrediente || "",
    });
  };

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;

    if (name === "image_url" && files.length > 0) {
      setUpdatedPlato({ ...updatedPlato, [name]: files[0] });
    } else if (name !== "image_url") {
      setUpdatedPlato({ ...updatedPlato, [name]: value });
    }
  };

  const handleUpdatePlato = async () => {
    try {
      const formData = new FormData();
      formData.append("nombre", updatedPlato.nombre);
      formData.append("descripcion", updatedPlato.descripcion);
      formData.append("precio", updatedPlato.precio);
      formData.append("tipo_id", updatedPlato.tipo_id);
      formData.append("tipo_combinacion", updatedPlato.tipo_combinacion);
      formData.append("tipo_ingrediente", updatedPlato.tipo_ingrediente);

      if (updatedPlato.image_url) {
        formData.append("image_url", updatedPlato.image_url); // Solo agregamos la imagen si está presente
      }

      await axios.put(
        `${process.env.REACT_APP_BACKEND_URL}/api/menu/plato/${editingPlato.id}`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      setPlatos(
        platos.map((plato) =>
          plato.id === editingPlato.id ? { ...plato, ...updatedPlato } : plato,
        ),
      );
      setEditingPlato(null);
      setError("");
      alert("Plato actualizado exitosamente");
    } catch (error) {
      console.error("Error al actualizar el plato:", error);
      setError("Error al actualizar el plato");
    }
  };

  const handleDeletePlato = async (id) => {
    try {
      await axios.delete(
        `${process.env.REACT_APP_BACKEND_URL}/api/menu/plato/${id}`,
      );
      setPlatos(platos.filter((plato) => plato.id !== id));
    } catch (error) {
      console.error("Error al eliminar el plato:", error);
      setError("Error al eliminar el plato");
    }
  };

  useEffect(() => {
    const fetchTiposPlato = async () => {
      const respuesta = await axios.get(
        `${process.env.REACT_APP_BACKEND_URL}/api/tipos-plato`,
      );
      setTipos(respuesta.data);
    };

    fetchTiposPlato();
  }, []);

  return (
    <div className="edit-plate-container">
      <h2>Buscar</h2>
      <div className="search-bar">
        <input
          type="text"
          value={searchTerm}
          onChange={handleChange}
          placeholder="Buscar plato..."
          className="search-input"
        />
        <button onClick={handleSearch} className="search-button">
          Buscar
        </button>
      </div>
      {error && <p className="error-message">{error}</p>}
      <div className="plate-list">
        {platos.length > 0 ? (
          <table className="plate-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Descripción</th>
                <th>Precio</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {platos.map((plato) => (
                <tr key={plato.id}>
                  <td>{plato.nombre}</td>
                  <td>{plato.descripcion}</td>
                  <td>${plato.precio}</td>
                  <td>
                    <button
                      onClick={() => handleEditClick(plato)}
                      className="edit-button"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleDeletePlato(plato.id)}
                      className="edit-button"
                    >
                      Borrar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          isSearched && (
            <p className="no-results-message">No se encontraron platos.</p>
          )
        )}
      </div>

      {editingPlato && (
        <form className="form">
          <div className="form__container">
            <label className="form__label">Nombre</label>
            <input
              className="form__value"
              type="text"
              name="nombre"
              value={updatedPlato.nombre}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form__container">
            <label className="form__label">Descripción</label>
            <input
              className="form__value"
              type="text"
              name="descripcion"
              value={updatedPlato.descripcion}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form__container">
            <label className="form__label">Precio</label>
            <input
              className="form__value"
              type="number"
              name="precio"
              value={updatedPlato.precio}
              onChange={handleInputChange}
              required
            />
          </div>
          <div className="form__container">
            <label className="form__label">Tipo de plato</label>
            <select
              className="form__value"
              name="tipo_id"
              value={updatedPlato.tipo_id}
              onChange={handleInputChange}
            >
              <option value="">Seleccione un tipo de plato</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>
                  {tipo.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="form__container">
            <label className="form__label">Imagen</label>
            <input
              className="form__value"
              type="file"
              name="image_url"
              onChange={handleInputChange}
            />
          </div>
          <div className="form__container">
            <label className="form__label">Tipo de combinación</label>
            <input
              className="form__value"
              type="number"
              name="tipo_combinacion"
              value={updatedPlato.tipo_combinacion}
              onChange={handleInputChange}
            />
          </div>
          <div className="form__container">
            <label className="form__label">Tipo de ingrediente</label>
            <input
              className="form__value"
              type="number"
              name="tipo_ingrediente"
              value={updatedPlato.tipo_ingrediente}
              onChange={handleInputChange}
            />
          </div>
          <button
            type="button"
            onClick={handleUpdatePlato}
            className="update-button"
          >
            Guardar cambios
          </button>
          <button
            type="button"
            onClick={() => setEditingPlato(null)}
            className="cancel-button"
          >
            Cancelar
          </button>
        </form>
      )}
    </div>
  );
};

export default Platos;

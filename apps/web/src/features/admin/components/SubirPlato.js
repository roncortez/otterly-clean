import React, { useEffect, useState } from "react";
import axios from "axios";
import "../../../shared/styles/SubirPlato.css";

function SubirPlato() {
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [precio, setPrecio] = useState("");
  const [tipoId, setTipoId] = useState("");
  const [tipoCombinacion, setTipoCombinacion] = useState("");
  const [imagenUrl, setImagenUrl] = useState(null);
  const [tipos, setTipos] = useState([]);

  const handleChange = (e) => {
    const archivoSeleccionado = e.target.files[0];
    setImagenUrl(archivoSeleccionado);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();

    const formData = new FormData();
    formData.append("nombre", nombre);
    formData.append("descripcion", descripcion);
    formData.append("precio", precio);
    formData.append("tipo_id", tipoId);
    formData.append("tipo_combinacion", tipoCombinacion);

    if (imagenUrl) {
      formData.append("image_url", imagenUrl);
    }

    try {
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/menu/plato`,
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data", // Cambiado a 'application/json'
          },
        },
      );
      alert("Plato subido al menú exitosamente");
      console.log("Plato subido con éxito:", response.data);
    } catch (error) {
      console.error("Error al subir el plato:", error.response.data);
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
    <form onSubmit={handleSubmit} className="form">
      <div className="form__container">
        <label className="form__label">Nombre</label>
        <input
          className="form__value"
          type="text"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          required
        />
      </div>
      <div className="form__container">
        <label className="form__label">Descripción</label>
        <input
          className="form__value"
          type="text"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
          required
        />
      </div>
      <div className="form__container">
        <label className="form__label">Precio</label>
        <input
          className="form__value"
          type="number"
          value={precio}
          onChange={(e) => setPrecio(e.target.value)}
          required
        />
      </div>
      <div className="form__container">
        <label className="form__label">Tipo de plato</label>
        <select
          className="form__value"
          value={tipoId}
          onChange={(e) => setTipoId(e.target.value)}
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
          onChange={handleChange}
          required
        />
      </div>
      <div className="form__container">
        <label className="form__label">Personalización de ingredientes</label>
        <ul>
          <li>1 (2 proteínas y 2 ensaladas)</li>
          <li>2 (Máximo 2 ingredientes de cualquier tipo)</li>
          <li>3 (Máximo 3 ingredientes de cualquier tipo)</li>
          <li>4 (Ninguna)</li>
        </ul>
        <input
          className="form__value"
          type="number"
          value={tipoCombinacion}
          onChange={(e) => setTipoCombinacion(e.target.value)}
          required
        />
      </div>
      <button type="submit">Subir Plato</button>
    </form>
  );
}

export default SubirPlato;

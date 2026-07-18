// Register.js
import React, { useState } from "react";
import { auth } from "../../../shared/lib/firebaseConfig";
import { createUserWithEmailAndPassword } from "firebase/auth";
import axios from "axios"; // Asegúrate de instalar axios

const Register = () => {
  const [first_name, setFirstName] = useState("");
  const [last_name, setLastName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const registrationData = {
      email,
      first_name,
      last_name,
      password,
      role: "user",
    };

    try {
      console.log("Enviando datos de registro:", registrationData);

      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/register`,
        registrationData,
      );
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      console.log("Respuesta del servidor:", response.data);
      setSuccess("Usuario registrado exitosamente.");
    } catch (error) {
      console.error(
        "Error durante el registro:",
        error.response ? error.response.data : error.message,
      );
      setError(
        "Error durante el registro: " +
          (error.response ? error.response.data.message : error.message),
      );
    }
  };

  return (
    <div>
      <h2>Register</h2>
      <form onSubmit={handleSubmit}>
        <div>
          <label>Nombre:</label>
          <input
            type="text"
            value={first_name}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Apellido:</label>
          <input
            type="text"
            value={last_name}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Teléfono:</label>
          <input
            type="text"
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            pattern="09\d{8}" // Asegura que el teléfono comience con 09 y tenga 10 dígitos
            maxLength="10"
            required
          />
        </div>
        <div>
          <label>Email:</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div>
          <label>Password:</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>

        {error && <p style={{ color: "red" }}>{error}</p>}
        {success && <p style={{ color: "green" }}>{success}</p>}
        <button type="submit">Register</button>
      </form>
    </div>
  );
};

export default Register;

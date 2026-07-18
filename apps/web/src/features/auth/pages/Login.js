import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from "firebase/auth";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEye, faEyeSlash } from "@fortawesome/free-solid-svg-icons";
import { auth } from "../../../shared/lib/firebaseConfig";
import "../../../shared/styles/Login.css";
import axios from "axios";
import Loading from "../../../shared/ui/Loading";

const Login = ({ onLoginSuccess }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState(""); // Estado para la confirmación de la contraseña
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [telefono, setTelefono] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [showResetForm, setShowResetForm] = useState(false);
  const [showRegisterForm, setShowRegisterForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password,
      );
      console.log("User signed in:", userCredential.user);

      // Llamada a la API para obtener el rol del usuario
      // Se envía un objeto
      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/getUserRole`,
        {
          email: email,
        },
      );

      // response.status devuelve un código numérico (200 es éxito)
      if (response.status !== 200) {
        throw new Error("Error en la respuesta del servidor");
      }
      const data = response.data;
      const userRole = data.role;

      // Actualizamos el rol del usuario en el estado de la aplicación
      onLoginSuccess(userRole);

      if (userRole === "admin") {
        alert("Ingreso exitoso como administrador");
        navigate("/admin"); // Asegúrate de que '/admin' coincida con la ruta para Admin
      } else {
        navigate("/"); // Asegúrate de que '/' coincida con la ruta para MenuList
      }
    } catch (error) {
      console.error("Error signing in:", error);
      setError("Usuario o contraseña incorrectos.");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError(""); // Limpiar el error antes de registrar
    setLoading(true);
    // Verificar que las contraseñas coincidan
    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password,
      );
      console.log("User registered:", userCredential.user);

      // Aquí puedes agregar lógica para guardar más detalles en la base de datos si es necesario
      const registrationData = {
        email,
        first_name: firstName, // Mapeo de firstName a first_name
        last_name: lastName,
        password,
        role: "user",
        telefono,
      };

      console.log("Enviando datos de registro:", registrationData);

      const response = await axios.post(
        `${process.env.REACT_APP_BACKEND_URL}/api/auth/register`,
        registrationData,
      );
      // Redirige o muestra un mensaje de éxito
      alert("Cuenta creada exitosamente");
      setShowRegisterForm(false);
      setError(""); // Limpiar el mensaje de error después del registro
    } catch (error) {
      console.error("Error during registration:", error);

      // Verifica el código de error de Firebase
      if (error.code === "auth/email-already-in-use") {
        setError("Este correo electrónico ya está registrado.");
      } else {
        setError("Error al registrar el usuario.");
      }

      // Intenta eliminar el usuario de Firebase si fue creado pero el registro en la base de datos falló
      if (error.code !== "auth/email-already-in-use") {
        // Intenta eliminar el usuario de Firebase
        try {
          await auth.currentUser.delete();
          console.log(
            "Usuario eliminado de Firebase debido a error en la base de datos.",
          );
        } catch (deleteError) {
          console.error(
            "Error al eliminar el usuario de Firebase:",
            deleteError,
          );
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Enlace de reestablecimiento enviado al correo electrónico");
      setShowResetForm(false);
    } catch (error) {
      setError(error.message);
    }
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  if (loading) return <Loading />;

  return (
    <div className="login-page h-screen font-comfortaa">
      {showRegisterForm ? (
        <form
          onSubmit={handleRegister}
          className="flex w-full flex-col gap-2 overflow-auto p-10 lg:my-auto lg:w-1/3 lg:border"
        >
          <h2 className="text-2xl font-bold ">Crear cuenta</h2>
          <div className="form-group flex gap-1">
            <label htmlFor="firstName">Nombre</label>
            <input
              className="border"
              type="text"
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder="Nombre"
              required
            />
          </div>
          <div className="form-group flex gap-1">
            <label htmlFor="lastName">Apellido</label>
            <input
              className="border"
              type="text"
              id="lastName"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Apellido"
              required
            />
          </div>
          <div className="form-group flex gap-1">
            <label htmlFor="lastName">Teléfono</label>
            <input
              className="border"
              type="text"
              id="telefono"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Teléfono"
              pattern="09[0-9]{8}"
              maxLength="10"
              title="El número debe empezar con 09 y contener máximo 10 dígitos"
              required
            />
          </div>
          <div className="form-group flex gap-1">
            <label htmlFor="email">Correo electrónico</label>
            <input
              className="border"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>
          <div className="form-group flex gap-1">
            <label htmlFor="password">Contraseña</label>
            <span className="text-sm">
              {" "}
              Ingrese una contraseña de 6 caracteres o más{" "}
            </span>
            <input
              className="border"
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="*********"
              required
            />
          </div>
          <div className="form-group flex gap-1">
            <label htmlFor="confirmPassword">Confirmar contraseña</label>
            <input
              className="border"
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="*********"
              required
            />
          </div>
          <div className="button-container">
            <button type="submit">Registrar</button>
            <button type="button" onClick={() => setShowRegisterForm(false)}>
              Cancelar
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
        </form>
      ) : showResetForm ? (
        <form
          onSubmit={handlePasswordReset}
          className="flex w-full flex-col gap-2 overflow-auto p-10 lg:my-auto lg:w-1/3 lg:border"
        >
          <h2 className="text-2xl font-bold">Reestablecer contraseña</h2>
          <div className="form-group flex gap-1">
            <label htmlFor="reset-email">Correo electrónico</label>
            <input
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="button-container">
            <button type="submit">Enviar enlace</button>
            <button type="button" onClick={() => setShowResetForm(false)}>
              Cancelar
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
        </form>
      ) : (
        <form
          onSubmit={handleLogin}
          className="flex  w-full flex-col gap-2 overflow-auto p-10 lg:my-auto lg:w-1/3 lg:border"
        >
          <h2 className="font-paytone text-2xl font-bold">Iniciar sesión</h2>
          <div className="form-group flex gap-1">
            <label htmlFor="email">Usuario</label>
            <input
              className="border"
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              required
            />
          </div>
          <div className="form-group password-container flex gap-1">
            <label htmlFor="password">Contraseña</label>
            <input
              className="border"
              type={showPassword ? "text" : "password"}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="*********"
              required
            />
            {/* 
            <FontAwesomeIcon
              icon={showPassword ? faEye : faEyeSlash}
              onClick={togglePasswordVisibility}
              className="password-toggle"
            />
            */}
          </div>
          <div className="form-group">
            <a
              href="#"
              onClick={() => setShowResetForm(true)}
              className="forgot-password"
            >
              Olvidé mi contraseña
            </a>
          </div>
          <div className="button-container">
            <button type="submit">Ingresar</button>
            <button type="button" onClick={() => setShowRegisterForm(true)}>
              Crear cuenta
            </button>
            {error && <p className="error-message">{error}</p>}
          </div>
        </form>
      )}
    </div>
  );
};

export default Login;

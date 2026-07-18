import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "assets/logo.jpg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes, faUser, faShoppingCart } from "@fortawesome/free-solid-svg-icons";
import { useAuth } from "app/context/AuthContext";

const Navbar = () => {
  const { currentUser, logout } = useAuth();
  const navigate = useNavigate();
  const userRole = localStorage.getItem("userRole");
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await logout();
      localStorage.removeItem("userRole");
      navigate("/");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-40 bg-white font-comfortaa shadow-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="flex shrink-0 items-center" onClick={() => setOpen(false)}>
            <img src={logo} alt="Otterly Clean" className="h-14 w-auto object-contain sm:h-16" />
          </Link>

          <button
            type="button"
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-xl text-gray-800 transition-colors hover:bg-yellow-50 md:hidden"
            aria-label={open ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <FontAwesomeIcon icon={open ? faTimes : faBars} />
          </button>

          <ul className="hidden items-center gap-1 text-sm font-medium text-gray-700 md:flex lg:text-base">
            <li>
              <Link
                to="/"
                className="rounded-lg px-4 py-2.5 transition-colors hover:bg-yellow-100 hover:text-gray-950"
              >
                Inicio
              </Link>
            </li>
            {currentUser && userRole === "admin" && (
              <li>
                <Link
                  to="/admin"
                  className="rounded-lg px-4 py-2.5 transition-colors hover:bg-yellow-100 hover:text-gray-950"
                >
                  Dashboard
                </Link>
              </li>
            )}
            <li>
              <Link
                to="/Cart"
                className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-yellow-100 hover:text-gray-950"
                aria-label="Carrito"
              >
                <FontAwesomeIcon icon={faShoppingCart} />
              </Link>
            </li>
            {currentUser ? (
              <>
                <li>
                  <Link
                    to="/profile"
                    className="flex h-11 w-11 items-center justify-center rounded-lg transition-colors hover:bg-yellow-100 hover:text-gray-950"
                    aria-label="Perfil"
                  >
                    <FontAwesomeIcon icon={faUser} />
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-4 py-2.5 transition-colors hover:bg-yellow-100 hover:text-gray-950"
                  >
                    Salir
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  to="/Login"
                  className="rounded-lg px-4 py-2.5 transition-colors hover:bg-yellow-100 hover:text-gray-950"
                >
                  Iniciar sesión
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>

      <ul
        className={`fixed inset-x-0 top-20 z-30 flex flex-col overflow-hidden border-t border-gray-100 bg-white px-4 font-comfortaa shadow-lg transition-all duration-300 md:hidden ${open ? "max-h-96 py-2 opacity-100" : "max-h-0 py-0 opacity-0"}`}
      >
        <li className="w-full border-b border-gray-100">
          <Link className="block rounded-lg px-3 py-3 text-right font-medium hover:bg-yellow-50" to="/" onClick={() => setOpen(false)}>
            Inicio
          </Link>
        </li>
        {currentUser && userRole === "admin" && (
          <li className="w-full border-b border-gray-100">
            <Link className="block rounded-lg px-3 py-3 text-right font-medium hover:bg-yellow-50" to="/admin" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          </li>
        )}
        <li className="w-full border-b border-gray-100">
          <Link className="flex items-center justify-end gap-2 rounded-lg px-3 py-3 font-medium hover:bg-yellow-50" to="/Cart" onClick={() => setOpen(false)}>
            Carrito <FontAwesomeIcon icon={faShoppingCart} />
          </Link>
        </li>
        {currentUser ? (
          <>
            <li className="w-full border-b border-gray-100">
              <Link className="flex items-center justify-end gap-2 rounded-lg px-3 py-3 font-medium hover:bg-yellow-50" to="/profile" onClick={() => setOpen(false)}>
                Perfil <FontAwesomeIcon icon={faUser} />
              </Link>
            </li>
            <li className="w-full border-b border-gray-100">
              <button
                type="button"
                className="block w-full rounded-lg px-3 py-3 text-right font-medium hover:bg-yellow-50"
                onClick={() => {
                  handleLogout();
                  setOpen(false);
                }}
              >
                Salir
              </button>
            </li>
          </>
        ) : (
          <li className="w-full border-b border-gray-100">
            <Link className="block rounded-lg px-3 py-3 text-right font-medium hover:bg-yellow-50" to="/Login" onClick={() => setOpen(false)}>
              Iniciar sesión
            </Link>
          </li>
        )}
      </ul>
    </>
  );
};

export default Navbar;

import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import logo from "assets/logo.jpg";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faTimes, faUser } from "@fortawesome/free-solid-svg-icons";
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
      console.error("Error signing out:", error);
    }
  };

  return (
    <>
      <nav className="sticky top-0 z-40 border-b border-sage-200 bg-white/90 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" className="flex shrink-0 items-center gap-2.5" onClick={() => setOpen(false)}>
            <img src={logo} alt="Otterly Clean" className="h-9 w-auto object-contain" />
          </Link>

          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-forest-600 transition-colors hover:bg-sage-100 hover:text-forest-800 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            <FontAwesomeIcon icon={open ? faTimes : faBars} className="text-lg" />
          </button>

          <ul className="hidden items-center gap-1 text-sm font-medium text-forest-600 md:flex">
            <li>
              <Link
                to="/"
                className="rounded-lg px-3.5 py-2 transition-colors hover:bg-sage-100 hover:text-forest-800"
              >
                Home
              </Link>
            </li>
            <li>
              <Link
                to="/services"
                className="rounded-lg px-3.5 py-2 transition-colors hover:bg-sage-100 hover:text-forest-800"
              >
                Services
              </Link>
            </li>
            {currentUser && userRole === "admin" && (
              <li>
                <Link
                  to="/admin"
                  className="rounded-lg px-3.5 py-2 transition-colors hover:bg-sage-100 hover:text-forest-800"
                >
                  Dashboard
                </Link>
              </li>
            )}
            <li className="ml-2 h-5 w-px bg-sage-200" />
            {currentUser ? (
              <>
                <li>
                  <Link
                    to="/profile"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors hover:bg-sage-100 hover:text-forest-800"
                    aria-label="Profile"
                  >
                    <FontAwesomeIcon icon={faUser} className="text-sm" />
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="rounded-lg px-3.5 py-2 transition-colors hover:bg-sage-100 hover:text-forest-800"
                  >
                    Sign Out
                  </button>
                </li>
              </>
            ) : (
              <li>
                <Link
                  to="/login"
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                >
                  Sign In
                </Link>
              </li>
            )}
          </ul>
        </div>
      </nav>

      <ul
        className={`fixed inset-x-0 top-16 z-30 overflow-hidden border-b border-sage-200 bg-white transition-all duration-300 md:hidden ${open ? "max-h-80 py-2 opacity-100 shadow-lg" : "max-h-0 py-0 opacity-0"}`}
      >
        <li className="border-b border-sage-100 px-5">
          <Link className="block py-3 text-sm font-medium text-forest-700 hover:text-forest-900" to="/" onClick={() => setOpen(false)}>
            Home
          </Link>
        </li>
        <li className="border-b border-sage-100 px-5">
          <Link className="block py-3 text-sm font-medium text-forest-700 hover:text-forest-900" to="/services" onClick={() => setOpen(false)}>
            Services
          </Link>
        </li>
        {currentUser && userRole === "admin" && (
          <li className="border-b border-sage-100 px-5">
            <Link className="block py-3 text-sm font-medium text-forest-700 hover:text-forest-900" to="/admin" onClick={() => setOpen(false)}>
              Dashboard
            </Link>
          </li>
        )}
        {currentUser ? (
          <>
            <li className="border-b border-sage-100 px-5">
              <Link className="flex items-center gap-2 py-3 text-sm font-medium text-forest-700 hover:text-forest-900" to="/profile" onClick={() => setOpen(false)}>
                Profile
              </Link>
            </li>
            <li className="px-5">
              <button
                type="button"
                className="block py-3 text-sm font-medium text-forest-700 hover:text-forest-900"
                onClick={() => { handleLogout(); setOpen(false); }}
              >
                Sign Out
              </button>
            </li>
          </>
        ) : (
          <li className="px-5 pt-2 pb-1">
            <Link
              className="block w-full rounded-lg bg-primary-600 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              to="/login"
              onClick={() => setOpen(false)}
            >
              Sign In
            </Link>
          </li>
        )}
      </ul>
    </>
  );
};

export default Navbar;

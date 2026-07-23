import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Route,
  Routes,
  Navigate,
} from "react-router-dom";
import Navbar from "shared/ui/Navbar";
import Footer from "shared/ui/Footer";
import HomePage from "features/home/pages/HomePage";
import ServiceRequestPage from "features/services/pages/ServiceRequestPage";
import MenuList from "features/menu/pages/MenuPage";
import Cart from "features/cart/pages/Cart";
import Login from "features/auth/pages/Login";
import Profile from "features/account/pages/ProfilePage";
import AdminLayout from "features/admin/components/AdminLayout";
import OrdersPage from "features/admin/pages/AdminOrdersPage";
import MenuPage from 'features/admin/pages/AdminMenuPage'
import AdminOverviewPage from "features/admin/pages/AdminOverviewPage";
import AdminSettingsPage from "features/admin/pages/AdminSettingsPage";
import AdminUsersPage from "features/admin/pages/AdminUsersPage";
import AdminTakeOrderPage from "features/admin/pages/AdminTakeOrderPage";
import AdminCuponesPage from "features/admin/pages/AdminCuponesPage";
import { AuthProvider } from "app/context/AuthContext";

const App = () => {
  const [, setUserRole] = useState(
    localStorage.getItem("userRole") || null,
  ); // Inicializa con el valor de localStorage si existe

  // Funcion para actualizar el rol del usuario y guardarlo en localStorage
  const handleLoginSuccess = (role) => {
    setUserRole(role);
    localStorage.setItem("userRole", role); // Guarda el rol en localStorage
  };

  // Efecto para comprobar si el rol esta almacenado en localStorage
  useEffect(() => {
    const storedRole = localStorage.getItem("userRole");
    if (storedRole) {
      setUserRole(storedRole);
    }
  }, []);

  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Navbar />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/services" element={<ServiceRequestPage />} />
            <Route path="/menu" element={<MenuList />} />
            <Route
              path="/login"
              element={<Login onLoginSuccess={handleLoginSuccess} />}
            />
            <Route path="/profile" element={<Profile />} />
            <Route path="/admin-dashboard" element={<AdminLayout />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="overview" replace />} />
              <Route path="overview" element={<AdminOverviewPage />} />
              <Route path="orders" element={<OrdersPage />} />
              <Route path="take-order" element={<AdminTakeOrderPage />} />
              <Route path="menu" element={<MenuPage />} />
              <Route path="cupones" element={<AdminCuponesPage />} />
              <Route path="settings" element={<AdminSettingsPage />} />
              <Route path="users" element={<AdminUsersPage />} />
            </Route>
            <Route path="/cart" element={<Cart />} />
          </Routes>
          <Footer />
        </div>
      </Router>
    </AuthProvider>
  );
};

export default App;

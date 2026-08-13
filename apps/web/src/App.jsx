import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth, homePathForRoles, landingPathFor } from '@/shared/auth/AuthContext';
import { Spinner } from '@/shared/ui';

import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import ActivateAccountPage from '@/features/auth/ActivateAccountPage';
import OnboardingPage from '@/features/onboarding/OnboardingPage';
import HomePage from '@/features/home/HomePage';

import CustomerLayout from '@/features/customer/CustomerLayout';
import CustomerDashboard from '@/features/customer/DashboardPage';
import BookingWizard from '@/features/customer/booking/BookingWizard';
import CustomerOrderDetail from '@/features/customer/OrderDetailPage';
import CustomerOrders from '@/features/customer/OrdersPage';
import ProductsPage from '@/features/customer/products/ProductsPage';

import ProfileLayout from '@/features/profile/ProfileLayout';
import ProfilePage from '@/features/profile/ProfilePage';
import AddressesPage from '@/features/customer/AddressesPage';
import PropertyManager from '@/features/customer/properties/PropertyManager';

import OperationsLayout from '@/features/operations/OperationsLayout';
import OperationsDashboard from '@/features/operations/DashboardPage';
import OperationsOrders from '@/features/operations/OrdersPage';
import OperationsOrderDetail from '@/features/operations/OrderDetailPage';
import StaffManagement from '@/features/operations/StaffPage';
import CustomersPage from '@/features/operations/CustomersPage';
import IncidentsPage from '@/features/operations/IncidentsPage';
import CouponsPage from '@/features/operations/CouponsPage';
import SettingsPage from '@/features/operations/SettingsPage';
import ConfigurationLayout from '@/features/operations/configuration/ConfigurationLayout';
import CompanySettingsPage from '@/features/operations/configuration/CompanySettingsPage';
import ServicesSettingsPage from '@/features/operations/configuration/ServicesSettingsPage';
import BlackoutsPage from '@/features/operations/configuration/BlackoutsPage';
import UsersPage from '@/features/operations/UsersPage';

import StaffLayout from '@/features/staff/StaffLayout';
import StaffJobsPage from '@/features/staff/JobsPage';
import StaffJobDetail from '@/features/staff/JobDetailPage';

/**
 * Rutas de acceso. Se pintan como panel sobre la página en la que estabas, no
 * como pantallas propias: ver `features/auth/AuthDialog`.
 */
const AUTH_PATHS = ['/entrar', '/crear-cuenta', '/activar-cuenta'];

/**
 * Enrutado por audiencia.
 *
 * Cada árbol de rutas exige su rol, y con roles múltiples basta con tenerlo
 * entre los suyos: alguien con ADMIN + STAFF entra tanto en /operaciones como
 * en /trabajo. El backend vuelve a validar todo; esto solo evita que alguien
 * vea una pantalla que no le corresponde.
 *
 * Antes del rol se comprueba el onboarding, y ese orden importa: quien tiene el
 * perfil a medias va a completarlo escriba la URL que escriba, y no rebota
 * entre paneles buscando uno que le deje entrar.
 */
function RequireRole({ role, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Comprobando tu sesión" />;
  if (!isAuthenticated) return <Navigate to="/entrar" replace />;
  if (user.onboarding?.pending) return <Navigate to="/onboarding" replace />;
  if (role && !user.roles?.includes(role)) {
    return <Navigate to={homePathForRoles(user.roles)} replace />;
  }

  return children;
}

/** El onboarding solo exige sesión: es justamente lo que falta por completar. */
function RequireSession({ children }) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Comprobando tu sesión" />;
  if (!isAuthenticated) return <Navigate to="/entrar" replace />;
  return children;
}

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Cargando" />;
  if (!isAuthenticated) return <HomePage />;
  return <Navigate to={landingPathFor(user)} replace />;
}

function AppRoutes({ location }) {
  return (
    <Routes location={location}>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/home" element={<HomePage />} />

      {/* Completar el perfil. Sin rol: depende de quién eres, no de dónde entras. */}
      <Route
        path="/onboarding"
        element={
          <RequireSession>
            <OnboardingPage />
          </RequireSession>
        }
      />

      {/*
        Reservar y ver el catálogo NO exigen sesión.

        Un visitante que llega de la portada puede elegir servicio y rellenar la
        reserva entera; la sesión se pide en el último paso, justo antes de
        confirmar, que es cuando de verdad hace falta saber de quién es el
        pedido. El backend sigue exigiendo CUSTOMER autenticado para crear la
        orden: esto abre el formulario, no la API.

        Comparten el mismo marco que el resto del cliente (`CustomerLayout`), que
        se adapta a si hay sesión o no.
      */}
      <Route element={<CustomerLayout />}>
        <Route path="/reservar" element={<BookingWizard />} />
        <Route path="/productos" element={<ProductsPage />} />
      </Route>

      {/* Cliente */}
      <Route
        element={
          <RequireRole role="CUSTOMER">
            <CustomerLayout />
          </RequireRole>
        }
      >
        <Route path="/inicio" element={<CustomerDashboard />} />
        <Route path="/servicios" element={<CustomerOrders />} />
        <Route path="/servicios/:id" element={<CustomerOrderDetail />} />
      </Route>

      {/*
        Perfil propio: mismo sitio para clienta, trabajadora o administradora.

        Direcciones y Lugares viven aquí dentro y no en la navegación principal:
        son configuración de la cuenta, no sitios donde se trabaja a diario. El
        orden de las pestañas es el orden en que se usan —primero existe la
        dirección, después el lugar que hay en ella—.
      */}
      <Route
        path="/mi-perfil"
        element={
          <RequireRole>
            <ProfileLayout />
          </RequireRole>
        }
      >
        <Route index element={<ProfilePage />} />
        <Route path="direcciones" element={<AddressesPage />} />
        <Route path="lugares" element={<PropertyManager />} />
      </Route>

      {/* Operaciones */}
      <Route
        element={
          <RequireRole role="ADMIN">
            <OperationsLayout />
          </RequireRole>
        }
      >
        <Route path="/operaciones" element={<OperationsDashboard />} />
        <Route path="/operaciones/solicitudes" element={<OperationsOrders />} />
        <Route path="/operaciones/solicitudes/:id" element={<OperationsOrderDetail />} />
        <Route path="/operaciones/trabajadores" element={<StaffManagement />} />
        <Route path="/operaciones/clientes" element={<CustomersPage />} />
        <Route path="/operaciones/usuarios" element={<UsersPage />} />
        <Route path="/operaciones/incidencias" element={<IncidentsPage />} />
        <Route path="/operaciones/cupones" element={<CouponsPage />} />

        {/* Configuración de la plataforma */}
        <Route path="/operaciones/configuracion" element={<ConfigurationLayout />}>
          <Route index element={<Navigate to="empresa" replace />} />
          <Route path="empresa" element={<CompanySettingsPage />} />
          <Route path="servicios" element={<ServicesSettingsPage />} />
          <Route path="agenda" element={<BlackoutsPage />} />
          <Route path="avisos" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Trabajador */}
      <Route
        element={
          <RequireRole role="STAFF">
            <StaffLayout />
          </RequireRole>
        }
      >
        <Route path="/trabajo" element={<StaffJobsPage />} />
        <Route path="/trabajo/:id" element={<StaffJobDetail />} />
      </Route>

      {/*
        Compatibilidad. Direcciones y Lugares tenían ruta propia en la
        navegación principal, y `feat/maplibre-geoapify` llegó a separar las
        experiencias por servicio. Los enlaces guardados y los correos ya
        enviados siguen llevando a donde ahora vive cada cosa.
      */}
      <Route path="/direcciones" element={<Navigate to="/mi-perfil/direcciones" replace />} />
      <Route path="/inmuebles" element={<Navigate to="/mi-perfil/lugares" replace />} />
      <Route path="/limpieza/espacios" element={<Navigate to="/mi-perfil/lugares" replace />} />
      <Route path="/limpieza/hogar" element={<Navigate to="/mi-perfil/lugares" replace />} />
      <Route path="/limpieza/reservar" element={<Navigate to="/reservar?servicio=CLEANING" replace />} />
      <Route path="/lavanderia/recogida" element={<Navigate to="/reservar?servicio=LAUNDRY" replace />} />
      <Route path="/limpieza/reservas" element={<Navigate to="/servicios" replace />} />
      <Route path="/lavanderia/pedidos" element={<Navigate to="/servicios" replace />} />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  const location = useLocation();
  // Al abrir el acceso desde una pantalla, esa pantalla se queda detrás. Si se
  // llega por enlace directo no hay nada detrás, y entonces se usa la portada:
  // un panel flotando sobre el vacío parecería un error.
  const background = location.state?.background;
  const isAuthRoute = AUTH_PATHS.includes(location.pathname);

  return (
    <>
      {isAuthRoute && !background ? <HomePage /> : <AppRoutes location={background ?? location} />}

      {isAuthRoute ? (
        <Routes>
          <Route path="/entrar" element={<LoginPage />} />
          <Route path="/crear-cuenta" element={<RegisterPage />} />
          <Route path="/activar-cuenta" element={<ActivateAccountPage />} />
        </Routes>
      ) : null}
    </>
  );
}

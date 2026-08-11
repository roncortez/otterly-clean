import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, homePathForRole } from '@/shared/auth/AuthContext';
import { Spinner } from '@/shared/ui';

import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';

import CustomerLayout from '@/features/customer/CustomerLayout';
import CustomerDashboard from '@/features/customer/DashboardPage';
import BookingWizard from '@/features/customer/booking/BookingWizard';
import CustomerOrderDetail from '@/features/customer/OrderDetailPage';
import CustomerOrders from '@/features/customer/OrdersPage';
import AddressesPage from '@/features/customer/AddressesPage';

import OperationsLayout from '@/features/operations/OperationsLayout';
import OperationsDashboard from '@/features/operations/DashboardPage';
import OperationsOrders from '@/features/operations/OrdersPage';
import OperationsOrderDetail from '@/features/operations/OrderDetailPage';
import StaffManagement from '@/features/operations/StaffPage';
import CustomersPage from '@/features/operations/CustomersPage';
import IncidentsPage from '@/features/operations/IncidentsPage';

import StaffLayout from '@/features/staff/StaffLayout';
import StaffJobsPage from '@/features/staff/JobsPage';
import StaffJobDetail from '@/features/staff/JobDetailPage';

/**
 * Enrutado por audiencia.
 *
 * Cada árbol de rutas exige su rol. El backend vuelve a validar todo: esto
 * es solo para que nadie vea una pantalla que no le corresponde.
 */
function RequireRole({ role, children }) {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Comprobando tu sesión" />;
  if (!isAuthenticated) return <Navigate to="/entrar" replace />;
  if (role && user.role !== role) return <Navigate to={homePathForRole(user.role)} replace />;

  return children;
}

function RootRedirect() {
  const { user, isAuthenticated, isLoading } = useAuth();

  if (isLoading) return <Spinner label="Cargando" />;
  if (!isAuthenticated) return <Navigate to="/entrar" replace />;
  return <Navigate to={homePathForRole(user.role)} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<RootRedirect />} />
      <Route path="/entrar" element={<LoginPage />} />
      <Route path="/crear-cuenta" element={<RegisterPage />} />

      {/* Cliente */}
      <Route
        element={
          <RequireRole role="CUSTOMER">
            <CustomerLayout />
          </RequireRole>
        }
      >
        <Route path="/inicio" element={<CustomerDashboard />} />
        <Route path="/reservar" element={<BookingWizard />} />
        <Route path="/servicios" element={<CustomerOrders />} />
        <Route path="/servicios/:id" element={<CustomerOrderDetail />} />
        <Route path="/direcciones" element={<AddressesPage />} />
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
        <Route path="/operaciones/incidencias" element={<IncidentsPage />} />
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

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

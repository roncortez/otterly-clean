import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");`r`nconst TABLE_ORDER_EMAIL = process.env.REACT_APP_TABLE_ORDER_EMAIL || "table-orders@otterly-clean.local";
const currencyFormatter = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
});

function getDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  return currencyFormatter.format(Number(value || 0));
}

function isTableOrder(order) {
  return order?.email === TABLE_ORDER_EMAIL || /^Mesa\s+/i.test(order?.lugar_envio || "");
}

function orderChannelLabel(order) {
  if (isTableOrder(order)) return order.lugar_envio || "Mesa";
  return order.delivery ? order.lugar_envio : "Retiro";
}

export default function AdminOverviewPage() {
  const today = useMemo(() => getDateInputValue(new Date()), []);
  const [summary, setSummary] = useState(null);
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const fetchDashboard = async () => {
      setLoading(true);
      try {
        const [summaryResponse, ordersResponse, menuResponse, usersResponse] = await Promise.all([
          axios.get(`${API_BASE}/api/estadisticas/dia/${today}`),
          axios.get(`${API_BASE}/api/pedido`, {
            params: { from: today, to: today, page: 1, limit: 5 },
          }),
          axios.get(`${API_BASE}/api/menu`),
          axios.get(`${API_BASE}/api/auth/users`),
        ]);

        if (cancelled) return;
        setSummary(summaryResponse.data || null);
        setOrders(Array.isArray(ordersResponse.data?.data) ? ordersResponse.data.data : []);
        setMenuItems(Array.isArray(menuResponse.data) ? menuResponse.data : []);
        setUsers(Array.isArray(usersResponse.data) ? usersResponse.data : []);
        setError(null);
      } catch {
        if (!cancelled) {
          setError("No se pudo cargar el resumen del panel.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchDashboard();
    return () => { cancelled = true; };
  }, [today]);

  const activeMenuItems = menuItems.filter((item) => item.activo !== false).length;
  const deliveryOrders = Number(summary?.delivery_pedidos || 0);
  const tableOrders = Number(summary?.mesa_pedidos || 0);
  const pickupOrders = Number(summary?.retiro_pedidos || 0);

  if (loading) return <Loading />;

  return (
    <section className="flex flex-col gap-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Resumen</h1>
        <p className="mt-1 text-sm text-gray-500">
          Vista rápida de la actividad para hoy.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Pedidos hoy</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{summary?.total_pedidos || 0}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Ventas hoy</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{formatMoney(summary?.valor_total)}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Platos en menú</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{activeMenuItems}</p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-500">Usuarios</p>
          <p className="mt-2 text-2xl font-bold text-gray-900">{users.length}</p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-100 px-4 py-3">
            <h2 className="font-semibold text-gray-900">Últimos pedidos</h2>
          </div>
          <div className="divide-y divide-gray-100">
            {orders.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Todavía no hay pedidos hoy.</p>
            ) : (
              orders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-4 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-gray-900">
                      #{order.id} - {order.first_name} {order.last_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {order.hora} - {orderChannelLabel(order)}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-semibold text-gray-900">{formatMoney(order.total)}</p>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Actividad de hoy</h2>
          <div className="mt-4 flex flex-col gap-3">
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Delivery</span>
              <span className="font-semibold text-gray-900">{deliveryOrders}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Órdenes en mesa</span>
              <span className="font-semibold text-gray-900">{tableOrders}</span>
            </div>
            <div className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-600">Retiro</span>
              <span className="font-semibold text-gray-900">{pickupOrders}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
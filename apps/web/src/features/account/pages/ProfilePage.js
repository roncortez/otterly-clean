import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";
import { useAuth } from "app/context/AuthContext";
import PropertyManager from "shared/ui/PropertyManager";
import { FaHome, FaClipboardList, FaUser, FaSignOutAlt } from "react-icons/fa";

const PAGE_SIZE = 4;

const TABS = [
  { key: "properties", label: "My Properties", icon: FaHome },
  { key: "services", label: "My Services", icon: FaClipboardList },
  { key: "account", label: "Account", icon: FaUser },
];

const Profile = () => {
  const { currentUser, logout } = useAuth();
  const [cliente, setCliente] = useState("");
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("properties");
  const [currentPage, setCurrentPage] = useState(1);
  const [propertyTypes, setPropertyTypes] = useState([]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (!currentUser) { setLoading(false); return; }
      setLoading(true);
      try {
        const r1 = await axios.post(
          `${process.env.REACT_APP_BACKEND_URL}/api/auth/getUser`,
          { email: currentUser.email },
          { signal: controller.signal },
        );
        if (cancelled) return;
        setCliente(r1.data);

        const [pedidosRes, ptRes] = await Promise.all([
          r1.data?.id
            ? axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/orders/mine/${r1.data.id}`, { signal: controller.signal })
            : Promise.resolve({ data: { data: [] } }),
          axios.get(`${process.env.REACT_APP_BACKEND_URL}/api/property-types`, { signal: controller.signal }),
        ]);
        if (cancelled) return;
        const ordersData = pedidosRes.data?.data || pedidosRes.data || [];
        setPedidos(Array.isArray(ordersData) ? ordersData : []);
        setPropertyTypes(ptRes.data);
      } catch (err) {
        if (!cancelled) console.log(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => { cancelled = true; controller.abort(); };
  }, [currentUser]);

  useEffect(() => { setCurrentPage(1); }, [pedidos.length]);

  const totalPages = Math.max(1, Math.ceil((pedidos?.length || 0) / PAGE_SIZE));
  const paginatedPedidos = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return (pedidos || []).slice(start, start + PAGE_SIZE);
  }, [pedidos, currentPage]);

  if (loading) return <Loading />;

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 lg:flex-row">
        {/* Sidebar */}
        <aside className="w-full flex-shrink-0 lg:w-64">
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            {/* User info */}
            <div className="flex items-center gap-3 border-b border-sage-100 pb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-forest-600 text-sm font-bold text-white">
                {cliente.first_name?.[0]}{cliente.last_name?.[0]}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-forest-800 truncate">{cliente.first_name} {cliente.last_name}</p>
                <p className="text-xs text-forest-400 truncate">{cliente.email}</p>
              </div>
            </div>

            {/* Tabs */}
            <nav className="mt-4 flex flex-col gap-1">
              {TABS.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveTab(key)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === key
                      ? "bg-sage-100 text-forest-700"
                      : "text-forest-500 hover:bg-gray-50 hover:text-forest-700"
                  }`}
                >
                  <Icon className="text-sm" />
                  {label}
                </button>
              ))}
            </nav>

            {/* Logout */}
            <div className="mt-4 border-t border-sage-100 pt-4">
              <button
                type="button"
                onClick={logout}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-500 transition-colors hover:bg-red-50"
              >
                <FaSignOutAlt className="text-sm" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Properties tab */}
          {activeTab === "properties" && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-forest-800">My Properties</h2>
              <p className="mt-1 text-sm text-forest-500">Manage your saved properties for faster service requests.</p>
              <div className="mt-5">
                {cliente.id && (
                  <PropertyManager userId={cliente.id} propertyTypes={propertyTypes} />
                )}
              </div>
            </div>
          )}

          {/* Services tab */}
          {activeTab === "services" && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-forest-800">My Services</h2>
              <p className="mt-1 text-sm text-forest-500">View your service history and resend confirmations.</p>

              {pedidos.length === 0 ? (
                <div className="mt-8 rounded-xl border border-dashed border-sage-300 bg-sage-50 p-8 text-center">
                  <FaClipboardList className="mx-auto text-3xl text-sage-300" />
                  <p className="mt-3 text-sm text-forest-500">No services requested yet.</p>
                  <a href="/services" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700">
                    Request a Service
                  </a>
                </div>
              ) : (
                <>
                  <p className="mt-4 text-xs text-forest-400">Showing {paginatedPedidos.length} of {pedidos.length} services</p>
                  <ul className="mt-4 flex flex-col gap-3">
                    {paginatedPedidos.map((order) => {
                      const statusColors = {
                        pending: "bg-yellow-100 text-yellow-700",
                        confirmed: "bg-blue-100 text-blue-700",
                        scheduled: "bg-indigo-100 text-indigo-700",
                        in_progress: "bg-purple-100 text-purple-700",
                        completed: "bg-forest-100 text-forest-700",
                        cancelled: "bg-red-100 text-red-700",
                        picked_up: "bg-blue-100 text-blue-700",
                        processing: "bg-purple-100 text-purple-700",
                        ready: "bg-forest-100 text-forest-700",
                        delivered: "bg-forest-100 text-forest-700",
                        inspected: "bg-blue-100 text-blue-700",
                        quoted: "bg-orange-100 text-orange-700",
                        accepted: "bg-indigo-100 text-indigo-700",
                        repairing: "bg-purple-100 text-purple-700",
                      };
                      const categoryLabels = { cleaning: "Cleaning", laundry: "Laundry", repair: "Repair" };
                      const dateStr = order.created_at ? new Date(order.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
                      return (
                        <li key={order.id} className="rounded-xl border border-gray-100 p-4">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-semibold text-forest-400">Order #{order.id}</p>
                                <span className={`w-fit rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusColors[order.status] || "bg-gray-100 text-gray-600"}`}>
                                  {order.status?.replace(/_/g, " ")}
                                </span>
                              </div>
                              <p className="mt-1 text-sm font-medium text-forest-800">{categoryLabels[order.service_type] || order.service_type}</p>
                              <p className="text-xs text-forest-500">{dateStr}</p>
                              {order.service_address && <p className="text-xs text-forest-400 mt-0.5">{order.service_address}</p>}
                            </div>
                            <div className="flex flex-col gap-2 sm:items-end">
                              <span className="text-base font-bold text-forest-800">${Number(order.total || 0).toFixed(2)}</span>
                              <a href={`https://wa.me/12034558417?text=${encodeURIComponent(`Hi, I'd like to confirm my service request #${order.id}.`)}`}
                                target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-[11px] font-bold text-white transition-colors hover:bg-green-600">
                                WhatsApp
                              </a>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                  {pedidos.length > PAGE_SIZE && (
                    <div className="mt-4 flex items-center justify-between">
                      <p className="text-xs text-forest-400">Page {currentPage} of {totalPages}</p>
                      <div className="flex gap-2">
                        <button type="button" disabled={currentPage <= 1} onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                          className="rounded-lg border border-sage-200 px-3 py-1.5 text-xs font-semibold text-forest-600 transition-colors hover:bg-sage-50 disabled:opacity-40">Prev</button>
                        <button type="button" disabled={currentPage >= totalPages} onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                          className="rounded-lg border border-sage-200 px-3 py-1.5 text-xs font-semibold text-forest-600 transition-colors hover:bg-sage-50 disabled:opacity-40">Next</button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Account tab */}
          {activeTab === "account" && (
            <div className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <h2 className="font-display text-lg font-bold text-forest-800">Account</h2>
              <p className="mt-1 text-sm text-forest-500">Your account information.</p>
              <div className="mt-5 flex flex-col gap-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-forest-400">First Name</p>
                    <p className="mt-1 text-sm font-medium text-forest-800">{cliente.first_name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-forest-400">Last Name</p>
                    <p className="mt-1 text-sm font-medium text-forest-800">{cliente.last_name || "—"}</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-forest-400">Email</p>
                  <p className="mt-1 text-sm font-medium text-forest-800">{cliente.email || "—"}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-forest-400">Phone</p>
                  <p className="mt-1 text-sm font-medium text-forest-800">{cliente.telefono || "—"}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
};

export default Profile;

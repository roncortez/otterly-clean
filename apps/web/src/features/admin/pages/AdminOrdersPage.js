import React, { useEffect, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const PAGE_SIZE = 20;
const DEFAULT_OPERATION_SETTINGS = { highlightDelivery: true };

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function getDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function formatearFecha(fechaStr) {
  const [anio, mes, dia] = fechaStr.split("-");
  return `${parseInt(dia, 10)} de ${MESES[parseInt(mes, 10) - 1]}, ${anio}`;
}

function agruparPedidosPorFecha(pedidos) {
  const pedidosAgrupados = pedidos.reduce((acc, pedido) => {
    const fecha = pedido.fecha;
    if (!acc[fecha]) acc[fecha] = [];
    acc[fecha].push(pedido);
    return acc;
  }, {});

  return Object.entries(pedidosAgrupados).sort(
    (a, b) => new Date(b[0]) - new Date(a[0]),
  );
}

export default function OrdersPage() {
  const today = getDateInputValue(new Date());
  const [filters, setFilters] = useState({ from: today, to: today });
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });

  const [pedidosPorFecha, setPedidosPorFecha] = useState([]);
  const [resumenPorFecha, setResumenPorFecha] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [operationSettings, setOperationSettings] = useState(DEFAULT_OPERATION_SETTINGS);

  const [detallesPedidos, setDetallesPedidos] = useState({});
  const [visibilidadDetalles, setVisibilidadDetalles] = useState({});

  useEffect(() => {
    let cancelado = false;

    const fetchOperationSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/settings/operation`);
        if (!cancelado) {
          setOperationSettings({ ...DEFAULT_OPERATION_SETTINGS, ...response.data });
        }
      } catch (err) {
        console.error("Error al obtener la configuración operativa:", err);
      }
    };

    fetchOperationSettings();
    return () => { cancelado = true; };
  }, []);
  useEffect(() => {
    let cancelado = false;

    const fetchPedidos = async () => {
      if (filters.to < filters.from) {
        setPedidosPorFecha([]);
        setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
        setError("La fecha final no puede ser anterior a la fecha inicial.");
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/api/pedido`, {
          params: {
            from: filters.from,
            to: filters.to,
            page,
            limit: PAGE_SIZE,
          },
        });
        if (cancelado) return;

        const payload = response.data;
        const pedidos = Array.isArray(payload) ? payload : payload.data;
        if (!Array.isArray(pedidos)) {
          throw new Error("Formato inesperado de los datos de pedidos.");
        }

        setPedidosPorFecha(agruparPedidosPorFecha(pedidos));
        setPagination(
          payload.pagination || {
            page,
            limit: PAGE_SIZE,
            total: pedidos.length,
            totalPages: pedidos.length > 0 ? 1 : 0,
          },
        );
        setError(null);
      } catch (err) {
        if (!cancelado) {
          setPedidosPorFecha([]);
          setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
          setError(err.response?.data?.error || "Error al obtener los pedidos");
        }
      } finally {
        if (!cancelado) setLoading(false);
      }
    };

    fetchPedidos();
    return () => { cancelado = true; };
  }, [filters, page]);

  const updateFilters = (nextFilters) => {
    setFilters(nextFilters);
    setPage(1);
    setResumenPorFecha({});
    setVisibilidadDetalles({});
  };

  const aplicarFiltroRapido = (tipo) => {
    const now = new Date();

    if (tipo === "today") {
      const value = getDateInputValue(now);
      updateFilters({ from: value, to: value });
      return;
    }

    if (tipo === "yesterday") {
      const value = getDateInputValue(addDays(now, -1));
      updateFilters({ from: value, to: value });
      return;
    }

    if (tipo === "last7") {
      updateFilters({
        from: getDateInputValue(addDays(now, -6)),
        to: getDateInputValue(now),
      });
    }
  };

  const toggleDetalles = async (pedidoId) => {
    if (visibilidadDetalles[pedidoId]) {
      setVisibilidadDetalles((prev) => ({ ...prev, [pedidoId]: false }));
      return;
    }

    if (detallesPedidos[pedidoId]) {
      setVisibilidadDetalles((prev) => ({ ...prev, [pedidoId]: true }));
      return;
    }

    try {
      const res = await axios.get(
        `${API_BASE}/api/pedido/detalle-pedido/${pedidoId}`,
      );
      setDetallesPedidos((prev) => ({ ...prev, [pedidoId]: res.data }));
      setVisibilidadDetalles((prev) => ({ ...prev, [pedidoId]: true }));
    } catch {
      setError("Error al obtener el detalle del pedido");
    }
  };

  const obtenerEstadisticasPorFecha = async (fecha) => {
    try {
      const res = await axios.get(
        `${API_BASE}/api/estadisticas/dia/${fecha}`,
      );
      setResumenPorFecha((prev) => ({ ...prev, [fecha]: res.data }));
    } catch {
      setError("Error al obtener estadísticas del día");
    }
  };

  const canGoPrevious = page > 1;
  const canGoNext = pagination.totalPages > 0 && page < pagination.totalPages;

  return (
    <div className="flex flex-col pb-6">
      <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-2">Pedidos recibidos</h2>
          <p className="text-sm text-gray-500">
            {pagination.total} {pagination.total === 1 ? "pedido encontrado" : "pedidos encontrados"}
          </p>
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm xl:flex-row xl:items-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              className="h-9 rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              onClick={() => aplicarFiltroRapido("today")}
            >
              Hoy
            </button>
            <button
              type="button"
              className="h-9 rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              onClick={() => aplicarFiltroRapido("yesterday")}
            >
              Ayer
            </button>
            <button
              type="button"
              className="h-9 rounded-md bg-gray-100 px-3 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-200"
              onClick={() => aplicarFiltroRapido("last7")}
            >
              Últimos 7 días
            </button>
          </div>

          <div className="flex gap-2 flex-row sm:items-end">
            <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Desde
              <input
                type="date"
                className="mt-1 h-9 rounded-md border border-gray-200 px-2.5 text-sm font-normal normal-case tracking-normal text-gray-700 outline-none focus:border-yellow-400"
                value={filters.from}
                onChange={(event) => updateFilters({ ...filters, from: event.target.value })}
              />
            </label>
            <label className="flex flex-col text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Hasta
              <input
                type="date"
                className="mt-1 h-9 rounded-md border border-gray-200 px-2.5 text-sm font-normal normal-case tracking-normal text-gray-700 outline-none focus:border-yellow-400"
                value={filters.to}
                onChange={(event) => updateFilters({ ...filters, to: event.target.value })}
              />
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          {pedidosPorFecha.length === 0 && !error && (
            <p className="text-gray-500">No hay pedidos disponibles para este rango.</p>
          )}

          {pedidosPorFecha.map(([fecha, pedidos]) => (
            <div key={fecha} className="mb-8">
              <div className="flex items-center gap-3 mb-3">
                <h3 className="text-lg font-bold text-gray-800">
                  {formatearFecha(fecha)}
                </h3>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  {pedidos.length} {pedidos.length === 1 ? "pedido" : "pedidos"}
                </span>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50 text-left">
                      <th className="font-semibold text-gray-500 px-4 py-3 w-12">#</th>
                      <th className="font-semibold text-gray-500 px-4 py-3">Cliente</th>
                      <th className="font-semibold text-gray-500 px-4 py-3 whitespace-nowrap hidden md:table-cell">Hora</th>
                      <th className="font-semibold text-gray-500 px-4 py-3 whitespace-nowrap text-right">Total</th>
                      <th className="font-semibold text-gray-500 px-4 py-3 whitespace-nowrap hidden sm:table-cell">Tipo</th>
                      <th className="font-semibold text-gray-500 px-4 py-3 whitespace-nowrap hidden lg:table-cell">Teléfono</th>
                      <th className="font-semibold text-gray-500 px-4 py-3 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {pedidos.map((pedido) => {
                      const abierto = !!visibilidadDetalles[pedido.id];
                      const detalles = detallesPedidos[pedido.id];

                      return (
                        <React.Fragment key={pedido.id}>
                          <tr
                            className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors cursor-pointer"
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleDetalles(pedido.id)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") toggleDetalles(pedido.id);
                            }}
                          >
                            <td className="px-4 py-3 font-mono text-gray-400 w-12">
                              {pedido.id}
                            </td>
                            <td className="px-4 py-3 min-w-0">
                              <span className="font-medium text-gray-900 block truncate">
                                {pedido.first_name} {pedido.last_name}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap hidden md:table-cell">
                              {pedido.hora}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-gray-900 whitespace-nowrap">
                              ${pedido.total}
                            </td>
                            <td className="px-4 py-3 hidden sm:table-cell">
                              <span
                                className={`inline-block text-xs font-semibold px-2.5 py-0.5 rounded-full whitespace-nowrap ${
                                  pedido.delivery && operationSettings.highlightDelivery
                                    ? "bg-green-100 text-green-700"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {pedido.delivery ? pedido.lugar_envio : "Retiro"}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-gray-500 whitespace-nowrap hidden lg:table-cell">
                              {pedido.telefono}
                            </td>
                            <td className="px-4 py-3 w-10">
                              <div
                                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
                                title={abierto ? "Ocultar detalle" : "Ver detalle"}
                                aria-hidden
                              >
                                <svg
                                  className={`w-4 h-4 transition-transform ${abierto ? "rotate-180" : ""}`}
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </div>
                            </td>
                          </tr>

                          {abierto && detalles && (
                            <tr>
                              <td colSpan="7" className="px-4 py-0">
                                <div className="py-3 pl-4 border-l-2 border-yellow-300 ml-2">
                                  {detalles.length === 0 ? (
                                    <p className="text-sm text-gray-400 italic py-2">
                                      Sin detalle disponible
                                    </p>
                                  ) : (
                                    <div className="flex flex-col gap-2">
                                      {detalles.map((detalle) => (
                                        <div
                                          key={detalle.id}
                                          className="flex items-start justify-between gap-4 text-sm"
                                        >
                                          <div className="flex-1 min-w-0">
                                            <span className="font-medium text-gray-800">
                                              {detalle.nombre}
                                            </span>
                                            {detalle.ingredientes &&
                                              detalle.ingredientes.length > 0 && (
                                                <span className="text-gray-400 ml-2">
                                                  - {detalle.ingredientes.map((ing) => ing.nombre).join(", ")}
                                                </span>
                                              )}
                                          </div>
                                          <div className="flex items-center gap-3 text-gray-500 whitespace-nowrap">
                                            <span>x{detalle.cantidad}</span>
                                            <span className="font-semibold text-gray-700">${detalle.precio}</span>
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
                <button
                  className="px-4 py-2 bg-yellow-300 hover:bg-yellow-400 rounded-lg text-sm font-medium transition-colors w-full sm:w-auto"
                  onClick={() => obtenerEstadisticasPorFecha(fecha)}
                >
                  Resumen del día
                </button>
                {resumenPorFecha[fecha] && (
                  <div className="flex items-center gap-4 text-sm text-gray-600">
                    <span>
                      Pedidos: <strong>{resumenPorFecha[fecha].total_pedidos}</strong>
                    </span>
                    <span>
                      Total: <strong>${resumenPorFecha[fecha].valor_total || 0}</strong>
                    </span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {pagination.totalPages > 1 && (
            <div className="mt-2 flex flex-col gap-3 border-t border-gray-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-gray-500">
                Página {pagination.page} de {pagination.totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canGoPrevious}
                  onClick={() => setPage((currentPage) => Math.max(currentPage - 1, 1))}
                >
                  Anterior
                </button>
                <button
                  type="button"
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canGoNext}
                  onClick={() => setPage((currentPage) => currentPage + 1)}
                >
                  Siguiente
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
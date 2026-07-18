import React, { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";
import { useAuth } from "app/context/AuthContext";
import { buildOrderWhatsAppUrl } from "shared/lib/whatsappOrder";

const PAGE_SIZE = 4;

const normalizeIngredients = (ingredients) => {
  if (!ingredients) return [];
  if (Array.isArray(ingredients)) return ingredients;

  if (typeof ingredients === "string") {
    try {
      const parsed = JSON.parse(ingredients);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  return [];
};

const Profile = () => {
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(false);
  const { currentUser } = useAuth();
  const [cliente, setCliente] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const run = async () => {
      if (!currentUser) {
        setCliente("");
        setPedidos([]);
        return;
      }

      setLoading(true);
      try {
        const r1 = await axios.post(
          `${process.env.REACT_APP_BACKEND_URL}/api/auth/getUser`,
          { email: currentUser.email },
          { signal: controller.signal },
        );
        if (cancelled) return;
        setCliente(r1.data);

        if (r1.data && r1.data.id) {
          const r2 = await axios.get(
            `${process.env.REACT_APP_BACKEND_URL}/api/pedido/${r1.data.id}`,
            { signal: controller.signal },
          );
          if (cancelled) return;
          setPedidos(Array.isArray(r2.data) ? r2.data : []);
        } else {
          setPedidos([]);
        }
      } catch (err) {
        if (!cancelled) console.log(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentUser]);

  useEffect(() => {
    setCurrentPage(1);
  }, [pedidos.length]);

  const totalPages = Math.max(1, Math.ceil((pedidos?.length || 0) / PAGE_SIZE));
  const paginatedPedidos = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return (pedidos || []).slice(start, start + PAGE_SIZE);
  }, [pedidos, currentPage]);
  const canGoPrevious = currentPage > 1;
  const canGoNext = currentPage < totalPages;

  if (loading) return <Loading />;

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-gray-50 px-4 py-6 font-comfortaa sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-5">
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h1 className="font-paytone text-3xl font-bold text-gray-900">
            Hola {cliente.first_name || ""}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Revisa tus pedidos y reenvía el resumen por WhatsApp cuando lo necesites.
          </p>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-paytone text-2xl font-semibold text-gray-900">
              {pedidos && pedidos.length > 0
                ? "Pedidos realizados"
                : "Aún no has realizado pedidos"}
            </h2>
            {pedidos.length > 0 && (
              <p className="mt-1 text-sm text-gray-500">
                Mostrando {paginatedPedidos.length} de {pedidos.length} pedidos
              </p>
            )}
          </div>
          {pedidos.length > PAGE_SIZE && (
            <p className="text-sm font-semibold text-gray-500">
              Página {currentPage} de {totalPages}
            </p>
          )}
        </div>

        <ul className="flex flex-col gap-4">
          {paginatedPedidos.map((pedido) => {
            const whatsappUrl = buildOrderWhatsAppUrl({
              order: pedido,
              customer: cliente,
              details: pedido.detalles || [],
            });

            return (
              <li
                className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
                key={pedido.id_pedido}
              >
                <div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-semibold text-gray-500">Pedido #{pedido.id_pedido}</p>
                    <p className="mt-1 font-semibold text-gray-900">{pedido.fecha}</p>
                    <p className="mt-1 text-sm text-gray-600">
                      {pedido.lugar_envio ? `Entrega: ${pedido.lugar_envio}` : "Retiro en el local"}
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:items-end">
                    <span className="text-xl font-bold text-gray-900">${pedido.total}</span>
                    <span className="w-fit rounded-full bg-lime-100 px-3 py-1 text-xs font-semibold text-lime-800">
                      Recibido
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <ul className="flex flex-1 flex-col gap-3">
                    {pedido.detalles.map((detalle) => {
                      const ingredients = normalizeIngredients(detalle.ingredientes);

                      return (
                        <li
                          key={detalle.id_detalle}
                          className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3 sm:flex-row sm:items-start sm:justify-between"
                        >
                          <div>
                            <p className="font-semibold text-gray-900">{detalle.plato}</p>
                            {ingredients.length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-gray-600">
                                {ingredients.map((ingrediente, index) => (
                                  <li key={`${detalle.id_detalle}-${index}`} className="rounded-full bg-white px-2 py-1">
                                    {ingrediente.nombre || ingrediente}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="text-sm font-semibold text-gray-700">
                            {detalle.cantidad} x ${detalle.precio_unitario}
                          </div>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="w-full lg:w-56">
                    <a
                      className="block rounded-lg bg-green-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-green-600"
                      href={whatsappUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Enviar por WhatsApp
                    </a>
                    <p className="mt-2 text-xs text-gray-500">
                      Úsalo si WhatsApp no se abrió o quieres reenviar el pedido.
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        {pedidos.length > PAGE_SIZE && (
          <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Página {currentPage} de {totalPages}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canGoPrevious}
                onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canGoNext}
                onClick={() => setCurrentPage((page) => Math.min(page + 1, totalPages))}
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
};

export default Profile;

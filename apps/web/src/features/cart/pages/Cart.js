import React, { useContext, useEffect, useState } from "react";
import { CartContext } from "../../../app/context/CartContext";
import { Link } from "react-router-dom";
import { useAuth } from "../../../app/context/AuthContext";
import Loading from "../../../shared/ui/Loading";
import axios from "axios";
import { buildOrderWhatsAppUrl } from "shared/lib/whatsappOrder";
import CuponInput from "../components/CuponInput";
import "../../../shared/styles/Cart.css";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const DEFAULT_OPERATION_SETTINGS = {
  acceptOrders: true,
  freeDelivery: false,
  notifyTelegram: true,
  highlightDelivery: true,
};

const Cart = () => {
  const { cartItems, setCartItems, removeFromCart, clearCart, appliedCoupon, getCouponDiscount } = useContext(CartContext);
  const { currentUser } = useAuth();
  const [isDelivery, setIsDelivery] = useState(false);
  const [isPickup, setIsPickup] = useState(false);
  const [direcciones, setDirecciones] = useState([]);
  const [cliente, setCliente] = useState("");
  const [direccion, setDireccion] = useState("");
  const [formaPago] = useState("");
  const [costoEnvio, setCostoEnvio] = useState(0);
  const [operationSettings, setOperationSettings] = useState(DEFAULT_OPERATION_SETTINGS);
  const [completedOrder, setCompletedOrder] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const totalPrice = cartItems.reduce(
    (total, item) => total + item.precio * item.cantidad,
    0,
  );
  const couponDiscount = getCouponDiscount(totalPrice);
  const couponCoversShipping = appliedCoupon?.tipo === "envio_gratis";
  const effectiveShippingCost = isDelivery && (operationSettings.freeDelivery || couponCoversShipping) ? 0 : Number(costoEnvio);
  const totalToPay = totalPrice - couponDiscount + effectiveShippingCost;

  const finalizarPedido = async () => {
    if (!operationSettings.acceptOrders) {
      alert("El negocio no está aceptando pedidos en este momento");
      return;
    }

    if (cartItems.length === 0) {
      alert("Debe tener al menos un producto en el carrito");
      return;
    }

    if (!isDelivery && !isPickup) {
      alert("Debe seleccionar una forma de entrega");
      return;
    }

    if (isDelivery && !direccion) {
      alert("Debe seleccionar un lugar de envío");
      return;
    }

    setLoading(true);

    const pedido = {
      id_cliente: `${cliente.id}`,
      total: totalToPay,
      delivery: isDelivery,
      lugar_envio: isDelivery ? direccion : "",
      id_forma_pago: formaPago,
      cupon_id: appliedCoupon?.id || null,
      descuento: couponDiscount,
    };

    try {
      const response = await axios.post(`${API_BASE}/api/pedido`, pedido);
      if (response.status === 201) {
        const savedOrder = response.data.pedido;
        const idPedido = savedOrder.id;
        await enviarDetallesPedido(idPedido);

        const detallePedido = await axios.get(`${API_BASE}/api/pedido/detalle-pedido/${idPedido}`);
        const details = Array.isArray(detallePedido.data) ? detallePedido.data : [];
        const whatsappUrl = buildOrderWhatsAppUrl({
          order: savedOrder,
          customer: cliente,
          details,
          subtotal: totalPrice,
          shippingCost: effectiveShippingCost,
          discount: couponDiscount,
          couponCode: appliedCoupon?.codigo || null,
        });

        setCompletedOrder({
          order: savedOrder,
          details,
          whatsappUrl,
        });
        clearCart();
        setIsDelivery(false);
        setIsPickup(false);
        setDireccion("");
        setCostoEnvio(0);
      } else {
        alert("Error al realizar el pedido");
      }
    } catch (error) {
      console.error("Error al enviar el pedido:", error);
      alert(error.response?.data?.error || "Hubo un problema al enviar el pedido");
    } finally {
      setLoading(false);
    }
  };

  const enviarDetallesPedido = async (idPedido) => {
    const detallesPedido = cartItems.map((item) => ({
      menu_id: item.id,
      cantidad: item.cantidad,
      precio: item.precio * item.cantidad,
      ingredientes: item.ingredientes,
    }));

    try {
      await Promise.all(
        detallesPedido.map((detalle) =>
          axios.post(`${API_BASE}/api/pedido/detalle-pedido`, {
            pedido_id: idPedido,
            ...detalle,
          }),
        ),
      );
    } catch (error) {
      console.error("Error al enviar los detalles del pedido:", error);
      alert("Hubo un problema al enviar los detalles del pedido");
    }
  };

  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    const savedCart = localStorage.getItem("cart");
    if (savedCart) {
      setCartItems(JSON.parse(savedCart));
    }
  }, [setCartItems]);

  useEffect(() => {
    let cancelled = false;

    const fetchOperationSettings = async () => {
      try {
        const response = await axios.get(`${API_BASE}/api/settings/operation`);
        if (!cancelled) {
          setOperationSettings({ ...DEFAULT_OPERATION_SETTINGS, ...response.data });
        }
      } catch (error) {
        console.error("Error al obtener la configuración operativa:", error);
      }
    };

    fetchOperationSettings();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const fetchDirecciones = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/api/direcciones`);
        setDirecciones(response.data);
      } catch (error) {
        setError("Error al obtener las direcciones");
      } finally {
        setLoading(false);
      }
    };

    fetchDirecciones();
  }, []);

  useEffect(() => {
    const fetchCliente = async () => {
      if (currentUser) {
        try {
          const response = await axios.post(`${API_BASE}/api/auth/getUser`, {
            email: currentUser.email,
          });
          setCliente(response.data);
        } catch (error) {
          setError("Error al obtener el cliente");
        }
      }
    };

    fetchCliente();
  }, [currentUser]);

  const handleDireccionChange = (event) => {
    const selectedDireccion = direcciones.find((item) => item.nombre === event.target.value);
    setDireccion(event.target.value);
    setCostoEnvio(selectedDireccion ? selectedDireccion.costo_envio : 0);
  };

  const handleDeliveryChange = (event) => {
    setIsDelivery(event.target.checked);
    setIsPickup(false);
    setDireccion("");
    setCostoEnvio(0);
  };

  const handlePickupChange = (event) => {
    setIsPickup(event.target.checked);
    setIsDelivery(false);
    setDireccion("");
    setCostoEnvio(0);
  };

  if (loading) return <Loading />;
  if (error) return <p className="mx-auto max-w-3xl p-6 text-center text-red-700">{error}</p>;

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-gray-50 px-4 py-6 font-comfortaa sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-paytone text-2xl font-bold text-gray-900">Carrito</h1>
          <p className="text-sm text-gray-500">
            Revisa tu pedido antes de enviarlo por WhatsApp.
          </p>
        </div>

        {completedOrder && (
          <section className="rounded-xl border border-green-200 bg-white p-5 shadow-sm">
            <div className="rounded-lg bg-green-50 px-4 py-3 text-green-800">
              <p className="font-paytone text-xl font-bold">Pedido recibido</p>
              <p className="mt-1 text-sm">
                Tu pedido #{completedOrder.order.id} ya quedó registrado. Para coordinarlo con el negocio, envía el resumen por WhatsApp.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <a
                className="rounded-lg bg-green-500 px-4 py-2.5 text-center text-sm font-bold text-white transition-colors hover:bg-green-600"
                href={completedOrder.whatsappUrl}
                target="_blank"
                rel="noreferrer"
              >
                Enviar por WhatsApp
              </a>
              <Link
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                to="/profile"
              >
                Ver pedidos realizados
              </Link>
              <Link
                className="rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                to="/"
              >
                Hacer otro pedido
              </Link>
            </div>
            <p className="mt-3 text-xs text-gray-500">
              Si WhatsApp no se abre, toca de nuevo el botón. También quedará disponible en tus pedidos realizados.
            </p>
          </section>
        )}

        {!completedOrder && !operationSettings.acceptOrders && cartItems.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            El negocio no está aceptando pedidos en este momento.
          </div>
        )}

        {!completedOrder && operationSettings.freeDelivery && cartItems.length > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Delivery gratis activo para pedidos a domicilio.
          </div>
        )}

        {!completedOrder && couponCoversShipping && isDelivery && cartItems.length > 0 && (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            Cupón <span className="font-bold">{appliedCoupon?.codigo}</span> aplicado: envío gratis.
          </div>
        )}

        {!completedOrder && cartItems.length > 0 && (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 px-4 py-3 font-paytone text-lg font-bold text-gray-900 sm:px-5">
              ¿Cómo quieres recibir tu pedido?
            </h2>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${isDelivery ? "border-yellow-300 bg-yellow-50" : "border-gray-200 hover:border-yellow-200"}`}>
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={isDelivery}
                    onChange={handleDeliveryChange}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  <span className="font-semibold text-gray-900">Delivery</span>
                </label>
                <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${isPickup ? "border-yellow-300 bg-yellow-50" : "border-gray-200 hover:border-yellow-200"}`}>
                  <input
                    type="radio"
                    name="deliveryType"
                    checked={isPickup}
                    onChange={handlePickupChange}
                    className="h-4 w-4 accent-yellow-400"
                  />
                  <span className="font-semibold text-gray-900">Retirar</span>
                </label>
              </div>

              {isDelivery && (
                <label className="flex flex-col gap-2 text-sm font-semibold text-gray-700">
                  Lugar de entrega
                  <select
                    className="h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm font-normal text-gray-700 outline-none transition-colors focus:border-yellow-400"
                    value={direccion}
                    onChange={handleDireccionChange}
                  >
                    <option value="">Selecciona una opción</option>
                    {direcciones.map((direccionItem) => (
                      <option
                        key={direccionItem.id}
                        value={direccionItem.nombre}
                      >
                        {direccionItem.nombre} - {operationSettings.freeDelivery || couponCoversShipping ? "Gratis" : `$${direccionItem.costo_envio}`}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>
          </section>
        )}

        {!completedOrder && (
          <section className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <h2 className="border-b border-gray-100 px-4 py-3 font-paytone text-lg font-bold text-gray-900 sm:px-5">
              Detalles del pedido
            </h2>
            <div className="flex flex-col gap-4 p-4 sm:p-5">
              {cartItems.length === 0 ? (
                <div className="flex flex-col items-center gap-4 py-10 text-center">
                  <p className="text-lg font-semibold text-gray-900">
                    Tu carrito está vacío
                  </p>
                  <Link
                    className="rounded-lg bg-yellow-300 px-5 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400"
                    to="/"
                  >
                    Ver menú
                  </Link>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-3">
                    {cartItems.map((item) => (
                      <div
                        key={`${item.id}-${JSON.stringify(item.ingredientes || [])}`}
                        className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-4"
                      >
                        <div className="flex min-w-0 gap-3 sm:gap-4">
                          <img
                            src={item.image_url}
                            alt={item.nombre}
                            className="h-24 w-24 shrink-0 rounded-lg object-cover sm:h-28 sm:w-28"
                          />
                          <div className="flex min-w-0 flex-col justify-center">
                            <h3 className="font-semibold text-gray-900">{item.nombre}</h3>
                            <p className="mt-1 text-sm text-gray-500">
                              {item.cantidad} x ${Number(item.precio).toFixed(2)}
                            </p>

                            {item.ingredientes && item.ingredientes.length > 0 && (
                              <ul className="mt-2 flex flex-wrap gap-1.5 text-xs text-gray-600">
                                {item.ingredientes.map((ingrediente) => (
                                  <li key={ingrediente.id} className="rounded-full bg-gray-100 px-2 py-1">
                                    {ingrediente.nombre}
                                  </li>
                                ))}
                              </ul>
                            )}
                            <button
                              type="button"
                              onClick={() => removeFromCart(item.id)}
                              className="mt-3 w-fit rounded-md border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                            >
                              Borrar
                            </button>
                          </div>
                        </div>
                        <div className="text-right font-bold text-gray-900 sm:min-w-24">
                          ${(item.precio * item.cantidad).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-col gap-4 border-t border-gray-100 pt-4 lg:flex-row lg:items-start lg:justify-between">
                    <button
                      type="button"
                      className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 lg:w-auto"
                      onClick={clearCart}
                    >
                      Vaciar carrito
                    </button>

                    <div className="w-full rounded-lg bg-gray-50 p-4 lg:max-w-sm">
                      <h3 className="text-lg font-bold text-gray-900">Pago</h3>
                      <div className="mt-3 flex w-full justify-between text-sm text-gray-600">
                        <span>Subtotal</span>
                        <span className="font-bold text-gray-900">${totalPrice.toFixed(2)}</span>
                      </div>
                      <div className="mt-2 flex w-full justify-between text-sm text-gray-600">
                        <span>Envío</span>
                        <span className="font-bold text-gray-900">
                          ${effectiveShippingCost.toFixed(2)}
                        </span>
                      </div>

                      <div className="mt-3">
                        <CuponInput subtotal={totalPrice} />
                      </div>

                      {couponDiscount > 0 && (
                        <div className="mt-2 flex w-full justify-between text-sm text-green-700">
                          <span>Descuento ({appliedCoupon?.codigo})</span>
                          <span className="font-bold">-${couponDiscount.toFixed(2)}</span>
                        </div>
                      )}

                      <div className="mt-3 flex w-full justify-between border-t border-gray-200 pt-3 text-base font-bold text-gray-900">
                        <span>Total a pagar</span>
                        <span className="text-xl">${totalToPay.toFixed(2)}</span>
                      </div>

                      {currentUser ? (
                        <div className="mt-4 flex flex-col gap-2">
                          <button
                            type="button"
                            className="w-full rounded-lg bg-yellow-300 px-4 py-2.5 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={finalizarPedido}
                            disabled={!operationSettings.acceptOrders}
                          >
                            Finalizar pedido
                          </button>
                          <Link
                            className="w-full rounded-lg border border-gray-200 px-4 py-2.5 text-center text-sm font-semibold text-gray-700 transition-colors hover:bg-white"
                            to="/"
                          >
                            Volver al menú
                          </Link>
                        </div>
                      ) : (
                        <Link
                          className="mt-4 block w-full rounded-lg bg-yellow-300 px-4 py-2.5 text-center text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400"
                          to="/Login"
                        >
                          Inicia sesión para finalizar tu pedido
                        </Link>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  );
};

export default Cart;

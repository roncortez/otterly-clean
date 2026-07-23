import React, { useContext, useEffect, useState } from "react";
import { CartContext } from "../../../app/context/CartContext";
import { Link } from "react-router-dom";
import { useAuth } from "../../../app/context/AuthContext";
import Loading from "../../../shared/ui/Loading";
import axios from "axios";
import WhatsAppButton from "shared/ui/WhatsAppButton";
import CuponInput from "../components/CuponInput";
import {
  FaBroom,
  FaTshirt,
  FaTools,
  FaTrash,
  FaPlus,
  FaCheck,
} from "react-icons/fa";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const CATEGORY_ICONS = {
  cleaning: FaBroom,
  laundry: FaTshirt,
  repair: FaTools,
};

const CATEGORY_LABELS = {
  cleaning: "Cleaning",
  laundry: "Laundry",
  repair: "Repair",
};

const Cart = () => {
  const { cartItems, removeFromCart, clearCart, appliedCoupon, getCouponDiscount } =
    useContext(CartContext);
  const { currentUser } = useAuth();
  const [user, setUser] = useState(null);
  const [loading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [completedOrder, setCompletedOrder] = useState(null);

  const totalPrice = cartItems.reduce(
    (total, item) => total + (item.base_price || item.precio || 0) * (item.cantidad || 1),
    0,
  );
  const couponDiscount = getCouponDiscount(totalPrice);
  const totalToPay = totalPrice - couponDiscount;

  useEffect(() => {
    if (!currentUser) return;
    axios
      .post(`${API_BASE}/api/auth/getUser`, { email: currentUser.email })
      .then((res) => setUser(res.data))
      .catch(() => {});
  }, [currentUser]);

  const finalizarPedido = async () => {
    if (cartItems.length === 0) {
      alert("Your cart is empty");
      return;
    }

    if (!currentUser) {
      alert("You must sign in to continue");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const results = [];

      for (const item of cartItems) {
        const serviceType = item.category || item.service_type || "cleaning";
        const payload = {
          customer_id: user?.id || null,
          service_type: serviceType,
          service_address: item.service_address || undefined,
          pickup_address: item.pickup_address || undefined,
          property_type_id: item.property_type_id ? Number(item.property_type_id) : undefined,
          number_of_bedrooms: item.number_of_bedrooms ? Number(item.number_of_bedrooms) : undefined,
          number_of_bathrooms: item.number_of_bathrooms ? Number(item.number_of_bathrooms) : undefined,
          has_pets: item.has_pets || false,
          pickup_date: item.pickup_date || undefined,
          pickup_time_start: item.pickup_time_start || undefined,
          pickup_time_end: item.pickup_time_end || undefined,
          delivery_date: item.delivery_date || undefined,
          repair_description: item.repair_description || undefined,
          access_instructions: item.access_instructions || undefined,
          special_instructions: item.special_instructions || undefined,
          base_price: item.base_price || item.precio || 0,
          total: (item.base_price || item.precio || 0) * (item.cantidad || 1),
          items: [
            {
              service_id: item.id || item.service_id,
              quantity: item.cantidad || 1,
              garment_type: item.garment_type || undefined,
              notes: item.notes || undefined,
            },
          ],
        };

        const res = await axios.post(`${API_BASE}/api/orders`, payload);
        if (res.status === 201) {
          results.push({ order: res.data.order, items: res.data.items || [] });
        }
      }

      if (results.length > 0) {
        setCompletedOrder({
          orderIds: results.map((r) => r.order.id),
          whatsappMessage: `Hi, I'd like to confirm my service request${results.length > 1 ? "s" : ""} ${results.map((r) => `#${r.order.id}`).join(", ")}. Total: $${totalToPay.toFixed(2)}`,
        });
        clearCart();
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || "Error submitting request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-gray-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-5xl flex-col gap-5">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-bold text-forest-800">Service Cart</h1>
          <p className="text-sm text-forest-500">
            Review your services before submitting the request.
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {completedOrder && (
          <section className="rounded-2xl border border-forest-200 bg-white p-5 shadow-sm">
            <div className="rounded-xl bg-sage-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-forest-600">
                  <FaCheck className="text-[10px] text-white" />
                </div>
                <p className="font-display text-xl font-bold text-forest-800">Request Submitted!</p>
              </div>
              <p className="mt-1.5 text-sm text-forest-600">
                Your requests{" "}
                {completedOrder.orderIds.map((id) => `#${id}`).join(", ")} have been registered.
                Confirm the details via WhatsApp.
              </p>
            </div>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <WhatsAppButton message={completedOrder.whatsappMessage} />
              <Link
                className="rounded-lg border border-sage-200 px-4 py-2.5 text-center text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50"
                to="/profile"
              >
                View My Requests
              </Link>
              <Link
                className="rounded-lg border border-sage-200 px-4 py-2.5 text-center text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50"
                to="/"
              >
                Back to Home
              </Link>
            </div>
          </section>
        )}

        {!completedOrder && cartItems.length === 0 && (
          <section className="rounded-2xl border border-sage-200 bg-white p-10 text-center shadow-sm">
            <p className="text-lg font-bold text-forest-800">Your cart is empty</p>
            <p className="mt-2 text-sm text-forest-500">
              Browse our services and add what you need.
            </p>
            <Link
              className="mt-6 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              to="/services"
            >
              View Services
            </Link>
          </section>
        )}

        {!completedOrder && cartItems.length > 0 && (
          <>
            <section className="overflow-hidden rounded-2xl border border-sage-200 bg-white shadow-sm">
              <h2 className="border-b border-sage-100 px-5 py-3.5 font-display text-lg font-bold text-forest-800">
                Selected Services
              </h2>
              <div className="flex flex-col gap-3 p-5">
                {cartItems.map((item, idx) => {
                  const Icon = CATEGORY_ICONS[item.category] || FaBroom;
                  const categoryLabel = CATEGORY_LABELS[item.category] || item.category;

                  return (
                    <div
                      key={`${item.id}-${idx}`}
                      className="flex flex-col gap-4 rounded-xl border border-gray-100 bg-gray-50 p-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sage-100 text-forest-600">
                          <Icon className="text-lg" />
                        </div>
                        <div className="flex min-w-0 flex-col justify-center">
                          <h3 className="text-sm font-bold text-forest-800">{item.name || item.nombre}</h3>
                          <p className="text-xs text-forest-400">{categoryLabel}</p>
                          {item.cantidad > 1 && (
                            <p className="text-xs text-forest-400">Qty: {item.cantidad}</p>
                          )}
                          {item.service_address && (
                            <p className="text-xs text-forest-400">{item.service_address}</p>
                          )}
                          {item.pickup_address && (
                            <p className="text-xs text-forest-400">{item.pickup_address}</p>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 sm:min-w-[140px] sm:justify-end">
                        <span className="text-sm font-bold text-forest-800">
                          ${(item.base_price || item.precio || 0).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeFromCart(item.id || idx)}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
                          aria-label="Remove"
                        >
                          <FaTrash className="text-sm" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="flex flex-col gap-4 border-t border-sage-100 pt-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-lg border border-sage-200 px-4 py-2.5 text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50"
                  onClick={clearCart}
                >
                  Clear Cart
                </button>
                <Link
                  to="/"
                  className="inline-flex items-center gap-2 rounded-lg border border-sage-200 px-4 py-2.5 text-center text-sm font-medium text-forest-600 transition-colors hover:bg-sage-50"
                >
                  <FaPlus /> Add More Services
                </Link>
              </div>

              <div className="w-full rounded-2xl bg-sage-50 p-5 lg:max-w-sm">
                <h3 className="text-base font-bold text-forest-800">Summary</h3>
                <div className="mt-3 flex w-full justify-between text-sm text-forest-600">
                  <span>Subtotal</span>
                  <span className="font-bold text-forest-800">${totalPrice.toFixed(2)}</span>
                </div>

                <div className="mt-3">
                  <CuponInput subtotal={totalPrice} />
                </div>

                {couponDiscount > 0 && (
                  <div className="mt-2 flex w-full justify-between text-sm text-forest-600">
                    <span>Discount ({appliedCoupon?.codigo})</span>
                    <span className="font-bold">-${couponDiscount.toFixed(2)}</span>
                  </div>
                )}

                <div className="mt-3 flex w-full justify-between border-t border-sage-200 pt-3 text-base font-bold text-forest-800">
                  <span>Estimated Total</span>
                  <span className="text-xl">${totalToPay.toFixed(2)}</span>
                </div>

                {currentUser ? (
                  <button
                    type="button"
                    className="mt-4 w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={finalizarPedido}
                    disabled={submitting}
                  >
                    {submitting ? "Submitting..." : "Submit Request"}
                  </button>
                ) : (
                  <Link
                    className="mt-4 block w-full rounded-lg bg-primary-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition-colors hover:bg-primary-700"
                    to="/login"
                  >
                    Sign In to Continue
                  </Link>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
};

export default Cart;

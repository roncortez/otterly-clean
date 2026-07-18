// src/context/CartContext.js
import React, { createContext, useState, useEffect } from "react";

export const CartContext = createContext();

export const CartProvider = ({ children }) => {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cartItems");
    return savedCart ? JSON.parse(savedCart) : [];
  });
  const [cartToast, setCartToast] = useState(null);
  const [appliedCoupon, setAppliedCoupon] = useState(() => {
    const saved = localStorage.getItem("appliedCoupon");
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    localStorage.setItem("cartItems", JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    if (appliedCoupon) {
      localStorage.setItem("appliedCoupon", JSON.stringify(appliedCoupon));
    } else {
      localStorage.removeItem("appliedCoupon");
    }
  }, [appliedCoupon]);

  useEffect(() => {
    if (!cartToast) return undefined;

    const timeoutId = setTimeout(() => {
      setCartToast(null);
    }, 2200);

    return () => clearTimeout(timeoutId);
  }, [cartToast]);

  const addToCart = (item) => {
    setCartItems((prevItems) => {
      const sameIngredients = (cartItem) =>
        JSON.stringify(cartItem.ingredientes) === JSON.stringify(item.ingredientes);
      const existingItem = prevItems.find(
        (cartItem) => cartItem.id === item.id && sameIngredients(cartItem),
      );

      if (existingItem) {
        return prevItems.map((cartItem) =>
          cartItem.id === existingItem.id && sameIngredients(cartItem)
            ? { ...cartItem, cantidad: cartItem.cantidad + 1 }
            : cartItem,
        );
      }

      return [...prevItems, { ...item, cantidad: 1 }];
    });

    setCartToast({
      title: "Agregado al carrito",
      message: item?.nombre ? `${item.nombre} se agregó correctamente.` : "Producto agregado correctamente.",
    });
  };

  const removeFromCart = (itemId) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    setCartItems([]);
    setAppliedCoupon(null);
    localStorage.removeItem("cartItems");
    localStorage.removeItem("appliedCoupon");
  };

  const applyCoupon = (coupon) => {
    setAppliedCoupon(coupon);
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
  };

  const getCouponDiscount = (subtotal) => {
    if (!appliedCoupon) return 0;
    if (appliedCoupon.tipo === "porcentaje" || appliedCoupon.tipo === "combo") {
      return Math.round((subtotal * Number(appliedCoupon.valor)) / 100 * 100) / 100;
    }
    if (appliedCoupon.tipo === "monto_fijo") {
      return Math.min(Number(appliedCoupon.valor), subtotal);
    }
    return 0;
  };

  return (
    <CartContext.Provider
      value={{
        cartItems,
        setCartItems,
        addToCart,
        removeFromCart,
        clearCart,
        appliedCoupon,
        applyCoupon,
        removeCoupon,
        getCouponDiscount,
      }}
    >
      {children}
      {cartToast && (
        <div
          aria-live="polite"
          className="fixed right-4 top-24 z-50 w-[calc(100%-2rem)] max-w-sm rounded-lg border border-green-200 bg-white px-4 py-3 font-comfortaa text-sm text-gray-800 shadow-lg sm:right-6"
        >
          <p className="font-bold text-green-700">{cartToast.title}</p>
          <p className="mt-1 text-gray-600">{cartToast.message}</p>
        </div>
      )}
    </CartContext.Provider>
  );
};

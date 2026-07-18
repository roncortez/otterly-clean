import { useContext, useState } from "react";
import { CartContext } from "app/context/CartContext";
import axios from "axios";
import "./CuponInput.css";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

export default function CuponInput({ subtotal }) {
  const { appliedCoupon, applyCoupon, removeCoupon } = useContext(CartContext);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await axios.post(`${API_BASE}/api/cupones/validar`, {
        codigo: trimmed,
        montoPedido: subtotal,
      });

      const result = response.data;

      if (result.valido) {
        applyCoupon({
          ...result.cupon,
          descuento_calculado: result.descuento,
        });
        setCode("");
      } else {
        setError(result.mensaje || "Cupón no válido");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Error al validar el cupón");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    removeCoupon();
    setCode("");
    setError("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleApply();
    }
  };

  if (appliedCoupon) {
    const discountLabel =
      appliedCoupon.tipo === "porcentaje" || appliedCoupon.tipo === "combo"
        ? `${appliedCoupon.valor}% off`
        : appliedCoupon.tipo === "monto_fijo"
        ? `$${Number(appliedCoupon.valor).toFixed(2)} off`
        : appliedCoupon.tipo === "envio_gratis"
        ? "Envío gratis"
        : appliedCoupon.tipo === "bebida_gratis"
        ? "Bebida gratis"
        : appliedCoupon.tipo === "2x1"
        ? "2x1"
        : "Descuento";

    return (
      <div className="cupon-applied">
        <div className="cupon-applied-info">
          <span className="cupon-applied-badge">Cupón</span>
          <span className="cupon-applied-code">{appliedCoupon.codigo}</span>
          <span className="cupon-applied-type">{discountLabel}</span>
        </div>
        <button
          type="button"
          className="cupon-applied-remove"
          onClick={handleRemove}
        >
          Quitar
        </button>
      </div>
    );
  }

  return (
    <div className="cupon-input-wrapper">
      <label className="cupon-input-label">Tienes un cupón de descuento</label>
      <div className="cupon-input-row">
        <input
          type="text"
          className="cupon-input-field"
          placeholder="Escribe tu código"
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            setError("");
          }}
          onKeyDown={handleKeyDown}
          disabled={loading}
        />
        <button
          type="button"
          className="cupon-input-btn"
          onClick={handleApply}
          disabled={loading || !code.trim()}
        >
          {loading ? "..." : "Aplicar"}
        </button>
      </div>
      {error && <p className="cupon-input-error">{error}</p>}
    </div>
  );
}

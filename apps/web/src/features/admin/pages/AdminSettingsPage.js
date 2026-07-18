import { useEffect, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const DEFAULT_BANNER = {
  enabled: false,
  title: "Promoción del día",
  description: "Disfruta nuestros platos favoritos preparados al momento.",
  imageUrl: "",
};

const DEFAULT_OPERATION = {
  acceptOrders: true,
  freeDelivery: false,
  notifyTelegram: true,
  highlightDelivery: true,
};

function Toggle({ checked, onChange, label, description }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div>
        <p className="font-medium text-gray-900">{label}</p>
        <p className="mt-1 text-sm text-gray-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-offset-2 ${
          checked ? "bg-yellow-400" : "bg-gray-200"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function AdminSettingsPage() {
  const [banner, setBanner] = useState(DEFAULT_BANNER);
  const [operation, setOperation] = useState(DEFAULT_OPERATION);
  const [bannerImage, setBannerImage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const fetchSettings = async () => {
      setLoading(true);
      try {
        const [bannerResponse, operationResponse] = await Promise.all([
          axios.get(`${API_BASE}/api/settings/banner`),
          axios.get(`${API_BASE}/api/settings/operation`),
        ]);
        if (cancelled) return;
        setBanner({ ...DEFAULT_BANNER, ...bannerResponse.data });
        setOperation({ ...DEFAULT_OPERATION, ...operationResponse.data });
        setError(null);
      } catch {
        if (!cancelled) setError("No se pudo cargar la configuración.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchSettings();
    return () => { cancelled = true; };
  }, []);

  const updateBanner = (key, value) => {
    setBanner((currentBanner) => ({ ...currentBanner, [key]: value }));
    setSaved(false);
  };

  const updateOperation = (key) => {
    setOperation((currentOperation) => ({
      ...currentOperation,
      [key]: !currentOperation[key],
    }));
    setSaved(false);
  };

  const saveSettings = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);

    try {
      const formData = new FormData();
      formData.append("enabled", String(banner.enabled));
      formData.append("title", banner.title);
      formData.append("description", banner.description);
      formData.append("imageUrl", banner.imageUrl || "");

      if (bannerImage instanceof File) {
        formData.append("image", bannerImage);
      }

      const [bannerResponse, operationResponse] = await Promise.all([
        axios.put(`${API_BASE}/api/settings/banner`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        }),
        axios.put(`${API_BASE}/api/settings/operation`, operation),
      ]);

      setBanner({ ...DEFAULT_BANNER, ...bannerResponse.data });
      setOperation({ ...DEFAULT_OPERATION, ...operationResponse.data });
      setBannerImage(null);
      setSaved(true);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo guardar la configuración.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <Loading />;

  return (
    <section className="flex max-w-5xl flex-col gap-5 pb-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="mt-1 text-sm text-gray-500">
          Administra preferencias operativas y el banner de publicidad que aparece al abrir el inicio.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3">
          <Toggle
            checked={operation.acceptOrders}
            onChange={() => updateOperation("acceptOrders")}
            label="Aceptar pedidos"
            description="Marca si el negocio se encuentra operativo para recibir nuevas órdenes."
          />
          <Toggle
            checked={operation.freeDelivery}
            onChange={() => updateOperation("freeDelivery")}
            label="Delivery gratis"
            description="Preferencia para destacar entregas sin costo cuando el negocio lo decida."
          />
          <Toggle
            checked={operation.notifyTelegram}
            onChange={() => updateOperation("notifyTelegram")}
            label="Notificaciones operativas"
            description="Mantiene visible la preferencia de recibir avisos cuando entra un pedido."
          />
          <Toggle
            checked={operation.highlightDelivery}
            onChange={() => updateOperation("highlightDelivery")}
            label="Resaltar delivery"
            description="Ayuda a priorizar pedidos con entrega a domicilio durante la revisión."
          />
          <Toggle
            checked={banner.enabled}
            onChange={() => updateBanner("enabled", !banner.enabled)}
            label="Banner de publicidad"
            description="Activa o desactiva el banner publicitario que aparece al entrar al inicio."
          />
        </div>

        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="font-semibold text-gray-900">Banner de publicidad</h2>
          <div className="mt-4 flex flex-col gap-3">
            <label className="text-sm font-medium text-gray-700">
              Imagen del banner
              <input
                type="file"
                accept="image/*"
                className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
                onChange={(event) => setBannerImage(event.target.files?.[0] || null)}
              />
            </label>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <button
            type="button"
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={saving}
            onClick={saveSettings}
          >
            {saving ? "Guardando..." : "Guardar configuración"}
          </button>
          {saved && <span className="text-sm font-medium text-green-700">Configuración guardada</span>}
        </div>
      </div>
    </section>
  );
}

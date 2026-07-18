import { useEffect, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const COUPON_TYPES = [
  { value: "porcentaje", label: "Porcentaje" },
  { value: "monto_fijo", label: "Monto fijo" },
  { value: "envio_gratis", label: "Envío gratis" },
  { value: "bebida_gratis", label: "Bebida gratis" },
  { value: "2x1", label: "2x1" },
  { value: "combo", label: "Combo" },
];

const EMPTY_FORM = {
  codigo: "",
  descripcion: "",
  tipo: "porcentaje",
  valor: "",
  uso_maximo: "1",
  uso_por_cliente: "1",
  monto_minimo: "",
  fecha_expiracion: "",
};

function formatDate(dateStr) {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-EC", { day: "2-digit", month: "short", year: "numeric" });
}

function getCouponTypeLabel(tipo) {
  const found = COUPON_TYPES.find((ct) => ct.value === tipo);
  return found ? found.label : tipo;
}

function CreateCouponModal({ isOpen, form, saving, error, onClose, onChange, onSubmit }) {
  if (!isOpen) return null;

  const needsValue = ["porcentaje", "monto_fijo", "combo"].includes(form.tipo);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Crear cupón</h2>
            <p className="mt-1 text-sm text-gray-500">Define los datos del nuevo cupón de descuento.</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Código
            <input
              type="text"
              name="codigo"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm uppercase tracking-wider outline-none focus:border-yellow-400"
              value={form.codigo}
              onChange={onChange}
              placeholder="EJ: NAVIDAD15"
              required
            />
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Descripción
            <input
              type="text"
              name="descripcion"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.descripcion}
              onChange={onChange}
              placeholder="Ej: Descuento de Navidad"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Tipo
            <select
              name="tipo"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.tipo}
              onChange={onChange}
            >
              {COUPON_TYPES.map((ct) => (
                <option key={ct.value} value={ct.value}>
                  {ct.label}
                </option>
              ))}
            </select>
          </label>

          {needsValue && (
            <label className="text-sm font-medium text-gray-700">
              Valor {form.tipo === "porcentaje" || form.tipo === "combo" ? "(%)" : "($)"}
              <input
                type="number"
                name="valor"
                step="0.01"
                min="0"
                className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
                value={form.valor}
                onChange={onChange}
                placeholder={form.tipo === "porcentaje" ? "15" : "5.00"}
                required
              />
            </label>
          )}

          <label className="text-sm font-medium text-gray-700">
            Usos máximos (total)
            <input
              type="number"
              name="uso_maximo"
              min="1"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.uso_maximo}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Usos por cliente
            <input
              type="number"
              name="uso_por_cliente"
              min="1"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.uso_por_cliente}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Monto mínimo ($)
            <input
              type="number"
              name="monto_minimo"
              step="0.01"
              min="0"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.monto_minimo}
              onChange={onChange}
              placeholder="0.00"
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Fecha de expiración
            <input
              type="datetime-local"
              name="fecha_expiracion"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.fecha_expiracion}
              onChange={onChange}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Creando..." : "Crear cupón"}
          </button>
        </div>
      </form>
    </div>
  );
}

function AssignCouponModal({ isOpen, cupones, saving, error, onClose, onAssign, onAssignAll }) {
  const [search, setSearch] = useState("");
  const [usuarios, setUsuarios] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selectedCoupon, setSelectedCoupon] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!search.trim()) return;
    setSearching(true);
    try {
      const res = await axios.get(`${API_BASE}/api/cupones/buscar-usuarios`, {
        params: { search: search.trim() },
      });
      setUsuarios(res.data);
    } catch {
      setUsuarios([]);
    } finally {
      setSearching(false);
    }
  };

  const handleAssign = async () => {
    if (!selectedCoupon || !selectedUser) return;
    await onAssign(Number(selectedCoupon), selectedUser.id);
    setSelectedUser(null);
    setSearch("");
    setUsuarios([]);
  };

  const handleAssignAll = async () => {
    if (!selectedCoupon) return;
    await onAssignAll(Number(selectedCoupon));
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 px-4 py-6">
      <div className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Asignar cupón</h2>
            <p className="mt-1 text-sm text-gray-500">Busca un usuario o asigna a todos los clientes.</p>
          </div>
          <button
            type="button"
            className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-semibold text-gray-600 hover:bg-gray-50"
            onClick={onClose}
          >
            Cerrar
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-4 flex flex-col gap-4">
          <label className="text-sm font-medium text-gray-700">
            Selecciona el cupón
            <select
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={selectedCoupon}
              onChange={(e) => setSelectedCoupon(e.target.value)}
            >
              <option value="">Seleccionar cupón</option>
              {cupones.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} - {getCouponTypeLabel(c.tipo)}
                </option>
              ))}
            </select>
          </label>

          <div>
            <p className="mb-2 text-sm font-semibold text-gray-700">Buscar usuario</p>
            <div className="flex gap-2">
              <input
                type="text"
                className="h-10 flex-1 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
                placeholder="Nombre o email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              />
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                onClick={handleSearch}
                disabled={searching}
              >
                {searching ? "..." : "Buscar"}
              </button>
            </div>

            {usuarios.length > 0 && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded-md border border-gray-200">
                {usuarios.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`flex w-full items-center justify-between border-b border-gray-100 px-3 py-2 text-left text-sm last:border-0 hover:bg-gray-50 ${
                      selectedUser?.id === u.id ? "bg-yellow-50" : ""
                    }`}
                    onClick={() => setSelectedUser(u)}
                  >
                    <span>
                      {u.first_name} {u.last_name}
                    </span>
                    <span className="text-xs text-gray-500">{u.email}</span>
                  </button>
                ))}
              </div>
            )}

            {selectedUser && (
              <p className="mt-2 text-sm text-green-700">
                Seleccionado: {selectedUser.first_name} {selectedUser.last_name}
              </p>
            )}
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row sm:justify-end">
          <button
            type="button"
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            onClick={onClose}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || !selectedCoupon}
            className="rounded-lg border border-yellow-300 px-4 py-2 text-sm font-semibold text-yellow-800 transition-colors hover:bg-yellow-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAssignAll}
          >
            {saving ? "..." : "Asignar a todos"}
          </button>
          <button
            type="button"
            disabled={saving || !selectedCoupon || !selectedUser}
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleAssign}
          >
            {saving ? "..." : "Asignar a usuario"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminCuponesPage() {
  const [cupones, setCupones] = useState([]);
  const [allCupones, setAllCupones] = useState([]);
  const [search, setSearch] = useState("");
  const [tipoFilter, setTipoFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const [showAssign, setShowAssign] = useState(false);
  const [assignError, setAssignError] = useState(null);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setPage(1);
    }, 350);
    return () => clearTimeout(timeout);
  }, [search, tipoFilter]);

  useEffect(() => {
    let cancelled = false;

    const fetchCupones = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/api/cupones`, {
          params: { page, limit: 20, search, tipo: tipoFilter },
        });
        if (cancelled) return;
        setCupones(response.data.data || []);
        setPagination(response.data.pagination || { page, limit: 20, total: 0, totalPages: 0 });
        setError(null);
      } catch {
        if (!cancelled) {
          setError("No se pudieron cargar los cupones.");
          setCupones([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchCupones();
    return () => { cancelled = true; };
  }, [page, search, tipoFilter]);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const res = await axios.get(`${API_BASE}/api/cupones`, { params: { limit: 100 } });
        setAllCupones(res.data.data || []);
      } catch {
        // silently fail
      }
    };
    fetchAll();
  }, [showAssign, saving]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setShowCreate(true);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!form.codigo.trim() || !form.tipo) {
      setFormError("Código y tipo son obligatorios.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      await axios.post(`${API_BASE}/api/cupones`, {
        codigo: form.codigo.trim(),
        descripcion: form.descripcion.trim() || null,
        tipo: form.tipo,
        valor: form.valor ? Number(form.valor) : null,
        uso_maximo: Number(form.uso_maximo) || 1,
        uso_por_cliente: Number(form.uso_por_cliente) || 1,
        monto_minimo: form.monto_minimo ? Number(form.monto_minimo) : 0,
        fecha_expiracion: form.fecha_expiracion || null,
      });
      setShowCreate(false);
      setPage(1);
    } catch (err) {
      setFormError(err.response?.data?.message || "No se pudo crear el cupón.");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (cupon) => {
    try {
      await axios.put(`${API_BASE}/api/cupones/${cupon.id}`, { activo: !cupon.activo });
      setCupones((prev) =>
        prev.map((c) => (c.id === cupon.id ? { ...c, activo: !c.activo } : c)),
      );
    } catch (err) {
      alert(err.response?.data?.message || "Error al actualizar cupón");
    }
  };

  const handleDelete = async (cupon) => {
    if (!window.confirm(`¿Eliminar el cupón "${cupon.codigo}"?`)) return;
    try {
      await axios.delete(`${API_BASE}/api/cupones/${cupon.id}`);
      setCupones((prev) => prev.filter((c) => c.id !== cupon.id));
    } catch (err) {
      alert(err.response?.data?.message || "Error al eliminar cupón");
    }
  };

  const handleAssign = async (cuponId, usuarioId) => {
    setAssignError(null);
    try {
      await axios.post(`${API_BASE}/api/cupones/asignar`, { cupon_id: cuponId, usuario_id: usuarioId });
    } catch (err) {
      setAssignError(err.response?.data?.message || "Error al asignar cupón");
    }
  };

  const handleAssignAll = async (cuponId) => {
    setAssignError(null);
    try {
      await axios.post(`${API_BASE}/api/cupones/asignar-todos`, { cupon_id: cuponId });
    } catch (err) {
      setAssignError(err.response?.data?.message || "Error al asignar cupón");
    }
  };

  const canGoPrevious = page > 1;
  const canGoNext = pagination.totalPages > 0 && page < pagination.totalPages;

  return (
    <section className="flex flex-col gap-5 pb-6">
      <CreateCouponModal
        isOpen={showCreate}
        form={form}
        saving={saving}
        error={formError}
        onClose={() => setShowCreate(false)}
        onChange={handleFormChange}
        onSubmit={handleCreate}
      />

      <AssignCouponModal
        isOpen={showAssign}
        cupones={allCupones}
        saving={saving}
        error={assignError}
        onClose={() => setShowAssign(false)}
        onAssign={handleAssign}
        onAssignAll={handleAssignAll}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cupones</h1>
          <p className="mt-1 text-sm text-gray-500">
            Crea, administra y asigna cupones de descuento a tus clientes.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-lg border border-yellow-300 px-4 py-2 text-sm font-semibold text-yellow-800 transition-colors hover:bg-yellow-50"
            onClick={() => setShowAssign(true)}
          >
            Asignar cupón
          </button>
          <button
            type="button"
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400"
            onClick={openCreate}
          >
            + Crear cupón
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
        <input
          type="search"
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400 md:w-80"
          placeholder="Buscar por código o descripción"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 outline-none focus:border-yellow-400"
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
        >
          <option value="all">Todos los tipos</option>
          {COUPON_TYPES.map((ct) => (
            <option key={ct.value} value={ct.value}>
              {ct.label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <Loading />
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-4 py-3 font-semibold">Código</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Tipo</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Valor</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Usos</th>
                  <th className="hidden px-4 py-3 font-semibold lg:table-cell">Expira</th>
                  <th className="px-4 py-3 font-semibold">Estado</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {cupones.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                      No hay cupones para mostrar.
                    </td>
                  </tr>
                ) : (
                  cupones.map((cupon) => (
                    <tr key={cupon.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-bold tracking-wide text-gray-900">{cupon.codigo}</p>
                        {cupon.descripcion && (
                          <p className="text-xs text-gray-500">{cupon.descripcion}</p>
                        )}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                        {getCouponTypeLabel(cupon.tipo)}
                      </td>
                      <td className="hidden px-4 py-3 font-semibold text-gray-900 md:table-cell">
                        {cupon.tipo === "porcentaje" || cupon.tipo === "combo"
                          ? `${cupon.valor}%`
                          : cupon.tipo === "monto_fijo"
                          ? `$${Number(cupon.valor).toFixed(2)}`
                          : cupon.tipo === "envio_gratis"
                          ? "Gratis"
                          : cupon.tipo === "bebida_gratis"
                          ? "Gratis"
                          : cupon.tipo === "2x1"
                          ? "2x1"
                          : "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                        {cupon.usos_realizados}/{cupon.uso_maximo}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 lg:table-cell">
                        {formatDate(cupon.fecha_expiracion)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                            cupon.activo
                              ? "bg-green-100 text-green-800"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {cupon.activo ? "Activo" : "Inactivo"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button
                            type="button"
                            className="rounded-md border border-gray-200 px-2.5 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                            onClick={() => handleToggleActive(cupon)}
                          >
                            {cupon.activo ? "Desactivar" : "Activar"}
                          </button>
                          <button
                            type="button"
                            className="rounded-md border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                            onClick={() => handleDelete(cupon)}
                          >
                            Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Página {pagination.totalPages === 0 ? 0 : pagination.page} de {pagination.totalPages} - {pagination.total} cupones
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canGoPrevious}
                onClick={() => setPage((p) => Math.max(p - 1, 1))}
              >
                Anterior
              </button>
              <button
                type="button"
                className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                disabled={!canGoNext}
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

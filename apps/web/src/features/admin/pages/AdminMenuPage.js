import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");

const EMPTY_FORM = {
  nombre: "",
  descripcion: "",
  precio: "",
  tipo_id: "",
  tipo_combinacion: "",
  tipo_ingrediente: "",
  image_url: null,
};

function buildFormData(form) {
  const formData = new FormData();
  formData.append("nombre", form.nombre.trim());
  formData.append("descripcion", form.descripcion.trim());
  formData.append("precio", form.precio);
  formData.append("tipo_id", form.tipo_id);
  formData.append("tipo_combinacion", form.tipo_combinacion || "");
  formData.append("tipo_ingrediente", form.tipo_ingrediente || "");

  if (form.image_url instanceof File) {
    formData.append("image_url", form.image_url);
  }

  return formData;
}

function formatPrice(value) {
  const amount = Number(value || 0);
  return `$${amount.toFixed(2)}`;
}

function SuccessModal({ modal, onClose }) {
  if (!modal) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-green-100 text-green-700">
          <span className="text-sm font-bold">OK</span>
        </div>
        <div className="mt-4 text-center">
          <h2 className="text-lg font-bold text-gray-900">{modal.title}</h2>
          <p className="mt-2 text-sm text-gray-500">{modal.message}</p>
        </div>
        <button
          type="button"
          className="mt-5 w-full rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400"
          onClick={onClose}
        >
          Entendido
        </button>
      </div>
    </div>
  );
}
function ConfirmDeleteModal({ plato, deleting, onCancel, onConfirm }) {
  if (!plato) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 px-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-red-100 text-red-700">
          <span className="text-sm font-bold">!</span>
        </div>
        <div className="mt-4 text-center">
          <h2 className="text-lg font-bold text-gray-900">Eliminar plato</h2>
          <p className="mt-2 text-sm text-gray-500">
            Vas a eliminar {plato.nombre}. Esta acción no se puede deshacer.
          </p>
        </div>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="flex-1 rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            onClick={onCancel}
            disabled={deleting}
          >
            Cancelar
          </button>
          <button
            type="button"
            className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={onConfirm}
            disabled={deleting}
          >
            {deleting ? "Eliminando..." : "Eliminar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function PlateFormModal({ isOpen, form, tipos, editingPlato, saving, error, onClose, onSubmit, onChange }) {
  if (!isOpen) return null;

  const currentImageUrl = editingPlato?.image_url || "";

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 px-4 py-6">
      <form onSubmit={onSubmit} className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {editingPlato ? "Editar plato" : "Nuevo plato"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              {editingPlato ? "Actualiza información, precio o imagen." : "Agrega un plato disponible en el menú."}
            </p>
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
          <label className="text-sm font-medium text-gray-700">
            Nombre
            <input
              type="text"
              name="nombre"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.nombre}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Precio
            <input
              type="number"
              min="0"
              step="0.01"
              name="precio"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.precio}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Descripción
            <textarea
              name="descripcion"
              rows="3"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm outline-none focus:border-yellow-400"
              value={form.descripcion}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Categoría
            <select
              name="tipo_id"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.tipo_id}
              onChange={onChange}
            >
              <option value="">Seleccione</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700">
            Combinación
            <input
              type="number"
              name="tipo_combinacion"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.tipo_combinacion}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Ingrediente
            <input
              type="number"
              name="tipo_ingrediente"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.tipo_ingrediente}
              onChange={onChange}
            />
          </label>

          <details className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600 md:col-span-2">
            <summary className="cursor-pointer font-semibold text-gray-700">
              Ver claves de combinación e ingrediente
            </summary>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="font-semibold text-gray-800">Combinación</p>
                <ul className="mt-1 space-y-1">
                  <li>1: Proteína y ensalada, máximo 2 opciones.</li>
                  <li>2: Salsas, selección simple.</li>
                  <li>3: Sabores, selección simple.</li>
                  <li>4: Sin personalización.</li>
                  <li>5: Sabores de cócteles, selección simple.</li>
                </ul>
              </div>
              <div>
                <p className="font-semibold text-gray-800">Ingrediente</p>
                <ul className="mt-1 space-y-1">
                  <li>1: Proteínas y ensaladas.</li>
                  <li>2: Salsas.</li>
                  <li>3: Sabores.</li>
                  <li>5: Sabores de cócteles.</li>
                </ul>
              </div>
            </div>
          </details>

          <label className="text-sm font-medium text-gray-700">
            Imagen {editingPlato ? "(opcional)" : ""}
            <input
              type="file"
              name="image_url"
              accept="image/*"
              className="mt-1 w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700 outline-none file:mr-3 file:rounded-md file:border-0 file:bg-gray-100 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-gray-700 hover:file:bg-gray-200"
              onChange={onChange}
            />
          </label>
        </div>

        {editingPlato && currentImageUrl && (
          <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="text-sm font-medium text-gray-700">Imagen actual</p>
            <img
              src={currentImageUrl}
              alt={editingPlato.nombre}
              className="mt-2 h-40 w-full rounded-md object-cover"
            />
          </div>
        )}

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
            {saving ? "Guardando..." : editingPlato ? "Guardar cambios" : "Crear plato"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminMenuPage() {
  const [platos, setPlatos] = useState([]);
  const [tipos, setTipos] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedType, setSelectedType] = useState("all");
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingPlato, setEditingPlato] = useState(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [formError, setFormError] = useState(null);
  const [successModal, setSuccessModal] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [menuResponse, tiposResponse] = await Promise.all([
        axios.get(`${API_BASE}/api/menu`),
        axios.get(`${API_BASE}/api/tipos-plato`),
      ]);
      setPlatos(Array.isArray(menuResponse.data) ? menuResponse.data : []);
      setTipos(Array.isArray(tiposResponse.data) ? tiposResponse.data : []);
      setError(null);
    } catch {
      setError("No se pudo cargar el menú.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredPlatos = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();

    return platos.filter((plato) => {
      const matchesSearch =
        !query ||
        (plato.nombre || "").toLowerCase().includes(query) ||
        (plato.descripcion || "").toLowerCase().includes(query);
      const matchesType = selectedType === "all" || String(plato.tipo_id) === selectedType;
      return matchesSearch && matchesType;
    });
  }, [platos, searchTerm, selectedType]);

  const typeById = useMemo(() => {
    return tipos.reduce((acc, tipo) => {
      acc[String(tipo.id)] = tipo.nombre;
      return acc;
    }, {});
  }, [tipos]);

  const platosPorCategoria = useMemo(() => {
    const categoryMap = new Map();

    filteredPlatos.forEach((plato) => {
      const categoryId = String(plato.tipo_id || "uncategorized");
      const categoryName = typeById[categoryId] || "Sin categoría";

      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, { id: categoryId, name: categoryName, items: [] });
      }

      categoryMap.get(categoryId).items.push(plato);
    });

    return Array.from(categoryMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [filteredPlatos, typeById]);

  useEffect(() => {
    if (platosPorCategoria.length === 0) return;

    const shouldExpandAll = selectedType !== "all" || searchTerm.trim().length > 0;
    setExpandedCategories((currentExpanded) => {
      const nextExpanded = {};

      platosPorCategoria.forEach((category, index) => {
        nextExpanded[category.id] = shouldExpandAll
          ? true
          : currentExpanded[category.id] ?? index === 0;
      });

      return nextExpanded;
    });
  }, [platosPorCategoria, selectedType, searchTerm]);

  const closeFormModal = () => {
    setForm(EMPTY_FORM);
    setEditingPlato(null);
    setFormError(null);
    setIsFormModalOpen(false);
  };

  const openCreateModal = () => {
    setForm(EMPTY_FORM);
    setEditingPlato(null);
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const startEditing = (plato) => {
    setEditingPlato(plato);
    setForm({
      nombre: plato.nombre || "",
      descripcion: plato.descripcion || "",
      precio: plato.precio || "",
      tipo_id: plato.tipo_id || "",
      tipo_combinacion: plato.tipo_combinacion || "",
      tipo_ingrediente: plato.tipo_ingrediente || "",
      image_url: null,
    });
    setFormError(null);
    setIsFormModalOpen(true);
  };

  const handleInputChange = (event) => {
    const { name, value, files } = event.target;
    setForm((currentForm) => ({
      ...currentForm,
      [name]: files ? files[0] : value,
    }));
  };

  const validateForm = () => {
    if (!form.nombre.trim() || !form.descripcion.trim() || !form.precio || !form.tipo_id) {
      setFormError("Completa nombre, descripción, precio y tipo de plato.");
      return false;
    }

    if (!editingPlato && !(form.image_url instanceof File)) {
      setFormError("Selecciona una imagen para el nuevo plato.");
      return false;
    }

    if (Number(form.precio) <= 0) {
      setFormError("El precio debe ser mayor a cero.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError(null);

    if (!validateForm()) return;

    setSaving(true);
    try {
      const formData = buildFormData(form);

      if (editingPlato) {
        const response = await axios.put(
          `${API_BASE}/api/menu/plato/${editingPlato.id}`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } },
        );
        const updatedPlato = response.data?.plato;
        setPlatos((currentPlatos) =>
          currentPlatos.map((plato) => (plato.id === editingPlato.id ? updatedPlato : plato)),
        );
        setSuccessModal({
          title: "Plato actualizado",
          message: `${updatedPlato?.nombre || form.nombre} se actualizó correctamente.`,
        });
      } else {
        const response = await axios.post(`${API_BASE}/api/menu/plato`, formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        const newPlato = response.data?.plato;
        setPlatos((currentPlatos) => [newPlato, ...currentPlatos]);
        setSuccessModal({
          title: "Plato creado",
          message: `${newPlato?.nombre || form.nombre} se agregó al menú correctamente.`,
        });
      }

      closeFormModal();
    } catch (err) {
      setFormError(err.response?.data?.message || "No se pudo guardar el plato.");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = (plato) => {
    setDeleteTarget(plato);
    setError(null);
  };

  const closeDeleteModal = () => {
    if (deleting) return;
    setDeleteTarget(null);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await axios.delete(`${API_BASE}/api/menu/plato/${deleteTarget.id}`);
      setPlatos((currentPlatos) => currentPlatos.filter((item) => item.id !== deleteTarget.id));
      setSuccessModal({
        title: "Plato eliminado",
        message: `${deleteTarget.nombre} se eliminó correctamente.`,
      });
      setDeleteTarget(null);
      setError(null);
    } catch (err) {
      setError(err.response?.data?.message || "No se pudo eliminar el plato.");
    } finally {
      setDeleting(false);
    }
  };

  const toggleCategory = (categoryId) => {
    setExpandedCategories((currentExpanded) => ({
      ...currentExpanded,
      [categoryId]: !currentExpanded[categoryId],
    }));
  };

  const expandAllCategories = () => {
    setExpandedCategories(
      platosPorCategoria.reduce((acc, category) => {
        acc[category.id] = true;
        return acc;
      }, {}),
    );
  };

  const collapseAllCategories = () => {
    setExpandedCategories(
      platosPorCategoria.reduce((acc, category) => {
        acc[category.id] = false;
        return acc;
      }, {}),
    );
  };

  return (
    <section className="flex flex-col gap-5 pb-6">
      <SuccessModal modal={successModal} onClose={() => setSuccessModal(null)} />
      <ConfirmDeleteModal
        plato={deleteTarget}
        deleting={deleting}
        onCancel={closeDeleteModal}
        onConfirm={confirmDelete}
      />
      <PlateFormModal
        isOpen={isFormModalOpen}
        form={form}
        tipos={tipos}
        editingPlato={editingPlato}
        saving={saving}
        error={formError}
        onClose={closeFormModal}
        onSubmit={handleSubmit}
        onChange={handleInputChange}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Menú</h1>
          <p className="mt-1 text-sm text-gray-500">
            Administra servicios, precios, categorías e imágenes del negocio.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="grid grid-cols-2 gap-2 sm:min-w-[260px]">
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center">
              <p className="text-xs font-medium text-gray-500">Platos</p>
              <p className="text-lg font-bold text-gray-900">{platos.length}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-center">
              <p className="text-xs font-medium text-gray-500">Categorías</p>
              <p className="text-lg font-bold text-gray-900">{tipos.length}</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-lg bg-yellow-300 px-4 py-2 text-sm font-semibold text-gray-900 transition-colors hover:bg-yellow-400"
            onClick={openCreateModal}
          >
            Nuevo plato
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
          <input
            type="search"
            className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400 md:w-80"
            placeholder="Buscar plato o descripción"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <select
              className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 outline-none focus:border-yellow-400"
              value={selectedType}
              onChange={(event) => setSelectedType(event.target.value)}
            >
              <option value="all">Todas las categorías</option>
              {tipos.map((tipo) => (
                <option key={tipo.id} value={tipo.id}>{tipo.nombre}</option>
              ))}
            </select>
            <div className="flex gap-1.5">
              <button
                type="button"
                className="h-10 rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                onClick={expandAllCategories}
              >
                Expandir
              </button>
              <button
                type="button"
                className="h-10 rounded-md border border-gray-200 px-3 text-xs font-semibold text-gray-600 transition-colors hover:bg-gray-50"
                onClick={collapseAllCategories}
              >
                Contraer
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <Loading />
        ) : platosPorCategoria.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-8 text-center text-sm text-gray-500">
            No hay platos para mostrar.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {platosPorCategoria.map((category) => {
              const isExpanded = !!expandedCategories[category.id];

              return (
                <div key={category.id} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-left transition-colors hover:bg-gray-100"
                    onClick={() => toggleCategory(category.id)}
                  >
                    <div className="min-w-0">
                      <h2 className="truncate font-semibold text-gray-900">{category.name}</h2>
                      <p className="text-xs text-gray-500">
                        {category.items.length} {category.items.length === 1 ? "plato" : "platos"}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-gray-500">
                      {isExpanded ? "Ocultar" : "Ver"}
                    </span>
                  </button>

                  {isExpanded && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-white text-left text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="px-4 py-2.5 font-semibold">Plato</th>
                            <th className="hidden px-4 py-2.5 font-semibold lg:table-cell">Descripción</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Precio</th>
                            <th className="px-4 py-2.5 text-right font-semibold">Acciones</th>
                          </tr>
                        </thead>
                        <tbody>
                          {category.items.map((plato) => (
                            <tr key={plato.id} className="border-t border-gray-100 hover:bg-gray-50">
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-3">
                                  {plato.image_url ? (
                                    <img
                                      src={plato.image_url}
                                      alt={plato.nombre}
                                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 shrink-0 rounded-md bg-gray-100" />
                                  )}
                                  <div className="min-w-0">
                                    <p className="truncate font-medium text-gray-900">{plato.nombre}</p>
                                    <p className="line-clamp-1 text-xs text-gray-500 lg:hidden">{plato.descripcion}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="hidden max-w-md px-4 py-2.5 text-gray-500 lg:table-cell">
                                <span className="line-clamp-1">{plato.descripcion}</span>
                              </td>
                              <td className="px-4 py-2.5 text-right font-semibold text-gray-900">
                                {formatPrice(plato.precio)}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-700 transition-colors hover:bg-white"
                                    onClick={() => startEditing(plato)}
                                  >
                                    Editar
                                  </button>
                                  <button
                                    type="button"
                                    className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50"
                                    onClick={() => openDeleteModal(plato)}
                                  >
                                    Borrar
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import Loading from "shared/ui/Loading";

const API_BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const PAGE_SIZE = 20;
const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  telefono: "",
  role: "user",
  password: "",
};

function normalizeRole(role) {
  if (!role) return "Sin rol";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function EditUserModal({ isOpen, form, saving, error, onClose, onChange, onSubmit }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-gray-900/40 px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-xl rounded-xl bg-white p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 pb-4">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Editar usuario</h2>
            <p className="mt-1 text-sm text-gray-500">
              Actualiza datos, rol o asigna una nueva clave.
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
              name="first_name"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.first_name}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Apellido
            <input
              type="text"
              name="last_name"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.last_name}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Email
            <input
              type="email"
              name="email"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.email}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Teléfono
            <input
              type="text"
              name="telefono"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.telefono}
              onChange={onChange}
            />
          </label>

          <label className="text-sm font-medium text-gray-700">
            Rol
            <select
              name="role"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.role}
              onChange={onChange}
            >
              <option value="user">User</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label className="text-sm font-medium text-gray-700 md:col-span-2">
            Nueva clave opcional
            <input
              type="password"
              name="password"
              className="mt-1 h-10 w-full rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400"
              value={form.password}
              onChange={onChange}
              placeholder="Dejar vacío para mantener la actual"
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
            {saving ? "Guardando..." : "Guardar cambios"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editingUser, setEditingUser] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 350);

    return () => clearTimeout(timeoutId);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [roleFilter]);

  useEffect(() => {
    let cancelled = false;

    const fetchUsers = async () => {
      setLoading(true);
      try {
        const response = await axios.get(`${API_BASE}/api/auth/users`, {
          params: {
            page,
            limit: PAGE_SIZE,
            search: debouncedSearch,
            role: roleFilter,
          },
        });
        if (cancelled) return;

        const payload = response.data;
        const nextUsers = Array.isArray(payload) ? payload : payload.data;
        setUsers(Array.isArray(nextUsers) ? nextUsers : []);
        setPagination(
          payload.pagination || {
            page,
            limit: PAGE_SIZE,
            total: nextUsers?.length || 0,
            totalPages: nextUsers?.length ? 1 : 0,
          },
        );
        setError(null);
      } catch {
        if (!cancelled) {
          setError("No se pudieron cargar los usuarios.");
          setUsers([]);
          setPagination({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchUsers();
    return () => { cancelled = true; };
  }, [page, debouncedSearch, roleFilter]);

  const visibleRoleOptions = useMemo(() => {
    const roles = new Set(users.map((user) => user.role).filter(Boolean));
    return Array.from(roles).sort();
  }, [users]);

  const adminCount = users.filter((user) => user.role === "admin").length;
  const clientCount = users.length - adminCount;
  const canGoPrevious = page > 1;
  const canGoNext = pagination.totalPages > 0 && page < pagination.totalPages;

  const openEditModal = (user) => {
    setEditingUser(user);
    setForm({
      first_name: user.first_name || "",
      last_name: user.last_name || "",
      email: user.email || "",
      telefono: user.telefono || "",
      role: user.role || "user",
      password: "",
    });
    setFormError(null);
    setSavedMessage("");
  };

  const closeEditModal = () => {
    setEditingUser(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const handleFormChange = (event) => {
    const { name, value } = event.target;
    setForm((currentForm) => ({ ...currentForm, [name]: value }));
    setSavedMessage("");
  };

  const validateForm = () => {
    if (!form.first_name.trim() || !form.last_name.trim() || !form.email.trim() || !form.role) {
      setFormError("Completa nombre, apellido, email y rol.");
      return false;
    }

    if (form.password && form.password.length < 6) {
      setFormError("La nueva clave debe tener al menos 6 caracteres.");
      return false;
    }

    return true;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!editingUser || !validateForm()) return;

    setSaving(true);
    setFormError(null);

    try {
      const payload = {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        telefono: form.telefono.trim(),
        role: form.role,
      };

      if (form.password.trim()) {
        payload.password = form.password.trim();
      }

      const response = await axios.put(`${API_BASE}/api/auth/users/${editingUser.id}`, payload);
      const updatedUser = response.data;
      setUsers((currentUsers) =>
        currentUsers.map((user) => (user.id === updatedUser.id ? updatedUser : user)),
      );
      setSavedMessage("Usuario actualizado correctamente.");
      closeEditModal();
    } catch (err) {
      setFormError(err.response?.data?.message || "No se pudo actualizar el usuario.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="flex flex-col gap-5 pb-6">
      <EditUserModal
        isOpen={!!editingUser}
        form={form}
        saving={saving}
        error={formError}
        onClose={closeEditModal}
        onChange={handleFormChange}
        onSubmit={handleSubmit}
      />

      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuarios</h1>
          <p className="mt-1 text-sm text-gray-500">
            Consulta y edita clientes y administradores registrados en la plataforma.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center sm:min-w-[360px]">
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-gray-500">Total</p>
            <p className="text-lg font-bold text-gray-900">{pagination.total}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-gray-500">Admins pág.</p>
            <p className="text-lg font-bold text-gray-900">{adminCount}</p>
          </div>
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
            <p className="text-xs font-medium text-gray-500">Clientes pág.</p>
            <p className="text-lg font-bold text-gray-900">{clientCount}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-3 md:flex-row md:items-center md:justify-between">
        <input
          type="search"
          className="h-10 rounded-md border border-gray-200 px-3 text-sm outline-none focus:border-yellow-400 md:w-80"
          placeholder="Buscar por nombre, email o teléfono"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <select
          className="h-10 rounded-md border border-gray-200 px-3 text-sm text-gray-700 outline-none focus:border-yellow-400"
          value={roleFilter}
          onChange={(event) => setRoleFilter(event.target.value)}
        >
          <option value="all">Todos los roles</option>
          <option value="admin">Admin</option>
          <option value="user">User</option>
          {visibleRoleOptions
            .filter((role) => !["admin", "user"].includes(role))
            .map((role) => (
              <option key={role} value={role}>{normalizeRole(role)}</option>
            ))}
        </select>
      </div>

      {savedMessage && (
        <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          {savedMessage}
        </div>
      )}

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
                  <th className="px-4 py-3 font-semibold">Usuario</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Teléfono</th>
                  <th className="hidden px-4 py-3 font-semibold md:table-cell">Rol</th>
                  <th className="px-4 py-3 text-right font-semibold">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="px-4 py-8 text-center text-gray-500">
                      No hay usuarios para mostrar.
                    </td>
                  </tr>
                ) : (
                  users.map((user) => (
                    <tr key={user.id} className="border-t border-gray-100">
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">
                          {user.first_name} {user.last_name}
                        </p>
                        <p className="text-xs text-gray-500">{user.email}</p>
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                        {user.telefono || "-"}
                      </td>
                      <td className="hidden px-4 py-3 text-gray-600 md:table-cell">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          user.role === "admin" ? "bg-yellow-100 text-yellow-800" : "bg-gray-100 text-gray-700"
                        }`}>
                          {normalizeRole(user.role)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          className="rounded-md border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition-colors hover:bg-gray-50"
                          onClick={() => openEditModal(user)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-gray-500">
              Página {pagination.totalPages === 0 ? 0 : pagination.page} de {pagination.totalPages} - {pagination.total} usuarios
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
        </>
      )}
    </section>
  );
}

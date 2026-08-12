import React, { useState, useEffect } from 'react';
import { Home, Plus, Trash2, Key, MapPin, Building, AlertCircle } from 'lucide-react';
import api from '@/shared/api/client';

export default function PropertyManager() {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    name: '',
    propertyType: 'Studio',
    bedrooms: 1,
    bathrooms: 1,
    streetAddress: '',
    dependentLocality: '',
    locality: 'Quito',
    administrativeArea: 'Pichincha',
    accessCode: '',
    notes: '',
  });
  const [error, setError] = useState('');

  async function loadProperties() {
    try {
      setLoading(true);
      const res = await api.get('/customer/properties');
      setProperties(res.data.properties || []);
    } catch {
      setError('No se pudieron cargar tus inmuebles.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadProperties();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      await api.post('/customer/properties', form);
      setShowModal(false);
      setForm({
        name: '',
        propertyType: 'Studio',
        bedrooms: 1,
        bathrooms: 1,
        streetAddress: '',
        dependentLocality: '',
        locality: 'Quito',
        administrativeArea: 'Pichincha',
        accessCode: '',
        notes: '',
      });
      loadProperties();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error guardando inmueble.');
    }
  }

  async function handleDelete(id) {
    if (!window.confirm('¿Seguro de eliminar este inmueble?')) return;
    try {
      await api.delete(`/customer/properties/${id}`);
      loadProperties();
    } catch {
      alert('No se pudo eliminar el inmueble.');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <Home className="h-5 w-5 text-emerald-600" />
            Mis Inmuebles Registrados
          </h2>
          <p className="text-xs text-slate-500">
            Administra tus casas, departamentos u oficinas con accesos cifrados
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-all"
        >
          <Plus className="h-4 w-4" />
          Añadir Inmueble
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Cargando inmuebles...</div>
      ) : properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <Building className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700">No tienes inmuebles registrados</p>
          <p className="mt-1 text-xs text-slate-400">Agrega un inmueble para agilizar tus reservas futuras.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {properties.map((prop) => (
            <div
              key={prop.id}
              className="relative rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-all hover:shadow-md"
            >
              <button
                onClick={() => handleDelete(prop.id)}
                className="absolute right-3 top-3 text-slate-400 hover:text-rose-600"
                title="Eliminar"
              >
                <Trash2 className="h-4 w-4" />
              </button>

              <h3 className="font-bold text-slate-900 text-sm">{prop.name}</h3>
              <p className="text-xs text-slate-500 mt-0.5">{prop.property_type} ({prop.bedrooms} hab. / {prop.bathrooms} baño)</p>

              <div className="mt-4 space-y-1.5 text-xs text-slate-600">
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                  <span>{prop.street_address}, {prop.locality}</span>
                </div>
                {prop.access_code && (
                  <div className="flex items-center gap-1.5 text-emerald-700 font-medium bg-emerald-50 px-2 py-1 rounded w-fit">
                    <Key className="h-3.5 w-3.5 shrink-0" />
                    <span>Código de acceso: {prop.access_code}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Modal Add Property */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Registrar Nuevo Inmueble</h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Nombre identificativo</label>
                <input
                  type="text"
                  required
                  placeholder="Ej: Mi Casa, Dpto Cumbayá, Oficina"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tipo Inmueble</label>
                  <select
                    value={form.propertyType}
                    onChange={(e) => setForm({ ...form, propertyType: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="Studio">Estudio / Suite</option>
                    <option value="1 Bedroom">1 Dormitorio</option>
                    <option value="2 Bedrooms">2 Dormitorios</option>
                    <option value="3 Bedrooms">3 Dormitorios</option>
                    <option value="4+ Bedrooms">4+ Dormitorios</option>
                    <option value="Office">Oficina</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Dirección</label>
                  <input
                    type="text"
                    required
                    placeholder="Calle Principal y Secundaria"
                    value={form.streetAddress}
                    onChange={(e) => setForm({ ...form, streetAddress: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Código de Puerta / Alarma (Cifrado AES-256)</label>
                <input
                  type="text"
                  placeholder="Ej: Clave 1234# / Llave en conserjería"
                  value={form.accessCode}
                  onChange={(e) => setForm({ ...form, accessCode: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="rounded-lg px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
                >
                  Guardar Inmueble
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

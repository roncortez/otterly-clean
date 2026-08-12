import React, { useState, useEffect } from 'react';
import { Ticket, Plus, CheckCircle, XCircle, Tag, AlertCircle } from 'lucide-react';
import api from '@/shared/api/client';

export default function CouponsPage() {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    codigo: '',
    descripcion: '',
    tipo: 'porcentaje',
    valor: 10,
    usoMaximo: 100,
    usoPorCliente: 1,
    montoMinimo: 0,
  });
  const [error, setError] = useState('');

  async function loadCoupons() {
    try {
      setLoading(true);
      const res = await api.get('/operations/coupons');
      setCoupons(res.data.coupons || []);
    } catch {
      setError('Error cargando los cupones');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCoupons();
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    try {
      setError('');
      await api.post('/operations/coupons', form);
      setShowModal(false);
      setForm({
        codigo: '',
        descripcion: '',
        tipo: 'porcentaje',
        valor: 10,
        usoMaximo: 100,
        usoPorCliente: 1,
        montoMinimo: 0,
      });
      loadCoupons();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al crear el cupón');
    }
  }

  async function toggleStatus(id, currentActive) {
    try {
      await api.patch(`/operations/coupons/${id}/status`, { active: !currentActive });
      loadCoupons();
    } catch {
      alert('Error cambiando estado del cupón');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Ticket className="h-6 w-6 text-emerald-600" />
            Gestión de Cupones y Promociones
          </h2>
          <p className="text-xs text-slate-500">
            Crea y administra códigos promocionales para los clientes de la plataforma
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-all"
        >
          <Plus className="h-4 w-4" />
          Nuevo Cupón
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Cargando cupones...</div>
      ) : coupons.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center">
          <Tag className="mx-auto h-8 w-8 text-slate-400" />
          <p className="mt-2 text-sm font-medium text-slate-700">No hay cupones creados</p>
          <p className="mt-1 text-xs text-slate-400">Crea tu primer código promocional para atraer clientes.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 border-b border-slate-200 font-semibold">
              <tr>
                <th className="p-3">Código</th>
                <th className="p-3">Descripción</th>
                <th className="p-3">Tipo / Valor</th>
                <th className="p-3">Usos (Realizados/Máx)</th>
                <th className="p-3">Estado</th>
                <th className="p-3 text-right">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {coupons.map((cup) => (
                <tr key={cup.id} className="hover:bg-slate-50/80">
                  <td className="p-3 font-mono font-bold text-emerald-700">{cup.codigo}</td>
                  <td className="p-3 text-slate-600">{cup.descripcion || 'Sin descripción'}</td>
                  <td className="p-3 font-medium">
                    {cup.tipo === 'porcentaje' ? `${cup.valor}%` : `$${cup.valor}`}
                  </td>
                  <td className="p-3">
                    {cup.usos_realizados} / {cup.uso_maximo}
                  </td>
                  <td className="p-3">
                    {cup.activo ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="h-3 w-3" /> Activo
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                        <XCircle className="h-3 w-3" /> Inactivo
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => toggleStatus(cup.id, cup.activo)}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline"
                    >
                      {cup.activo ? 'Desactivar' : 'Activar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal Modal Nuevo Cupón */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="text-base font-bold text-slate-900">Crear Nuevo Cupón Promocional</h3>
            <form onSubmit={handleSubmit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-700">Código (Ej: PROMO2026)</label>
                <input
                  type="text"
                  required
                  placeholder="CODIGO"
                  value={form.codigo}
                  onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs uppercase focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Descripción</label>
                <input
                  type="text"
                  placeholder="Ej: Descuento 10% en primera limpieza"
                  value={form.descripcion}
                  onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Tipo Descuento</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm({ ...form, tipo: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="porcentaje">Porcentaje (%)</option>
                    <option value="monto_fijo">Monto Fijo ($)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Valor</label>
                  <input
                    type="number"
                    required
                    min="1"
                    value={form.valor}
                    onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700">Uso Máximo Global</label>
                  <input
                    type="number"
                    min="1"
                    value={form.usoMaximo}
                    onChange={(e) => setForm({ ...form, usoMaximo: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700">Monto Mínimo ($)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.montoMinimo}
                    onChange={(e) => setForm({ ...form, montoMinimo: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
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
                  Guardar Cupón
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

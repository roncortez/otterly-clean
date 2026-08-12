import React, { useState } from 'react';
import { Plus, CheckCircle, XCircle, Tag } from 'lucide-react';
import api from '@/shared/api/client';
import { useApiQuery } from '@/shared/api/useApiQuery';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '@/shared/ui';

const EMPTY_FORM = {
  codigo: '',
  descripcion: '',
  tipo: 'porcentaje',
  valor: 10,
  usoMaximo: 100,
  usoPorCliente: 1,
  montoMinimo: 0,
};

export default function CouponsPage() {
  // La lectura pasa por useApiQuery: deriva `loading` comparando lo pedido con
  // lo resuelto, en lugar de escribirlo con un setState dentro del efecto.
  const couponsQuery = useApiQuery('/operations/coupons');
  const coupons = couponsQuery.data?.coupons ?? [];
  const loading = couponsQuery.loading;

  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const loadCoupons = couponsQuery.reload;

  async function handleSubmit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      setError('');
      await api.post('/operations/coupons', form);
      setShowModal(false);
      setForm(EMPTY_FORM);
      loadCoupons();
    } catch (err) {
      setError(err.response?.data?.error?.message || 'Error al crear el cupón');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(id, currentActive) {
    try {
      setError('');
      await api.patch(`/operations/coupons/${id}/status`, { active: !currentActive });
      loadCoupons();
    } catch {
      setError('No pudimos cambiar el estado del cupón.');
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Operaciones"
        title="Cupones y promociones"
        description="Crea y administra los códigos promocionales de la plataforma."
        action={
          <Button variant="accent" onClick={() => setShowModal(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo cupón
          </Button>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {loading ? (
        <Spinner label="Cargando cupones" />
      ) : coupons.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="No hay cupones creados"
          description="Crea tu primer código promocional para atraer clientes."
          action={
            <Button variant="accent" onClick={() => setShowModal(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Nuevo cupón
            </Button>
          }
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-surface-sunken">
                <tr className="text-left text-xs tracking-wide text-text-subtle uppercase">
                  <th className="px-4 py-2.5 font-medium">Código</th>
                  <th className="px-4 py-2.5 font-medium">Descripción</th>
                  <th className="px-4 py-2.5 font-medium">Tipo / valor</th>
                  <th className="px-4 py-2.5 font-medium">Usos</th>
                  <th className="px-4 py-2.5 font-medium">Estado</th>
                  <th className="px-4 py-2.5 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {coupons.map((cup) => (
                  <tr key={cup.id} className="transition-colors hover:bg-surface-sunken/60">
                    <td className="px-4 py-3 font-mono font-semibold text-forest-700">
                      {cup.codigo}
                    </td>
                    <td className="px-4 py-3 text-text-muted">
                      {cup.descripcion || 'Sin descripción'}
                    </td>
                    <td className="px-4 py-3 font-medium text-text tnum">
                      {cup.tipo === 'porcentaje' ? `${cup.valor}%` : `$${cup.valor}`}
                    </td>
                    <td className="px-4 py-3 text-text-muted tnum">
                      {cup.usos_realizados} / {cup.uso_maximo}
                    </td>
                    <td className="px-4 py-3">
                      {cup.activo ? (
                        <Badge tone="success">
                          <CheckCircle className="size-3" aria-hidden="true" />
                          Activo
                        </Badge>
                      ) : (
                        <Badge tone="neutral">
                          <XCircle className="size-3" aria-hidden="true" />
                          Inactivo
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleStatus(cup.id, cup.activo)}
                      >
                        {cup.activo ? 'Desactivar' : 'Activar'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title="Crear cupón promocional"
        description="El código se guarda en mayúsculas y queda activo desde su creación."
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>
              Cancelar
            </Button>
            <Button type="submit" form="coupon-form" variant="accent" loading={saving}>
              Guardar cupón
            </Button>
          </>
        }
      >
        <form id="coupon-form" onSubmit={handleSubmit} className="space-y-4">
          <Field label="Código" hint="Por ejemplo: PROMO2026" required>
            <Input
              type="text"
              required
              placeholder="CODIGO"
              value={form.codigo}
              onChange={(e) => setForm({ ...form, codigo: e.target.value.toUpperCase() })}
              className="uppercase"
            />
          </Field>

          <Field label="Descripción">
            <Input
              type="text"
              placeholder="Descuento 10% en la primera limpieza"
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tipo de descuento">
              <Select
                value={form.tipo}
                onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              >
                <option value="porcentaje">Porcentaje (%)</option>
                <option value="monto_fijo">Monto fijo ($)</option>
              </Select>
            </Field>

            <Field label="Valor" required>
              <Input
                type="number"
                required
                min="1"
                value={form.valor}
                onChange={(e) => setForm({ ...form, valor: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Uso máximo global">
              <Input
                type="number"
                min="1"
                value={form.usoMaximo}
                onChange={(e) => setForm({ ...form, usoMaximo: Number(e.target.value) })}
              />
            </Field>

            <Field label="Monto mínimo ($)">
              <Input
                type="number"
                min="0"
                value={form.montoMinimo}
                onChange={(e) => setForm({ ...form, montoMinimo: Number(e.target.value) })}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}

import { useState } from 'react';
import { UserPlus, ShieldCheck, ShieldAlert, Power } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  cx,
} from '@/shared/ui';

const VERIFICATION_TONES = {
  VERIFIED: 'success',
  PENDING: 'warning',
  IN_REVIEW: 'info',
  REJECTED: 'danger',
  EXPIRED: 'danger',
};

const VERIFICATION_LABELS = {
  VERIFIED: 'Verificado',
  PENDING: 'Sin verificar',
  IN_REVIEW: 'En revisión',
  REJECTED: 'Rechazado',
  EXPIRED: 'Caducado',
};

/**
 * Gestión de trabajadores.
 *
 * Las cuentas se crean aquí, no por registro público: es lo que distingue esta
 * plataforma de un marketplace abierto. Un trabajador sin verificar existe pero
 * el sistema no permite asignarle servicios.
 */
export default function StaffPage() {
  const [showForm, setShowForm] = useState(false);

  const staffQuery = useApiQuery('/operations/staff');
  const zonesQuery = useApiQuery('/operations/zones');
  const { busy: saving, error: actionError, execute } = useApiAction();

  const staff = staffQuery.data?.staff ?? [];
  const zones = zonesQuery.data?.zones ?? [];
  const loading = staffQuery.loading || zonesQuery.loading;
  const error = staffQuery.error ?? zonesQuery.error ?? actionError;

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
    employeeCode: '',
    bio: '',
    serviceTypes: [],
    zoneIds: [],
  });

  async function handleCreate(event) {
    event.preventDefault();

    await execute(
      () =>
        api.post('/operations/staff', {
          ...form,
          phone: form.phone || undefined,
          employeeCode: form.employeeCode || undefined,
          bio: form.bio || undefined,
        }),
      {
        onSuccess: () => {
          setForm({
            firstName: '',
            lastName: '',
            email: '',
            phone: '',
            password: '',
            employeeCode: '',
            bio: '',
            serviceTypes: [],
            zoneIds: [],
          });
          setShowForm(false);
          staffQuery.reload();
        },
      },
    );
  }

  async function setVerification(staffId, status) {
    await execute(() => api.post(`/operations/staff/${staffId}/verification`, { status }), {
      onSuccess: staffQuery.reload,
    });
  }

  async function toggleActive(member) {
    const action = member.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Seguro que quieres ${action} a ${member.first_name}?`)) return;

    await execute(
      () => api.post(`/operations/staff/${member.id}/active`, { active: !member.active }),
      { onSuccess: staffQuery.reload },
    );
  }

  const toggleServiceType = (code) =>
    setForm((current) => ({
      ...current,
      serviceTypes: current.serviceTypes.includes(code)
        ? current.serviceTypes.filter((entry) => entry !== code)
        : [...current.serviceTypes, code],
    }));

  const toggleZone = (zoneId) =>
    setForm((current) => ({
      ...current,
      zoneIds: current.zoneIds.includes(zoneId)
        ? current.zoneIds.filter((entry) => entry !== zoneId)
        : [...current.zoneIds, zoneId],
    }));

  if (loading) return <Spinner />;

  return (
    <div>
      <PageHeader
        title="Trabajadores"
        eyebrow="Operaciones"
        description="Personal contratado por la empresa. Solo los verificados pueden recibir servicios."
        action={
          !showForm && (
            <Button onClick={() => setShowForm(true)}>
              <UserPlus className="size-4" aria-hidden="true" />
              Nuevo trabajador
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {showForm && (
        <Card className="mb-6">
          <CardHeader
            title="Nuevo trabajador"
            description="Se crea sin verificar; verifícalo antes de poder asignarle trabajos."
          />
          <form onSubmit={handleCreate} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre" required>
                <Input
                  required
                  value={form.firstName}
                  onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                />
              </Field>
              <Field label="Apellido" required>
                <Input
                  required
                  value={form.lastName}
                  onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                />
              </Field>
              <Field label="Correo" required>
                <Input
                  type="email"
                  required
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                />
              </Field>
              <Field label="Teléfono" hint="Formato internacional: +593991234567">
                <Input
                  value={form.phone}
                  onChange={(event) => setForm({ ...form, phone: event.target.value })}
                />
              </Field>
              <Field label="Contraseña inicial" hint="Mínimo 8 caracteres." required>
                <Input
                  type="password"
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </Field>
              <Field label="Código de empleado">
                <Input
                  value={form.employeeCode}
                  onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                  placeholder="EMP-004"
                />
              </Field>
            </div>

            <Field label="Presentación" hint="Lo ve el cliente. Genera confianza.">
              <Input
                value={form.bio}
                onChange={(event) => setForm({ ...form, bio: event.target.value })}
                placeholder="Cinco años de experiencia en limpieza residencial."
              />
            </Field>

            <div>
              <p className="mb-2 text-sm font-medium text-text">Servicios que atiende</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { code: 'CLEANING', label: 'Limpieza' },
                  { code: 'LAUNDRY', label: 'Lavandería' },
                ].map((service) => (
                  <button
                    key={service.code}
                    type="button"
                    onClick={() => toggleServiceType(service.code)}
                    aria-pressed={form.serviceTypes.includes(service.code)}
                    className={cx(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      form.serviceTypes.includes(service.code)
                        ? 'border-forest-600 bg-forest-600 text-white'
                        : 'border-border text-text-muted hover:border-border-strong',
                    )}
                  >
                    {service.label}
                  </button>
                ))}
              </div>
            </div>

            {zones.length > 0 && (
              <div>
                <p className="mb-2 text-sm font-medium text-text">Zonas que cubre</p>
                <div className="flex flex-wrap gap-2">
                  {zones.map((zone) => (
                    <button
                      key={zone.id}
                      type="button"
                      onClick={() => toggleZone(zone.id)}
                      aria-pressed={form.zoneIds.includes(zone.id)}
                      className={cx(
                        'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                        form.zoneIds.includes(zone.id)
                          ? 'border-sage-500 bg-sage-500 text-white'
                          : 'border-border text-text-muted hover:border-border-strong',
                      )}
                    >
                      {zone.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saving} disabled={form.serviceTypes.length === 0}>
                Crear trabajador
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {staff.map((member) => (
          <Card key={member.id} className={cx('p-5', !member.active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-700">
                  {member.first_name?.[0]}
                  {member.last_name?.[0]}
                </span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-text">
                    {member.first_name} {member.last_name}
                  </p>
                  <p className="truncate text-xs text-text-subtle">{member.email}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => toggleActive(member)}
                className={cx(
                  'shrink-0 rounded-lg p-2 transition-colors',
                  member.active
                    ? 'text-text-subtle hover:bg-danger-soft hover:text-danger'
                    : 'text-success hover:bg-success-soft',
                )}
                aria-label={member.active ? 'Desactivar' : 'Reactivar'}
                title={member.active ? 'Desactivar' : 'Reactivar'}
              >
                <Power className="size-4" aria-hidden="true" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              <Badge tone={VERIFICATION_TONES[member.verification_status]}>
                {member.verification_status === 'VERIFIED' ? (
                  <ShieldCheck className="size-3" aria-hidden="true" />
                ) : (
                  <ShieldAlert className="size-3" aria-hidden="true" />
                )}
                {VERIFICATION_LABELS[member.verification_status]}
              </Badge>
              {member.service_types?.map((type) => (
                <Badge key={type} tone="forest">
                  {type === 'CLEANING' ? 'Limpieza' : 'Lavandería'}
                </Badge>
              ))}
              {!member.active && <Badge tone="neutral">Inactivo</Badge>}
            </div>

            {member.bio && <p className="mt-3 text-sm text-text-muted">{member.bio}</p>}

            <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
              <span className="text-xs text-text-subtle">
                {member.jobs_today} trabajo(s) hoy
                {member.employee_code && ` · ${member.employee_code}`}
              </span>

              {member.verification_status !== 'VERIFIED' && (
                <Select
                  className="h-8 w-auto text-xs"
                  value=""
                  onChange={(event) =>
                    event.target.value && setVerification(member.id, event.target.value)
                  }
                  aria-label="Cambiar verificación"
                >
                  <option value="">Verificación…</option>
                  <option value="IN_REVIEW">Marcar en revisión</option>
                  <option value="VERIFIED">Marcar verificado</option>
                  <option value="REJECTED">Rechazar</option>
                </Select>
              )}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

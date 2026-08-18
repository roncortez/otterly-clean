import { useState } from 'react';
import {
  UserPlus,
  ShieldCheck,
  ShieldAlert,
  Power,
  Copy,
  Send,
  Clock,
  Check,
} from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
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

const SERVICE_LABELS = {
  CLEANING: 'Limpieza',
  LAUNDRY: 'Lavandería',
  ALTERATION: 'Arreglos',
};

const EMPTY_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  employeeCode: '',
  serviceTypes: [],
  zoneIds: [],
  roles: ['STAFF'],
  active: true,
};

/**
 * Gestión de trabajadores.
 *
 * Las cuentas se crean aquí, no por registro público: es lo que distingue esta
 * plataforma de un marketplace abierto.
 *
 * Operaciones aporta lo que solo la empresa sabe —a quién contrata, qué
 * servicios puede atender, en qué zonas y si la cuenta está activa— y el
 * sistema envía una invitación. La contraseña la elige el trabajador y su
 * presentación (nombre público, biografía y foto) la escribe él: aquí ya no se
 * teclean datos personales en nombre de nadie.
 */
export default function StaffPage() {
  const [showForm, setShowForm] = useState(false);
  const [invitation, setInvitation] = useState(null);
  const [copied, setCopied] = useState(false);

  const staffQuery = useApiQuery('/operations/staff');
  const zonesQuery = useApiQuery('/operations/zones');
  const { busy: saving, error: actionError, execute } = useApiAction();

  const staff = staffQuery.data?.staff ?? [];
  const zones = zonesQuery.data?.zones ?? [];
  const loading = staffQuery.loading || zonesQuery.loading;
  const error = staffQuery.error ?? zonesQuery.error ?? actionError;

  const [form, setForm] = useState(EMPTY_FORM);

  async function handleCreate(event) {
    event.preventDefault();

    await execute(
      () =>
        api.post('/operations/staff', {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          employeeCode: form.employeeCode || undefined,
          serviceTypes: form.serviceTypes,
          zoneIds: form.zoneIds,
          roles: form.roles,
          active: form.active,
        }),
      {
        onSuccess: (result) => {
          setForm(EMPTY_FORM);
          setShowForm(false);
          setInvitation({ ...result.data, name: `${form.firstName} ${form.lastName}` });
          setCopied(false);
          staffQuery.reload();
        },
      },
    );
  }

  async function resendInvitation(member) {
    await execute(() => api.post(`/operations/staff/${member.id}/invite`), {
      onSuccess: (result) => {
        setInvitation({ ...result.data, name: `${member.first_name} ${member.last_name}` });
        setCopied(false);
        staffQuery.reload();
      },
    });
  }

  async function setVerification(staffId, status) {
    await execute(() => api.post(`/operations/staff/${staffId}/verification`, { status }), {
      onSuccess: staffQuery.reload,
    });
  }

  async function toggleActive(member) {
    const action = member.active ? 'desactivar' : 'reactivar';
    if (!window.confirm(`¿Seguro que quieres ${action} a ${member.first_name}?`)) return;

    await execute(() => api.post(`/operations/staff/${member.id}/active`, { active: !member.active }), {
      onSuccess: staffQuery.reload,
    });
  }

  const toggleIn = (key, value) =>
    setForm((current) => ({
      ...current,
      [key]: current[key].includes(value)
        ? current[key].filter((entry) => entry !== value)
        : [...current[key], value],
    }));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(invitation.activationUrl);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

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
              Invitar trabajador
            </Button>
          )
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      {/*
        Mientras no exista un proveedor real de correo o WhatsApp, el enlace se
        entrega aquí para que alguien lo reenvíe a mano. El sistema no dice que
        lo envió: dice exactamente lo que pasó con cada canal.
      */}
      {invitation && (
        <Card className="mb-6 border-forest-100 bg-forest-50/50 p-5">
          <p className="font-medium text-forest-800">Invitación creada para {invitation.name}</p>
          <p className="mt-1 text-sm text-forest-700/90">
            Caduca el {new Date(invitation.invitation.expiresAt).toLocaleString('es-EC')}. Envíale
            este enlace para que active su cuenta y complete su perfil.
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg border border-border bg-surface-raised px-3 py-2 text-xs text-text-muted">
              {invitation.activationUrl}
            </code>
            <Button type="button" variant="outline" size="sm" onClick={copyLink}>
              {copied ? (
                <Check className="size-4" aria-hidden="true" />
              ) : (
                <Copy className="size-4" aria-hidden="true" />
              )}
              {copied ? 'Copiado' : 'Copiar'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setInvitation(null)}>
              Cerrar
            </Button>
          </div>

          <ul className="mt-3 flex flex-wrap gap-3 text-xs text-forest-700/80">
            {invitation.delivery?.map((entry) => (
              <li key={entry.channel} className="flex items-center gap-1.5">
                <Clock className="size-3.5" aria-hidden="true" />
                {entry.channel === 'WHATSAPP' ? 'WhatsApp' : 'Correo'}:{' '}
                {entry.status === 'SENT' ? 'enviado' : 'pendiente, sin proveedor configurado'}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* El formulario aparece donde no había nada y empuja la lista hacia
          abajo. Entrando desde arriba se lee como un panel que se abre; sin
          movimiento, la lista parece haber dado un salto sola. */}
      {showForm && (
        <Card className="anim-rise mb-6">
          <CardHeader
            title="Nuevo trabajador"
            description="Solo los datos que decide la empresa. Su perfil lo completa él al aceptar la invitación."
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
              <Field label="Correo" hint="Ahí llega la invitación." required>
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
              <Field label="Código de empleado">
                <Input
                  value={form.employeeCode}
                  onChange={(event) => setForm({ ...form, employeeCode: event.target.value })}
                  placeholder="EMP-004"
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-text">Servicios que atiende</p>
              <div className="flex flex-wrap gap-2">
                {['CLEANING', 'LAUNDRY'].map((code) => (
                  <button
                    key={code}
                    type="button"
                    onClick={() => toggleIn('serviceTypes', code)}
                    aria-pressed={form.serviceTypes.includes(code)}
                    className={cx(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      form.serviceTypes.includes(code)
                        ? 'border-forest-600 bg-forest-600 text-white'
                        : 'border-border text-text-muted hover:border-border-strong',
                    )}
                  >
                    {SERVICE_LABELS[code]}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-text">Roles</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { code: 'STAFF', label: 'Trabajador' },
                  { code: 'ADMIN', label: 'Operaciones' },
                ].map((role) => (
                  <button
                    key={role.code}
                    type="button"
                    // El rol STAFF no se quita desde esta pantalla: es la de
                    // trabajadores, y una cuenta sin él no pinta nada aquí.
                    disabled={role.code === 'STAFF'}
                    onClick={() => toggleIn('roles', role.code)}
                    aria-pressed={form.roles.includes(role.code)}
                    className={cx(
                      'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                      'disabled:cursor-not-allowed disabled:opacity-70',
                      form.roles.includes(role.code)
                        ? 'border-forest-600 bg-forest-600 text-white'
                        : 'border-border text-text-muted hover:border-border-strong',
                    )}
                  >
                    {role.label}
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
                      onClick={() => toggleIn('zoneIds', zone.id)}
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

            <Checkbox
              label="Cuenta activa"
              description="Puede entrar en cuanto acepte la invitación."
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />

            <div className="flex gap-3 pt-2">
              <Button type="submit" loading={saving} disabled={form.serviceTypes.length === 0}>
                <Send className="size-4" aria-hidden="true" />
                Crear e invitar
              </Button>
              <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {staff.map((member) => (
          <Card key={member.id} className={cx('p-5', !member.active && 'opacity-60')}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                {member.photo_url ? (
                  <img
                    src={member.photo_url}
                    alt=""
                    className="size-11 shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-forest-100 font-semibold text-forest-700">
                    {member.first_name?.[0]}
                    {member.last_name?.[0]}
                  </span>
                )}
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
                  'press shrink-0 rounded-lg p-2 transition-colors',
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
                  {SERVICE_LABELS[type] ?? type}
                </Badge>
              ))}
              {!member.active && <Badge tone="neutral">Inactivo</Badge>}
              {member.invitation?.status === 'PENDING' && <Badge tone="info">Invitación enviada</Badge>}
              {!member.onboarding_completed_at && member.invitation?.status === 'ACCEPTED' && (
                <Badge tone="warning">Perfil incompleto</Badge>
              )}
            </div>

            {member.bio && <p className="mt-3 text-sm text-text-muted">{member.bio}</p>}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <span className="text-xs text-text-subtle">
                {member.jobs_today} trabajo(s) hoy
                {member.employee_code && ` · ${member.employee_code}`}
              </span>

              <div className="flex items-center gap-2">
                {/* Reenviar genera un enlace nuevo e invalida el anterior. */}
                {!member.onboarding_completed_at && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => resendInvitation(member)}
                  >
                    <Send className="size-3.5" aria-hidden="true" />
                    Reenviar invitación
                  </Button>
                )}

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
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}

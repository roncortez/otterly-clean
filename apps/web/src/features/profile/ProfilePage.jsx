import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Lock } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useAuth, homePathForRoles } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import PhotoField from '@/features/onboarding/PhotoField';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  DataRow,
  Field,
  Input,
  PageHeader,
  Spinner,
  Textarea,
} from '@/shared/ui';

/**
 * Mi perfil.
 *
 * Aquí cada persona corrige lo suyo: cómo se llama, cómo se le localiza, cómo
 * se presenta ante el cliente y su foto. Lo que tiene consecuencias —roles,
 * estado de la cuenta, servicios que puede atender, verificación— se muestra
 * pero no se toca: lo decide la empresa y el backend lo rechaza aunque alguien
 * lo intente por otro camino.
 */
export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const { phonePlaceholder, phonePrefix } = useConfig();

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/me/profile')
      .then(({ data }) => {
        if (cancelled) return;
        setProfile(data.profile);
        setForm({
          firstName: data.profile.user.firstName ?? '',
          lastName: data.profile.user.lastName ?? '',
          phone: data.profile.user.phone ?? '',
          displayName: data.profile.staff?.displayName ?? '',
          bio: data.profile.staff?.bio ?? '',
          skills: (data.profile.staff?.skills ?? []).join(', '),
          taxId: data.profile.customer?.taxId ?? '',
          marketingOptIn: Boolean(data.profile.customer?.marketingOptIn),
        });
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, 'No pudimos cargar tu perfil.'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (!profile || !form) {
    return error ? <Alert tone="danger">{error}</Alert> : <Spinner label="Cargando tu perfil" />;
  }

  const isStaff = Boolean(profile.staff);
  const isCustomer = Boolean(profile.customer);
  const update = (key) => (event) =>
    setForm({ ...form, [key]: event.target.type === 'checkbox' ? event.target.checked : event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);

    const phone = form.phone.trim();
    const payload = {
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      phone: phone
        ? phone.startsWith('+')
          ? phone.replace(/[\s()-]/g, '')
          : `${phonePrefix}${phone.replace(/[\s()-]/g, '').replace(/^0/, '')}`
        : null,
    };

    if (isStaff) {
      payload.displayName = form.displayName.trim();
      payload.bio = form.bio.trim() || null;
      payload.skills = form.skills
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
    if (isCustomer) {
      payload.taxId = form.taxId.trim() || null;
      payload.marketingOptIn = form.marketingOptIn;
    }

    try {
      const { data } = await api.patch('/me/profile', payload);
      setProfile(data.profile);
      await refreshUser();
      setSaved(true);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos guardar los cambios.'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Mi perfil"
        description="Tus datos personales y cómo te ven los clientes."
        action={
          <Link
            to={homePathForRoles(user?.roles)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-text-muted hover:text-text"
          >
            <ArrowLeft className="size-4" aria-hidden="true" />
            Volver
          </Link>
        }
      />

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}
      {saved && (
        <div className="mb-5">
          <Alert tone="success">Guardado.</Alert>
        </div>
      )}

      <Card className="mb-5 p-5 sm:p-6">
        <p className="mb-4 text-sm font-medium text-text">Tu foto</p>
        <PhotoField
          value={profile.photoUrl}
          onChange={(photoUrl) => setProfile({ ...profile, photoUrl })}
        />
      </Card>

      <form onSubmit={handleSubmit}>
        <Card className="mb-5 p-5 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombres" required>
              <Input required value={form.firstName} onChange={update('firstName')} />
            </Field>
            <Field label="Apellidos" required>
              <Input required value={form.lastName} onChange={update('lastName')} />
            </Field>
          </div>

          <div className="mt-4">
            <Field label="Teléfono" hint="Lo usamos para coordinar el día del servicio.">
              <Input
                type="tel"
                value={form.phone}
                onChange={update('phone')}
                placeholder={phonePlaceholder}
              />
            </Field>
          </div>

          {isStaff && (
            <div className="mt-4 space-y-4">
              <Field
                label="Nombre de presentación"
                hint="El cliente ve este nombre, no tu apellido."
                required
              >
                <Input required value={form.displayName} onChange={update('displayName')} />
              </Field>
              <Field label="Presentación" hint="Tu experiencia en una o dos frases.">
                <Textarea rows={4} value={form.bio} onChange={update('bio')} />
              </Field>
              <Field label="Habilidades" hint="Sepáralas con comas.">
                <Input value={form.skills} onChange={update('skills')} />
              </Field>
            </div>
          )}

          {isCustomer && (
            <div className="mt-4 space-y-4">
              <Field label="Cédula o RUC" hint="Solo si quieres factura.">
                <Input value={form.taxId} onChange={update('taxId')} />
              </Field>
              <Checkbox
                label="Quiero recibir promociones y novedades"
                checked={form.marketingOptIn}
                onChange={update('marketingOptIn')}
              />
            </div>
          )}

          <div className="mt-6">
            <Button type="submit" loading={saving}>
              Guardar cambios
            </Button>
          </div>
        </Card>
      </form>

      {isStaff && (
        <Card>
          <CardHeader
            title="Lo que gestiona la empresa"
            description="Puedes verlo, pero solo Operaciones lo cambia."
          />
          <dl className="divide-y divide-border px-5 pb-5">
            <DataRow label="Correo">{profile.user.email}</DataRow>
            <DataRow label="Servicios que atiendes">
              <span className="flex flex-wrap justify-end gap-1.5">
                {(profile.staff.serviceTypes ?? []).map((type) => (
                  <Badge key={type} tone="forest">
                    {type === 'CLEANING' ? 'Limpieza' : type === 'LAUNDRY' ? 'Lavandería' : 'Arreglos'}
                  </Badge>
                ))}
              </span>
            </DataRow>
            <DataRow label="Verificación">
              <Badge tone={profile.staff.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>
                {profile.staff.verificationStatus === 'VERIFIED' ? 'Verificado' : 'Pendiente'}
              </Badge>
            </DataRow>
            <DataRow label="Código de empleado">{profile.staff.employeeCode ?? '—'}</DataRow>
          </dl>
          <p className="flex items-center gap-1.5 border-t border-border px-5 py-3 text-xs text-text-subtle">
            <Lock className="size-3.5" aria-hidden="true" />
            Si algo de esto no es correcto, habla con Operaciones.
          </p>
        </Card>
      )}
    </div>
  );
}

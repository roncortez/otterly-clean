import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, homePathForRoles } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import { errorMessage } from '@/shared/api/client';
import BrandMark from '@/shared/ui/BrandMark';
import { Alert, Button, Field, Input } from '@/shared/ui';

export default function RegisterPage() {
  const { register } = useAuth();
  const { phonePlaceholder, phonePrefix } = useConfig();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (event) => setForm({ ...form, [field]: event.target.value });

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      // El backend espera E.164; se antepone el prefijo de la región si falta.
      const phone = form.phone.trim();
      const normalizedPhone = phone
        ? phone.startsWith('+')
          ? phone.replace(/[\s()-]/g, '')
          : `${phonePrefix}${phone.replace(/[\s()-]/g, '').replace(/^0/, '')}`
        : undefined;

      // El registro público siempre crea un CUSTOMER: el rol lo decide el
      // backend y nunca viaja en este formulario.
      const created = await register({ ...form, phone: normalizedPhone });
      navigate(homePathForRoles(created.roles), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos crear tu cuenta.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center px-5 py-12">
      <div className="w-full max-w-md">
        <BrandMark size="lg" className="mb-8" />

        <h1 className="text-2xl font-extrabold tracking-tight text-text">Crea tu cuenta</h1>
        <p className="mt-1.5 text-text-muted">
          Reserva y sigue cada servicio desde donde estés.
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && <Alert tone="danger">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre" required>
              <Input required value={form.firstName} onChange={update('firstName')} autoComplete="given-name" />
            </Field>
            <Field label="Apellido" required>
              <Input required value={form.lastName} onChange={update('lastName')} autoComplete="family-name" />
            </Field>
          </div>

          <Field label="Correo electrónico" required>
            <Input type="email" required value={form.email} onChange={update('email')} autoComplete="email" />
          </Field>

          <Field label="Teléfono" hint="Lo usamos para coordinar el acceso el día del servicio.">
            <Input
              type="tel"
              value={form.phone}
              onChange={update('phone')}
              placeholder={phonePlaceholder}
              autoComplete="tel"
            />
          </Field>

          <Field label="Contraseña" hint="Mínimo 8 caracteres." required>
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={update('password')}
              autoComplete="new-password"
            />
          </Field>

          <Button type="submit" size="lg" loading={submitting} className="w-full">
            Crear cuenta
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/entrar" className="font-medium text-forest-600 hover:text-forest-700">
            Entrar
          </Link>
        </p>
      </div>
    </main>
  );
}

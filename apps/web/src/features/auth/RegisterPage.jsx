import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, landingPathFor } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import { errorMessage } from '@/shared/api/client';
import { Alert, Button, Field, Input } from '@/shared/ui';
import AuthDialog from './AuthDialog';

export default function RegisterPage() {
  const { register } = useAuth();
  const { phonePlaceholder, phonePrefix } = useConfig();
  const navigate = useNavigate();
  const location = useLocation();

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
      // Lo que falte del perfil se pide después, en un paso corto: aquí solo se
      // pide lo imprescindible para tener cuenta.
      navigate(landingPathFor(created), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos crear tu cuenta.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthDialog
      title="Crea tu cuenta"
      description="Reserva y sigue cada servicio desde donde estés."
      aside={
        <>
          <p className="text-xl leading-tight font-extrabold tracking-tight text-balance">
            Reserva en un minuto y sigue el servicio desde donde estés.
          </p>
          <p className="mt-3 text-sm text-forest-100">
            Solo te pedimos lo imprescindible para empezar.
          </p>
        </>
      }
      footer={
        <p className="text-center text-sm text-text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link
            to="/entrar"
            state={location.state}
            className="font-medium text-forest-600 hover:text-forest-700"
          >
            Entrar
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
    </AuthDialog>
  );
}

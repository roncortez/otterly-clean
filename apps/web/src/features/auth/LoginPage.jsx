import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, landingPathFor } from '@/shared/auth/AuthContext';
import { errorMessage } from '@/shared/api/client';
import { Alert, Button, Field, Input } from '@/shared/ui';
import AuthDialog from './AuthDialog';

/**
 * Acceso a la cuenta.
 *
 * El formulario es el mismo de siempre; lo que cambió es el marco: ahora vive
 * dentro de un panel sobre la página en la que estabas (ver `AuthDialog`), en
 * lugar de ocupar la pantalla completa.
 */
export default function LoginPage() {
  const { login, isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to={landingPathFor(user)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const signedIn = await login(form);
      navigate(landingPathFor(signedIn), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos iniciar tu sesión.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthDialog
      title="Entra a tu cuenta"
      description="Sigue tus servicios y reserva uno nuevo."
      footer={
        <>
          <p className="text-center text-sm text-text-muted">
            ¿Aún no tienes cuenta?{' '}
            <Link
              to="/crear-cuenta"
              state={location.state}
              className="font-medium text-forest-600 hover:text-forest-700"
            >
              Crear una cuenta
            </Link>
          </p>
          <p className="mt-3 text-center text-xs text-text-subtle">
            ¿Trabajas con nosotros? Usa el mismo formulario: tu cuenta te lleva a tu panel.
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Correo electrónico" required>
          <Input
            type="email"
            autoComplete="email"
            required
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
            placeholder="tu@correo.com"
          />
        </Field>

        <Field label="Contraseña" required>
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
            placeholder="••••••••"
          />
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          Entrar
        </Button>
      </form>
    </AuthDialog>
  );
}

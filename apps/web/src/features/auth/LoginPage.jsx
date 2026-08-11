import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { Droplets } from 'lucide-react';
import { useAuth, homePathForRole } from '@/shared/auth/AuthContext';
import { errorMessage } from '@/shared/api/client';
import { Alert, Button, Field, Input } from '@/shared/ui';

export default function LoginPage() {
  const { login, isAuthenticated, user, isLoading } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isLoading && isAuthenticated) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const signedIn = await login(form);
      navigate(homePathForRole(signedIn.role), { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos iniciar tu sesión.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Panel de marca: solo en pantallas grandes, para no robar espacio en móvil */}
      <aside className="hidden flex-col justify-between bg-forest-800 p-12 text-text-inverse lg:flex">
        <div className="flex items-center gap-2.5">
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent-500">
            <Droplets className="size-5 text-white" aria-hidden="true" />
          </span>
          <span className="text-lg font-semibold">Otterly Clean</span>
        </div>

        <div className="max-w-md">
          <p className="text-3xl leading-tight font-semibold text-balance">
            Sabes quién entra a tu casa, cuándo llega y cuándo termina.
          </p>
          <p className="mt-4 text-forest-200">
            Limpieza y lavandería a domicilio en Quito, con profesionales contratados y verificados
            por nosotros.
          </p>
        </div>

        <p className="text-sm text-forest-300">Quito · Ecuador</p>
      </aside>

      <div className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <span className="flex size-9 items-center justify-center rounded-xl bg-forest-600">
              <Droplets className="size-5 text-white" aria-hidden="true" />
            </span>
            <span className="text-lg font-semibold text-forest-800">Otterly Clean</span>
          </div>

          <h1 className="text-2xl font-semibold text-text">Entra a tu cuenta</h1>
          <p className="mt-1.5 text-text-muted">Sigue tus servicios y reserva uno nuevo.</p>

          <form onSubmit={handleSubmit} className="mt-8 space-y-4">
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

          <p className="mt-6 text-center text-sm text-text-muted">
            ¿Aún no tienes cuenta?{' '}
            <Link to="/crear-cuenta" className="font-medium text-forest-600 hover:text-forest-700">
              Crear una cuenta
            </Link>
          </p>

          <p className="mt-8 text-center text-xs text-text-subtle">
            ¿Trabajas con nosotros? Usa el mismo formulario: tu cuenta te lleva a tu panel.
          </p>
        </div>
      </div>
    </main>
  );
}

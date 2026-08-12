import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useAuth } from '@/shared/auth/AuthContext';
import { Alert, Button, Field, Input, Spinner } from '@/shared/ui';
import AuthDialog from './AuthDialog';

/**
 * Activación de una cuenta invitada.
 *
 * Aquí llega quien recibe el enlace de invitación. No se le envió ninguna
 * contraseña: la elige ahora, y el enlace deja de servir en cuanto la usa.
 *
 * El enlace puede haber caducado o haberse usado ya. En los dos casos el
 * backend responde lo mismo, así que aquí se explica una sola cosa —"pide uno
 * nuevo"— en lugar de inventar diagnósticos que no tenemos.
 */
export default function ActivateAccountPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const { applyExternalSession } = useAuth();

  // Sin token no hace falta preguntar nada: el enlace ya está roto de entrada.
  const [state, setState] = useState({
    status: token ? 'checking' : 'invalid',
    invitation: null,
    error: null,
  });
  const [form, setForm] = useState({ password: '', confirmation: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    if (!token) return undefined;

    api
      .get(`/auth/invitations/${token}`)
      .then(({ data }) => {
        if (!cancelled) setState({ status: 'valid', invitation: data.invitation, error: null });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'invalid', invitation: null, error: null });
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  async function handleSubmit(event) {
    event.preventDefault();

    if (form.password !== form.confirmation) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post(`/auth/invitations/${token}/accept`, {
        password: form.password,
      });
      applyExternalSession(data);
      // Entra directamente a completar su perfil: es lo siguiente que necesita.
      navigate('/onboarding', { replace: true });
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos activar tu cuenta.'));
      setSubmitting(false);
    }
  }

  if (state.status === 'checking') {
    return (
      <AuthDialog title="Activando tu cuenta">
        <Spinner label="Comprobando tu invitación" />
      </AuthDialog>
    );
  }

  if (state.status === 'invalid') {
    return (
      <AuthDialog
        title="Este enlace ya no sirve"
        description="Las invitaciones caducan y solo se pueden usar una vez."
        footer={
          <p className="text-center text-sm text-text-muted">
            Pide a la empresa que te envíe uno nuevo, o{' '}
            <Link to="/entrar" className="font-medium text-forest-600 hover:text-forest-700">
              entra con tu cuenta
            </Link>{' '}
            si ya la activaste.
          </p>
        }
      >
        <Alert tone="warning">
          Puede que el enlace haya caducado, que ya lo hayas usado o que se haya enviado uno más
          reciente que sustituye a este.
        </Alert>
      </AuthDialog>
    );
  }

  return (
    <AuthDialog
      title={`Hola, ${state.invitation.firstName}`}
      description="Elige tu contraseña para activar tu cuenta."
      aside={
        <>
          <p className="text-xl leading-tight font-extrabold tracking-tight text-balance">
            Bienvenida al equipo.
          </p>
          <p className="mt-3 text-sm text-forest-100">
            Nadie más conoce esta contraseña: la eliges tú y solo tú.
          </p>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        <Field label="Tu contraseña" hint="Mínimo 8 caracteres." required>
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.password}
            onChange={(event) => setForm({ ...form, password: event.target.value })}
          />
        </Field>

        <Field label="Repítela" required>
          <Input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={form.confirmation}
            onChange={(event) => setForm({ ...form, confirmation: event.target.value })}
          />
        </Field>

        <Button type="submit" size="lg" loading={submitting} className="w-full">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Activar mi cuenta
        </Button>
      </form>
    </AuthDialog>
  );
}

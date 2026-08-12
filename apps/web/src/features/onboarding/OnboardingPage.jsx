import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, PartyPopper } from 'lucide-react';
import { api, errorMessage } from '@/shared/api/client';
import { useAuth, homePathForRoles } from '@/shared/auth/AuthContext';
import { useConfig } from '@/shared/config/ConfigContext';
import BrandMark from '@/shared/ui/BrandMark';
import AddressForm from '@/features/customer/AddressForm';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Field,
  Input,
  Spinner,
  Textarea,
  cx,
} from '@/shared/ui';
import PhotoField from './PhotoField';

/**
 * Completar el perfil.
 *
 * Los pasos no están escritos aquí: los calcula el backend según lo que le
 * falte a esta persona (`GET /api/me/onboarding`). Por eso el mismo asistente
 * sirve para un trabajador recién invitado y para un cliente que se acaba de
 * registrar, y por eso a nadie se le pregunta dos veces lo que ya dio.
 *
 * Quien tiene dos facetas —trabajadora y clienta— las completa una detrás de
 * otra: al terminar la primera, el backend devuelve la siguiente.
 */
export default function OnboardingPage() {
  const navigate = useNavigate();
  const { user, refreshUser, logout } = useAuth();
  const { phonePrefix, phonePlaceholder } = useConfig();

  const [state, setState] = useState(null);
  const [index, setIndex] = useState(0);
  const [values, setValues] = useState({});
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/me/onboarding')
      .then(({ data }) => {
        if (cancelled) return;
        setState(data.onboarding);
        setValues(data.onboarding.values ?? {});
      })
      .catch((requestError) => {
        if (!cancelled) setError(errorMessage(requestError, 'No pudimos cargar tu perfil.'));
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /** Solo se muestran los pasos que tienen algo que pedir. */
  const steps = useMemo(() => (state?.steps ?? []).filter((step) => step.pending), [state]);
  const step = steps[index] ?? null;

  // Sin sesión no hay perfil que completar.
  if (!user) return <Navigate to="/entrar" replace />;

  // Ya está completo: aquí no hay nada que hacer. Esta comprobación es la que
  // evita el bucle "guarda me manda al onboarding, el onboarding me devuelve".
  if (state && !state.pending && !finished) {
    return <Navigate to={homePathForRoles(user.roles)} replace />;
  }

  if (!state) {
    return (
      <Shell>
        {error ? <Alert tone="danger">{error}</Alert> : <Spinner label="Preparando tu perfil" />}
      </Shell>
    );
  }

  const isLast = index === steps.length - 1;

  function setValue(key, value) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  /** Campos del paso que se guardan con PATCH (los demás tienen su propio flujo). */
  function payloadFor(currentStep) {
    const payload = {};
    for (const field of currentStep.fields) {
      if (field.type === 'photo' || field.type === 'address') continue;

      let value = values[field.key];
      if (typeof value === 'string') value = value.trim();
      if (field.type === 'phone' && value) value = normalizePhone(value, phonePrefix);
      if (value === '' || value === undefined) continue;

      payload[field.key] = value;
    }
    return payload;
  }

  function missingInStep(currentStep) {
    return currentStep.fields
      .filter((field) => field.required)
      .filter((field) => {
        const value = values[field.key];
        if (Array.isArray(value)) return value.length === 0;
        if (typeof value === 'boolean') return value === false;
        return value === null || value === undefined || String(value).trim() === '';
      });
  }

  async function goForward() {
    if (!step) return;

    const missing = missingInStep(step);
    if (missing.length > 0) {
      setError(`Completa: ${missing.map((field) => field.label).join(', ')}.`);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = payloadFor(step);
      if (Object.keys(payload).length > 0) {
        const { data } = await api.patch('/me/onboarding', payload);
        setState((current) => ({ ...current, ...data.onboarding }));
      }

      if (!isLast) {
        setIndex((current) => current + 1);
        return;
      }

      const { data } = await api.post('/me/onboarding/complete');
      const refreshed = await refreshUser();

      // Quien es trabajadora y clienta encadena la siguiente faceta sin salir.
      if (data.onboarding.pending) {
        setState(data.onboarding);
        setValues(data.onboarding.values ?? {});
        setIndex(0);
        return;
      }

      setFinished(true);
      setState(data.onboarding);
      setTimeout(() => navigate(homePathForRoles(refreshed?.roles ?? user.roles), { replace: true }), 1400);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos guardar tus datos.'));
    } finally {
      setSaving(false);
    }
  }

  /** El paso de dirección guarda por su cuenta: tiene sus propias reglas. */
  async function saveAddress(payload) {
    setSaving(true);
    setError(null);
    try {
      const { data } = await api.post('/customer/addresses', payload);
      setValue('address', true);
      if (data.serviceArea?.covered === false) {
        setError(
          'Guardamos la dirección, pero todavía no damos servicio en esa ubicación. ' +
            'Puedes continuar y añadir otra más adelante.',
        );
      }
      const refreshed = await api.get('/me/onboarding');
      setState(refreshed.data.onboarding);
      if (!isLast) setIndex((current) => current + 1);
    } catch (requestError) {
      setError(errorMessage(requestError, 'No pudimos guardar la dirección.'));
    } finally {
      setSaving(false);
    }
  }

  if (finished || !step) {
    return (
      <Shell>
        <div className="py-6 text-center">
          <span className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-forest-50 text-forest-700">
            <PartyPopper className="size-6" aria-hidden="true" />
          </span>
          <h1 className="text-xl font-extrabold tracking-tight text-text">Todo listo</h1>
          <p className="mt-1.5 text-sm text-text-muted">Tu perfil está completo. Te llevamos a tu panel.</p>
          <Button
            className="mt-6"
            onClick={() => navigate(homePathForRoles(user.roles), { replace: true })}
          >
            Continuar
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell onLogout={logout}>
      {/* Progreso: cuántos pasos son y en cuál va. */}
      <div className="mb-6">
        <div className="mb-2 flex items-center justify-between text-xs font-medium text-text-muted">
          <span>
            Paso {index + 1} de {steps.length}
          </span>
          <span>{Math.round(((index + 1) / steps.length) * 100)}%</span>
        </div>
        <div className="flex gap-1.5" role="progressbar" aria-valuenow={index + 1} aria-valuemin={1} aria-valuemax={steps.length}>
          {steps.map((entry, position) => (
            <span
              key={entry.code}
              className={cx(
                'h-1.5 flex-1 rounded-full transition-colors',
                position <= index ? 'bg-forest-600' : 'bg-surface-sunken',
              )}
            />
          ))}
        </div>
      </div>

      <h1 className="text-xl font-extrabold tracking-tight text-text">{step.title}</h1>
      {step.description ? <p className="mt-1 text-sm text-text-muted">{step.description}</p> : null}

      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="mt-6 space-y-5">
        {step.fields.map((field) => (
          <OnboardingField
            key={field.key}
            field={field}
            value={values[field.key]}
            phonePlaceholder={phonePlaceholder}
            onChange={(value) => setValue(field.key, value)}
            onSaveAddress={saveAddress}
            saving={saving}
          />
        ))}
      </div>

      <div className="mt-8 flex items-center justify-between gap-3">
        <Button
          type="button"
          variant="ghost"
          disabled={index === 0 || saving}
          onClick={() => {
            setError(null);
            setIndex((current) => Math.max(0, current - 1));
          }}
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          Atrás
        </Button>

        {/* El paso de dirección se confirma con su propio botón de guardar. */}
        {step.fields.some((field) => field.type === 'address') && !values.address ? null : (
          <Button type="button" loading={saving} onClick={goForward}>
            {isLast ? (
              <>
                <Check className="size-4" aria-hidden="true" />
                Listo
              </>
            ) : (
              'Continuar'
            )}
          </Button>
        )}
      </div>
    </Shell>
  );
}

/** Marco de la pantalla: sin navegación, para no invitar a saltársela. */
function Shell({ children, onLogout }) {
  return (
    <div className="min-h-dvh bg-surface">
      <header className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex h-16 max-w-xl items-center justify-between px-5">
          <BrandMark size="md" />
          {onLogout ? (
            <button
              type="button"
              onClick={onLogout}
              className="text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              Salir
            </button>
          ) : null}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-5 py-8">
        <Card className="p-6 sm:p-8">{children}</Card>
      </main>
    </div>
  );
}

/** Un campo del asistente, según el tipo que declara el backend. */
function OnboardingField({ field, value, onChange, onSaveAddress, saving, phonePlaceholder }) {
  if (field.type === 'address') {
    if (value) {
      return (
        <Alert tone="success" title="Dirección guardada">
          Podrás añadir más o editarla desde tu cuenta.
        </Alert>
      );
    }
    return <AddressForm submitting={saving} onSubmit={onSaveAddress} submitLabel="Guardar dirección" />;
  }

  if (field.type === 'photo') {
    return (
      <div>
        <p className="mb-3 text-sm font-medium text-text">{field.label}</p>
        <PhotoField value={value} onChange={onChange} />
      </div>
    );
  }

  if (field.type === 'boolean') {
    return (
      <Checkbox
        label={field.label}
        description={field.hint}
        checked={Boolean(value)}
        onChange={(event) => onChange(event.target.checked)}
      />
    );
  }

  if (field.type === 'textarea') {
    return (
      <Field label={field.label} hint={field.hint} required={field.required}>
        <Textarea rows={4} value={value ?? ''} onChange={(event) => onChange(event.target.value)} />
      </Field>
    );
  }

  if (field.type === 'tags') {
    return (
      <Field label={field.label} hint={field.hint ?? 'Sepáralas con comas.'}>
        <Input
          value={Array.isArray(value) ? value.join(', ') : (value ?? '')}
          onChange={(event) =>
            onChange(
              event.target.value
                .split(',')
                .map((entry) => entry.trim())
                .filter(Boolean),
            )
          }
        />
      </Field>
    );
  }

  return (
    <Field label={field.label} hint={field.hint} required={field.required}>
      <Input
        type={field.type === 'phone' ? 'tel' : 'text'}
        placeholder={field.type === 'phone' ? phonePlaceholder : undefined}
        autoComplete={field.type === 'phone' ? 'tel' : 'off'}
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
}

/** El backend espera E.164; se antepone el prefijo de la región si falta. */
function normalizePhone(phone, prefix) {
  const clean = String(phone).replace(/[\s()-]/g, '');
  if (clean.startsWith('+')) return clean;
  return `${prefix}${clean.replace(/^0/, '')}`;
}

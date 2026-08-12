import { useState } from 'react';
import { api } from '@/shared/api/client';
import { useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import { Alert, Badge, Checkbox, Field, Input, Select } from '@/shared/ui';
import { centsToInput, inputToCents } from '@/shared/format';
import SaveBar from './SaveBar';

/**
 * Parámetros de precio de un plan.
 *
 * El formulario se construye a partir del descriptor que envía el backend
 * (`plan.pricing`), no de una lista escrita aquí: así la pantalla solo puede
 * editar los parámetros que el modelo de precio realmente usa. Un plan por hora
 * muestra "mínimo de horas"; uno por peso, "unidad" y "mínimo facturable".
 *
 * El modelo de precio en sí no se puede cambiar: cada uno necesita datos
 * distintos del cliente al reservar, así que cambiarlo rompería las reservas
 * en curso. Es una decisión de catálogo, no de pantalla.
 */
export default function ServicePlanCard({ serviceType, plan, onSaved }) {
  const { money } = useConfig();
  const { busy: saving, error, execute } = useApiAction();

  const descriptor = plan.pricing;
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState(() => ({
    active: plan.active,
    baseAmount: centsToInput(plan.base_amount),
    config: { ...(plan.config ?? {}) },
  }));

  const dirty =
    form.active !== plan.active ||
    form.baseAmount !== centsToInput(plan.base_amount) ||
    JSON.stringify(form.config) !== JSON.stringify(plan.config ?? {});

  const setField = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  const setConfig = (key, value) => {
    setForm((current) => ({ ...current, config: { ...current.config, [key]: value } }));
    setSaved(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    const payload = { active: form.active, config: form.config };

    if (descriptor?.amount) {
      const cents = inputToCents(form.baseAmount);
      if (cents === null) return;
      payload.baseAmount = cents;
    }

    await execute(() => api.patch(`/operations/services/${serviceType}/plans/${plan.id}`, payload), {
      onSuccess: () => {
        setSaved(true);
        onSaved?.();
      },
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-text">{plan.name}</p>
          <p className="mt-0.5 text-sm text-text-muted">{plan.description}</p>
        </div>
        <Badge tone={descriptor ? 'forest' : 'warning'}>
          {descriptor?.label ?? plan.pricing_model}
        </Badge>
      </div>

      {error ? (
        <div className="mt-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {descriptor?.amount ? (
          <Field
            label={descriptor.amount.label}
            hint={`Actual: ${money(plan.base_amount)}`}
            required
          >
            <Input
              type="number"
              min="0"
              step="0.01"
              required
              value={form.baseAmount}
              onChange={(event) => setField({ baseAmount: event.target.value })}
            />
          </Field>
        ) : null}

        {descriptor?.fields.map((field) => {
          if (field.type === 'number') {
            return (
              <Field key={field.key} label={field.label}>
                <Input
                  type="number"
                  min={field.min}
                  max={field.max}
                  step={field.step}
                  value={form.config[field.key] ?? ''}
                  onChange={(event) =>
                    setConfig(field.key, event.target.value === '' ? '' : Number(event.target.value))
                  }
                />
              </Field>
            );
          }

          if (field.type === 'enum') {
            return (
              <Field key={field.key} label={field.label}>
                <Select
                  value={form.config[field.key] ?? ''}
                  onChange={(event) => setConfig(field.key, event.target.value)}
                >
                  <option value="">Sin definir</option>
                  {field.options.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
            );
          }

          if (field.type === 'amountMap') {
            return (
              <TierEditor
                key={field.key}
                label={field.label}
                tiers={form.config[field.key] ?? {}}
                onChange={(tiers) => setConfig(field.key, tiers)}
              />
            );
          }

          return null;
        })}
      </div>

      <div className="mt-4">
        <Checkbox
          label="Plan disponible para reservar"
          description="Al desactivarlo deja de ofrecerse, pero los pedidos existentes no cambian."
          checked={form.active}
          onChange={(event) => setField({ active: event.target.checked })}
        />
      </div>

      <div className="mt-4">
        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          label="Guardar plan"
          onReset={() => {
            setForm({
              active: plan.active,
              baseAmount: centsToInput(plan.base_amount),
              config: { ...(plan.config ?? {}) },
            });
            setSaved(false);
          }}
        />
      </div>
    </form>
  );
}

/**
 * Tramos de precio por tamaño (modelo FLAT_BY_SIZE).
 * Solo se editan importes: los tramos existentes los define el catálogo, no
 * esta pantalla, para que no aparezcan tamaños que el asistente no sabe pedir.
 */
function TierEditor({ label, tiers, onChange }) {
  const entries = Object.entries(tiers);

  if (entries.length === 0) {
    return (
      <div className="sm:col-span-2">
        <p className="text-sm font-medium text-text">{label}</p>
        <p className="mt-1 text-sm text-text-subtle">
          Este plan todavía no tiene tramos definidos en el catálogo.
        </p>
      </div>
    );
  }

  return (
    <div className="sm:col-span-2">
      <p className="mb-2 text-sm font-medium text-text">{label}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {entries.map(([tier, amount]) => (
          <Field key={tier} label={tier}>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={centsToInput(amount)}
              onChange={(event) => {
                const cents = inputToCents(event.target.value);
                onChange({ ...tiers, [tier]: cents ?? 0 });
              }}
            />
          </Field>
        ))}
      </div>
    </div>
  );
}

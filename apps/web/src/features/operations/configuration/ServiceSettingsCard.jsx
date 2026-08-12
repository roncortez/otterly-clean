import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiAction } from '@/shared/api/useApiQuery';
import {
  Alert,
  Badge,
  Card,
  CardHeader,
  Checkbox,
  Divider,
  Field,
  Input,
  Select,
  Textarea,
} from '@/shared/ui';
import SaveBar from './SaveBar';
import ServicePlanCard from './ServicePlanCard';

/**
 * Configuración comercial de un tipo de servicio.
 *
 * Los tres tipos son fijos —limpieza, lavandería y arreglo de prendas— porque
 * cada uno tiene su máquina de estados y su flujo en el código. Aquí se decide
 * cómo se presentan y si se ofrecen, nunca cómo funcionan.
 */

/** Iconos que la portada sabe pintar. Debe coincidir con SERVICE_ICONS de HomePage. */
const ICON_OPTIONS = ['Sparkles', 'Shirt', 'Scissors'];

export default function ServiceSettingsCard({ service, onSaved }) {
  const { busy: saving, error, execute } = useApiAction();
  const [saved, setSaved] = useState(false);

  const initial = {
    active: service.active,
    displayName: service.label ?? '',
    description: service.description ?? '',
    customerInfo: service.customerInfo ?? '',
    icon: service.icon ?? '',
    imageUrl: service.imageUrl ?? '',
    displayOrder: service.displayOrder ?? 0,
  };

  const [form, setForm] = useState(initial);

  const dirty = Object.keys(initial).some((key) => form[key] !== initial[key]);

  const setField = (patch) => {
    setForm((current) => ({ ...current, ...patch }));
    setSaved(false);
  };

  async function handleSubmit(event) {
    event.preventDefault();

    await execute(
      () =>
        api.patch(`/operations/services/${service.code}`, {
          ...form,
          displayOrder: Number(form.displayOrder),
          // El backend acepta cadena vacía como "sin configurar".
          imageUrl: form.imageUrl || '',
        }),
      {
        onSuccess: () => {
          setSaved(true);
          onSaved?.();
        },
      },
    );
  }

  return (
    <Card>
      <CardHeader
        title={service.label}
        description={`Código de dominio: ${service.code}`}
        action={
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge tone={service.active ? 'success' : 'neutral'}>
              {service.active ? 'Ofrecido' : 'No ofrecido'}
            </Badge>
            {!service.implemented ? <Badge tone="warning">Flujo pendiente</Badge> : null}
          </div>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-4 p-5">
        {error ? <Alert tone="danger">{error}</Alert> : null}

        {/* Un servicio sin flujo implementado se puede configurar, pero el
            cliente no podrá reservarlo aunque se marque como ofrecido. Decirlo
            aquí evita que alguien lo active y crea que ya funciona. */}
        {!service.implemented ? (
          <Alert tone="warning" title="Este servicio todavía no se puede reservar">
            Su configuración comercial ya se guarda, pero falta implementar el flujo de reserva en
            el backend. Marcarlo como ofrecido no lo hará aparecer para el cliente.
          </Alert>
        ) : null}

        <Checkbox
          label="Ofrecer este servicio"
          description="Al desactivarlo desaparece de la portada y el backend rechaza reservas nuevas. Los pedidos en curso no se tocan."
          checked={form.active}
          onChange={(event) => setField({ active: event.target.checked })}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre mostrado" required>
            <Input
              required
              value={form.displayName}
              onChange={(event) => setField({ displayName: event.target.value })}
            />
          </Field>

          <Field label="Orden de aparición" hint="Menor número, más arriba en la portada.">
            <Input
              type="number"
              min="0"
              max="99"
              value={form.displayOrder}
              onChange={(event) => setField({ displayOrder: event.target.value })}
            />
          </Field>

          <Field label="Descripción corta" className="sm:col-span-2">
            <Textarea
              rows={2}
              maxLength={500}
              value={form.description}
              onChange={(event) => setField({ description: event.target.value })}
            />
          </Field>

          <Field
            label="Información para el cliente"
            hint="Texto más largo que se muestra antes de reservar."
            className="sm:col-span-2"
          >
            <Textarea
              rows={3}
              maxLength={2000}
              value={form.customerInfo}
              onChange={(event) => setField({ customerInfo: event.target.value })}
            />
          </Field>

          <Field label="Icono">
            <Select value={form.icon} onChange={(event) => setField({ icon: event.target.value })}>
              <option value="">Sin icono</option>
              {ICON_OPTIONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Imagen (URL)" hint="Si se define, sustituye al icono en la portada.">
            <Input
              type="url"
              value={form.imageUrl}
              onChange={(event) => setField({ imageUrl: event.target.value })}
            />
          </Field>
        </div>

        <SaveBar
          dirty={dirty}
          saving={saving}
          saved={saved}
          onReset={() => {
            setForm(initial);
            setSaved(false);
          }}
        />
      </form>

      <Divider />

      <div className="space-y-3 p-5">
        <div>
          <h3 className="text-sm font-semibold text-text">Precios</h3>
          <p className="mt-0.5 text-sm text-text-muted">
            El cálculo lo hace siempre el backend. Aquí se ajustan los parámetros del modelo de
            cada plan.
          </p>
        </div>

        {service.plans.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
            Este servicio todavía no tiene planes en el catálogo de esta región.
          </p>
        ) : (
          service.plans.map((plan) => (
            <ServicePlanCard
              key={plan.id}
              serviceType={service.code}
              plan={plan}
              onSaved={onSaved}
            />
          ))
        )}

        {service.plans.length > 0 && service.plans.every((plan) => !plan.active) ? (
          <p className="flex items-center gap-2 text-sm text-warning">
            <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
            Ningún plan activo: aunque el servicio esté ofrecido, el cliente no podrá reservarlo.
          </p>
        ) : null}
      </div>
    </Card>
  );
}

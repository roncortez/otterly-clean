import { useState } from 'react';
import { CalendarOff, Plus, Trash2 } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useConfig } from '@/shared/config/ConfigContext';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardHeader,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Select,
  Spinner,
  Textarea,
  cx,
} from '@/shared/ui';
import { formatDateTime, toDateInput } from '@/shared/format';

/**
 * Bloqueos de agenda.
 *
 * Responde a "hoy no aceptamos reservas" o "del 25 al 27 cerramos". Es distinto
 * de la disponibilidad de los trabajadores: aquí se decide cuándo abre la
 * empresa, no cuándo puede trabajar cada persona.
 *
 * Bloquear NO cancela nada: los pedidos ya aceptados siguen en pie. Solo se
 * cierran las reservas nuevas en ese intervalo.
 */

const EMPTY_FORM = {
  serviceType: '',
  startsAt: toDateInput(),
  endsAt: toDateInput(),
  startTime: '',
  endTime: '',
  allDay: true,
  reason: '',
};

export default function BlackoutsPage() {
  const blackoutsQuery = useApiQuery('/operations/booking-blackouts');
  const { serviceTypes } = useConfig();
  const { busy: saving, error: actionError, execute } = useApiAction();

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const blackouts = blackoutsQuery.data?.blackouts ?? [];
  const error = blackoutsQuery.error ?? actionError;

  const setField = (patch) => setForm((current) => ({ ...current, ...patch }));

  async function handleCreate(event) {
    event.preventDefault();

    // Una fecha suelta significa el día completo; con hora, el intervalo exacto.
    const payload = {
      serviceType: form.serviceType || null,
      startsAt: form.allDay ? form.startsAt : `${form.startsAt}T${form.startTime || '00:00'}`,
      endsAt: form.allDay ? form.endsAt : `${form.endsAt}T${form.endTime || '23:59'}`,
      allDay: form.allDay,
      reason: form.reason || null,
    };

    await execute(() => api.post('/operations/booking-blackouts', payload), {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setShowForm(false);
        blackoutsQuery.reload();
      },
    });
  }

  async function toggleActive(blackout) {
    await execute(
      () => api.patch(`/operations/booking-blackouts/${blackout.id}`, { active: !blackout.active }),
      { onSuccess: blackoutsQuery.reload },
    );
  }

  async function remove(blackout) {
    const confirmed = window.confirm(
      '¿Eliminar este bloqueo? La agenda volverá a aceptar reservas en ese intervalo.',
    );
    if (!confirmed) return;

    await execute(() => api.delete(`/operations/booking-blackouts/${blackout.id}`), {
      onSuccess: blackoutsQuery.reload,
    });
  }

  if (blackoutsQuery.loading) return <Spinner label="Cargando bloqueos" />;

  return (
    <div className="max-w-4xl space-y-5">
      {error ? <Alert tone="danger">{error}</Alert> : null}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="max-w-xl text-sm text-text-muted">
          Bloquear un intervalo impide reservas nuevas dentro de él. Los pedidos que ya existían no
          se cancelan, y al terminar el intervalo la agenda vuelve a abrirse sola.
        </p>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)}>
            <Plus className="size-4" aria-hidden="true" />
            Nuevo bloqueo
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <Card>
          <CardHeader
            title="Nuevo bloqueo"
            description="Deja el servicio sin elegir para cerrar la agenda de todos."
          />
          <form onSubmit={handleCreate} className="space-y-4 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Servicio afectado" hint="Sin elegir = todos los servicios.">
                <Select
                  value={form.serviceType}
                  onChange={(event) => setField({ serviceType: event.target.value })}
                >
                  <option value="">Todos los servicios</option>
                  {serviceTypes.map((service) => (
                    <option key={service.code} value={service.code}>
                      {service.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Motivo" hint="Se le muestra al cliente al elegir la fecha.">
                <Input
                  value={form.reason}
                  onChange={(event) => setField({ reason: event.target.value })}
                  placeholder="Feriado, inventario, mantenimiento…"
                  maxLength={300}
                />
              </Field>

              <Field label="Desde" required>
                <Input
                  type="date"
                  required
                  value={form.startsAt}
                  onChange={(event) => setField({ startsAt: event.target.value })}
                />
              </Field>

              <Field label="Hasta" required hint="Mismo día para bloquear una sola jornada.">
                <Input
                  type="date"
                  required
                  min={form.startsAt}
                  value={form.endsAt}
                  onChange={(event) => setField({ endsAt: event.target.value })}
                />
              </Field>
            </div>

            <Checkbox
              label="Día completo"
              description="Desmárcalo para bloquear solo un tramo de horas."
              checked={form.allDay}
              onChange={(event) => setField({ allDay: event.target.checked })}
            />

            {!form.allDay ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Hora de inicio" required>
                  <Input
                    type="time"
                    required
                    value={form.startTime}
                    onChange={(event) => setField({ startTime: event.target.value })}
                  />
                </Field>
                <Field label="Hora de fin" required>
                  <Input
                    type="time"
                    required
                    value={form.endTime}
                    onChange={(event) => setField({ endTime: event.target.value })}
                  />
                </Field>
              </div>
            ) : null}

            <div className="flex gap-3 pt-1">
              <Button type="submit" loading={saving}>
                Crear bloqueo
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      {blackouts.length === 0 ? (
        <EmptyState
          icon={CalendarOff}
          title="La agenda está completamente abierta"
          description="No hay ningún bloqueo. Crea uno para cerrar un día, un tramo de horas o un rango de fechas."
        />
      ) : (
        <div className="space-y-2.5">
          {blackouts.map((blackout) => (
            <BlackoutRow
              key={blackout.id}
              blackout={blackout}
              serviceTypes={serviceTypes}
              busy={saving}
              onToggle={() => toggleActive(blackout)}
              onDelete={() => remove(blackout)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function BlackoutRow({ blackout, serviceTypes, busy, onToggle, onDelete }) {
  const service = serviceTypes.find((entry) => entry.code === blackout.service_type);
  const expired = new Date(blackout.ends_at) < new Date();

  return (
    <Card className={cx('flex flex-wrap items-center gap-4 p-4', !blackout.active && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-text">
            {formatDateTime(blackout.starts_at)} — {formatDateTime(blackout.ends_at)}
          </p>
          <Badge tone={blackout.service_type ? 'forest' : 'accent'}>
            {service?.label ?? (blackout.service_type ? blackout.service_type : 'Todos los servicios')}
          </Badge>
          {!blackout.active ? <Badge tone="neutral">Desactivado</Badge> : null}
          {expired && blackout.active ? <Badge tone="neutral">Ya pasó</Badge> : null}
        </div>
        {blackout.reason ? (
          <p className="mt-1 text-sm text-text-muted">{blackout.reason}</p>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onToggle} disabled={busy}>
          {blackout.active ? 'Desactivar' : 'Reactivar'}
        </Button>
        <button
          type="button"
          onClick={onDelete}
          disabled={busy}
          className="rounded-lg p-2 text-text-subtle transition-colors hover:bg-danger-soft hover:text-danger disabled:opacity-50"
          aria-label="Eliminar bloqueo"
          title="Eliminar bloqueo"
        >
          <Trash2 className="size-4" aria-hidden="true" />
        </button>
      </div>
    </Card>
  );
}

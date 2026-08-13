import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';
import { counted } from '@/shared/format';
import { Alert, Button, Checkbox, Field, Input, Select, Textarea } from '@/shared/ui';

/**
 * Los datos de un espacio: qué hay que saber para limpiarlo.
 *
 * Existe una sola vez y se usa en los dos sitios donde se pregunta esto —la
 * pantalla "Mis espacios" y el asistente de reserva—, porque son la misma
 * pregunta. Cuando eran dos formularios, cada uno preguntaba cosas distintas: el
 * asistente pedía qué mascotas hay y la ficha no, la ficha guardaba unas notas
 * que ningún campo mostraba. Un concepto partido en dos mitades incompletas.
 *
 * Lo que aparece aquí es exactamente lo que el backend considera permanente del
 * lugar (`domain/cleaning/homeProfile.js`). Lo de cada visita —qué priorizar hoy,
 * si estarás en casa, cuánto tiempo— no está aquí y se pregunta al reservar.
 *
 * Los dos usos guardan en el mismo endpoint:
 * `PATCH /customer/addresses/:id/cleaning-profile`.
 */

export const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'HOUSE', label: 'Casa' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

export const ACCESS_METHODS = [
  { value: 'CUSTOMER_OPENS', label: 'Abro yo', needsSecret: false },
  { value: 'CONCIERGE', label: 'Portería o recepción', needsSecret: false },
  { value: 'DOOR_CODE', label: 'Código de puerta', needsSecret: true },
  { value: 'KEY', label: 'Llave escondida', needsSecret: true },
  { value: 'LOCKBOX', label: 'Caja de seguridad', needsSecret: true },
  { value: 'OTHER', label: 'Otro', needsSecret: false },
];

export function propertyTypeLabel(value) {
  return PROPERTY_TYPES.find((type) => type.value === value)?.label ?? value;
}

export function accessMethodLabel(value) {
  return ACCESS_METHODS.find((method) => method.value === value)?.label ?? value;
}

const EMPTY = {
  propertyType: 'APARTMENT',
  bedrooms: 1,
  bathrooms: 1,
  areaValue: '',
  hasPets: false,
  petType: '',
  petCount: 1,
  petInstructions: '',
  accessMethod: 'CUSTOMER_OPENS',
  accessSecret: '',
  accessInstructions: '',
  parkingInstructions: '',
  notes: '',
};

function toForm(profile) {
  if (!profile) return { ...EMPTY };

  const pet = profile.pets?.[0] ?? null;
  return {
    ...EMPTY,
    propertyType: profile.propertyType ?? EMPTY.propertyType,
    bedrooms: profile.bedrooms ?? EMPTY.bedrooms,
    bathrooms: profile.bathrooms ?? EMPTY.bathrooms,
    areaValue: profile.areaValue ?? '',
    hasPets: profile.hasPets ?? false,
    petType: pet?.type ?? '',
    petCount: pet?.count ?? 1,
    petInstructions: profile.petInstructions ?? '',
    accessMethod: profile.accessMethod ?? EMPTY.accessMethod,
    // El código guardado no vuelve del servidor: se escribe uno nuevo o se deja
    // en blanco para conservar el que ya hay.
    accessSecret: '',
    accessInstructions: profile.accessInstructions ?? '',
    parkingInstructions: profile.parkingInstructions ?? '',
    notes: profile.notes ?? '',
  };
}

/** El cuerpo que espera la API, con el mismo vocabulario que el dominio. */
function toPayload(form, areaUnit) {
  const payload = {
    propertyType: form.propertyType,
    bedrooms: Number(form.bedrooms) || 0,
    bathrooms: Number(form.bathrooms) || 0,
    areaValue: form.areaValue === '' || form.areaValue === null ? null : Number(form.areaValue),
    areaUnit,
    hasPets: form.hasPets,
    // Sin mascotas no hay nada que describir: se limpia en lugar de dejar restos
    // de una respuesta anterior.
    pets: form.hasPets && form.petType.trim() ? [{ type: form.petType.trim(), count: Number(form.petCount) || 1 }] : [],
    petInstructions: form.hasPets ? form.petInstructions || null : null,
    accessMethod: form.accessMethod,
    accessInstructions: form.accessInstructions || null,
    parkingInstructions: form.parkingInstructions || null,
    notes: form.notes || null,
  };

  // Solo se envía si se escribió algo: mandar cadena vacía significaría
  // "bórralo", y guardar el resto de la ficha no puede borrar la clave.
  if (form.accessSecret) payload.accessSecret = form.accessSecret;

  return payload;
}

export default function HomeProfileForm({
  profile = null,
  busy = false,
  submitLabel = 'Guardar',
  onSubmit,
  onCancel,
  cancelLabel = 'Cancelar',
}) {
  const { areaUnit } = useConfig();
  const [form, setForm] = useState(() => toForm(profile));

  const set = (patch) => setForm((current) => ({ ...current, ...patch }));
  const method = ACCESS_METHODS.find((entry) => entry.value === form.accessMethod);

  function handleSubmit(event) {
    event.preventDefault();
    onSubmit(toPayload(form, areaUnit));
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tipo de lugar">
          <Select
            value={form.propertyType}
            onChange={(event) => set({ propertyType: event.target.value })}
          >
            {PROPERTY_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Habitaciones">
          <Input
            type="number"
            min="0"
            max="20"
            value={form.bedrooms}
            onChange={(event) => set({ bedrooms: event.target.value })}
          />
        </Field>
        <Field label="Baños" required>
          <Input
            type="number"
            min="1"
            max="20"
            required
            value={form.bathrooms}
            onChange={(event) => set({ bathrooms: event.target.value })}
          />
        </Field>
      </div>

      <Field label={`Tamaño aproximado (${areaUnit})`} hint="Opcional. Ayuda a estimar el tiempo.">
        <Input
          type="number"
          min="1"
          value={form.areaValue}
          onChange={(event) => set({ areaValue: event.target.value })}
          placeholder="95"
        />
      </Field>

      <Field label="¿Cómo entra el profesional?">
        <Select
          value={form.accessMethod}
          onChange={(event) => set({ accessMethod: event.target.value })}
        >
          {ACCESS_METHODS.map((entry) => (
            <option key={entry.value} value={entry.value}>
              {entry.label}
            </option>
          ))}
        </Select>
      </Field>

      {method?.needsSecret && (
        <div className="space-y-3">
          <Alert tone="info" title="Se guarda cifrado">
            Solo lo ve el profesional que confirmó tu servicio, y queda registrado quién lo consultó
            y cuándo.
          </Alert>
          <Field
            label={form.accessMethod === 'DOOR_CODE' ? 'Código' : 'Dónde está la llave'}
            required={!profile?.hasAccessSecret}
            hint={
              profile?.hasAccessSecret
                ? 'Ya tienes uno guardado aquí: escribe solo si cambió.'
                : undefined
            }
          >
            <Input
              value={form.accessSecret}
              onChange={(event) => set({ accessSecret: event.target.value })}
              placeholder={form.accessMethod === 'DOOR_CODE' ? '4821#' : 'Bajo la maceta…'}
              autoComplete="off"
              required={!profile?.hasAccessSecret}
            />
          </Field>
        </div>
      )}

      <Field label="Cómo llegar y entrar" hint="Piso, timbre, a quién preguntar.">
        <Textarea
          value={form.accessInstructions}
          onChange={(event) => set({ accessInstructions: event.target.value })}
          placeholder="Edificio Torre Azul, timbre 5B. Preguntar por Andrés en recepción."
        />
      </Field>

      <Field label="Estacionamiento" hint="Opcional.">
        <Input
          value={form.parkingInstructions}
          onChange={(event) => set({ parkingInstructions: event.target.value })}
          placeholder="Visitas en el subsuelo 1"
        />
      </Field>

      <div className="space-y-3">
        <Checkbox
          label="Hay mascotas aquí"
          description="Así el profesional llega preparado."
          checked={form.hasPets}
          onChange={(event) => set({ hasPets: event.target.checked })}
        />

        {form.hasPets && (
          <div className="grid gap-4 rounded-xl bg-surface-sunken p-4 sm:grid-cols-2">
            <Field label="Cuáles">
              <Input
                value={form.petType}
                onChange={(event) => set({ petType: event.target.value })}
                placeholder="Perro, gato…"
              />
            </Field>
            <Field label="Cuántas">
              <Input
                type="number"
                min="1"
                max="20"
                value={form.petCount}
                onChange={(event) => set({ petCount: event.target.value })}
              />
            </Field>
            <Field label="Algo que debamos saber de ellas" className="sm:col-span-2">
              <Input
                value={form.petInstructions}
                onChange={(event) => set({ petInstructions: event.target.value })}
                placeholder="Rocky es amistoso pero no debe salir al pasillo."
              />
            </Field>
          </div>
        )}
      </div>

      <Field
        label="Instrucciones fijas de este lugar"
        hint="Lo que vale para todas las visitas: el timbre no funciona, no mover los cuadros de la sala."
      >
        <Textarea
          value={form.notes}
          onChange={(event) => set({ notes: event.target.value })}
          placeholder="El timbre no funciona, mejor llamar por teléfono."
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
        )}
      </div>
    </form>
  );
}

/** Resumen de una ficha para leerla de un vistazo, sin abrir el formulario. */
export function homeProfileSummary(profile, areaUnit) {
  if (!profile) return [];

  const parts = [
    propertyTypeLabel(profile.propertyType),
    counted(profile.bedrooms, 'habitación', 'habitaciones'),
    counted(profile.bathrooms, 'baño', 'baños'),
  ];

  if (profile.areaValue) parts.push(`${profile.areaValue} ${profile.areaUnit ?? areaUnit}`);
  if (profile.hasPets) parts.push(profile.pets?.[0]?.type ? `mascotas: ${profile.pets[0].type}` : 'con mascotas');

  return parts;
}

/** Aviso de que hay una clave guardada, sin decir cuál. */
export function AccessSecretBadge() {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-warning">
      <KeyRound className="size-3.5" aria-hidden="true" />
      Acceso guardado y cifrado
    </span>
  );
}

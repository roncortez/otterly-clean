import { ShieldCheck, PawPrint } from 'lucide-react';
import { Field, Input, Textarea, Select, Checkbox, OptionCard, Divider, Alert } from '@/shared/ui';

/**
 * Paso 5: acceso, mascotas e instrucciones.
 *
 * Es el paso más delicado del producto: aquí el cliente entrega la llave de su
 * casa. Se le dice explícitamente qué hacemos con ese dato en lugar de pedirlo
 * sin más.
 */
export default function StepInstructions(props) {
  return props.booking.serviceType === 'CLEANING' ? (
    <CleaningInstructions {...props} />
  ) : (
    <LaundryInstructions {...props} />
  );
}

const ACCESS_METHODS = [
  { value: 'CUSTOMER_OPENS', label: 'Yo abro la puerta', needsSecret: false },
  { value: 'CONCIERGE', label: 'Portería o recepción', needsSecret: false },
  { value: 'DOOR_CODE', label: 'Código de puerta', needsSecret: true },
  { value: 'KEY', label: 'Llave escondida', needsSecret: true },
  { value: 'LOCKBOX', label: 'Caja de seguridad', needsSecret: true },
  { value: 'OTHER', label: 'Otro', needsSecret: false },
];

function CleaningInstructions({ booking, update, updateDetail }) {
  const { cleaning } = booking;
  const method = ACCESS_METHODS.find((entry) => entry.value === cleaning.accessMethod);

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Acceso y detalles</h2>
        <p className="mt-1 text-text-muted">
          Esto es lo que le llega al profesional el día del servicio.
        </p>
      </div>

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">¿Estarás en casa?</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <OptionCard
            selected={cleaning.customerPresent}
            onSelect={() => updateDetail('cleaning', { customerPresent: true })}
            title="Sí, estaré"
            description="Recibes al profesional en persona."
          />
          <OptionCard
            selected={!cleaning.customerPresent}
            onSelect={() => updateDetail('cleaning', { customerPresent: false })}
            title="No estaré"
            description="Sigues todo el servicio desde la app."
          />
        </div>
      </div>

      <Field label="¿Cómo entra el profesional?">
        <Select
          value={cleaning.accessMethod}
          onChange={(event) => updateDetail('cleaning', { accessMethod: event.target.value })}
        >
          {ACCESS_METHODS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {method?.needsSecret && (
        <div className="space-y-3">
          <Alert tone="info" title="Guardamos esto cifrado">
            Solo el profesional asignado puede verlo, únicamente el día del servicio, y queda
            registrado quién lo consultó y cuándo.
          </Alert>
          <Field
            label={cleaning.accessMethod === 'DOOR_CODE' ? 'Código' : 'Dónde está la llave'}
            required
          >
            <Input
              value={cleaning.accessSecret}
              onChange={(event) => updateDetail('cleaning', { accessSecret: event.target.value })}
              placeholder={cleaning.accessMethod === 'DOOR_CODE' ? '4821#' : 'Bajo la maceta…'}
              autoComplete="off"
            />
          </Field>
        </div>
      )}

      <Field label="Instrucciones para llegar y entrar" hint="Piso, timbre, a quién preguntar.">
        <Textarea
          value={cleaning.accessInstructions}
          onChange={(event) => updateDetail('cleaning', { accessInstructions: event.target.value })}
          placeholder="Edificio Torre Azul, timbre 5B. Preguntar por Andrés en recepción."
        />
      </Field>

      <Field label="Estacionamiento" hint="Opcional.">
        <Input
          value={cleaning.parkingInstructions}
          onChange={(event) =>
            updateDetail('cleaning', { parkingInstructions: event.target.value })
          }
          placeholder="Visitas en el subsuelo 1"
        />
      </Field>

      <Divider />

      <div className="space-y-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-text">
          <PawPrint className="size-4 text-text-subtle" aria-hidden="true" />
          Mascotas
        </p>

        <Checkbox
          label="Hay mascotas en casa"
          description="Así el profesional llega preparado."
          checked={cleaning.hasPets}
          onChange={(event) => updateDetail('cleaning', { hasPets: event.target.checked })}
        />

        {cleaning.hasPets && (
          <div className="space-y-4 rounded-xl bg-surface-sunken p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Tipo">
                <Input
                  value={cleaning.pets[0]?.type ?? ''}
                  onChange={(event) =>
                    updateDetail('cleaning', {
                      pets: [{ ...(cleaning.pets[0] ?? { count: 1 }), type: event.target.value }],
                    })
                  }
                  placeholder="Perro, gato…"
                />
              </Field>
              <Field label="Cuántas">
                <Input
                  type="number"
                  min="1"
                  max="20"
                  value={cleaning.pets[0]?.count ?? 1}
                  onChange={(event) =>
                    updateDetail('cleaning', {
                      pets: [
                        {
                          ...(cleaning.pets[0] ?? { type: '' }),
                          count: Number(event.target.value) || 1,
                        },
                      ],
                    })
                  }
                />
              </Field>
            </div>

            <Checkbox
              label="Estarán en un espacio aparte durante el servicio"
              checked={cleaning.petsSecured === true}
              onChange={(event) => updateDetail('cleaning', { petsSecured: event.target.checked })}
            />

            <Field label="Algo que debamos saber" hint="Carácter, si no puede salir, dónde estará.">
              <Input
                value={cleaning.petInstructions}
                onChange={(event) =>
                  updateDetail('cleaning', { petInstructions: event.target.value })
                }
                placeholder="Rocky es amistoso pero no debe salir al pasillo."
              />
            </Field>
          </div>
        )}
      </div>

      <Divider />

      <Field
        label="Objetos delicados"
        hint="Cosas que preferirías que no se muevan o se traten con cuidado."
      >
        <Textarea
          value={cleaning.delicateItems}
          onChange={(event) => updateDetail('cleaning', { delicateItems: event.target.value })}
          placeholder="Los cuadros de la sala y el jarrón del recibidor."
        />
      </Field>

      <Field label="Cualquier otra cosa">
        <Textarea
          value={booking.customerNotes}
          onChange={(event) => update({ customerNotes: event.target.value })}
          placeholder="El timbre no funciona, mejor llamar por teléfono."
        />
      </Field>
    </div>
  );
}

function LaundryInstructions({ booking, update, updateDetail }) {
  const { laundry } = booking;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Recogida e instrucciones</h2>
        <p className="mt-1 text-text-muted">
          Cuanto más claro esté, menos posibilidad de que algo se trate mal.
        </p>
      </div>

      <Field label="¿Cómo recogemos la ropa?" hint="Dónde la dejas o con quién la coordinamos.">
        <Textarea
          value={laundry.pickupInstructions}
          onChange={(event) => updateDetail('laundry', { pickupInstructions: event.target.value })}
          placeholder="Dejo las bolsas con el conserje del edificio."
        />
      </Field>

      <Divider />

      <div className="rounded-xl border border-warning/20 bg-warning-soft p-4">
        <p className="flex items-center gap-1.5 text-sm font-medium text-warning">
          <ShieldCheck className="size-4" aria-hidden="true" />
          Lo que no debemos procesar
        </p>
        <p className="mt-1 text-sm text-warning/90">
          Si una prenda no debe lavarse, escríbela aquí. La separamos y te la devolvemos intacta.
        </p>
        <div className="mt-3">
          <Textarea
            value={laundry.doNotProcessItems}
            onChange={(event) =>
              updateDetail('laundry', { doNotProcessItems: event.target.value })
            }
            placeholder="Saco de lana gris, chaqueta de cuero."
          />
        </div>
      </div>

      <Field label="Prendas delicadas" hint="Las lavamos con cuidado especial.">
        <Textarea
          value={laundry.delicateItems}
          onChange={(event) => updateDetail('laundry', { delicateItems: event.target.value })}
          placeholder="Blusas de seda, ropa interior de encaje."
        />
      </Field>

      <Field label="Cualquier otra cosa">
        <Textarea
          value={booking.customerNotes}
          onChange={(event) => update({ customerNotes: event.target.value })}
          placeholder="Prefiero que doblen las camisas en lugar de colgarlas."
        />
      </Field>
    </div>
  );
}

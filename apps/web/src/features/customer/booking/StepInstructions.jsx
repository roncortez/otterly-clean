import { ShieldCheck, PawPrint, KeyRound } from 'lucide-react';
import { Field, Textarea, Checkbox, OptionCard, Divider, Button } from '@/shared/ui';
import { accessMethodLabel } from '../cleaning/HomeProfileForm';

/**
 * Lo que hace falta saber de ESTE día.
 *
 * Cómo se entra, si hay mascotas y qué instrucciones fijas tiene el lugar son
 * datos del espacio y ya están guardados: aquí se muestran para que la persona
 * los reconozca, con un atajo para corregirlos donde viven. Lo que sí se
 * pregunta es lo que cambia de una visita a otra: si estarás en casa, si hoy las
 * mascotas quedan aparte, qué cuidar esta vez.
 */
export default function StepInstructions(props) {
  return props.booking.serviceType === 'CLEANING' ? (
    <CleaningInstructions {...props} />
  ) : (
    <LaundryInstructions {...props} />
  );
}

function CleaningInstructions({ booking, update, updateDetail, selectedAddress, goToStep }) {
  const { cleaning } = booking;
  const profile = selectedAddress?.cleaningProfile ?? null;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">El día del servicio</h2>
        <p className="mt-1 text-text-muted">
          Esto es lo último: lo que cambia de una visita a otra.
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

      {/* Del espacio, no de esta visita: se recuerda y se corrige donde vive. */}
      {profile && (
        <div className="rounded-xl border border-border bg-surface-sunken/60 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1 text-sm">
              <p className="font-medium text-text">Cómo entra el profesional</p>
              <p className="text-text-muted">
                {accessMethodLabel(profile.accessMethod)}
                {profile.hasAccessSecret && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-warning">
                    <KeyRound className="size-3.5" aria-hidden="true" />
                    con la clave que guardaste
                  </span>
                )}
              </p>
              {profile.accessInstructions && (
                <p className="text-text-subtle">{profile.accessInstructions}</p>
              )}
              {profile.hasPets && (
                <p className="flex items-center gap-1.5 text-text-subtle">
                  <PawPrint className="size-3.5" aria-hidden="true" />
                  {profile.pets?.[0]?.type
                    ? `${profile.pets[0].count} ${profile.pets[0].type}`
                    : 'Con mascotas'}
                </p>
              )}
            </div>
            {goToStep && (
              <Button size="sm" variant="ghost" onClick={() => goToStep('space')}>
                Cambiar
              </Button>
            )}
          </div>
        </div>
      )}

      {profile?.hasPets && (
        <Checkbox
          label="Hoy estarán en un espacio aparte"
          description="Solo para esta visita."
          checked={cleaning.petsSecured === true}
          onChange={(event) => updateDetail('cleaning', { petsSecured: event.target.checked })}
        />
      )}

      <Divider />

      <Field
        label="Algo delicado que cuidar esta vez"
        hint="Lo que valga para todas las visitas va en los datos del espacio."
      >
        <Textarea
          value={cleaning.delicateItems}
          onChange={(event) => updateDetail('cleaning', { delicateItems: event.target.value })}
          placeholder="Acabo de colgar un cuadro en la sala."
        />
      </Field>

      <Field label="Cualquier otra cosa">
        <Textarea
          value={booking.customerNotes}
          onChange={(event) => update({ customerNotes: event.target.value })}
          placeholder="Llego a las 10, mejor después de esa hora."
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

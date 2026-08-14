import { useFragrances } from '@/shared/catalog/options';
import { Field, Input, Select, Textarea, Checkbox, OptionCard, Divider, cx } from '@/shared/ui';

/**
 * Paso 2 (configuración del servicio): define los detalles del trabajo.
 *
 * Cada servicio tiene su propia vista porque sus dimensiones son distintas:
 *   - Limpieza:   duración, áreas prioritarias, productos, fragancia.
 *   - Lavandería: cantidad estimada, temperatura, detergente, secado.
 *   - Kits:       cantidad de kits e instrucciones de entrega.
 *
 * La identidad del espacio (tipo de propiedad, habitaciones, baños) se pide
 * en el paso 3 (Dónde y cómo), junto a la dirección, para que el lugar sea
 * una sola cosa cohesiva.
 */
export default function StepConfigure(props) {
  const { booking } = props;
  if (booking.serviceType === 'LAUNDRY') return <LaundryStep {...props} />;
  if (booking.serviceType === 'KITS') return <KitsStep    {...props} />;
  return <CleaningStep {...props} />;
}

/**
 * A qué quieres que huela.
 *
 * Las opciones vienen del catálogo (`GET /api/catalog/fragrances`), no de un
 * array aquí: era un campo de texto libre, y "lavanda", "Lavanda" y "el que
 * huela rico" eran tres preferencias distintas para quien tiene que elegir el
 * producto. Ahora se guarda un código, y Operaciones puede añadir o retirar
 * fragancias sin desplegar.
 *
 * Se usa igual en limpieza y en lavandería: es la misma lista porque el cliente
 * no entiende por qué su casa puede oler a lavanda y su ropa no.
 *
 * Si el catálogo no responde, el campo no se pinta en lugar de ofrecer un
 * desplegable vacío: la fragancia es opcional y la reserva puede seguir.
 */
function FragranceField({ value, onChange, className }) {
  const { fragrances, loading } = useFragrances();

  if (loading || fragrances.length === 0) return null;

  const selected = fragrances.find((option) => option.code === value) ?? null;

  return (
    <Field
      label="Preferencia de fragancia"
      className={className}
      hint={selected?.description ?? 'Opcional.'}
    >
      <Select value={value ?? ''} onChange={(event) => onChange(event.target.value || null)}>
        <option value="">Sin preferencia</option>
        {fragrances.map((option) => (
          <option key={option.code} value={option.code}>
            {option.label}
          </option>
        ))}
      </Select>
    </Field>
  );
}

// =============================================================================
// LIMPIEZA
// =============================================================================

const PRIORITY_AREAS = ['Cocina', 'Baños', 'Dormitorios', 'Sala', 'Comedor', 'Balcón', 'Lavandería'];

/**
 * Opciones de duración. Se muestran solo las que son iguales o mayores al
 * mínimo que define el plan elegido; si el plan tiene 5h mínimo no tiene
 * sentido ofrecer 2h.
 */
const DURATIONS = [
  { minutes: 120, label: '2 horas', hint: 'Área pequeña' },
  { minutes: 180, label: '3 horas', hint: 'Lo más habitual' },
  { minutes: 240, label: '4 horas', hint: 'Casa grande' },
  { minutes: 300, label: '5 horas', hint: 'Profunda completa' },
  { minutes: 360, label: '6 horas', hint: 'Limpieza a fondo' },
  { minutes: 480, label: '8 horas', hint: 'Espacio muy grande' },
];

function CleaningStep({ booking, update, updateDetail, service, money }) {
  const { cleaning } = booking;
  const extras = service?.extras ?? [];

  const toggleArea = (area) => {
    const areas = cleaning.priorityAreas.includes(area)
      ? cleaning.priorityAreas.filter((item) => item !== area)
      : [...cleaning.priorityAreas, area];
    updateDetail('cleaning', { priorityAreas: areas });
  };

  // Buscamos los extras de ropa in situ en el catálogo para obtener sus precios.
  const insituWDF = extras.find((e) => e.code === 'CLEAN-IN-SITU-WASH-DRY-FOLD');
  const insituWDFI = extras.find((e) => e.code === 'CLEAN-IN-SITU-WASH-DRY-FOLD-IRON');
  const insituIron = extras.find((e) => e.code === 'CLEAN-IN-SITU-IRON');

  const selectedInSitu = booking.extraCodes.find((c) => c.startsWith('CLEAN-IN-SITU-')) || null;

  const handleSelectInSitu = (code) => {
    // Filtramos cualquier código in-situ previo
    const filtered = booking.extraCodes.filter((c) => !c.startsWith('CLEAN-IN-SITU-'));
    if (code) {
      update({ extraCodes: [...filtered, code] });
    } else {
      update({ extraCodes: filtered });
    }
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Cómo quieres tu limpieza</h2>
        <p className="mt-1 text-text-muted">
          Cuéntanos qué es lo más importante e indícanos si necesitas adicionales de ropa.
        </p>
      </div>

      <p className="text-sm font-medium text-text">¿Qué es lo más importante?</p>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          {PRIORITY_AREAS.map((area) => {
            const selected = cleaning.priorityAreas.includes(area);
            return (
              <button
                key={area}
                type="button"
                onClick={() => toggleArea(area)}
                aria-pressed={selected}
                className={cx(
                  'cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-forest-500 bg-forest-600 text-white'
                    : 'border-border bg-surface-raised text-text-muted hover:border-border-strong',
                )}
              >
                {area}
              </button>
            );
          })}
        </div>

      </div>


      <Divider />

      <div>
        <p className="mb-1 text-sm font-bold text-text">Adicional</p>
        <p className="mb-3 text-xs text-text-subtle">
          Se realiza con los equipos e insumos del cliente. Elige una opción adicional si lo requieres.
        </p>
        <div className="space-y-2.5">
          <OptionCard
            selected={selectedInSitu === null}
            onSelect={() => handleSelectInSitu(null)}
            title="Ninguno"
            description="No requiero servicio adicional de ropa."
          />
          {/*
            Sin descripción: el nombre del catálogo ya es la lista completa de
            lo que incluye ("Lavado + secado + doblado (ropa in situ)"), y
            repetirla debajo en prosa no añadía ni un dato.
          */}
          {insituWDF && (
            <OptionCard
              selected={selectedInSitu === insituWDF.code}
              onSelect={() => handleSelectInSitu(insituWDF.code)}
              title={insituWDF.name}
              meta={`+${money(insituWDF.amount)}`}
            />
          )}
          {insituWDFI && (
            <OptionCard
              selected={selectedInSitu === insituWDFI.code}
              onSelect={() => handleSelectInSitu(insituWDFI.code)}
              title={insituWDFI.name}
              meta={`+${money(insituWDFI.amount)}`}
            />
          )}
          {insituIron && (
            <OptionCard
              selected={selectedInSitu === insituIron.code}
              onSelect={() => handleSelectInSitu(insituIron.code)}
              title={insituIron.name}
              meta={`+${money(insituIron.amount)}`}
            />
          )}
        </div>
      </div>

      <Divider />

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">Productos de limpieza</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <OptionCard
            selected={cleaning.suppliesProvidedBy === 'COMPANY'}
            onSelect={() => updateDetail('cleaning', { suppliesProvidedBy: 'COMPANY' })}
            title="Los llevamos nosotros"
            description="Incluidos en el precio."
          />
          <OptionCard
            selected={cleaning.suppliesProvidedBy === 'CUSTOMER'}
            onSelect={() => updateDetail('cleaning', { suppliesProvidedBy: 'CUSTOMER' })}
            title="Uso los míos"
            description="Prefieres tus propios productos."
          />
        </div>
        <FragranceField
          className="mt-4"
          value={cleaning.fragrancePreference}
          onChange={(code) => updateDetail('cleaning', { fragrancePreference: code })}
        />
      </div>

      <Divider />

      <Field label="Instrucciones especiales" className="mt-4" hint="Opcional.">
        <Textarea
          value={cleaning.specialInstructions || ''}
          onChange={(event) =>
            updateDetail('cleaning', { specialInstructions: event.target.value })
          }
          placeholder="Ej: Limpiar el horno, lavar ventanas, etc."
        />
      </Field>
    </div>
  );
}

// =============================================================================
// LAVANDERÍA
// =============================================================================

const WASH_TEMPERATURES = [
  { value: 'COLD', label: 'Fría', hint: 'Cuida los colores' },
  { value: 'WARM', label: 'Tibia', hint: 'Uso diario' },
  { value: 'HOT', label: 'Caliente', hint: 'Blancos y toallas' },
];

const DETERGENTS = [
  { value: 'STANDARD', label: 'Estándar' },
  { value: 'HYPOALLERGENIC', label: 'Hipoalergénico' },
  { value: 'FRAGRANCE_FREE', label: 'Sin fragancia' },
  { value: 'CUSTOMER_PROVIDED', label: 'El mío' },
];

const DRYING = [
  { value: 'MACHINE', label: 'Secadora', hint: 'Todo a máquina' },
  { value: 'HANG_DRY', label: 'Al aire', hint: 'Nada de secadora' },
  { value: 'MIXED', label: 'Mixto', hint: 'Te indico qué colgar' },
];

function LaundryStep({ booking, update, updateDetail, service, money, weightUnit }) {
  const { laundry } = booking;
  const plan = service?.plans.find((entry) => entry.id === booking.planId);
  const extras = service?.extras ?? [];

  const toggleExtra = (code) => {
    const codes = booking.extraCodes.includes(code)
      ? booking.extraCodes.filter((item) => item !== code)
      : [...booking.extraCodes, code];
    update({ extraCodes: codes });
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">¿Cuánta ropa y cómo la tratamos?</h2>
        <p className="mt-1 text-text-muted">
          El peso final lo confirmamos al recibirla; esto es solo para estimar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Bolsas aproximadas">
          <Input
            type="number"
            min="1"
            max="50"
            value={laundry.estimatedBags}
            onChange={(event) =>
              updateDetail('laundry', { estimatedBags: Number(event.target.value) || 1 })
            }
          />
        </Field>

        {plan?.pricing_model === 'PER_WEIGHT' && (
          <Field
            label={`Peso estimado (${weightUnit})`}
            hint={
              plan.config?.minimumUnits
                ? `Mínimo facturable: ${plan.config.minimumUnits} ${weightUnit}.`
                : undefined
            }
          >
            <Input
              type="number"
              min="1"
              step="0.5"
              value={laundry.estimatedWeight}
              onChange={(event) =>
                updateDetail('laundry', { estimatedWeight: Number(event.target.value) || 1 })
              }
            />
          </Field>
        )}
      </div>

      <Divider />

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">Temperatura de lavado</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {WASH_TEMPERATURES.map((option) => (
            <OptionCard
              key={option.value}
              selected={laundry.washTemperature === option.value}
              onSelect={() => updateDetail('laundry', { washTemperature: option.value })}
              title={option.label}
              description={option.hint}
            />
          ))}
        </div>
      </div>

      <Field label="Detergente">
        <Select
          value={laundry.detergentPreference}
          onChange={(event) => updateDetail('laundry', { detergentPreference: event.target.value })}
        >
          {DETERGENTS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>

      {/*
        Detergente y fragancia responden a cosas distintas y antes se
        contestaban con el mismo campo: que un detergente sea 'FRAGRANCE_FREE'
        es una propiedad del producto; a qué quiere que huela su ropa es una
        elección del cliente.
      */}
      <FragranceField
        value={laundry.fragranceCode}
        onChange={(code) => updateDetail('laundry', { fragranceCode: code })}
      />

      <div className="space-y-3">
        <Checkbox
          label="Usar suavizante"
          description="Las toallas y la ropa deportiva absorben mejor sin él."
          checked={laundry.useFabricSoftener}
          onChange={(event) => updateDetail('laundry', { useFabricSoftener: event.target.checked })}
        />
        <Checkbox
          label="Separar blancos y colores"
          checked={laundry.separateColors}
          onChange={(event) => updateDetail('laundry', { separateColors: event.target.checked })}
        />
        <Checkbox
          label="Se puede usar cloro en los blancos"
          checked={laundry.useBleach}
          onChange={(event) => updateDetail('laundry', { useBleach: event.target.checked })}
        />
      </div>

      <Divider />

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">Secado</p>
        <div className="grid gap-2.5 sm:grid-cols-3">
          {DRYING.map((option) => (
            <OptionCard
              key={option.value}
              selected={laundry.dryingPreference === option.value}
              onSelect={() => updateDetail('laundry', { dryingPreference: option.value })}
              title={option.label}
              description={option.hint}
            />
          ))}
        </div>
      </div>

      {laundry.dryingPreference !== 'MACHINE' && (
        <Field label="¿Qué prendas se cuelgan?" hint="Descríbelas para que no haya dudas.">
          <Input
            value={laundry.hangDryItems}
            onChange={(event) => updateDetail('laundry', { hangDryItems: event.target.value })}
            placeholder="Camisas de lino, vestido negro…"
          />
        </Field>
      )}

      {extras.length > 0 && (
        <div>
          <p className="mb-2.5 text-sm font-medium text-text">Servicios adicionales</p>
          <div className="space-y-2">
            {extras.map((extra) => (
              <label
                key={extra.code}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors',
                  booking.extraCodes.includes(extra.code)
                    ? 'border-forest-500 bg-forest-50'
                    : 'border-border hover:bg-surface-sunken',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={booking.extraCodes.includes(extra.code)}
                    onChange={() => toggleExtra(extra.code)}
                    className="size-4.5 rounded border-border-strong text-forest-600 focus:ring-forest-500/25"
                  />
                  <span className="text-sm font-medium text-text">{extra.name}</span>
                </span>
                <span className="text-sm font-semibold text-forest-700 tnum">
                  +{money(extra.amount)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// KITS DE LIMPIEZA
// =============================================================================

function KitsStep({ booking, updateDetail }) {
  const { kits } = booking;

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Detalles de tu pedido</h2>
        <p className="mt-1 text-text-muted">
          Dinos cuántos kits necesitas y cualquier instrucción para la entrega.
        </p>
      </div>

      <Field label="Cantidad" hint="Máximo 20 kits por pedido.">
        <Input
          type="number"
          min="1"
          max="20"
          value={kits.quantity}
          onChange={(event) =>
            updateDetail('kits', { quantity: Math.max(1, Number(event.target.value) || 1) })
          }
        />
      </Field>

      <Field
        label="Instrucciones de entrega"
        hint="Opcional. Portería, horario preferido, código de acceso…"
      >
        <Input
          value={kits.deliveryInstructions}
          onChange={(event) =>
            updateDetail('kits', { deliveryInstructions: event.target.value })
          }
          placeholder="Dejar con el portero si no hay nadie en casa"
        />
      </Field>
    </div>
  );
}

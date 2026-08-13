import { Field, Input, Select, Checkbox, OptionCard, Divider, cx } from '@/shared/ui';

/**
 * Paso 2: detalles del servicio.
 * Cambia por completo entre limpieza y lavandería, porque son negocios
 * distintos: uno se mide en horas y habitaciones, el otro en kilos y
 * preferencias de lavado.
 */
export default function StepConfigure(props) {
  return props.booking.serviceType === 'CLEANING' ? (
    <CleaningStep {...props} />
  ) : (
    <LaundryStep {...props} />
  );
}

const PROPERTY_TYPES = [
  { value: 'APARTMENT', label: 'Departamento' },
  { value: 'HOUSE', label: 'Casa' },
  { value: 'SUITE', label: 'Suite' },
  { value: 'OFFICE', label: 'Oficina' },
];

const PRIORITY_AREAS = ['Cocina', 'Baños', 'Dormitorios', 'Sala', 'Comedor', 'Balcón', 'Lavandería'];

const DURATIONS = [
  { minutes: 120, label: '2 horas', hint: 'Espacio pequeño' },
  { minutes: 180, label: '3 horas', hint: 'Lo más habitual' },
  { minutes: 240, label: '4 horas', hint: 'Casa grande' },
  { minutes: 360, label: '6 horas', hint: 'Limpieza a fondo' },
];

function CleaningStep({ booking, update, updateDetail, service, money, areaUnit }) {
  const { cleaning } = booking;
  const extras = service?.extras ?? [];

  const toggleArea = (area) => {
    const areas = cleaning.priorityAreas.includes(area)
      ? cleaning.priorityAreas.filter((item) => item !== area)
      : [...cleaning.priorityAreas, area];
    updateDetail('cleaning', { priorityAreas: areas });
  };

  const toggleExtra = (code) => {
    const codes = booking.extraCodes.includes(code)
      ? booking.extraCodes.filter((item) => item !== code)
      : [...booking.extraCodes, code];
    update({ extraCodes: codes });
  };

  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">Cuéntanos del espacio</h2>
        <p className="mt-1 text-text-muted">
          Con esto calculamos cuánto tiempo hace falta y quién es la persona indicada.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Tipo de propiedad">
          <Select
            value={cleaning.propertyType}
            onChange={(event) => updateDetail('cleaning', { propertyType: event.target.value })}
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
            value={cleaning.bedrooms}
            onChange={(event) =>
              updateDetail('cleaning', { bedrooms: Number(event.target.value) || 0 })
            }
          />
        </Field>

        <Field label="Baños">
          <Input
            type="number"
            min="0"
            max="20"
            value={cleaning.bathrooms}
            onChange={(event) =>
              updateDetail('cleaning', { bathrooms: Number(event.target.value) || 0 })
            }
          />
        </Field>
      </div>

      <Field
        label={`Tamaño aproximado (${areaUnit})`}
        hint="Opcional. Nos ayuda a estimar mejor el tiempo."
      >
        <Input
          type="number"
          min="1"
          value={cleaning.areaValue}
          onChange={(event) => updateDetail('cleaning', { areaValue: event.target.value })}
          placeholder="95"
        />
      </Field>

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">¿Cuánto tiempo reservamos?</p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {DURATIONS.map((option) => (
            <OptionCard
              key={option.minutes}
              selected={booking.durationMinutes === option.minutes}
              onSelect={() => update({ durationMinutes: option.minutes })}
              title={option.label}
              description={option.hint}
            />
          ))}
        </div>
      </div>

      <Divider />

      <div>
        <p className="mb-2.5 text-sm font-medium text-text">¿Qué es lo más importante?</p>
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
                  'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors',
                  selected
                    ? 'border-service bg-service text-white'
                    : 'border-border bg-surface-raised text-text-muted hover:border-border-strong',
                )}
              >
                {area}
              </button>
            );
          })}
        </div>
      </div>

      {extras.length > 0 && (
        <div>
          <p className="mb-2.5 text-sm font-medium text-text">Tareas adicionales</p>
          <div className="space-y-2">
            {extras.map((extra) => (
              <label
                key={extra.code}
                className={cx(
                  'flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-4 py-3 transition-colors',
                  booking.extraCodes.includes(extra.code)
                    ? 'border-service bg-service-soft'
                    : 'border-border hover:bg-surface-sunken',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={booking.extraCodes.includes(extra.code)}
                    onChange={() => toggleExtra(extra.code)}
                    className="size-4.5 rounded border-border-strong text-service focus:ring-service/25"
                  />
                  <span className="text-sm font-medium text-text">{extra.name}</span>
                </span>
                <span className="text-sm font-semibold text-service-strong tnum">
                  +{money(extra.amount)}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

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
        <Field label="Preferencia de fragancia" className="mt-4" hint="Opcional.">
          <Input
            value={cleaning.fragrancePreference}
            onChange={(event) =>
              updateDetail('cleaning', { fragrancePreference: event.target.value })
            }
            placeholder="Sin fragancia, cítrico, lavanda…"
          />
        </Field>
      </div>
    </div>
  );
}

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
                    ? 'border-service bg-service-soft'
                    : 'border-border hover:bg-surface-sunken',
                )}
              >
                <span className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={booking.extraCodes.includes(extra.code)}
                    onChange={() => toggleExtra(extra.code)}
                    className="size-4.5 rounded border-border-strong text-service focus:ring-service/25"
                  />
                  <span className="text-sm font-medium text-text">{extra.name}</span>
                </span>
                <span className="text-sm font-semibold text-service-strong tnum">
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

import { Sparkles, Shirt, Scissors } from 'lucide-react';
import { Eyebrow, OptionCard, cx } from '@/shared/ui';

const ICONS = { CLEANING: Sparkles, LAUNDRY: Shirt, ALTERATION: Scissors };

/**
 * Paso 1: qué servicio y con qué plan.
 *
 * Entrando desde la experiencia de un servicio (`lockedService`), el servicio
 * ya está decidido y este paso solo elige el tipo dentro de él: volver a
 * ofrecer la lista invitaría a salirse del contexto en el que la persona acaba
 * de entrar.
 */
export default function StepService({ booking, update, catalog, service, money, lockedService }) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">
          {lockedService && service ? `¿Qué tipo de ${service.label.toLowerCase()}?` : '¿Qué necesitas?'}
        </h2>
        <p className="mt-1 text-text-muted">
          {lockedService
            ? 'Elige la modalidad que mejor te sirva.'
            : 'Elige el servicio y el tipo que mejor te sirva.'}
        </p>
      </div>

      {!lockedService && (
        <div className="grid gap-3 sm:grid-cols-2">
          {catalog?.map((entry) => {
            const Icon = ICONS[entry.code] ?? Sparkles;
            const selected = booking.serviceType === entry.code;

            return (
              <button
                key={entry.code}
                type="button"
                data-service={entry.code}
                onClick={() => update({ serviceType: entry.code, planId: null, extraCodes: [] })}
                aria-pressed={selected}
                className={cx(
                  'flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all',
                  selected
                    ? 'border-service bg-service-soft ring-2 ring-service/20'
                    : 'border-border hover:border-border-strong hover:bg-surface-sunken',
                )}
              >
                <span
                  className={cx(
                    'flex size-10 items-center justify-center rounded-xl',
                    selected ? 'bg-service text-white' : 'bg-surface-sunken text-text-muted',
                  )}
                >
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-text">{entry.label}</span>
                  <span className="mt-0.5 block text-sm text-text-muted">{entry.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {service && (
        <div>
          <Eyebrow className="mb-3 block">Tipo de {service.label.toLowerCase()}</Eyebrow>
          <div className="space-y-2.5">
            {service.plans.map((plan) => (
              <OptionCard
                key={plan.id}
                selected={booking.planId === plan.id}
                onSelect={() => update({ planId: plan.id })}
                title={plan.name}
                description={plan.description}
                meta={priceLabel(plan, money)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Etiqueta de precio según la modalidad de cobro del plan. */
function priceLabel(plan, money) {
  const amount = money(plan.base_amount);
  switch (plan.pricing_model) {
    case 'PER_HOUR':
      return `${amount} / hora`;
    case 'PER_WEIGHT':
      return `${amount} / ${plan.config?.unit ?? 'kg'}`;
    case 'PER_BAG':
      return `${amount} / bolsa`;
    case 'PER_ITEM':
      return `${amount} / prenda`;
    case 'QUOTE':
      return 'Con cotización';
    default:
      return amount;
  }
}

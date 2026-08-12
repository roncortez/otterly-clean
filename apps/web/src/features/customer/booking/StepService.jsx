import { Sparkles, Shirt } from 'lucide-react';
import { OptionCard, cx } from '@/shared/ui';

const ICONS = { CLEANING: Sparkles, LAUNDRY: Shirt };

/** Paso 1: qué servicio y con qué plan. */
export default function StepService({ booking, update, catalog, service, money }) {
  return (
    <div className="space-y-7">
      <div>
        <h2 className="text-xl font-bold tracking-tight text-text">¿Qué necesitas?</h2>
        <p className="mt-1 text-text-muted">Elige el servicio y el tipo que mejor te sirva.</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {catalog?.map((entry) => {
          const Icon = ICONS[entry.code] ?? Sparkles;
          const selected = booking.serviceType === entry.code;

          return (
            <button
              key={entry.code}
              type="button"
              onClick={() => update({ serviceType: entry.code, planId: null, extraCodes: [] })}
              aria-pressed={selected}
              className={cx(
                'flex flex-col items-start gap-3 rounded-xl border p-5 text-left transition-all',
                selected
                  ? 'border-forest-500 bg-forest-50 ring-2 ring-forest-500/20'
                  : 'border-border hover:border-border-strong hover:bg-surface-sunken',
              )}
            >
              <span
                className={cx(
                  'flex size-10 items-center justify-center rounded-xl',
                  selected ? 'bg-forest-600 text-white' : 'bg-surface-sunken text-text-muted',
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

      {service && (
        <div>
          <h3 className="mb-3 text-xs font-semibold tracking-[0.14em] text-forest-700 uppercase">
            Tipo de {service.label.toLowerCase()}
          </h3>
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

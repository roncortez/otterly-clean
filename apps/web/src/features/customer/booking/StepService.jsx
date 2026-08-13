import { Sparkles, Shirt, Package } from 'lucide-react';
import { OptionCard } from '@/shared/ui';

const ICONS = { CLEANING: Sparkles, LAUNDRY: Shirt, KITS: Package };

/** Paso 1: qué servicio y con qué plan. */
export default function StepService({ booking, update, service, money }) {
  const Icon = ICONS[booking.serviceType] ?? Sparkles;

  return (
    <div className="space-y-7">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-xl bg-forest-50 text-forest-700">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-xl font-bold tracking-tight text-text">
            {service?.label || 'Servicio'}
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">
            Selecciona el plan que prefieres solicitar.
          </p>
        </div>
      </div>

      {service && (
        <div className="space-y-3">
          {service.plans.map((plan) => (
            <OptionCard
              key={plan.id}
              selected={booking.planId === plan.id}
              onSelect={() =>
                update({
                  planId: plan.id,
                  // Al elegir el plan, la duración se ajusta al valor fijo estimado de dicho plan.
                  // Así no hay selector manual de duración.
                  durationMinutes: plan.estimated_duration_minutes ?? undefined,
                })
              }
              title={plan.name}
              description={
                <span className="block space-y-1">
                  <span className="block text-text-muted">{plan.description}</span>
                  {plan.service_type === 'CLEANING' && plan.estimated_duration_minutes && (
                    <span className="block text-xs font-semibold text-forest-700">
                      Duración máxima: {plan.estimated_duration_minutes / 60} horas
                    </span>
                  )}
                </span>
              }
              meta={priceLabel(plan, money)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Etiqueta de precio según la modalidad de cobro del plan.
 *
 * Para el servicio de limpieza (CLEANING), la tarifa por hora se multiplica
 * directamente por la duración máxima fija para mostrar el precio total final.
 */
function priceLabel(plan, money) {
  if (plan.service_type === 'CLEANING' && plan.pricing_model === 'PER_HOUR') {
    const hours = Number(plan.estimated_duration_minutes ?? 0) / 60;
    return money(plan.base_amount * hours);
  }

  switch (plan.pricing_model) {
    case 'PER_HOUR': {
      const minHours = Number(plan.config?.minimumHours ?? 0);
      if (minHours > 0) {
        return `Desde ${money(plan.base_amount * minHours)}`;
      }
      return `${money(plan.base_amount)} / hora`;
    }
    case 'PER_WEIGHT':
      return `${money(plan.base_amount)} / ${plan.config?.unit ?? 'kg'}`;
    case 'PER_BAG':
      return `${money(plan.base_amount)} / bolsa`;
    case 'PER_ITEM':
      return `${money(plan.base_amount)} / prenda`;
    case 'FIXED':
      return money(plan.base_amount);
    case 'QUOTE':
      return 'Con cotización';
    default:
      return money(plan.base_amount);
  }
}

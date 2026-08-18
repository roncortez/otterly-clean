import { Link } from 'react-router-dom';
import { Sparkles, Shirt, Scissors, MapPin, ChevronRight } from 'lucide-react';
import { Card, StatusBadge } from '@/shared/ui';
import { formatLongDate, formatTimeWindow, isToday } from '@/shared/format';

export const SERVICE_ICONS = {
  CLEANING: Sparkles,
  LAUNDRY: Shirt,
  ALTERATION: Scissors,
};

export const SERVICE_LABELS = {
  CLEANING: 'Limpieza',
  LAUNDRY: 'Lavandería',
  ALTERATION: 'Arreglo de prendas',
};

/**
 * Tarjeta de servicio para listados y panel del cliente.
 * Prioriza, en este orden: qué es, cuándo, en qué estado. Es el orden en que
 * la persona se hace las preguntas.
 */
export function ServiceCard({ order, to, showPrice = true, money }) {
  const Icon = SERVICE_ICONS[order.serviceType] ?? Sparkles;
  const today = isToday(order.scheduledDate);

  return (
    <Card
      as={Link}
      to={to}
      interactive
      className="group block"
    >
      <div className="flex items-start gap-4 p-4 sm:p-5">
        {/*
          El icono lleva el acento del servicio del pedido, no el de la pantalla
          en la que se dibuja: en una lista mezclada es lo que permite distinguir
          una limpieza de una recogida de un vistazo.
        */}
        <span
          data-service={order.serviceType}
          className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-service-soft text-service-strong"
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-semibold text-text">{order.planName ?? SERVICE_LABELS[order.serviceType]}</p>
            <StatusBadge status={order.status} label={order.statusLabel} />
          </div>

          <p className="mt-1 text-sm text-text-muted">
            {today && <span className="font-medium text-accent-700">Hoy · </span>}
            {formatLongDate(order.scheduledDate)}
            {order.scheduledWindowStart && (
              <> · {formatTimeWindow(order.scheduledWindowStart, order.scheduledWindowEnd)}</>
            )}
          </p>

          {(order.streetLine1 || order.neighborhood) && (
            <p className="mt-1.5 flex items-center gap-1.5 text-sm text-text-subtle">
              <MapPin className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {[order.streetLine1, order.neighborhood].filter(Boolean).join(' · ')}
              </span>
            </p>
          )}

          <p className="mt-2 font-mono text-xs text-text-subtle">{order.reference}</p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-2">
          {showPrice && order.totalAmount !== undefined && money && (
            <span className="font-semibold text-text tnum">{money(order.totalAmount)}</span>
          )}
          <ChevronRight className="nudge size-5 text-text-subtle" aria-hidden="true" />
        </div>
      </div>
    </Card>
  );
}

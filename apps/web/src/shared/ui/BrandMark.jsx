import { Droplets } from 'lucide-react';
import { useConfig } from '@/shared/config/ConfigContext';
import { cx } from '@/shared/ui';

const SIZES = {
  sm: { box: 'size-7', icon: 'size-4', text: 'text-sm' },
  md: { box: 'size-8', icon: 'size-4.5', text: 'text-base' },
  lg: { box: 'size-10', icon: 'size-5', text: 'text-lg' },
};

/**
 * Marca de la empresa: logo y nombre comercial.
 *
 * Existe para que el nombre esté escrito en un solo sitio. Antes aparecía
 * repetido en cinco pantallas, así que cambiarlo obligaba a buscarlo en todas.
 * Ahora viene de la configuración administrable.
 *
 * Si no hay logo cargado se usa el icono de la marca: la cabecera nunca queda
 * con un hueco roto mientras Operaciones decide qué imagen subir.
 */
export default function BrandMark({ size = 'md', subtitle, className, showName = true }) {
  const { company } = useConfig();
  const scale = SIZES[size] ?? SIZES.md;
  const name = company.name || 'Otterly Clean';

  return (
    <span className={cx('flex items-center gap-2.5', className)}>
      {company.logoUrl ? (
        <img
          src={company.logoUrl}
          alt={name}
          className={cx(scale.box, 'shrink-0 rounded-lg object-cover')}
        />
      ) : (
        <span
          className={cx(
            scale.box,
            'flex shrink-0 items-center justify-center rounded-lg bg-forest-700',
          )}
        >
          <Droplets className={cx(scale.icon, 'text-white')} aria-hidden="true" />
        </span>
      )}

      {showName ? (
        <span className="leading-tight">
          <span className={cx(scale.text, 'block font-semibold text-forest-800')}>{name}</span>
          {subtitle ? (
            <span className="block text-[11px] text-text-subtle">{subtitle}</span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

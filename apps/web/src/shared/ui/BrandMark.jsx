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
 *
 * Sobre los fondos verde profundo (portada, panel de acceso, consola del
 * trabajador) hay que pasar `tone="inverse"`: antes cada una de esas pantallas
 * se dibujaba su propio logotipo a mano y se iban separando entre sí.
 */
export default function BrandMark({
  size = 'md',
  subtitle,
  className,
  showName = true,
  tone = 'default',
}) {
  const { company } = useConfig();
  const scale = SIZES[size] ?? SIZES.md;
  const name = company.name || 'Otterly Clean';
  const inverse = tone === 'inverse';

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
            'flex shrink-0 items-center justify-center rounded-lg',
            inverse ? 'bg-accent-600' : 'bg-forest-700',
          )}
        >
          <Droplets className={cx(scale.icon, 'text-white')} aria-hidden="true" />
        </span>
      )}

      {showName ? (
        <span className="leading-tight">
          <span
            className={cx(
              scale.text,
              'block font-bold tracking-tight',
              inverse ? 'text-white' : 'text-forest-800',
            )}
          >
            {name}
          </span>
          {subtitle ? (
            <span
              className={cx('block text-[11px]', inverse ? 'text-forest-200' : 'text-text-subtle')}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}

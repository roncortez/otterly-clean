import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import BrandMark from '@/shared/ui/BrandMark';
import { ButtonLink } from '@/shared/ui';
import { useTranslation, LanguageSelector } from '@/shared/i18n/I18nContext';

/**
 * Cabecera flotante de la portada.
 *
 * Cristal verde profundo sobre la imagen del hero: es el mismo verde de la
 * marca en su versión más oscura, no un gris azulado prestado de Tailwind.
 *
 * ---------------------------------------------------------------------------
 * Por qué el conmutador de idioma va pegado al logotipo y no junto a las
 * acciones, que es donde parecería que le toca.
 *
 * Es el único control de la cabecera que se pulsa para cambiar la cabecera. Si
 * al pulsarlo se mueve de sitio, la segunda pulsación cae en otra cosa; y con
 * dos idiomas, volver atrás es exactamente lo que se hace cuando te has
 * equivocado. Así que tiene que quedarse quieto al cambiar de idioma.
 *
 * Para que algo no se mueva, todo lo que tiene a un lado tiene que medir igual
 * en los dos idiomas, y ese lado tiene que ser su ancla. En esta barra solo hay
 * un elemento que mide igual en español y en inglés: el logotipo, porque el
 * nombre de la empresa no se traduce. Los enlaces cambian («¿Quiénes somos?» /
 * «About us»), «Iniciar sesión» cambia y el botón de cotización cambia. De ahí
 * que el único sitio estable de toda la barra sea justo a la derecha del
 * logotipo — y de paso es donde mejor está, porque es una preferencia y no una
 * acción, y no tenía por qué compartir grupo con «Iniciar sesión» y la llamada
 * principal.
 *
 * Lo demás se reparte de forma que solo se mueva lo que no queda más remedio:
 * el logotipo y el idioma anclados a la izquierda, la cotización anclada a la
 * derecha, y el hueco elástico entre los enlaces y las acciones, que es donde
 * se absorbe la diferencia de longitud entre los dos idiomas.
 * ---------------------------------------------------------------------------
 */
export default function Header() {
  const { t } = useTranslation();
  const location = useLocation();

  const LINKS = [
    { href: '#how-it-works', label: t('header.howItWorks') },
    { href: '#services', label: t('header.services') },
    { href: '#about', label: t('header.about') },
    { href: '#faqs', label: t('header.faqs') },
  ];

  return (
    <header className="fixed inset-x-0 top-4 z-50 px-4 sm:px-6">
      {/* La cabecera baja a su sitio al cargar. Flota sobre la foto del hero, y
          bajando se lee como una pieza que se posa encima; apareciendo sin más
          parecería parte de la imagen. */}
      {/*
        `gap-6` en la barra, y no `justify-between`.

        Repartir con `justify-between` deja la separación entre grupos a merced
        de lo que sobre, y en español no sobra nada: los enlaces son más largos,
        el hueco se cierra del todo y «Preguntas frecuentes» acaba tocando el
        conmutador de idioma. Un `gap` es una distancia mínima que no se puede
        cerrar; el reparto lo hace `flex-1` en los enlaces, que empuja las
        acciones a la derecha.
      */}
      <nav className="anim-drop mx-auto flex w-[90%] max-w-6xl items-center gap-6 rounded-2xl border border-white/15 bg-forest-950/80 px-6 py-3.5 text-white shadow-[var(--shadow-raised)] backdrop-blur-xl xl:gap-10">
        {/* Anclado a la izquierda: lo único que mide igual en los dos idiomas. */}
        <div className="flex shrink-0 items-center gap-4">
          {/* Logotipo administrable, igual que en el resto de la aplicación.
              `swell` reemplaza a `hover:scale-105`, que en un móvil se quedaba
              pegado tras el toque y dejaba el logotipo grande para siempre. */}
          <a href="#hero" className="swell">
            <BrandMark size="md" tone="inverse" />
          </a>

          <LanguageSelector tone="inverse" />
        </div>

        {/*
          Enlaces de navegación.

          `flex-1` sin centrar: alineados al principio, el primer enlace no se
          mueve nunca y la diferencia de longitud entre idiomas se acumula al
          final, en el hueco que queda antes de las acciones. Centrados, un
          título más largo desplazaría los cuatro a la vez.

          Aparecen en `xl` y no en `lg`, y el motivo es el español. «¿Cómo
          funciona?» y «Preguntas frecuentes» ocupan casi el doble que «How it
          works» y «FAQs»: a 1024 px los cuatro enlaces no caben en una línea y
          se partían en dos, dejando la barra con el doble de alto y los títulos
          descuadrados entre sí. Medido en inglés no se veía, porque en inglés sí
          caben — este es justo el fallo que aparece al cambiar de idioma y no al
          cambiar de tamaño.

          Entre 1024 y 1280 la barra se queda con marca, idioma, acceso y
          cotización, que es el mismo reparto que ya hacía en móvil. `nowrap` en
          cada enlace impide que la solución se deshaga sola si mañana una
          traducción crece.
        */}
        <ul className="hidden flex-1 items-center gap-6 text-sm font-medium text-forest-100 xl:flex 2xl:gap-8">
          {LINKS.map(({ href, label }) => (
            <li key={href}>
              <a href={href} className="whitespace-nowrap transition-colors hover:text-white">
                {label}
              </a>
            </li>
          ))}
        </ul>

        {/* Acciones, ancladas a la derecha. */}
        <div className="ml-auto flex shrink-0 items-center gap-5">
          {/* `background` deja la portada detrás del panel de acceso. */}
          <Link
            to="/entrar"
            state={{ background: location }}
            className="text-sm font-semibold whitespace-nowrap text-white transition-colors hover:text-accent-300"
          >
            {t('header.login')}
          </Link>

          <ButtonLink
            as={Link}
            to="/reservar"
            variant="accent"
            size="sm"
            className="whitespace-nowrap"
          >
            {t('header.quote')}
          </ButtonLink>
        </div>
      </nav>
    </header>
  );
}

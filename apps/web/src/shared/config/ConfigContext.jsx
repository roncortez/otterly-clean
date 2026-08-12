import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '@/shared/api/client';

const ConfigContext = createContext(null);

/**
 * Valores de respaldo de la empresa.
 *
 * Se declaran fuera del componente para que la referencia sea estable: si se
 * crearan en cada render, todo lo que dependa de `company` se recalcularía sin
 * motivo.
 */
const EMPTY_COMPANY = Object.freeze({ name: '', phone: '', whatsapp: '', email: '' });

/**
 * Configuración servida por el backend: región + empresa + servicios.
 *
 * Ningún componente escribe "Provincia", "$", "IVA", el nombre comercial ni el
 * número de WhatsApp a mano: todo eso llega de /api/catalog/config. Cambiar de
 * Ecuador a Estados Unidos es cambiar la región del usuario, y cambiar el
 * teléfono de la empresa es editar una pantalla, no desplegar.
 */
export function ConfigProvider({ children }) {
  const [config, setConfig] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    api
      .get('/catalog/config')
      .then(({ data }) => {
        if (!cancelled) setConfig(data);
      })
      .catch((requestError) => {
        if (!cancelled) setError(requestError);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // El título de la pestaña también es un dato de marca: si el nombre
  // comercial cambia, cambia aquí sin tocar index.html.
  const companyName = config?.company?.name;
  useEffect(() => {
    if (companyName) document.title = `${companyName} · Servicios a domicilio`;
  }, [companyName]);

  const value = useMemo(() => {
    const region = config?.region;

    return {
      config,
      region,
      company: config?.company ?? EMPTY_COMPANY,
      serviceTypes: config?.serviceTypes ?? [],
      error,
      isLoading: !config && !error,

      /** Formatea centavos según la moneda y el locale de la región. */
      money(amountInCents) {
        if (amountInCents === null || amountInCents === undefined) return '—';
        if (!region) return (amountInCents / 100).toFixed(2);
        return new Intl.NumberFormat(region.locale, {
          style: 'currency',
          currency: region.currency.code,
          minimumFractionDigits: region.currency.decimals,
        }).format(amountInCents / 100);
      },

      /** Etiqueta local de un campo de dirección (Provincia vs State). */
      addressLabel(field) {
        return region?.address.labels[field] ?? field;
      },

      addressFields() {
        return region?.address.fields ?? [];
      },

      isAddressFieldRequired(field) {
        return region?.address.required.includes(field) ?? false;
      },

      timeWindows() {
        return region?.booking.timeWindows ?? [];
      },

      taxLabel: region?.tax.label ?? 'Impuesto',
      weightUnit: region?.units.weight ?? 'kg',
      areaUnit: region?.units.area ?? 'm2',
      phonePlaceholder: region?.phone.placeholder ?? '',
      phonePrefix: region?.phone.countryCallingCode ?? '',
      minLeadTimeHours: region?.booking.minLeadTimeHours ?? 0,
      freeCancellationHours: region?.booking.freeCancellationHours ?? 0,
    };
  }, [config, error]);

  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>;
}

export function useConfig() {
  const context = useContext(ConfigContext);
  if (!context) throw new Error('useConfig debe usarse dentro de ConfigProvider');
  return context;
}

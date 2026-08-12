import { NavLink, Outlet } from 'react-router-dom';
import { Building2, CalendarOff, Megaphone, Sparkles } from 'lucide-react';
import { PageHeader, cx } from '@/shared/ui';
import { UploadConfigProvider } from './UploadConfigContext';

/**
 * Configuración de la plataforma.
 *
 * Agrupa lo que Operaciones puede cambiar sin tocar código. Deliberadamente NO
 * incluye configuración técnica —claves, credenciales, orígenes CORS—: eso vive
 * en variables de entorno y no debe poder editarse desde una pantalla.
 */
const TABS = [
  { to: 'empresa', label: 'Empresa', icon: Building2 },
  { to: 'servicios', label: 'Servicios', icon: Sparkles },
  { to: 'agenda', label: 'Agenda', icon: CalendarOff },
  { to: 'avisos', label: 'Avisos', icon: Megaphone },
];

export default function ConfigurationLayout() {
  return (
    // Las capacidades de subida se consultan una vez para toda la sección.
    <UploadConfigProvider>
      <PageHeader
        title="Configuración"
        eyebrow="Operaciones"
        description="Datos comerciales de la plataforma. Los ajustes técnicos y las claves siguen viviendo fuera de la aplicación."
      />

      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cx(
                '-mb-px flex shrink-0 items-center gap-2 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'border-forest-600 text-forest-700'
                  : 'border-transparent text-text-muted hover:text-text',
              )
            }
          >
            <Icon className="size-4" aria-hidden="true" />
            {label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </UploadConfigProvider>
  );
}

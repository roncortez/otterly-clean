import { useState } from 'react';
import { Search, ShieldCheck, Users } from 'lucide-react';
import { api } from '@/shared/api/client';
import { useApiQuery, useApiAction } from '@/shared/api/useApiQuery';
import { useAuth } from '@/shared/auth/AuthContext';
import { useDebounced } from '@/shared/hooks/useDebounced';
import {
  Alert,
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Input,
  PageHeader,
  Select,
  Spinner,
  cx,
} from '@/shared/ui';
import { fullName, initials } from '@/shared/format';

/**
 * Usuarios y roles.
 *
 * Una persona puede tener varios roles a la vez: quien coordina la operación
 * también sale a trabajar. No es un sistema de permisos: solo tres roles fijos,
 * sin capacidades sueltas tipo "orders.read".
 *
 * Que un trabajador atienda limpieza o lavandería NO se decide aquí — eso es
 * una capacidad profesional y vive en la pantalla de Trabajadores.
 */

const ROLES = [
  {
    code: 'CUSTOMER',
    label: 'Cliente',
    description: 'Reserva servicios y sigue sus pedidos.',
    tone: 'neutral',
  },
  {
    code: 'STAFF',
    label: 'Trabajador',
    description: 'Entra a /trabajo y ejecuta las asignaciones que recibe.',
    tone: 'forest',
  },
  {
    code: 'ADMIN',
    label: 'Administrador',
    description: 'Entra a /operaciones y configura la plataforma.',
    tone: 'accent',
  },
];

const ROLE_LABEL = Object.fromEntries(ROLES.map((role) => [role.code, role.label]));
const ROLE_TONE = Object.fromEntries(ROLES.map((role) => [role.code, role.tone]));

export default function UsersPage() {
  const { user: currentUser } = useAuth();

  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const debouncedSearch = useDebounced(search, 300);

  const usersQuery = useApiQuery('/operations/users', {
    params: {
      search: debouncedSearch || undefined,
      role: roleFilter || undefined,
      limit: 50,
    },
  });

  const { busy, error: actionError, execute } = useApiAction();
  const [editing, setEditing] = useState(null);

  const users = usersQuery.data?.data ?? [];
  const error = usersQuery.error ?? actionError;

  async function saveRoles(user, roles) {
    // Quitarse a uno mismo el rol ADMIN es la forma más fácil de perder el
    // acceso sin querer. El backend también lo protege, pero avisar antes
    // evita el susto.
    if (user.id === currentUser.id && !roles.includes('ADMIN')) {
      const confirmed = window.confirm(
        'Estás a punto de quitarte el rol de administrador. Perderás el acceso a Operaciones. ¿Continuar?',
      );
      if (!confirmed) return;
    }

    await execute(() => api.put(`/operations/users/${user.id}/roles`, { roles }), {
      onSuccess: () => {
        setEditing(null);
        usersQuery.reload();
      },
    });
  }

  async function toggleStatus(user) {
    const action = user.status === 'ACTIVE' ? 'desactivar' : 'reactivar';
    const confirmed = window.confirm(`¿Seguro que quieres ${action} a ${fullName(user)}?`);
    if (!confirmed) return;

    await execute(
      () =>
        api.post(`/operations/users/${user.id}/status`, {
          active: user.status !== 'ACTIVE',
        }),
      { onSuccess: usersQuery.reload },
    );
  }

  return (
    <div>
      <PageHeader
        title="Usuarios y roles"
        eyebrow="Operaciones"
        description="Una misma persona puede tener varios roles. El registro público siempre crea clientes: STAFF y ADMIN solo se otorgan desde aquí."
      />

      {error ? (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <Card className="mb-5 p-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
          <Field label="Buscar">
            <div className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-subtle"
                aria-hidden="true"
              />
              <Input
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nombre, correo o teléfono"
              />
            </div>
          </Field>

          <Field label="Rol">
            <Select value={roleFilter} onChange={(event) => setRoleFilter(event.target.value)}>
              <option value="">Todos</option>
              {ROLES.map((role) => (
                <option key={role.code} value={role.code}>
                  {role.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Card>

      {usersQuery.loading ? (
        <Spinner label="Cargando usuarios" />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Sin resultados"
          description="Prueba con otro término de búsqueda o quita el filtro de rol."
        />
      ) : (
        <div className="space-y-2.5">
          {users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={user.id === currentUser.id}
              editing={editing === user.id}
              busy={busy}
              onEdit={() => setEditing(user.id)}
              onCancel={() => setEditing(null)}
              onSave={(roles) => saveRoles(user, roles)}
              onToggleStatus={() => toggleStatus(user)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function UserRow({ user, isSelf, editing, busy, onEdit, onCancel, onSave, onToggleStatus }) {
  const [selected, setSelected] = useState(user.roles);

  const toggle = (code) =>
    setSelected((current) =>
      current.includes(code) ? current.filter((role) => role !== code) : [...current, code],
    );

  const inactive = user.status !== 'ACTIVE';

  return (
    <Card className={cx('p-4', inactive && 'opacity-60')}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-forest-100 text-sm font-semibold text-forest-700">
            {initials(fullName(user))}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-text">
              {fullName(user)}
              {isSelf ? <span className="ml-2 text-xs text-text-subtle">(tú)</span> : null}
            </p>
            <p className="truncate text-sm text-text-subtle">{user.email}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {user.roles.map((role) => (
            <Badge key={role} tone={ROLE_TONE[role] ?? 'neutral'}>
              {role === 'ADMIN' ? <ShieldCheck className="size-3" aria-hidden="true" /> : null}
              {ROLE_LABEL[role] ?? role}
            </Badge>
          ))}
          {inactive ? <Badge tone="neutral">Inactivo</Badge> : null}
        </div>
      </div>

      {editing ? (
        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-sm font-medium text-text">Roles de esta persona</p>
          <div className="space-y-2">
            {ROLES.map((role) => (
              <label
                key={role.code}
                className={cx(
                  'flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors',
                  selected.includes(role.code)
                    ? 'border-forest-500 bg-forest-50'
                    : 'border-border hover:bg-surface-sunken',
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4.5 shrink-0 rounded border-border-strong text-forest-600 focus:ring-forest-500/25"
                  checked={selected.includes(role.code)}
                  onChange={() => toggle(role.code)}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-text">{role.label}</span>
                  <span className="block text-xs text-text-muted">{role.description}</span>
                </span>
              </label>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <Button
              size="sm"
              loading={busy}
              disabled={selected.length === 0}
              onClick={() => onSave(selected)}
            >
              Guardar roles
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelected(user.roles);
                onCancel();
              }}
            >
              Cancelar
            </Button>
            {selected.length === 0 ? (
              <span className="self-center text-xs text-danger">
                Una persona debe conservar al menos un rol.
              </span>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <Button size="sm" variant="outline" onClick={onEdit}>
            Editar roles
          </Button>
          <Button size="sm" variant="ghost" onClick={onToggleStatus} disabled={busy}>
            {inactive ? 'Reactivar cuenta' : 'Desactivar cuenta'}
          </Button>
        </div>
      )}
    </Card>
  );
}

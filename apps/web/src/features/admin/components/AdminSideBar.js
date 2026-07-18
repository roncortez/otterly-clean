import { Link, useLocation } from "react-router-dom";

const adminLinks = [
  { to: "/admin/overview", label: "Resumen" },
  { to: "/admin/orders", label: "Órdenes" },
  { to: "/admin/take-order", label: "Tomar orden" },
  { to: "/admin/menu", label: "Menú" },
  { to: "/admin/cupones", label: "Cupones" },
  { to: "/admin/settings", label: "Configuración" },
  { to: "/admin/users", label: "Usuarios" },
];

export default function AdminSideBar() {
  const { pathname } = useLocation();

  return (
    <nav className="flex gap-1 overflow-x-auto px-3 py-3 md:h-full md:flex-col md:overflow-x-visible md:py-6">
      {adminLinks.map((link) => {
        const activo = pathname.startsWith(link.to);
        return (
          <Link
            key={link.to}
            to={link.to}
            className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
              activo
                ? "bg-yellow-100 text-yellow-800"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

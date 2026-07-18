import AdminSideBar from "features/admin/components/AdminSideBar";
import { Outlet } from "react-router-dom";

export default function AdminLayout() {
  return (
    <div className="flex min-h-[calc(100vh-5rem)] flex-col md:pt-20 md:flex-row md:px-8">
      <aside className="border-b border-gray-200 bg-white md:w-56 md:flex-shrink-0 md:border-b-0 md:border-r">
        <AdminSideBar />
      </aside>
      <section className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 py-5 md:px-8 md:py-6">
        <Outlet />
      </section>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { Sliders, Save, Image, MessageSquare, AlertCircle } from 'lucide-react';
import api from '../../shared/api/client';

export default function SettingsPage() {
  const [banner, setBanner] = useState({
    enabled: false,
    imageUrl: '',
    message: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');

  useEffect(() => {
    async function loadBanner() {
      try {
        setLoading(true);
        const res = await api.get('/operations/settings/banner');
        if (res.data.banner) setBanner(res.data.banner);
      } catch {
        // Ignorar
      } finally {
        setLoading(false);
      }
    }
    loadBanner();
  }, []);

  async function handleSave(e) {
    e.preventDefault();
    try {
      setSaving(true);
      setStatusMsg('');
      await api.post('/operations/settings/banner', banner);
      setStatusMsg('Configuración guardada exitosamente.');
    } catch {
      setStatusMsg('Error al guardar la configuración.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Sliders className="h-6 w-6 text-emerald-600" />
          Configuración Global de la Aplicación
        </h2>
        <p className="text-xs text-slate-500">
          Gestiona los anuncios promocionales, banners globales y avisos al cliente
        </p>
      </div>

      {statusMsg && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <AlertCircle className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{statusMsg}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-xs text-slate-400">Cargando ajustes...</div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6 rounded-2xl bg-white p-6 border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h3 className="font-bold text-slate-900 text-sm">Banner Promocional (Overlay Popup)</h3>
              <p className="text-xs text-slate-500">Muestra una imagen o anuncio flotante cuando el cliente entra a la Home</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={banner.enabled}
                onChange={(e) => setFormBanner({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
            </label>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 flex items-center gap-1">
                <Image className="h-3.5 w-3.5 text-slate-400" /> URL de Imagen del Banner
              </label>
              <input
                type="url"
                placeholder="https://ejemplo.com/imagen.jpg"
                value={banner.imageUrl}
                onChange={(e) => setFormBanner({ imageUrl: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 flex items-center gap-1">
                <MessageSquare className="h-3.5 w-3.5 text-slate-400" /> Mensaje / Texto del Banner
              </label>
              <textarea
                rows={3}
                placeholder="Escribe el mensaje o texto promocional..."
                value={banner.message}
                onChange={(e) => setFormBanner({ message: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-all disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Guardando...' : 'Guardar Cambios'}
            </button>
          </div>
        </form>
      )}
    </div>
  );

  function setFormBanner(updated) {
    setBanner((prev) => ({ ...prev, ...updated }));
  }
}

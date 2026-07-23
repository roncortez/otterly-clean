const Loading = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 rounded-full border-[3px] border-gray-200 border-t-primary-600 animate-spinner-ring" />
        <p className="text-sm font-medium text-gray-400">Cargando...</p>
      </div>
    </div>
  );
};

export default Loading;

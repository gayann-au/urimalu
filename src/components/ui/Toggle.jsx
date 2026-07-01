export function Toggle({ label, icon, value, onChange, disabled, lang }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="font-semibold text-gray-800 text-sm flex items-center gap-1.5">
        {icon && <span>{icon}</span>}{label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        disabled={disabled}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 rounded-full transition shrink-0 disabled:opacity-50 after:absolute after:content-[''] after:-inset-y-2 after:inset-x-0 ${value ? "bg-coorg-600" : "bg-gray-300"}`}
      >
        <span className={`absolute top-0.5 left-0.5 h-6 w-6 rounded-full bg-white shadow transition ${value ? "translate-x-5" : ""}`}/>
      </button>
    </div>
  );
}
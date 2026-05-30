export function Stars({ value = 0, size = 14, className = "" }) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 text-amber-500 ${className}`} aria-label={`${value} of 5`}>
      {[0,1,2,3,4].map(i => {
        const filled = i < full || (i === full && half);
        return (
          <svg key={i} width={size} height={size} viewBox="0 0 24 24"
            fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
          </svg>
        );
      })}
    </span>
  );
}
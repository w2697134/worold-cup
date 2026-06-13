type ChevronToggleProps = {
  open: boolean;
  label: string;
  onClick: () => void;
};

export function ChevronToggle({ open, label, onClick }: ChevronToggleProps) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      aria-label={label}
      aria-expanded={open}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-ink-900 transition hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300"
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.8"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
  );
}

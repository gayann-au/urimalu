import { useEffect, useId, useRef, useState } from "react";
import { Input } from "./Input";

// Reusable filtered-autocomplete text input. Free text is always allowed: the
// value is exactly what the user types. `getSuggestions(query)` returns the
// list to show as `[{ value, label }]`; picking one calls `onChange` with that
// suggestion's `value`. The dropdown opens on focus and while typing, closes on
// Escape, outside click, or selection, and supports arrow-key + Enter
// navigation. The component is presentation-only and holds no domain knowledge.
export function Autocomplete({
  value,
  onChange,
  getSuggestions,
  placeholder,
  maxLength,
  error,
  optionClassName = "",
  ...inputRest
}) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef(null);
  const listId = `${useId()}-list`;

  const suggestions = open ? getSuggestions(value) : [];
  const hasList = suggestions.length > 0;

  // Close the dropdown when the user clicks anywhere outside the widget.
  useEffect(() => {
    function onDocMouseDown(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function choose(item) {
    onChange(item.value);
    setOpen(false);
    setHighlight(-1);
  }

  function handleKeyDown(e) {
    if (e.key === "ArrowDown" && !open) {
      setOpen(true);
      return;
    }
    if (!hasList) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter" && highlight >= 0) {
      e.preventDefault();
      choose(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={wrapRef}>
      <Input
        {...inputRest}
        role="combobox"
        aria-expanded={open && hasList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        placeholder={placeholder}
        maxLength={maxLength}
        error={error}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
      />

      {open && hasList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-auto rounded-xl border-2 border-gray-200 bg-white shadow-lg"
        >
          {suggestions.map((item, i) => (
            <li
              key={item.value}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => {
                e.preventDefault();
                choose(item);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`cursor-pointer px-4 py-2.5 text-base ${
                i === highlight ? "bg-coorg-50 text-coorg-800" : "text-gray-700"
              } ${optionClassName}`}
            >
              {item.label}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

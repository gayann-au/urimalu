import { useId, useState } from "react";
import { Input } from "./Input";

// Reusable filtered-autocomplete text input. Free text is always allowed: the
// value is exactly what the user types. `getSuggestions(query)` returns the
// list to show as `[{ value, label }]`; picking one calls `onChange` with that
// suggestion's `value`. The dropdown opens on focus and while typing, stays put
// while the input keeps focus, and closes cleanly on selection, Escape, or a
// real blur (a click/tab outside). Supports arrow-key + Enter navigation. The
// component is presentation-only and holds no domain knowledge.
//
// Visibility is a plain function of focus + typing (the `open` flag) with no
// global document listener: outside clicks close the list through the input's
// native blur, and the list items call preventDefault on mousedown so selecting
// one never blurs the input first. This keeps open/closed tied to focus and
// removes the blur-vs-mousedown race that makes such dropdowns blink.
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
  const listId = `${useId()}-list`;

  const suggestions = open ? getSuggestions(value) : [];
  const hasList = suggestions.length > 0;

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
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
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
        // A real click/tab outside blurs the input and closes the list. Picking
        // a suggestion does not reach here: the list's mousedown handlers call
        // preventDefault, so the input never loses focus mid-selection.
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
      />

      {open && hasList && (
        <ul
          id={listId}
          role="listbox"
          // Keep focus on the input for any press inside the list (an option, a
          // gap, or the scrollbar) so a stray mousedown never blurs and closes.
          onMouseDown={(e) => e.preventDefault()}
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

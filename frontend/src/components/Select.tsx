// our own dropdown instead of the browser's <select>.
// the native mac popup opens away from the box in its own grey style (and huge when the page is zoomed),
// so this draws the list right under the button in the app's style. works with the keyboard too:
// arrows/Home/End move, Enter/Space picks, Escape/Tab closes
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  placeholder?: string; // shown when value doesn't match an option
  ariaLabel?: string; // when there's no visible <label> pointing at it
  id?: string; // lets a <label htmlFor> point at the button
  invalid?: boolean;
}

export function Select({ value, options, onChange, placeholder = "Select…", ariaLabel, id, invalid }: SelectProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0); // highlighted option while the list is open
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listId = useId();

  const selectedIndex = options.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  // click anywhere outside closes it
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function openList() {
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function pick(index: number) {
    onChange(options[index].value);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        openList();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, options.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Home") {
      e.preventDefault();
      setActive(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActive(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (options[active]) pick(active);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className="select" ref={rootRef}>
      <button
        type="button"
        id={id}
        ref={buttonRef}
        className={`select-button${invalid ? " select-invalid" : ""}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? "" : "select-placeholder"}>{selected?.label ?? placeholder}</span>
        <svg className="select-chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <ul className="select-list" role="listbox" id={listId} aria-label={ariaLabel}>
          {options.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              className={`select-option${i === active ? " select-option-active" : ""}`}
              // mousedown so the pick happens before the button loses focus
              onMouseDown={(e) => {
                e.preventDefault();
                pick(i);
              }}
              onMouseEnter={() => setActive(i)}
            >
              <span>{o.label}</span>
              {o.value === value && (
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                  <path d="M3 7.5 6 10.5 11 4" fill="none" stroke="currentColor" strokeWidth="1.8" />
                </svg>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

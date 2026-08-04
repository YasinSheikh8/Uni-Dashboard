"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { suggestDestinations } from "@/lib/destinations";

/**
 * Destination field with suggestions.
 *
 * This exists for a correctness reason, not a cosmetic one. Suppliers reject an
 * incomplete location — LiteAPI needs city AND country — so a bare "Lisbon"
 * produced a rejected request that surfaced as "the supplier didn't respond".
 * Picking from the list writes "Lisbon, PT", which resolves unambiguously every
 * time. Free text still works and is still resolved against the same table; the
 * list just removes the guesswork.
 *
 * Suggestions come from a local table rather than an endpoint: it is a few KB,
 * so there is no request to wait on, nothing to debounce, and nothing to fail.
 *
 * Implemented as a real combobox — arrow keys move the active option, Enter
 * takes it, Escape closes, and aria-activedescendant tells a screen reader
 * what is highlighted. A div that merely looks like a dropdown is unusable
 * without a mouse.
 */
export function DestinationInput({
  id,
  name,
  value,
  onChange,
  placeholder,
  required,
  className,
}: {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  required?: boolean;
  className?: string;
}) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Suppresses reopening right after a selection. */
  const justPicked = useRef(false);

  const suggestions = useMemo(() => suggestDestinations(value), [value]);

  // Close when focus or a click goes elsewhere.
  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [value]);

  function pick(index: number) {
    const choice = suggestions[index];
    if (!choice) return;
    justPicked.current = true;
    onChange(choice.value);
    setOpen(false);
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || suggestions.length === 0) {
      // Arrow down with a closed list is a request to see the options.
      if (event.key === "ArrowDown" && suggestions.length > 0) {
        setOpen(true);
        event.preventDefault();
      }
      return;
    }

    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        setActive((current) => (current + 1) % suggestions.length);
        break;
      case "ArrowUp":
        event.preventDefault();
        setActive((current) => (current - 1 + suggestions.length) % suggestions.length);
        break;
      case "Enter":
        // Only intercept Enter when a suggestion is genuinely highlighted,
        // otherwise typing a place we do not know could never submit the form.
        event.preventDefault();
        pick(active);
        break;
      case "Escape":
        setOpen(false);
        break;
      case "Tab":
        // Tabbing away accepts the highlighted option, which is what the
        // highlight implies.
        if (suggestions.length > 0) pick(active);
        break;
    }
  }

  const showList = open && suggestions.length > 0;

  return (
    <div ref={wrapperRef} className="relative">
      <input
        id={id}
        name={name}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          if (justPicked.current) {
            justPicked.current = false;
          } else {
            setOpen(true);
          }
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className={className}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-${active}` : undefined}
      />

      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+10px)] z-50 overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] py-1.5"
          style={{ boxShadow: "var(--elev-3)", border: "1px solid var(--color-border)" }}
        >
          {suggestions.map((suggestion, index) => (
            <li
              key={suggestion.value}
              id={`${listId}-${index}`}
              role="option"
              aria-selected={index === active}
              // pointerdown rather than click: click fires after blur, which
              // would have already closed the list.
              onPointerDown={(event) => {
                event.preventDefault();
                pick(index);
              }}
              onPointerEnter={() => setActive(index)}
              className={`cursor-pointer px-4 py-2.5 text-sm ${
                index === active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                  : "text-[var(--color-ink-soft)]"
              }`}
            >
              {/* The comma lives in the text, not in the margin: a screen
                  reader reads textContent, where "LisbonPortugal" is what a
                  purely visual gap produces. */}
              <span className="font-medium text-[var(--color-ink)]">{suggestion.city}</span>
              <span className="text-[var(--color-ink-faint)]">
                {", "}
                {suggestion.label.split(", ").slice(1).join(", ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

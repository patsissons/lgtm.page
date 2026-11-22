import { useId } from "react";
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
} from "lucide-react";
import {
  NATURAL_ORDER,
  SORT_KEYS,
  SORT_LABELS,
  orderLabel,
  type Sort,
  type SortKey,
} from "@/lib/sort-apps";

const CONTROL =
  "h-9 rounded-md border bg-card text-sm text-foreground transition hover:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50";

/**
 * Picks what the cards are ordered by and which way. Picking a new key
 * starts it in its natural order (newest first, or A to Z); the button
 * flips it.
 */
export function SortControl({
  sort,
  onChange,
  disabled = false,
}: {
  sort: Sort;
  onChange: (sort: Sort) => void;
  disabled?: boolean;
}) {
  const id = useId();
  const current = orderLabel(sort.key, sort.order);
  const flipped = sort.order === "asc" ? "desc" : "asc";
  const Icon = sort.order === "asc" ? ArrowUpNarrowWide : ArrowDownWideNarrow;

  return (
    <div className="flex items-center gap-2">
      <label
        htmlFor={id}
        className="text-sm whitespace-nowrap text-muted-foreground"
      >
        Sort by
      </label>
      <div className="relative">
        <select
          id={id}
          value={sort.key}
          disabled={disabled}
          onChange={(event) => {
            const key = event.target.value as SortKey;
            onChange({ key, order: NATURAL_ORDER[key] });
          }}
          className={`${CONTROL} cursor-pointer appearance-none pr-8 pl-3 dark:[color-scheme:dark]`}
        >
          {SORT_KEYS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-muted-foreground"
        />
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange({ ...sort, order: flipped })}
        title={`Switch to ${orderLabel(sort.key, flipped).toLowerCase()}`}
        className={`${CONTROL} inline-flex cursor-pointer items-center gap-1.5 px-2.5`}
      >
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <span className="sr-only sm:not-sr-only">{current}</span>
      </button>
    </div>
  );
}

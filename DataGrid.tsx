import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { ColumnDef, DataGridProps } from "../data-grid-contract";
import "./DataGrid.css";

const PAGE_SIZE = 10;

type SortDirection = "asc" | "desc";

interface SortState<T> {
  key: keyof T;
  direction: SortDirection;
}

interface CellPosition {
  /** 0 = header row, 1..n = body rows on the current page. */
  row: number;
  col: number;
}

function compareValues(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function matchesFilter<T>(item: T, columns: ColumnDef<T>[], query: string) {
  return columns.some((col) =>
    String(item[col.accessorKey] ?? "").toLowerCase().includes(query),
  );
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Task 1.4 – keyboard + accessibility layer on top of Task 1.3.
 *
 * Keyboard (grid has ONE tab stop; arrows move inside it – roving tabindex):
 *   Arrow keys        move between cells (header row included)
 *   Home / End        first / last cell in the row
 *   Ctrl+Home / End   first / last cell in the grid
 *   Enter (body cell) select the row  -> onRowSelect(item)
 *   Space (body cell) toggle the row's selection
 *   Enter / Space on a sortable header activates its sort button
 *
 * Screen readers: aria-sort on the sorted column header only, and a single
 * polite live region that announces sort, filter results, paging,
 * selection and loading state.
 */
export function DataGrid<T>({
  data,
  columns,
  onRowSelect,
  ariaLabel,
  isProcessing = false,
}: DataGridProps<T>) {
  const filterId = useId();
  const [sort, setSort] = useState<SortState<T> | null>(null);
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<T | null>(null);
  const [active, setActive] = useState<CellPosition>({ row: 0, col: 0 });
  const [live, setLive] = useState({ text: "", n: 0 });
  const cellRefs = useRef(new Map<string, HTMLElement>());

  /** Polite announcement; n flips a trailing nbsp so repeats are re-read. */
  const announce = useCallback((text: string) => {
    setLive((prev) => ({ text, n: prev.n + 1 }));
  }, []);

  const processed = useMemo(() => {
    const query = filter.trim().toLowerCase();
    const filtered = query
      ? data.filter((item) => matchesFilter(item, columns, query))
      : data;
    if (!sort) return filtered;
    const factor = sort.direction === "asc" ? 1 : -1;
    // Array.prototype.sort is stable, so equal values keep their order.
    return [...filtered].sort(
      (a, b) => factor * compareValues(a[sort.key], b[sort.key]),
    );
  }, [data, columns, filter, sort]);

  const countRef = useRef(processed.length);
  countRef.current = processed.length;

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  const pageRows = processed.slice(start, start + PAGE_SIZE);

  // Clamp the roving-tabindex position so the grid always has one tab stop,
  // even after filtering/paging shrinks the number of rows.
  const maxRow = pageRows.length;
  const maxCol = columns.length - 1;
  const activeRow = Math.min(active.row, maxRow);
  const activeCol = Math.min(active.col, maxCol);

  const rowLabel = (item: T) =>
    columns.length > 0 ? String(item[columns[0].accessorKey] ?? "") : "row";

  // Announce filter results (debounced so typing doesn't spam the reader).
  const prevFilter = useRef(filter);
  useEffect(() => {
    if (prevFilter.current === filter) return;
    prevFilter.current = filter;
    const id = window.setTimeout(() => {
      const n = countRef.current;
      announce(
        n === 0
          ? "No rows match the filter"
          : `${plural(n, "row", "rows")} match the filter`,
      );
    }, 500);
    return () => window.clearTimeout(id);
  }, [filter, announce]);

  // Announce loading start / finish.
  const prevProcessing = useRef(isProcessing);
  useEffect(() => {
    if (prevProcessing.current === isProcessing) return;
    prevProcessing.current = isProcessing;
    announce(
      isProcessing
        ? "Loading data"
        : `Data loaded. ${plural(countRef.current, "row", "rows")}.`,
    );
  }, [isProcessing, announce]);

  function handleSort(col: ColumnDef<T>) {
    if (isProcessing) return;
    let next: SortState<T> | null;
    if (!sort || sort.key !== col.accessorKey) {
      next = { key: col.accessorKey, direction: "asc" };
    } else if (sort.direction === "asc") {
      next = { key: col.accessorKey, direction: "desc" };
    } else {
      next = null;
    }
    setSort(next);
    setPage(1);
    announce(
      next
        ? `Sorted by ${col.header}, ${next.direction === "asc" ? "ascending" : "descending"}`
        : "Sorting cleared",
    );
  }

  function handleFilter(value: string) {
    setFilter(value);
    setPage(1);
  }

  function goToPage(target: number) {
    if (isProcessing || target < 1 || target > totalPages) return;
    setPage(target);
    const from = (target - 1) * PAGE_SIZE + 1;
    const to = Math.min(target * PAGE_SIZE, processed.length);
    announce(`Page ${target} of ${totalPages}, rows ${from} to ${to}`);
  }

  function selectRow(item: T) {
    if (isProcessing) return;
    setSelected(item);
    onRowSelect?.(item);
    announce(`Selected ${rowLabel(item)}`);
  }

  function toggleRow(item: T) {
    if (isProcessing) return;
    if (selected === item) {
      setSelected(null);
      announce(`Deselected ${rowLabel(item)}`);
    } else {
      selectRow(item);
    }
  }

  function focusCell(row: number, col: number) {
    setActive({ row, col });
    cellRefs.current.get(`${row}:${col}`)?.focus();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTableElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-grid-row]",
    );
    if (!target) return;
    const row = Number(target.dataset.gridRow);
    const col = Number(target.dataset.gridCol);

    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusCell(row, Math.min(col + 1, maxCol));
        return;
      case "ArrowLeft":
        e.preventDefault();
        focusCell(row, Math.max(col - 1, 0));
        return;
      case "ArrowDown":
        e.preventDefault();
        focusCell(Math.min(row + 1, maxRow), col);
        return;
      case "ArrowUp":
        e.preventDefault();
        focusCell(Math.max(row - 1, 0), col);
        return;
      case "Home":
        e.preventDefault();
        focusCell(e.ctrlKey ? 0 : row, 0);
        return;
      case "End":
        e.preventDefault();
        focusCell(e.ctrlKey ? maxRow : row, maxCol);
        return;
      case "Enter":
      case " ": {
        // Header buttons handle Enter/Space natively (click -> sort).
        if (row === 0) return;
        const item = pageRows[row - 1];
        if (item === undefined) return;
        e.preventDefault(); // stop Space from scrolling the page
        if (e.key === "Enter") selectRow(item);
        else toggleRow(item);
        return;
      }
    }
  }

  /** Keeps `active` in sync when a cell receives focus by mouse or Tab. */
  function handleFocus(e: React.FocusEvent<HTMLTableElement>) {
    const target = (e.target as HTMLElement).closest<HTMLElement>(
      "[data-grid-row]",
    );
    if (!target) return;
    setActive({
      row: Number(target.dataset.gridRow),
      col: Number(target.dataset.gridCol),
    });
  }

  /** Props shared by every element that can hold focus inside the grid. */
  function cellProps(row: number, col: number) {
    return {
      "data-grid-row": row,
      "data-grid-col": col,
      tabIndex: row === activeRow && col === activeCol ? 0 : -1,
      ref: (el: HTMLElement | null) => {
        const key = `${row}:${col}`;
        if (el) cellRefs.current.set(key, el);
        else cellRefs.current.delete(key);
      },
    };
  }

  const rangeStart = processed.length === 0 ? 0 : start + 1;
  const rangeEnd = start + pageRows.length;
  const prevDisabled = currentPage <= 1 || isProcessing;
  const nextDisabled = currentPage >= totalPages || isProcessing;

  return (
    <div className="data-grid-wrapper">
      <div className="data-grid__toolbar">
        <label htmlFor={filterId}>Filter rows</label>
        <input
          id={filterId}
          type="search"
          value={filter}
          onChange={(e) => handleFilter(e.target.value)}
          disabled={isProcessing}
        />
      </div>

      {/* The single live region: announcements are routed through here. */}
      <div
        className="visually-hidden"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {live.text}
        {live.n % 2 === 1 ? "\u00A0" : ""}
      </div>

      {isProcessing && <p className="data-grid__status">Loading data…</p>}

      <table
        className="data-grid"
        role="grid"
        aria-label={ariaLabel}
        aria-busy={isProcessing}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
      >
        <thead>
          <tr role="row">
            {columns.map((col, c) => {
              const sorted = sort?.key === col.accessorKey ? sort : null;
              const ariaSort = sorted
                ? sorted.direction === "asc"
                  ? "ascending"
                  : "descending"
                : undefined;
              return col.sortable ? (
                <th
                  key={String(col.accessorKey)}
                  scope="col"
                  role="columnheader"
                  aria-sort={ariaSort}
                  className="data-grid__th--sortable"
                >
                  <button
                    type="button"
                    className="data-grid__sort"
                    aria-disabled={isProcessing || undefined}
                    onClick={() => handleSort(col)}
                    {...cellProps(0, c)}
                  >
                    {col.header}
                    <span aria-hidden="true">
                      {sorted ? (sorted.direction === "asc" ? " ▲" : " ▼") : ""}
                    </span>
                  </button>
                </th>
              ) : (
                <th
                  key={String(col.accessorKey)}
                  scope="col"
                  role="columnheader"
                  {...cellProps(0, c)}
                >
                  {col.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {pageRows.length === 0 ? (
            <tr role="row">
              <td role="gridcell" colSpan={columns.length}>
                {isProcessing ? "Loading…" : "No matching rows."}
              </td>
            </tr>
          ) : (
            pageRows.map((item, i) => (
              <tr
                key={start + i}
                role="row"
                aria-selected={selected === item}
                className={selected === item ? "is-selected" : undefined}
                onClick={() => selectRow(item)}
              >
                {columns.map((col, c) => (
                  <td
                    key={String(col.accessorKey)}
                    role="gridcell"
                    {...cellProps(i + 1, c)}
                  >
                    {String(item[col.accessorKey] ?? "")}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      <nav
        className="data-grid__pagination"
        aria-label={`${ariaLabel} pagination`}
      >
        <button
          type="button"
          aria-disabled={prevDisabled || undefined}
          onClick={() => goToPage(currentPage - 1)}
        >
          Previous
        </button>
        <span>
          Page {currentPage} of {totalPages} · Rows {rangeStart}–{rangeEnd} of{" "}
          {processed.length}
        </span>
        <button
          type="button"
          aria-disabled={nextDisabled || undefined}
          onClick={() => goToPage(currentPage + 1)}
        >
          Next
        </button>
      </nav>
    </div>
  );
}

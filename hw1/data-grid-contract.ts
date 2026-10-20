/**
 * Public contract for the accessible Data-Grid component.
 *
 * Invariant: the rendered grid must expose full ARIA grid semantics
 * (role="grid", role="row", role="gridcell").
 */

export interface ColumnDef<T> {
  /** Visible column header text. */
  header: string;
  /** Key of the row object this column reads its value from. */
  accessorKey: keyof T;
  /** Whether the column can be sorted. */
  sortable?: boolean;
}

export interface DataGridProps<T> {
  /** Rows to display. */
  data: T[];
  /** Column definitions, in display order. */
  columns: ColumnDef<T>[];
  /** Called when a row is selected (Enter key or click). */
  onRowSelect?: (item: T) => void;
  /** Accessible name for the grid. */
  ariaLabel: string;
  /** True while data is loading/processing; the grid is marked busy. */
  isProcessing?: boolean;
}

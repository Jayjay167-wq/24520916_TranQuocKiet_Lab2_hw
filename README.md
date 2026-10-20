# HW1 – Production Enterprise Data-Grid (WCAG 2.2 AA)

## Run
```bash
npm install
npm run dev        # dev server
npm run typecheck  # TypeScript check
```

## Status
- [x] 1.1 Setup & contract (`src/data-grid-contract.ts`, `src/data/sampleData.ts`)
- [x] 1.2 Semantic markup (`src/components/DataGrid.tsx`)
- [x] 1.3 Core features (sort, filter, pagination, onRowSelect, isProcessing)
- [x] 1.4 Keyboard & a11y (roving tabindex, aria-sort, live region)
- [ ] 1.5 Audit & delivery

## Keyboard

The grid is a single tab stop (roving tabindex); arrows move inside it.

| Key | Action |
|-----|--------|
| Arrow keys | Move between cells (header row included) |
| Home / End | First / last cell in the row |
| Ctrl+Home / Ctrl+End | First / last cell in the grid |
| Enter (body cell) | Select the row (`onRowSelect`) |
| Space (body cell) | Toggle the row's selection |
| Enter / Space (sortable header) | Cycle sort: ascending, descending, none |

## Screen-reader behaviour

- `aria-sort` is set only on the currently sorted column header.
- One polite live region announces sort changes, filter result counts
  (debounced), page changes, selection changes and loading start/finish.

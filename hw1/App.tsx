import { useState } from "react";
import { DataGrid } from "./DataGrid";
import { employees, employeeColumns } from "./sampleData";

export default function App() {
  const [selected, setSelected] = useState<Employee | null>(null);

  return (
    <main>
      <h1>HW1 – Enterprise Data-Grid</h1>
      <DataGrid
        data={employees}
        columns={employeeColumns}
        onRowSelect={setSelected}
        ariaLabel="Employee directory"
      />
      <p>Selected: {selected ? `${selected.name} (${selected.role})` : "none"}</p>
    </main>
  );
}

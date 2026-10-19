import type { ColumnDef } from "../data-grid-contract";

export type Department = "Engineering" | "Design" | "Marketing" | "Sales" | "Support";

export interface Employee {
  id: number;
  name: string;
  email: string;
  department: Department;
  role: string;
  location: string;
  startDate: string; // ISO 8601 (YYYY-MM-DD)
  salary: number;
}

export const employees: Employee[] = [
  { id: 1,  name: "Linh Nguyen",   email: "linh.nguyen@example.com",   department: "Engineering", role: "Frontend Engineer",   location: "Ho Chi Minh City", startDate: "2021-03-15", salary: 2800 },
  { id: 2,  name: "Minh Tran",     email: "minh.tran@example.com",     department: "Engineering", role: "Backend Engineer",    location: "Hanoi",            startDate: "2020-07-01", salary: 3100 },
  { id: 3,  name: "Hoa Pham",      email: "hoa.pham@example.com",      department: "Design",      role: "UX Designer",         location: "Da Nang",          startDate: "2022-01-10", salary: 2400 },
  { id: 4,  name: "Duc Le",        email: "duc.le@example.com",        department: "Sales",       role: "Account Executive",   location: "Ho Chi Minh City", startDate: "2019-11-04", salary: 2200 },
  { id: 5,  name: "Thu Vo",        email: "thu.vo@example.com",        department: "Marketing",   role: "Content Strategist",  location: "Hanoi",            startDate: "2023-02-20", salary: 2000 },
  { id: 6,  name: "Khoa Dang",     email: "khoa.dang@example.com",     department: "Engineering", role: "DevOps Engineer",     location: "Ho Chi Minh City", startDate: "2018-09-17", salary: 3400 },
  { id: 7,  name: "Mai Bui",       email: "mai.bui@example.com",       department: "Support",     role: "Support Specialist",  location: "Can Tho",          startDate: "2022-06-06", salary: 1500 },
  { id: 8,  name: "An Hoang",      email: "an.hoang@example.com",      department: "Design",      role: "Product Designer",    location: "Hanoi",            startDate: "2021-08-23", salary: 2600 },
  { id: 9,  name: "Phuc Do",       email: "phuc.do@example.com",       department: "Engineering", role: "QA Engineer",         location: "Da Nang",          startDate: "2020-12-01", salary: 2300 },
  { id: 10, name: "Ngoc Vu",       email: "ngoc.vu@example.com",       department: "Sales",       role: "Sales Manager",       location: "Ho Chi Minh City", startDate: "2017-05-29", salary: 3000 },
  { id: 11, name: "Bao Ly",        email: "bao.ly@example.com",        department: "Marketing",   role: "SEO Analyst",         location: "Hanoi",            startDate: "2023-09-11", salary: 1900 },
  { id: 12, name: "Trang Ngo",     email: "trang.ngo@example.com",     department: "Support",     role: "Support Lead",        location: "Ho Chi Minh City", startDate: "2019-04-08", salary: 2100 },
  { id: 13, name: "Huy Duong",     email: "huy.duong@example.com",     department: "Engineering", role: "Full-Stack Engineer", location: "Da Nang",          startDate: "2022-10-03", salary: 2900 },
  { id: 14, name: "Yen Ha",        email: "yen.ha@example.com",        department: "Design",      role: "Design Lead",         location: "Hanoi",            startDate: "2018-02-12", salary: 3200 },
  { id: 15, name: "Son Truong",    email: "son.truong@example.com",    department: "Sales",       role: "Business Developer",  location: "Can Tho",          startDate: "2021-12-13", salary: 1800 },
  { id: 16, name: "Lan Dinh",      email: "lan.dinh@example.com",      department: "Marketing",   role: "Marketing Manager",   location: "Ho Chi Minh City", startDate: "2016-10-24", salary: 3100 },
  { id: 17, name: "Tuan Phan",     email: "tuan.phan@example.com",     department: "Engineering", role: "Engineering Manager", location: "Hanoi",            startDate: "2015-06-15", salary: 4200 },
  { id: 18, name: "Chi Mai",       email: "chi.mai@example.com",       department: "Support",     role: "Support Specialist",  location: "Da Nang",          startDate: "2023-05-22", salary: 1450 },
  { id: 19, name: "Vinh Cao",      email: "vinh.cao@example.com",      department: "Engineering", role: "Data Engineer",       location: "Ho Chi Minh City", startDate: "2020-03-30", salary: 3300 },
  { id: 20, name: "Quyen Luu",     email: "quyen.luu@example.com",     department: "Design",      role: "UI Designer",         location: "Can Tho",          startDate: "2024-01-15", salary: 2100 },
  { id: 21, name: "Dat Kieu",      email: "dat.kieu@example.com",      department: "Sales",       role: "Account Executive",   location: "Hanoi",            startDate: "2022-04-18", salary: 2250 },
  { id: 22, name: "Thao Lam",      email: "thao.lam@example.com",      department: "Marketing",   role: "Brand Designer",      location: "Da Nang",          startDate: "2021-07-05", salary: 2150 },
  { id: 23, name: "Nam Chau",      email: "nam.chau@example.com",      department: "Engineering", role: "Security Engineer",   location: "Ho Chi Minh City", startDate: "2019-08-19", salary: 3600 },
  { id: 24, name: "Hanh Ta",       email: "hanh.ta@example.com",       department: "Support",     role: "Customer Success",    location: "Hanoi",            startDate: "2024-03-04", salary: 1600 },
  { id: 25, name: "Long Mac",      email: "long.mac@example.com",      department: "Engineering", role: "Mobile Engineer",     location: "Da Nang",          startDate: "2021-01-25", salary: 2850 },
];

/** Column definitions for the sample dataset. Typed against Employee, so
 *  a misspelled accessorKey is a compile error. */
export const employeeColumns: ColumnDef<Employee>[] = [
  { header: "Name",       accessorKey: "name",       sortable: true },
  { header: "Email",      accessorKey: "email" },
  { header: "Department", accessorKey: "department", sortable: true },
  { header: "Role",       accessorKey: "role",       sortable: true },
  { header: "Location",   accessorKey: "location",   sortable: true },
  { header: "Start date", accessorKey: "startDate",  sortable: true },
  { header: "Salary (USD)", accessorKey: "salary",   sortable: true },
];

import { getStudentsForSelect, getCollegesForSelect } from "@/lib/db/queries";
import { AddCollegeForm } from "./add-college-form";

export default async function AddCollegePage() {
  const [students, colleges] = await Promise.all([
    getStudentsForSelect(),
    getCollegesForSelect(),
  ]);

  return <AddCollegeForm students={students} colleges={colleges} />;
}

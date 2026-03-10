import { getStudentsForSelect, getCollegesForSelect } from "@/lib/db/queries";
import { NewApplicationForm } from "./new-application-form";

export default async function NewApplicationPage() {
  const [students, colleges] = await Promise.all([
    getStudentsForSelect(),
    getCollegesForSelect(),
  ]);

  return <NewApplicationForm students={students} colleges={colleges} />;
}

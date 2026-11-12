import { getCollegePromptLibrary } from "@/lib/db/queries";
import { CollegePromptLibrary } from "./prompt-library-client";

export default async function CollegePromptLibraryPage() {
  return <CollegePromptLibrary sets={await getCollegePromptLibrary()} />;
}

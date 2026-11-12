import { revalidatePath } from "next/cache";

/** One invalidation set for the same work viewed through three personas. */
export function revalidateCollegeWorkspaces() {
  revalidatePath("/students", "layout");
  for (const path of ["/student-colleges", "/family-colleges", "/applications",
    "/student-applications", "/family-applications", "/essays", "/student-essays"]) revalidatePath(path);
  for (const path of ["/student-colleges/[id]", "/family-colleges/[id]", "/applications/[id]",
    "/essays/[id]", "/student-essays/[id]", "/family-essays/[id]"]) revalidatePath(path, "page");
}

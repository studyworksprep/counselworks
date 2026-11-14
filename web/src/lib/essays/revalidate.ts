import { revalidatePath } from "next/cache";

export function revalidateEssayPlanningBoards() {
  revalidatePath("/students/[id]/essays/planning", "page");
  revalidatePath("/student-essays/planning");
  revalidatePath("/family-essay-planning");
  revalidatePath("/family-essay-planning/[id]", "page");
}

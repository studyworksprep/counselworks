import {
  discoverColleges,
  getCollegeStates,
  getStudentsForSelect,
  type CollegeDiscoveryFilters,
} from "@/lib/db/queries";
import { DiscoverClient } from "./discover-client";

interface Props {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function CollegeDiscoverPage({ searchParams }: Props) {
  const params = await searchParams;

  const filters: CollegeDiscoveryFilters = {};
  if (params.search) filters.search = params.search;
  if (params.state) filters.state = params.state;
  if (params.institution_type) filters.institution_type = params.institution_type;
  if (params.locale_type) filters.locale_type = params.locale_type;
  if (params.acceptance_rate_min) filters.acceptance_rate_min = parseFloat(params.acceptance_rate_min);
  if (params.acceptance_rate_max) filters.acceptance_rate_max = parseFloat(params.acceptance_rate_max);
  if (params.sat_min) filters.sat_min = parseInt(params.sat_min);
  if (params.sat_max) filters.sat_max = parseInt(params.sat_max);
  if (params.act_min) filters.act_min = parseInt(params.act_min);
  if (params.act_max) filters.act_max = parseInt(params.act_max);
  if (params.tuition_max) filters.tuition_max = parseInt(params.tuition_max);
  if (params.enrollment_min) filters.enrollment_min = parseInt(params.enrollment_min);
  if (params.enrollment_max) filters.enrollment_max = parseInt(params.enrollment_max);
  if (params.graduation_rate_min) filters.graduation_rate_min = parseFloat(params.graduation_rate_min);
  if (params.usnews_rank_max) filters.usnews_rank_max = parseInt(params.usnews_rank_max);

  const hasFilters = Object.keys(filters).length > 0;

  const [colleges, states, students] = await Promise.all([
    hasFilters ? discoverColleges(filters) : discoverColleges({ usnews_rank_max: 100 }),
    getCollegeStates(),
    getStudentsForSelect(),
  ]);

  return (
    <DiscoverClient colleges={colleges} states={states} students={students} />
  );
}

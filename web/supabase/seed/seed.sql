-- Seed data for development
-- Run this after applying migrations

-- Insert sample colleges with IPEDS Unit IDs (scorecard_id)
INSERT INTO colleges (id, name, slug, city, state_region, country, website_url, application_platform, scorecard_id)
VALUES
  (gen_random_uuid(), 'Harvard University', 'harvard-university', 'Cambridge', 'MA', 'US', 'https://www.harvard.edu', 'Common App', 166027),
  (gen_random_uuid(), 'Stanford University', 'stanford-university', 'Stanford', 'CA', 'US', 'https://www.stanford.edu', 'Common App', 243744),
  (gen_random_uuid(), 'Massachusetts Institute of Technology', 'mit', 'Cambridge', 'MA', 'US', 'https://www.mit.edu', 'MyMIT', 166683),
  (gen_random_uuid(), 'Yale University', 'yale-university', 'New Haven', 'CT', 'US', 'https://www.yale.edu', 'Common App', 130794),
  (gen_random_uuid(), 'Princeton University', 'princeton-university', 'Princeton', 'NJ', 'US', 'https://www.princeton.edu', 'Common App', 186131),
  (gen_random_uuid(), 'Columbia University', 'columbia-university', 'New York', 'NY', 'US', 'https://www.columbia.edu', 'Common App', 190150),
  (gen_random_uuid(), 'University of Pennsylvania', 'university-of-pennsylvania', 'Philadelphia', 'PA', 'US', 'https://www.upenn.edu', 'Common App', 215062),
  (gen_random_uuid(), 'Duke University', 'duke-university', 'Durham', 'NC', 'US', 'https://www.duke.edu', 'Common App', 198419),
  (gen_random_uuid(), 'University of Chicago', 'university-of-chicago', 'Chicago', 'IL', 'US', 'https://www.uchicago.edu', 'Common App', 144050),
  (gen_random_uuid(), 'Northwestern University', 'northwestern-university', 'Evanston', 'IL', 'US', 'https://www.northwestern.edu', 'Common App', 147767),
  (gen_random_uuid(), 'Brown University', 'brown-university', 'Providence', 'RI', 'US', 'https://www.brown.edu', 'Common App', 217156),
  (gen_random_uuid(), 'Dartmouth College', 'dartmouth-college', 'Hanover', 'NH', 'US', 'https://www.dartmouth.edu', 'Common App', 182670),
  (gen_random_uuid(), 'Cornell University', 'cornell-university', 'Ithaca', 'NY', 'US', 'https://www.cornell.edu', 'Common App', 190415),
  (gen_random_uuid(), 'Vanderbilt University', 'vanderbilt-university', 'Nashville', 'TN', 'US', 'https://www.vanderbilt.edu', 'Common App', 221999),
  (gen_random_uuid(), 'Rice University', 'rice-university', 'Houston', 'TX', 'US', 'https://www.rice.edu', 'Common App', 227757),
  (gen_random_uuid(), 'University of Notre Dame', 'university-of-notre-dame', 'Notre Dame', 'IN', 'US', 'https://www.nd.edu', 'Common App', 152080),
  (gen_random_uuid(), 'Georgetown University', 'georgetown-university', 'Washington', 'DC', 'US', 'https://www.georgetown.edu', 'Georgetown App', 131496),
  (gen_random_uuid(), 'University of Michigan', 'university-of-michigan', 'Ann Arbor', 'MI', 'US', 'https://umich.edu', 'Common App', 170976),
  (gen_random_uuid(), 'University of Virginia', 'university-of-virginia', 'Charlottesville', 'VA', 'US', 'https://www.virginia.edu', 'Common App', 234076),
  (gen_random_uuid(), 'University of California, Berkeley', 'uc-berkeley', 'Berkeley', 'CA', 'US', 'https://www.berkeley.edu', 'UC App', 110635),
  (gen_random_uuid(), 'University of California, Los Angeles', 'ucla', 'Los Angeles', 'CA', 'US', 'https://www.ucla.edu', 'UC App', 110662),
  (gen_random_uuid(), 'University of Southern California', 'usc', 'Los Angeles', 'CA', 'US', 'https://www.usc.edu', 'Common App', 123961),
  (gen_random_uuid(), 'New York University', 'nyu', 'New York', 'NY', 'US', 'https://www.nyu.edu', 'Common App', 193900),
  (gen_random_uuid(), 'Boston University', 'boston-university', 'Boston', 'MA', 'US', 'https://www.bu.edu', 'Common App', 164988),
  (gen_random_uuid(), 'Emory University', 'emory-university', 'Atlanta', 'GA', 'US', 'https://www.emory.edu', 'Common App', 139658)
ON CONFLICT (slug) DO NOTHING;

-- ===========================================================================
-- Make the seeded catalog scorer-eligible
-- ===========================================================================
-- getCollegeRecommendations filters on `scorecard_synced_at IS NOT NULL`
-- (src/lib/db/queries.ts) and the scorer reads acceptance_rate, sat_avg,
-- act_avg, net_price_avg, graduation_rate, institution_type and state_region
-- (src/lib/colleges/recommendation.ts). Nothing but the College Scorecard sync
-- job ever writes those, so a freshly seeded database has zero eligible
-- colleges and every student gets "No recommendations found" — which is what
-- blocked golden-path step 3 on its first live run.
--
-- Values are derived deterministically from usnews_national_rank so the same
-- seed always produces the same recommendations: a test that asserts on
-- ordering must not depend on random data. They are plausible rather than
-- real; the sync job overwrites them with genuine Scorecard figures wherever
-- it runs.

UPDATE colleges SET
    -- Rank 1 ≈ 4% acceptance, rising to ~60% by rank 200; unranked sit at 55%.
    acceptance_rate = ROUND(
      LEAST(0.60, 0.04 + (COALESCE(usnews_national_rank, 180) - 1) * 0.0028)::numeric, 4),
    -- Rank 1 ≈ 1550 SAT, falling ~1.1 points per rank, floored at 1050.
    sat_avg = GREATEST(1050, 1550 - (COALESCE(usnews_national_rank, 180) - 1) * 11 / 10),
    act_avg = GREATEST(21, 35 - (COALESCE(usnews_national_rank, 180) - 1) / 18),
    graduation_rate = ROUND(
      GREATEST(0.45, 0.97 - (COALESCE(usnews_national_rank, 180) - 1) * 0.0022)::numeric, 4),
    -- Publics are cheaper and charge non-residents more; both bases matter to
    -- the 11.4 in-state/out-of-state net-cost logic.
    institution_type = CASE
      WHEN name ILIKE 'University of %' OR name ILIKE '%State University%'
        THEN 'public' ELSE 'private' END,
    tuition_in_state = CASE
      WHEN name ILIKE 'University of %' OR name ILIKE '%State University%'
        THEN 14000 ELSE 58000 END,
    tuition_out_state = CASE
      WHEN name ILIKE 'University of %' OR name ILIKE '%State University%'
        THEN 39000 ELSE 58000 END,
    net_price_avg = CASE
      WHEN name ILIKE 'University of %' OR name ILIKE '%State University%'
        THEN 19000 ELSE 32000 END,
    scorecard_synced_at = now()
WHERE scorecard_synced_at IS NULL;

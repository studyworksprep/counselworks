-- Seed data for development
-- Run this after applying migrations

-- Insert sample colleges
INSERT INTO colleges (id, name, slug, city, state_region, country, website_url, application_platform)
VALUES
  (gen_random_uuid(), 'Harvard University', 'harvard-university', 'Cambridge', 'MA', 'US', 'https://www.harvard.edu', 'Common App'),
  (gen_random_uuid(), 'Stanford University', 'stanford-university', 'Stanford', 'CA', 'US', 'https://www.stanford.edu', 'Common App'),
  (gen_random_uuid(), 'Massachusetts Institute of Technology', 'mit', 'Cambridge', 'MA', 'US', 'https://www.mit.edu', 'MyMIT'),
  (gen_random_uuid(), 'Yale University', 'yale-university', 'New Haven', 'CT', 'US', 'https://www.yale.edu', 'Common App'),
  (gen_random_uuid(), 'Princeton University', 'princeton-university', 'Princeton', 'NJ', 'US', 'https://www.princeton.edu', 'Common App'),
  (gen_random_uuid(), 'Columbia University', 'columbia-university', 'New York', 'NY', 'US', 'https://www.columbia.edu', 'Common App'),
  (gen_random_uuid(), 'University of Pennsylvania', 'university-of-pennsylvania', 'Philadelphia', 'PA', 'US', 'https://www.upenn.edu', 'Common App'),
  (gen_random_uuid(), 'Duke University', 'duke-university', 'Durham', 'NC', 'US', 'https://www.duke.edu', 'Common App'),
  (gen_random_uuid(), 'University of Chicago', 'university-of-chicago', 'Chicago', 'IL', 'US', 'https://www.uchicago.edu', 'Common App'),
  (gen_random_uuid(), 'Northwestern University', 'northwestern-university', 'Evanston', 'IL', 'US', 'https://www.northwestern.edu', 'Common App'),
  (gen_random_uuid(), 'Brown University', 'brown-university', 'Providence', 'RI', 'US', 'https://www.brown.edu', 'Common App'),
  (gen_random_uuid(), 'Dartmouth College', 'dartmouth-college', 'Hanover', 'NH', 'US', 'https://www.dartmouth.edu', 'Common App'),
  (gen_random_uuid(), 'Cornell University', 'cornell-university', 'Ithaca', 'NY', 'US', 'https://www.cornell.edu', 'Common App'),
  (gen_random_uuid(), 'Vanderbilt University', 'vanderbilt-university', 'Nashville', 'TN', 'US', 'https://www.vanderbilt.edu', 'Common App'),
  (gen_random_uuid(), 'Rice University', 'rice-university', 'Houston', 'TX', 'US', 'https://www.rice.edu', 'Common App'),
  (gen_random_uuid(), 'University of Notre Dame', 'university-of-notre-dame', 'Notre Dame', 'IN', 'US', 'https://www.nd.edu', 'Common App'),
  (gen_random_uuid(), 'Georgetown University', 'georgetown-university', 'Washington', 'DC', 'US', 'https://www.georgetown.edu', 'Georgetown App'),
  (gen_random_uuid(), 'University of Michigan', 'university-of-michigan', 'Ann Arbor', 'MI', 'US', 'https://umich.edu', 'Common App'),
  (gen_random_uuid(), 'University of Virginia', 'university-of-virginia', 'Charlottesville', 'VA', 'US', 'https://www.virginia.edu', 'Common App'),
  (gen_random_uuid(), 'University of California, Berkeley', 'uc-berkeley', 'Berkeley', 'CA', 'US', 'https://www.berkeley.edu', 'UC App'),
  (gen_random_uuid(), 'University of California, Los Angeles', 'ucla', 'Los Angeles', 'CA', 'US', 'https://www.ucla.edu', 'UC App'),
  (gen_random_uuid(), 'University of Southern California', 'usc', 'Los Angeles', 'CA', 'US', 'https://www.usc.edu', 'Common App'),
  (gen_random_uuid(), 'New York University', 'nyu', 'New York', 'NY', 'US', 'https://www.nyu.edu', 'Common App'),
  (gen_random_uuid(), 'Boston University', 'boston-university', 'Boston', 'MA', 'US', 'https://www.bu.edu', 'Common App'),
  (gen_random_uuid(), 'Emory University', 'emory-university', 'Atlanta', 'GA', 'US', 'https://www.emory.edu', 'Common App')
ON CONFLICT (slug) DO NOTHING;

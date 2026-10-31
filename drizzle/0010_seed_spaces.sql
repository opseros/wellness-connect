-- The six spaces shown on the home page, as open groups anyone can join.
INSERT INTO "group" (slug, name, about, privacy, kind, space_key) VALUES
  ('wellness-mindfulness', 'Wellness & mindfulness', 'Breathwork, sleep, stress and the small habits that actually stick.', 'public', 'space', 'wellness'),
  ('travel', 'Travel', 'Retreats, slow weekends and work trips that leave you rested.', 'public', 'space', 'travel'),
  ('meetups', 'Meet-ups', 'Sunrise walks, run clubs and chai circles in your city.', 'public', 'space', 'meetup'),
  ('fitness-movement', 'Fitness & movement', 'Desk yoga, strength, cycling and getting back into sport.', 'public', 'space', 'move'),
  ('food-nutrition', 'Food & nutrition', 'Lunchbox ideas, mindful eating and recipes worth sharing.', 'public', 'space', 'food'),
  ('careers-mentoring', 'Careers & mentoring', 'Burnout, boundaries, growth and finding a mentor.', 'public', 'space', 'career')
ON CONFLICT (slug) DO NOTHING;

-- Hospitals (and everything Care & Travel) start switched off; super admins turn
-- them on in Admin → Settings. Keeps an existing choice if the row is already there.
INSERT INTO "feature_flag" ("key", "enabled") VALUES ('hospitals', false) ON CONFLICT ("key") DO NOTHING;

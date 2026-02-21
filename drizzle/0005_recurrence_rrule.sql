ALTER TABLE "publication" ADD COLUMN "event_recurrence_rule" varchar(500);
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_interval";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_day_of_week";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_start_day";
ALTER TABLE "publication" DROP COLUMN IF EXISTS "event_recurrence_end_day";

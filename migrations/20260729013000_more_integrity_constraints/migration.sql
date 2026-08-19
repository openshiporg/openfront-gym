-- Fail closed when historical rows are ambiguous; do not silently merge evidence.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "ClassInstance" WHERE "classSchedule" IS NOT NULL GROUP BY "organization", "classSchedule", "date" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate class instances require manual remediation';
  END IF;
  IF EXISTS (SELECT 1 FROM "WorkoutSet" WHERE "workoutLog" IS NOT NULL AND "exercise" IS NOT NULL GROUP BY "organization", "workoutLog", "exercise", "setNumber" HAVING count(*) > 1) THEN
    RAISE EXCEPTION 'Duplicate workout sets require manual remediation';
  END IF;
END $$;

CREATE UNIQUE INDEX "ClassInstance_organization_classSchedule_date_key"
  ON "ClassInstance"("organization", "classSchedule", "date");
CREATE UNIQUE INDEX "WorkoutSet_organization_workoutLog_exercise_setNumber_key"
  ON "WorkoutSet"("organization", "workoutLog", "exercise", "setNumber");

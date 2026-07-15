-- CreateTable
CREATE TABLE "universities" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "country" TEXT,
    "city" TEXT,
    "created_at" DATETIME,
    "updated_at" DATETIME
);

-- CreateTable
CREATE TABLE "faculties" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "university_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "faculties_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "faculty_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "departments_faculty_id_fkey" FOREIGN KEY ("faculty_id") REFERENCES "faculties" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "courses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department_id" TEXT,
    "university_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "courses_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "courses_university_id_fkey" FOREIGN KEY ("university_id") REFERENCES "universities" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "past_questions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "year" INTEGER,
    "question_text" TEXT,
    "option_a" TEXT,
    "option_b" TEXT,
    "option_c" TEXT,
    "option_d" TEXT,
    "correct_index" INTEGER,
    "explanation" TEXT,
    "file_url" TEXT,
    "created_at" DATETIME,
    "updated_at" DATETIME,
    CONSTRAINT "past_questions_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "settings" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "language" TEXT NOT NULL DEFAULT 'en',
    "model" TEXT NOT NULL DEFAULT 'gemma4:e2b',
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "study_intakes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "topic" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "study_minutes" INTEGER NOT NULL,
    "scenario_type" TEXT NOT NULL,
    "scenario" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "study_syllabi" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "intake_id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "units_json" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "study_syllabi_intake_id_fkey" FOREIGN KEY ("intake_id") REFERENCES "study_intakes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "subunit_progress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "syllabus_id" TEXT NOT NULL,
    "subunit_id" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "last_visited" DATETIME,
    CONSTRAINT "subunit_progress_syllabus_id_fkey" FOREIGN KEY ("syllabus_id") REFERENCES "study_syllabi" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "questions_of_day" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" TEXT NOT NULL,
    "past_question_id" TEXT,
    "answered_index" INTEGER,
    "correct" BOOLEAN,
    "answered_at" DATETIME
);

-- CreateTable
CREATE TABLE "streaks" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "last_active_date" TEXT
);

-- CreateTable
CREATE TABLE "bookmarks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "ref_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL,
    "raw_text" TEXT,
    "summary" TEXT,
    "key_concepts" TEXT,
    "quiz_json" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "cbt_attempts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "course_id" TEXT NOT NULL,
    "question_ids" TEXT NOT NULL,
    "answers" TEXT,
    "score" INTEGER,
    "total" INTEGER,
    "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" DATETIME
);

-- CreateIndex
CREATE INDEX "faculties_university_id_idx" ON "faculties"("university_id");

-- CreateIndex
CREATE INDEX "departments_faculty_id_idx" ON "departments"("faculty_id");

-- CreateIndex
CREATE INDEX "courses_department_id_idx" ON "courses"("department_id");

-- CreateIndex
CREATE INDEX "courses_university_id_idx" ON "courses"("university_id");

-- CreateIndex
CREATE INDEX "past_questions_course_id_idx" ON "past_questions"("course_id");

-- CreateIndex
CREATE INDEX "past_questions_course_id_year_idx" ON "past_questions"("course_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "subunit_progress_syllabus_id_subunit_id_key" ON "subunit_progress"("syllabus_id", "subunit_id");

-- CreateIndex
CREATE UNIQUE INDEX "questions_of_day_date_key" ON "questions_of_day"("date");

-- CreateIndex
CREATE UNIQUE INDEX "bookmarks_kind_ref_id_key" ON "bookmarks"("kind", "ref_id");

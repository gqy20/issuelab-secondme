-- CreateEnum
CREATE TYPE "MentionTaskStatus" AS ENUM ('pending', 'running', 'done', 'failed');

-- CreateTable
CREATE TABLE "forum_cursors" (
    "id" TEXT NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_cursors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mention_tasks" (
    "id" TEXT NOT NULL,
    "dedupe_key" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "author_id" TEXT,
    "content" TEXT NOT NULL,
    "status" "MentionTaskStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mention_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "mention_tasks_dedupe_key_key" ON "mention_tasks"("dedupe_key");

-- CreateIndex
CREATE INDEX "mention_tasks_status_next_run_at_idx" ON "mention_tasks"("status", "next_run_at");

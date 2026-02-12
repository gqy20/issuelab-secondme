-- CreateTable
CREATE TABLE "forum_publish_tasks" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "thread_id" TEXT NOT NULL,
    "comment_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "status" "MentionTaskStatus" NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_run_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "forum_publish_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "forum_publish_tasks_user_id_created_at_idx" ON "forum_publish_tasks"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "forum_publish_tasks_status_next_run_at_idx" ON "forum_publish_tasks"("status", "next_run_at");

-- AddForeignKey
ALTER TABLE "forum_publish_tasks" ADD CONSTRAINT "forum_publish_tasks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "targetLogin" TEXT,
    "targetRole" "EmployeeRole",
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_targetLogin_isRead_idx" ON "Notification"("targetLogin", "isRead");

-- CreateIndex
CREATE INDEX "Notification_targetRole_isRead_idx" ON "Notification"("targetRole", "isRead");

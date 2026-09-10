-- CreateEnum
CREATE TYPE "WorkOrderStatus" AS ENUM ('created', 'in_progress', 'waiting_otk', 'rework', 'closed');

-- CreateEnum
CREATE TYPE "LaunchStatus" AS ENUM ('to_launch', 'issued', 'in_work', 'done');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed', 'auto_closed');

-- CreateEnum
CREATE TYPE "TransitionStatus" AS ENUM ('in_progress', 'completed', 'checked');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('pending', 'printed');

-- CreateEnum
CREATE TYPE "EmployeeRole" AS ENUM ('master', 'shift', 'operator', 'otk');

-- CreateTable
CREATE TABLE "Catalog" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "designation2" TEXT NOT NULL,
    "parentQty" DOUBLE PRECISION NOT NULL,
    "blankType" TEXT NOT NULL,
    "material" TEXT NOT NULL,
    "materialGrade" TEXT NOT NULL,
    "blankSize" TEXT NOT NULL,
    "wallThickness" DOUBLE PRECISION NOT NULL,
    "cutLength" DOUBLE PRECISION NOT NULL,
    "ppb" TEXT NOT NULL,
    "blankWeight" DOUBLE PRECISION NOT NULL,
    "partWeight" DOUBLE PRECISION NOT NULL,
    "cutting" BOOLEAN NOT NULL,
    "heatTreatment" BOOLEAN NOT NULL,
    "plasma" BOOLEAN NOT NULL,
    "turning" BOOLEAN NOT NULL,
    "milling" BOOLEAN NOT NULL,
    "drilling" BOOLEAN NOT NULL,
    "fitting" BOOLEAN NOT NULL,
    "bending" BOOLEAN NOT NULL,
    "coating" BOOLEAN NOT NULL,
    "priority" TEXT NOT NULL,

    CONSTRAINT "Catalog_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "Launches" (
    "id" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assembly" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "paNumber" TEXT NOT NULL,
    "status" "LaunchStatus" NOT NULL DEFAULT 'to_launch',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "launchType" TEXT NOT NULL DEFAULT 'Основной',
    "reason" TEXT,
    "relatedLaunchId" TEXT,

    CONSTRAINT "Launches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrders" (
    "number" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "assembly" TEXT NOT NULL,
    "program" TEXT,
    "customer" TEXT,
    "sp" TEXT,
    "operator" TEXT NOT NULL,
    "machine" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "status" "WorkOrderStatus" NOT NULL DEFAULT 'created',
    "launchId" TEXT,
    "reworkReason" TEXT,

    CONSTRAINT "WorkOrders_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "Transitions" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "time" DOUBLE PRECISION NOT NULL,
    "melt" TEXT,
    "machine" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "status" "TransitionStatus" NOT NULL DEFAULT 'in_progress',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "accepted" DOUBLE PRECISION,
    "defect" DOUBLE PRECISION,

    CONSTRAINT "Transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClosedOrders" (
    "id" TEXT NOT NULL,
    "orderNumber" TEXT NOT NULL,
    "acceptedTotal" DOUBLE PRECISION NOT NULL,
    "defectTotal" DOUBLE PRECISION NOT NULL,
    "defectReason" TEXT,
    "comment" TEXT,
    "closedBy" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClosedOrders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shifts" (
    "id" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "machine" TEXT NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',

    CONSTRAINT "Shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PrintQueue" (
    "id" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "orderNumber" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "assembly" TEXT NOT NULL,
    "program" TEXT,
    "customer" TEXT,
    "sp" TEXT,
    "operator" TEXT NOT NULL,
    "machine" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "status" "PrintJobStatus" NOT NULL DEFAULT 'pending',

    CONSTRAINT "PrintQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employees" (
    "login" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "role" "EmployeeRole" NOT NULL,

    CONSTRAINT "Employees_pkey" PRIMARY KEY ("login")
);

-- CreateTable
CREATE TABLE "Equipment" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Queue" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "assembly" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "machines" TEXT NOT NULL,
    "qty" DOUBLE PRECISION NOT NULL,
    "priority" TEXT NOT NULL,
    "customer" TEXT,
    "sp" TEXT,
    "program" TEXT,
    "operator" TEXT,
    "issueMachine" TEXT,
    "issue" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT,

    CONSTRAINT "Queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Transitions_orderNumber_number_key" ON "Transitions"("orderNumber", "number");

-- CreateIndex
CREATE UNIQUE INDEX "PrintQueue_orderNumber_key" ON "PrintQueue"("orderNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Equipment_name_key" ON "Equipment"("name");

-- AddForeignKey
ALTER TABLE "Launches" ADD CONSTRAINT "Launches_partCode_fkey" FOREIGN KEY ("partCode") REFERENCES "Catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Launches" ADD CONSTRAINT "Launches_relatedLaunchId_fkey" FOREIGN KEY ("relatedLaunchId") REFERENCES "Launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrders" ADD CONSTRAINT "WorkOrders_partCode_fkey" FOREIGN KEY ("partCode") REFERENCES "Catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrders" ADD CONSTRAINT "WorkOrders_launchId_fkey" FOREIGN KEY ("launchId") REFERENCES "Launches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transitions" ADD CONSTRAINT "Transitions_orderNumber_fkey" FOREIGN KEY ("orderNumber") REFERENCES "WorkOrders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClosedOrders" ADD CONSTRAINT "ClosedOrders_orderNumber_fkey" FOREIGN KEY ("orderNumber") REFERENCES "WorkOrders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintQueue" ADD CONSTRAINT "PrintQueue_orderNumber_fkey" FOREIGN KEY ("orderNumber") REFERENCES "WorkOrders"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PrintQueue" ADD CONSTRAINT "PrintQueue_partCode_fkey" FOREIGN KEY ("partCode") REFERENCES "Catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Queue" ADD CONSTRAINT "Queue_code_fkey" FOREIGN KEY ("code") REFERENCES "Catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

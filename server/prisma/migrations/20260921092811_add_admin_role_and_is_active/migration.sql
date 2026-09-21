-- AlterEnum
ALTER TYPE "EmployeeRole" ADD VALUE 'admin';

-- AlterTable
ALTER TABLE "Employees" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true;

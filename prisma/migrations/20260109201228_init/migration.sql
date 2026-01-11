-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN_MASTER', 'FULL', 'WRITE', 'BEGINNER');

-- CreateEnum
CREATE TYPE "Sector" AS ENUM ('SUPORTE_N2', 'OEM', 'ATENDIMENTO');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'BEGINNER',
    "sector" "Sector" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

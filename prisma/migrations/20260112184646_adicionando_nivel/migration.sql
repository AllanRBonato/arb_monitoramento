/*
  Warnings:

  - You are about to drop the column `description` on the `roles` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "roles" DROP COLUMN "description",
ADD COLUMN     "label" TEXT NOT NULL DEFAULT 'Leitura',
ADD COLUMN     "level" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "excelLink" TEXT;

-- CreateTable
CREATE TABLE "providers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vlan" TEXT,
    "contact" TEXT,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "providers_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "providers" ADD CONSTRAINT "providers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

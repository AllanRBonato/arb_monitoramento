-- CreateTable
CREATE TABLE "password_requests" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_requests_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "password_requests" ADD CONSTRAINT "password_requests_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

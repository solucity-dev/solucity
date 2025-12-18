-- CreateIndex
CREATE INDEX "idx_serviceOrder_status_deadline" ON "ServiceOrder"("status", "acceptDeadlineAt");

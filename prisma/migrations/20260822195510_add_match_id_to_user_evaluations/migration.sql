-- AlterTable
-- user_evaluations 테이블이 아직 비어있어(평가 기능 미구현 상태였음) NOT NULL로 바로 추가.
ALTER TABLE "user_evaluations" ADD COLUMN     "match_id" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "user_evaluations_match_id_evaluator_id_target_id_key" ON "user_evaluations"("match_id", "evaluator_id", "target_id");

-- AddForeignKey
ALTER TABLE "user_evaluations" ADD CONSTRAINT "user_evaluations_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "custom_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

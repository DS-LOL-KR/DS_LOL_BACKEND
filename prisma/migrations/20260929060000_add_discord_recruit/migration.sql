-- AlterTable
ALTER TABLE "users" ADD COLUMN     "discord_user_id" TEXT;

-- AlterTable
ALTER TABLE "custom_matches" ADD COLUMN     "recruit_size" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "users_discord_user_id_key" ON "users"("discord_user_id");

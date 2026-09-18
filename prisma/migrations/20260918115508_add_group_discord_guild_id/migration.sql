-- AlterTable
ALTER TABLE "groups" ADD COLUMN     "discord_guild_id" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "groups_discord_guild_id_key" ON "groups"("discord_guild_id");

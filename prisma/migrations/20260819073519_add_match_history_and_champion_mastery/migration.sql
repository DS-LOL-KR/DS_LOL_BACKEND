-- AlterTable
ALTER TABLE "user_game_stats" ADD COLUMN     "profile_icon_id" INTEGER,
ADD COLUMN     "summoner_level" INTEGER;

-- CreateTable
CREATE TABLE "match_histories" (
    "id" SERIAL NOT NULL,
    "riot_match_id" TEXT NOT NULL,
    "game_id" INTEGER NOT NULL,
    "queue_type" TEXT,
    "played_at" TIMESTAMP(3) NOT NULL,
    "duration_seconds" INTEGER NOT NULL,
    "synced_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_histories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_history_participants" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "game_account_id" INTEGER NOT NULL,
    "champion_id" INTEGER NOT NULL,
    "position" TEXT,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "cs" INTEGER NOT NULL,
    "gold_earned" INTEGER NOT NULL,
    "damage_dealt" INTEGER NOT NULL,
    "vision_score" INTEGER NOT NULL,
    "win" BOOLEAN NOT NULL,

    CONSTRAINT "match_history_participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "champion_masteries" (
    "id" SERIAL NOT NULL,
    "game_account_id" INTEGER NOT NULL,
    "champion_id" INTEGER NOT NULL,
    "mastery_level" INTEGER NOT NULL,
    "mastery_points" INTEGER NOT NULL,
    "last_play_time" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "champion_masteries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_histories_riot_match_id_key" ON "match_histories"("riot_match_id");

-- CreateIndex
CREATE UNIQUE INDEX "match_history_participants_match_id_game_account_id_key" ON "match_history_participants"("match_id", "game_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "champion_masteries_game_account_id_champion_id_key" ON "champion_masteries"("game_account_id", "champion_id");

-- AddForeignKey
ALTER TABLE "match_histories" ADD CONSTRAINT "match_histories_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history_participants" ADD CONSTRAINT "match_history_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "match_histories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_history_participants" ADD CONSTRAINT "match_history_participants_game_account_id_fkey" FOREIGN KEY ("game_account_id") REFERENCES "game_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "champion_masteries" ADD CONSTRAINT "champion_masteries_game_account_id_fkey" FOREIGN KEY ("game_account_id") REFERENCES "game_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

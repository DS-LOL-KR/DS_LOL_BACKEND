-- CreateEnum
CREATE TYPE "Role" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('WAITING', 'MATCHED', 'FINISHED');

-- CreateEnum
CREATE TYPE "Team" AS ENUM ('TEAM_A', 'TEAM_B');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "nickname" TEXT NOT NULL,
    "profile_image_url" TEXT,
    "bio" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_accounts" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "game_nickname" TEXT NOT NULL,
    "puuid" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_game_stats" (
    "id" SERIAL NOT NULL,
    "game_account_id" INTEGER NOT NULL,
    "official_tier" TEXT,
    "internal_mmr" INTEGER NOT NULL DEFAULT 1000,
    "main_position" TEXT,
    "sub_position" TEXT,
    "manner_score" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_game_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_position_stats" (
    "id" SERIAL NOT NULL,
    "game_account_id" INTEGER NOT NULL,
    "position" TEXT NOT NULL,
    "position_mmr" INTEGER NOT NULL DEFAULT 1000,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "win_rate" DOUBLE PRECISION NOT NULL DEFAULT 0.0,

    CONSTRAINT "user_position_stats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_evaluations" (
    "id" SERIAL NOT NULL,
    "evaluator_id" INTEGER NOT NULL,
    "target_id" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "owner_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "invite_code" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_members" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_matches" (
    "id" SERIAL NOT NULL,
    "group_id" INTEGER NOT NULL,
    "game_id" INTEGER NOT NULL,
    "created_by" INTEGER NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'WAITING',
    "winning_team" "Team",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "custom_match_participants" (
    "id" SERIAL NOT NULL,
    "match_id" INTEGER NOT NULL,
    "user_id" INTEGER NOT NULL,
    "assigned_team" "Team",
    "assigned_position" TEXT,
    "mmr_change" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "custom_match_participants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "games_code_key" ON "games"("code");

-- CreateIndex
CREATE UNIQUE INDEX "game_accounts_user_id_game_id_key" ON "game_accounts"("user_id", "game_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_game_stats_game_account_id_key" ON "user_game_stats"("game_account_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_position_stats_game_account_id_position_key" ON "user_position_stats"("game_account_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "groups_invite_code_key" ON "groups"("invite_code");

-- CreateIndex
CREATE UNIQUE INDEX "group_members_group_id_user_id_key" ON "group_members"("group_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "custom_match_participants_match_id_user_id_key" ON "custom_match_participants"("match_id", "user_id");

-- AddForeignKey
ALTER TABLE "game_accounts" ADD CONSTRAINT "game_accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_accounts" ADD CONSTRAINT "game_accounts_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_game_stats" ADD CONSTRAINT "user_game_stats_game_account_id_fkey" FOREIGN KEY ("game_account_id") REFERENCES "game_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_position_stats" ADD CONSTRAINT "user_position_stats_game_account_id_fkey" FOREIGN KEY ("game_account_id") REFERENCES "game_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_evaluations" ADD CONSTRAINT "user_evaluations_evaluator_id_fkey" FOREIGN KEY ("evaluator_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_evaluations" ADD CONSTRAINT "user_evaluations_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_matches" ADD CONSTRAINT "custom_matches_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_matches" ADD CONSTRAINT "custom_matches_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_matches" ADD CONSTRAINT "custom_matches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_match_participants" ADD CONSTRAINT "custom_match_participants_match_id_fkey" FOREIGN KEY ("match_id") REFERENCES "custom_matches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "custom_match_participants" ADD CONSTRAINT "custom_match_participants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

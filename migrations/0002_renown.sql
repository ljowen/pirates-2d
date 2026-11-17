-- Renown: earned on the open sea by work done together — bounties, escorts,
-- settlements defended. The leaderboard is ordered by it.
ALTER TABLE stats ADD COLUMN renown INTEGER NOT NULL DEFAULT 0;

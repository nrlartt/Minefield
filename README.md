# Lila Minefield (Play.fun-ready)

A premium classic Minesweeper experience for Play.fun, designed and shipped fully autonomously by AI agent **Lila** (end-to-end game design, UI, logic, balancing, SDK integration, and deployment).

## Features
- Pure HTML/CSS/JS (no build step)
- 3 difficulty levels (Easy / Medium / Hard)
- Left click to reveal, right click to flag
- Mobile long-press to flag
- First-click safety (first clicked cell + neighbors are mine-free)

## Run locally
```bash
cd /home/nrlio/.openclaw/workspace
python3 -m http.server 8080
```

Open:
`http://localhost:8080/playfun-minesweeper/`

## Cover image
Use `cover.jpg` in this folder.

## Suggested Play.fun registration fields
- `name`: Lila Minefield
- `description`: Classic Minesweeper-style puzzle game by Lila.
- `platform`: web
- `isHTMLGame`: true
- `iframable`: true
- `maxScorePerSession`: 10000
- `maxSessionsPerDay`: 100
- `maxCumulativePointsPerDay`: 200000

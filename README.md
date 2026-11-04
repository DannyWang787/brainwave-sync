# 腦波對頻 (Brainwave Sync)

An online word-meld party game for **2–10 players**. Everyone secretly writes a word; the round **passes** only if every player wrote the same word. Otherwise you keep linking from last round's words until you sync (or run out of rounds and **fail**).

## Rules

1. Each round, every player secretly writes one word. Words are revealed when everyone has submitted or the timer runs out.
2. Round 1 links two random starter words (or starts free, if the host turns topics off). After that, link the words from the previous round.
3. **Pass:** every player wrote the same word.
4. Partial matches (e.g. 3 of 7 players) are highlighted to help the group narrow in, but they don't pass.
5. **Fail:** if the host set a round limit (8 or 12) and it runs out before everyone matches. With "不限" there's no limit.

Room settings: player cap (2–10), round time (45 / 60 / 90 s), round limit (unlimited / 8 / 12), starter topic on or off. The host can start as soon as **2 or more** players are in.

Other details: anyone joining mid-round watches and plays from the next round; if the host leaves, the next player becomes host; refreshing the page puts you back in the same room.

## Try it on your own computer

You need Node.js 18 or newer (download from nodejs.org).

```
npm install
npm start
```

Open http://localhost:3000. To test with "friends", open a second browser window in private/incognito mode and join with the room code.

## Put it online for friends (free, using Render)

Your friends need a public link, so the server has to run on the internet. Render has a free plan that works for this.

The code is already on GitHub in this repository, so you only need Render:

1. **Make a Render account** at render.com and sign in with GitHub.
2. Click **New → Web Service**, pick the `brainwave-sync` repo.
3. Settings:
   - Runtime: **Node**
   - Build command: `npm install`
   - Start command: `npm start`
   - Instance type: **Free**
4. Click **Create Web Service**. After a minute or two you get a link like `https://brainwave-sync.onrender.com`.
5. Open the link, create a room, tap **複製邀請連結**, and send it to your friends on WhatsApp/IG. They open it, type a nickname, and they're in.

Notes on the free plan:
- It goes to sleep when nobody's playing, so the first visit after a while can take about a minute to load. After that it's fast.
- Rooms live in the server's memory, so they disappear if the server restarts or sleeps. That's fine for a party game: just make a new room.

## Changing things

All the settings are at the top of `server.js`:
- `MAX_PLAYERS` – the player cap (currently 10)
- `MIN_PLAYERS` – how many are needed to start (currently 2)
- `TOPICS` – the list of starter word pairs; add your own

If you change `MAX_PLAYERS`, also update the button list `[2,3,4,5,6,7,8,9,10]` in `public/index.html`. Edit the files on GitHub (pencil icon → Commit changes) and Render redeploys automatically.

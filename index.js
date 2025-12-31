require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error("BOT_TOKEN missing. Add it in Railway Variables.");
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });
console.log("AmongUs Bot started.");

const games = new Map(); // key: chatId, value: gameState

function getGame(chatId) {
  return games.get(chatId);
}

function isGroup(chat) {
  return chat && (chat.type === "group" || chat.type === "supergroup");
}

function usernameOf(user) {
  if (!user) return "unknown";
  if (user.username) return "@" + user.username;
  return (user.first_name  "User") + (user.last_name ? " " + user.last_name : "");
}

function ensureGroup(msg) {
  if (!isGroup(msg.chat)) {
    bot.sendMessage(msg.chat.id, "Ye game group me chalega. Ek group me add karke use karo.");
    return false;
  }
  return true;
}

bot.onText(/^\/newgame$/, (msg) => {
  if (!ensureGroup(msg)) return;

  const chatId = msg.chat.id;
  const g = {
    status: "lobby",
    ownerId: msg.from.id,
    players: new Map(), // userId -> { id, name, alive, role }
    votes: new Map() // voterId -> targetId
  };

  g.players.set(msg.from.id, { id: msg.from.id, name: usernameOf(msg.from), alive: true, role: "crewmate" });
  games.set(chatId, g);

  bot.sendMessage(chatId, "Lobby ban gaya ✅\nPlayers join karein: /join\nStart: /startgame (2-4 players)");
});

bot.onText(/^\/join$/, (msg) => {
  if (!ensureGroup(msg)) return;

  const chatId = msg.chat.id;
  const g = getGame(chatId);
  if (!g  g.status !== "lobby") {
    bot.sendMessage(chatId, "Pehle /newgame karo.");
    return;
  }

  if (g.players.size >= 4) {
    bot.sendMessage(chatId, "Max 4 players ho gaye. /startgame karo.");
    return;
  }

  if (!g.players.has(msg.from.id)) {
    g.players.set(msg.from.id, { id: msg.from.id, name: usernameOf(msg.from), alive: true, role: "crewmate" });
  }

  bot.sendMessage(chatId, "Joined ✅ (" + g.players.size + "/4)\nPlayers: " + Array.from(g.players.values()).map(p => p.name).join(", "));
});

bot.onText(/^\/startgame$/, (msg) => {
  if (!ensureGroup(msg)) return;

  const chatId = msg.chat.id;
  const g = getGame(chatId);
  if (!g  g.status !== "lobby") {
    bot.sendMessage(chatId, "Pehle /newgame karo.");
    return;
  }

  if (msg.from.id !== g.ownerId) {
    bot.sendMessage(chatId, "Sirf lobby owner start kar sakta hai.");
    return;
  }

  if (g.players.size < 2) {
    bot.sendMessage(chatId, "Kam se kam 2 players chahiye.");
    return;
  }

  // Reset roles
  const ids = Array.from(g.players.keys());
  ids.forEach((id) => {
    const p = g.players.get(id);
    p.role = "crewmate";
    p.alive = true;
  });

  // Pick 1 impostor
  const impId = ids[Math.floor(Math.random() * ids.length)];
  g.players.get(impId).role = "impostor";

  g.status = "playing";
  g.votes.clear();

  // DM roles (best effort)
  ids.forEach((id) => {
    const p = g.players.get(id);
    const text = (p.role === "impostor")
      ? "ROLE: IMPOSTOR 😈\nGoal: bach ke raho, vote se bachna."
      : "ROLE: CREWMATE 👨‍🚀\nGoal: impostor ko vote out karo.";
    bot.sendMessage(id, text).catch(() => {});
  });

  bot.sendMessage(chatId, "Game start ✅\nVoting mode: /sus @username\nStatus: /status");
});

bot.onText(/^\/sus(?:\s+(.+))?$/, (msg, match) => {
  if (!ensureGroup(msg)) return;

  const chatId = msg.chat.id;
  const g = getGame(chatId);
  if (!g  g.status !== "playing") {
    bot.sendMessage(chatId, "Game start nahi hai. /newgame then /startgame");
    return;
  }

  const voter = g.players.get(msg.from.id);
  if (!voter) {
    bot.sendMessage(chatId, "Tum game me nahi ho. /join karo.");
    return;
  }
  if (!voter.alive) {
    bot.sendMessage(chatId, "Tum already out ho.");
    return;
  }

  const targetText = (match && match[1]) ? match[1].trim() : "";
  if (!targetText) {
    bot.sendMessage(chatId, "Use: /sus @username");
    return;
  }



  // Find target by username string match
  const target = Array.from(g.players.values()).find(p => p.name.toLowerCase() === targetText.toLowerCase());
  if (!target) {
    bot.sendMessage(chatId, "Player nahi mila. Players list: " + Array.from(g.players.values()).map(p => p.name).join(", "));
    return;
  }
  if (!target.alive) {
    bot.sendMessage(chatId, "Woh already out hai.");
    return;
  }

  g.votes.set(msg.from.id, target.id);
  bot.sendMessage(chatId, voter.name + " voted for " + target.name + " ✅");

  // If all alive players voted, resolve
  const alive = Array.from(g.players.values()).filter(p => p.alive);
  if (g.votes.size >= alive.length) {
    const counts = new Map(); // targetId -> count
    g.votes.forEach((tid) => counts.set(tid, (counts.get(tid)  0) + 1));

    let max = 0;
    let outId = null;
    counts.forEach((c, tid) => {
      if (c > max) {
        max = c;
        outId = tid;
      }
    });

    const out = g.players.get(outId);
    out.alive = false;
    g.votes.clear();

    let msgText = "Voting complete ✅\nOut: " + out.name;
    if (out.role === "impostor") {
      msgText += "\nIMPOSTOR OUT 😈➡️✅ Crewmates win!";
      g.status = "ended";
    } else {
      msgText += "\nWoh Crewmate nikla 😅";
      const aliveImps = Array.from(g.players.values()).filter(p => p.alive && p.role === "impostor");
      const aliveCrew = Array.from(g.players.values()).filter(p => p.alive && p.role === "crewmate");
      if (aliveImps.length >= aliveCrew.length) {
        msgText += "\nImpostor win 😈";
        g.status = "ended";
      }
    }
    bot.sendMessage(chatId, msgText);
  }
});

bot.onText(/^\/status$/, (msg) => {
  const chatId = msg.chat.id;
  const g = getGame(chatId);
  if (!g) {
    bot.sendMessage(chatId, "No game. /newgame");
    return;
  }
  const list = Array.from(g.players.values()).map(p => p.name + (p.alive ? "" : " (out)")).join("\n");
  bot.sendMessage(chatId, "Status: " + g.status + "\nPlayers:\n" + list);
});

bot.onText(/^\/end$/, (msg) => {
  const chatId = msg.chat.id;
  const g = getGame(chatId);
  if (!g) return;
  if (msg.from.id !== g.ownerId) {
    bot.sendMessage(chatId, "Sirf owner end kar sakta hai.");
    return;
  }
  games.delete(chatId);
  bot.sendMessage(chatId, "Game ended.");
});

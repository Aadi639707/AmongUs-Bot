const TelegramBot = require("node-telegram-bot-api");

const token = process.env.BOT_TOKEN;
const bot = new TelegramBot(token, { polling: true });

let rooms = {};

bot.onText(/\/start/, msg => {
  bot.sendMessage(msg.chat.id,
👨‍🚀 *Among Us Game Bot*

Commands:
/create – Create room
/join CODE – Join room
/startgame – Start game, { parse_mode: "Markdown" });
});

bot.onText(/\/create/, msg => {
  const code = Math.random().toString(36).substring(2,7).toUpperCase();
  rooms[code] = { players:[msg.from.username], started:false };

  bot.sendMessage(msg.chat.id, ✅ Room Created\nRoom Code: *${code}*\nSend friends: /join ${code}, { parse_mode:"Markdown"});
});

bot.onText(/\/join (.+)/, (msg,match) => {
  const code = match[1].toUpperCase();
  if(!rooms[code]) return bot.sendMessage(msg.chat.id,"❌ Room not found");

  if(rooms[code].players.includes(msg.from.username))
    return bot.sendMessage(msg.chat.id,"You already joined");

  rooms[code].players.push(msg.from.username);
  bot.sendMessage(msg.chat.id, Joined room ${code});
});

bot.onText(/\/startgame/, msg => {
  let roomCode = Object.keys(rooms).find(code => rooms[code].players.includes(msg.from.username));
  if(!roomCode) return bot.sendMessage(msg.chat.id,"Join a room first");

  let room = rooms[roomCode];
  if(room.players.length < 2)
    return bot.sendMessage(msg.chat.id,"Need at least 2 players");

  const imposter = room.players[Math.floor(Math.random()*room.players.length)];
  room.players.forEach(p=>{
    bot.sendMessage(msg.chat.id,
      p===imposter ? "😈 You are IMPOSTER" : "🧑‍🚀 You are CREWMATE");
  });
});

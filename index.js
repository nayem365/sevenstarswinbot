// ============================================
// 7STARSWIN SUPPORT BOT - FULL FIXED VERSION
// ============================================

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  ? process.env.ADMIN_CHAT_IDS.split(",").map((id) => id.trim())
  : [];

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/support_bot";

const PORT = process.env.PORT || 3000;

// ============================================
// CHECK ENV
// ============================================

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing in .env");
  process.exit(1);
}

console.log("✅ Bot Starting...");
console.log("✅ Admins:", ADMIN_CHAT_IDS);

// ============================================
// EXPRESS
// ============================================

const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot Running");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});

// ============================================
// BOT
// ============================================

const bot = new Telegraf(BOT_TOKEN);

// ============================================
// DATABASE
// ============================================

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.log("❌ MongoDB Error:", err));

// ============================================
// SCHEMA
// ============================================

const userSchema = new mongoose.Schema({
  userId: String,
  name: String,
  username: String,
  phone: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const ticketSchema = new mongoose.Schema({
  ticketNumber: String,
  userId: String,
  userName: String,
  issueType: String,
  paymentMethod: String,
  playerId: String,
  agentNumber: String,
  trxId: String,
  date: String,
  time: String,
  photoId: String,
  status: {
    type: String,
    default: "pending",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);

// ============================================
// MEMORY STATE
// ============================================

const states = new Map();

function clearState(userId) {
  states.delete(userId);
}

// ============================================
// SAFE TEXT
// ============================================

function escapeText(text) {
  if (!text) return "";
  return String(text)
    .replace(/_/g, "\\_")
    .replace(/\*/g, "\\*")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

// ============================================
// START
// ============================================

bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();

  let user = await User.findOne({ userId });

  if (!user) {
    await ctx.reply(
      "📱 Share your phone number",
      {
        reply_markup: {
          keyboard: [
            [
              {
                text: "📱 Share Contact",
                request_contact: true,
              },
            ],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );

    return;
  }

  return showMainMenu(ctx);
});

// ============================================
// MAIN MENU
// ============================================

async function showMainMenu(ctx) {
  const isAdmin = ADMIN_CHAT_IDS.includes(ctx.from.id.toString());

  if (isAdmin) {
    return ctx.reply(
      "👑 ADMIN PANEL",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "🎫 Create Ticket",
            "create_ticket"
          ),
        ],
        [
          Markup.button.callback(
            "📢 Broadcast",
            "broadcast"
          ),
        ],
        [
          Markup.button.callback(
            "📋 Pending Tickets",
            "pending"
          ),
        ],
      ])
    );
  }

  return ctx.reply(
    "🏠 MAIN MENU",
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🎫 Create Support Ticket",
          "create_ticket"
        ),
      ],
    ])
  );
}

// ============================================
// CONTACT SAVE
// ============================================

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;

  if (contact.user_id !== ctx.from.id) {
    return ctx.reply("❌ Send your own contact");
  }

  await User.findOneAndUpdate(
    {
      userId: ctx.from.id.toString(),
    },
    {
      userId: ctx.from.id.toString(),
      name: `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`,
      username: ctx.from.username || "",
      phone: contact.phone_number,
    },
    {
      upsert: true,
    }
  );

  await ctx.reply("✅ Registration Complete", {
    reply_markup: {
      remove_keyboard: true,
    },
  });

  showMainMenu(ctx);
});

// ============================================
// CREATE TICKET
// ============================================

bot.action("create_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "issue_type",
  });

  ctx.reply(
    "📋 Select Issue Type",
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "💰 Deposit",
          "deposit"
        ),
      ],
      [
        Markup.button.callback(
          "💸 Withdrawal",
          "withdraw"
        ),
      ],
    ])
  );
});

// ============================================
// ISSUE TYPE
// ============================================

bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();

  let state = states.get(ctx.from.id);

  state.issueType = "Deposit";
  state.step = "payment";

  states.set(ctx.from.id, state);

  ctx.reply("💳 Enter Payment Method");
});

bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();

  let state = states.get(ctx.from.id);

  state.issueType = "Withdrawal";
  state.step = "payment";

  states.set(ctx.from.id, state);

  ctx.reply("💳 Enter Payment Method");
});

// ============================================
// TEXT FLOW
// ============================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  const userId = ctx.from.id;

  if (text.startsWith("/")) return;

  const state = states.get(userId);

  // =========================================
  // BROADCAST
  // =========================================

  if (state && state.step === "broadcast") {
    const users = await User.find();

    let success = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(
          user.userId,
          `📢 ADMIN MESSAGE\n\n${text}`
        );

        success++;
      } catch (e) {}
    }

    clearState(userId);

    return ctx.reply(`✅ Broadcast sent to ${success} users`);
  }

  if (!state) return;

  // =========================================
  // PAYMENT
  // =========================================

  if (state.step === "payment") {
    state.paymentMethod = text;
    state.step = "player";

    states.set(userId, state);

    return ctx.reply("🆔 Enter Player ID");
  }

  // =========================================
  // PLAYER ID
  // =========================================

  if (state.step === "player") {
    state.playerId = text;

    if (state.issueType === "Deposit") {
      state.step = "agent";
      states.set(userId, state);

      return ctx.reply("🤵 Enter Agent Number");
    }

    state.step = "trx";
    states.set(userId, state);

    return ctx.reply("🔢 Enter TRX ID");
  }

  // =========================================
  // AGENT NUMBER
  // =========================================

  if (state.step === "agent") {
    state.agentNumber = text;
    state.step = "trx";

    states.set(userId, state);

    return ctx.reply("🔢 Enter TRX ID");
  }

  // =========================================
  // TRX
  // =========================================

  if (state.step === "trx") {
    state.trxId = text;
    state.step = "date";

    states.set(userId, state);

    return ctx.reply("📅 Enter Date");
  }

  // =========================================
  // DATE
  // =========================================

  if (state.step === "date") {
    state.date = text;
    state.step = "time";

    states.set(userId, state);

    return ctx.reply("⏰ Enter Time");
  }

  // =========================================
  // TIME
  // =========================================

  if (state.step === "time") {
    state.time = text;
    state.step = "photo";

    states.set(userId, state);

    return ctx.reply(
      "📸 Send Screenshot or type skip"
    );
  }

  // =========================================
  // SKIP PHOTO
  // =========================================

  if (
    state.step === "photo" &&
    text.toLowerCase() === "skip"
  ) {
    await submitTicket(ctx, null);
  }
});

// ============================================
// PHOTO
// ============================================

bot.on("photo", async (ctx) => {
  const state = states.get(ctx.from.id);

  if (!state) return;

  if (state.step !== "photo") return;

  const photo = ctx.message.photo.pop();

  await submitTicket(ctx, photo.file_id);
});

// ============================================
// SUBMIT TICKET
// ============================================

async function submitTicket(ctx, photoId) {
  const userId = ctx.from.id.toString();

  const state = states.get(ctx.from.id);

  const user = await User.findOne({
    userId,
  });

  const ticketNumber =
    "TICKET" + Date.now();

  const ticket = await Ticket.create({
    ticketNumber,
    userId,
    userName: user?.name || "Unknown",
    issueType: state.issueType,
    paymentMethod: state.paymentMethod,
    playerId: state.playerId,
    agentNumber: state.agentNumber || "",
    trxId: state.trxId,
    date: state.date,
    time: state.time,
    photoId: photoId || "",
  });

  clearState(ctx.from.id);

  // =========================================
  // USER SUCCESS
  // =========================================

  await ctx.reply(
    `✅ Ticket Created\n\n🎫 Ticket ID: ${ticket.ticketNumber}`
  );

  // =========================================
  // ADMIN NOTIFICATION
  // =========================================

  const adminMessage =
    `🎫 NEW TICKET\n\n` +
    `🎟 Ticket: ${escapeText(ticket.ticketNumber)}\n` +
    `👤 User: ${escapeText(ticket.userName)}\n` +
    `📋 Issue: ${escapeText(ticket.issueType)}\n` +
    `💳 Payment: ${escapeText(ticket.paymentMethod)}\n` +
    `🆔 Player ID: ${escapeText(ticket.playerId)}\n` +
    `🤵 Agent: ${escapeText(ticket.agentNumber)}\n` +
    `🔢 TRX: ${escapeText(ticket.trxId)}\n` +
    `📅 Date: ${escapeText(ticket.date)}\n` +
    `⏰ Time: ${escapeText(ticket.time)}\n`;

  for (const adminId of ADMIN_CHAT_IDS) {
    try {
      if (photoId) {
        await bot.telegram.sendPhoto(
          adminId,
          photoId,
          {
            caption: adminMessage,
            parse_mode: "MarkdownV2",
          }
        );
      } else {
        await bot.telegram.sendMessage(
          adminId,
          adminMessage,
          {
            parse_mode: "MarkdownV2",
          }
        );
      }
    } catch (err) {
      console.log(
        "Admin notification failed:",
        err.message
      );
    }
  }

  showMainMenu(ctx);
}

// ============================================
// BROADCAST
// ============================================

bot.action("broadcast", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "broadcast",
  });

  ctx.reply("📢 Send broadcast message");
});

// ============================================
// PENDING
// ============================================

bot.action("pending", async (ctx) => {
  await ctx.answerCbQuery();

  const tickets = await Ticket.find({
    status: "pending",
  }).sort({
    createdAt: -1,
  });

  if (!tickets.length) {
    return ctx.reply("✅ No Pending Tickets");
  }

  let msg = "📋 Pending Tickets\n\n";

  tickets.forEach((t) => {
    msg += `🎫 ${t.ticketNumber} | ${t.issueType}\n`;
  });

  ctx.reply(msg);
});

// ============================================
// MY ID
// ============================================

bot.command("myid", (ctx) => {
  ctx.reply(`🆔 Your ID: ${ctx.from.id}`);
});

// ============================================
// ERROR
// ============================================

bot.catch((err) => {
  console.log("BOT ERROR:", err);
});

// ============================================
// START BOT
// ============================================

bot.launch();

console.log("✅ BOT STARTED");

// ============================================
// STOP
// ============================================

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

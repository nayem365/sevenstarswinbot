// ============================================
// 7STARSWIN SUPPORT BOT - FULL BEAUTIFUL FIXED VERSION
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
// EXPRESS
// ============================================

const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot Running");
});

app.listen(PORT, () => {
  console.log(`✅ Server Running On ${PORT}`);
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
  .catch((err) => console.log(err));

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
// STATES
// ============================================

const states = new Map();

function clearState(userId) {
  states.delete(userId);
}

// ============================================
// START
// ============================================

bot.start(async (ctx) => {
  const userId = ctx.from.id.toString();

  const isAdmin = ADMIN_CHAT_IDS.includes(userId);

  let user = await User.findOne({ userId });

  if (!user && !isAdmin) {
    return ctx.reply(
      "📱 Please Share Your Contact Number",
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
  }

  showMainMenu(ctx);
});

// ============================================
// MAIN MENU
// ============================================

async function showMainMenu(ctx) {
  const isAdmin = ADMIN_CHAT_IDS.includes(
    ctx.from.id.toString()
  );

  if (isAdmin) {
    return ctx.reply(
      "👑 ADMIN PANEL\n\nChoose Option Below 👇",
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "📋 Pending Tickets",
            "pending"
          ),
        ],
        [
          Markup.button.callback(
            "📢 Broadcast",
            "broadcast"
          ),
        ],
      ])
    );
  }

  ctx.reply(
    "🏠 MAIN MENU\n\nWelcome To 7StarsWin Support ⭐",
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
// CONTACT
// ============================================

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;

  await User.findOneAndUpdate(
    {
      userId: ctx.from.id.toString(),
    },
    {
      userId: ctx.from.id.toString(),
      name: `${ctx.from.first_name || ""} ${
        ctx.from.last_name || ""
      }`,
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
    step: "issue",
  });

  ctx.reply(
    "📋 Select Issue Type",
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "💰 Deposit Issue",
          "deposit"
        ),
      ],
      [
        Markup.button.callback(
          "💸 Withdrawal Issue",
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

  states.set(ctx.from.id, {
    issueType: "Deposit",
    step: "payment",
  });

  ctx.reply(
    "💳 Enter Payment Method\n\nExample:\n• BKASH\n• NAGAD\n• ROCKET"
  );
});

bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    issueType: "Withdrawal",
    step: "payment",
  });

  ctx.reply(
    "💳 Enter Payment Method\n\nExample:\n• BKASH\n• NAGAD\n• ROCKET"
  );
});

// ============================================
// TEXT FLOW
// ============================================

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith("/")) return;

  const userId = ctx.from.id;

  const state = states.get(userId);

  if (!state) return;

  // ==========================================
  // BROADCAST
  // ==========================================

  if (state.step === "broadcast") {
    const users = await User.find();

    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(
          user.userId,
          `📢 ADMIN MESSAGE\n\n${text}`
        );

        sent++;
      } catch (e) {}
    }

    clearState(userId);

    return ctx.reply(
      `✅ Broadcast Sent To ${sent} Users`
    );
  }

  // ==========================================
  // ADMIN REPLY
  // ==========================================

  if (state.step === "admin_reply") {
    try {
      await bot.telegram.sendMessage(
        state.targetUserId,
        `📩 ADMIN REPLY\n\n${text}\n\n💬 Reply Back Anytime`
      );

      clearState(userId);

      return ctx.reply("✅ Reply Sent");
    } catch (err) {
      return ctx.reply("❌ Failed To Send Reply");
    }
  }

  // ==========================================
  // USER REPLY
  // ==========================================

  if (state.step === "user_reply") {
    for (const adminId of ADMIN_CHAT_IDS) {
      try {
        await bot.telegram.sendMessage(
          adminId,
          `💬 USER REPLY\n\n👤 ${ctx.from.first_name}\n\n${text}`
        );
      } catch (e) {}
    }

    return ctx.reply(
      "✅ Your Reply Sent To Support Team"
    );
  }

  // ==========================================
  // PAYMENT
  // ==========================================

  if (state.step === "payment") {
    state.paymentMethod = text;
    state.step = "player";

    states.set(userId, state);

    return ctx.reply(
      "🆔 Enter Player ID\n\nExample:\n123456"
    );
  }

  // ==========================================
  // PLAYER ID
  // ==========================================

  if (state.step === "player") {
    state.playerId = text;

    if (state.issueType === "Deposit") {
      state.step = "agent";

      states.set(userId, state);

      return ctx.reply(
        "🤵 Enter Agent Number\n\nExample:\n786786"
      );
    }

    state.step = "trx";

    states.set(userId, state);

    return ctx.reply(
      "🔢 Enter TRX ID\n\nExample:\nTXN786786"
    );
  }

  // ==========================================
  // AGENT NUMBER
  // ==========================================

  if (state.step === "agent") {
    state.agentNumber = text;
    state.step = "trx";

    states.set(userId, state);

    return ctx.reply(
      "🔢 Enter TRX ID\n\nExample:\nTXN786786"
    );
  }

  // ==========================================
  // TRX ID
  // ==========================================

  if (state.step === "trx") {
    state.trxId = text;
    state.step = "date";

    states.set(userId, state);

    return ctx.reply(
      "📅 Enter Date\n\nExample:\n12/05/2026"
    );
  }

  // ==========================================
  // DATE
  // ==========================================

  if (state.step === "date") {
    state.date = text;
    state.step = "time";

    states.set(userId, state);

    return ctx.reply(
      "⏰ Enter Time\n\nExample:\n3:45 PM"
    );
  }

  // ==========================================
  // TIME
  // ==========================================

  if (state.step === "time") {
    state.time = text;
    state.step = "photo";

    states.set(userId, state);

    return ctx.reply(
      "📸 Send Screenshot\n\nOr Type: skip"
    );
  }

  // ==========================================
  // SKIP PHOTO
  // ==========================================

  if (
    state.step === "photo" &&
    text.toLowerCase() === "skip"
  ) {
    submitTicket(ctx, null);
  }
});

// ============================================
// PHOTO
// ============================================

bot.on("photo", async (ctx) => {
  const state = states.get(ctx.from.id);

  if (!state) return;

  if (state.step === "photo") {
    const photo = ctx.message.photo.pop();

    submitTicket(ctx, photo.file_id);
  }

  // ==========================================
  // BROADCAST PHOTO
  // ==========================================

  if (state.step === "broadcast_photo") {
    const photo = ctx.message.photo.pop();

    const users = await User.find();

    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendPhoto(
          user.userId,
          photo.file_id,
          {
            caption:
              state.caption ||
              "📢 Admin Broadcast",
          }
        );

        sent++;
      } catch (e) {}
    }

    clearState(ctx.from.id);

    return ctx.reply(
      `✅ Photo Broadcast Sent To ${sent} Users`
    );
  }
});

// ============================================
// SUBMIT TICKET
// ============================================

async function submitTicket(ctx, photoId) {
  const state = states.get(ctx.from.id);

  const ticketNumber =
    "TICKET" + Date.now();

  const ticket = await Ticket.create({
    ticketNumber,
    userId: ctx.from.id.toString(),
    userName: ctx.from.first_name,
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

  await ctx.reply(
    `✅ Ticket Created Successfully 🎉\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n\n⏳ Support Team Will Contact Soon`
  );

  // ==========================================
  // ADMIN NOTIFICATION
  // ==========================================

  const msg =
    `🎫 NEW SUPPORT TICKET\n\n` +
    `🎟 Ticket: ${ticket.ticketNumber}\n` +
    `👤 User: ${ticket.userName}\n` +
    `📋 Issue: ${ticket.issueType}\n` +
    `💳 Payment: ${ticket.paymentMethod}\n` +
    `🆔 Player ID: ${ticket.playerId}\n` +
    `🤵 Agent: ${ticket.agentNumber}\n` +
    `🔢 TRX ID: ${ticket.trxId}\n` +
    `📅 Date: ${ticket.date}\n` +
    `⏰ Time: ${ticket.time}`;

  for (const adminId of ADMIN_CHAT_IDS) {
    try {
      if (photoId) {
        await bot.telegram.sendPhoto(
          adminId,
          photoId,
          {
            caption: msg,
            ...Markup.inlineKeyboard([
              [
                Markup.button.callback(
                  "💬 Reply",
                  `reply_${ticket.userId}`
                ),
              ],
            ]),
          }
        );
      } else {
        await bot.telegram.sendMessage(
          adminId,
          msg,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "💬 Reply",
                `reply_${ticket.userId}`
              ),
            ],
          ])
        );
      }
    } catch (e) {
      console.log(e);
    }
  }

  showMainMenu(ctx);
}

// ============================================
// REPLY BUTTON
// ============================================

bot.action(/reply_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const targetUserId = ctx.match[1];

  states.set(ctx.from.id, {
    step: "admin_reply",
    targetUserId,
  });

  ctx.reply(
    "💬 Send Reply Message To User"
  );
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

  for (const ticket of tickets) {
    await ctx.reply(
      `🎫 ${ticket.ticketNumber}\n👤 ${ticket.userName}\n📋 ${ticket.issueType}`,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "💬 Reply",
            `reply_${ticket.userId}`
          ),
        ],
      ])
    );
  }
});

// ============================================
// BROADCAST
// ============================================

bot.action("broadcast", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "broadcast",
  });

  ctx.reply(
    "📢 Send Broadcast Message\n\nYou Can Send:\n• Text\n• Photo"
  );
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
process.once("SIGTERM", () =>
  bot.stop("SIGTERM")
);

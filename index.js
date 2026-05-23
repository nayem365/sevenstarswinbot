require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  ? process.env.ADMIN_CHAT_IDS.split(",").map((x) => x.trim())
  : [];

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/support_bot";

const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot Running");
});

app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});

const bot = new Telegraf(BOT_TOKEN);

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err.message));

/* =========================
   MODELS
========================= */

const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: String,
  username: String,
  phone: String,
  createdAt: { type: Date, default: Date.now },
});

const ticketSchema = new mongoose.Schema({
  ticketNumber: { type: String, unique: true },
  userId: String,
  userName: String,
  username: String,
  phone: String,

  issueType: String,
  paymentMethod: String,
  playerId: String,
  agentNumber: String,

  trxId: {
    type: String,
    unique: true,
    index: true,
  },

  date: String,
  time: String,

  photoId: String,

  status: {
    type: String,
    default: "processing",
  },

  checkedBy: String,

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);

/* =========================
   MEMORY STATE
========================= */

const states = new Map();

function clearState(id) {
  states.delete(id);
}

function isAdmin(id) {
  return ADMIN_CHAT_IDS.includes(String(id));
}

/* =========================
   HELPERS
========================= */

function statusText(status) {
  if (status === "processing") return "🟡 Pending";
  if (status === "task_at_work") return "👨‍💻 Task At Work";
  if (status === "successful") return "✅ Successful";
  if (status === "resolved") return "🏁 Resolved";

  return status;
}

function displayAccount(t) {
  if (t.username) return `@${t.username}`;
  if (t.phone) return t.phone;

  return t.userId;
}

function copyInfo(t) {
  return (
    `Issue: ${t.issueType}\n` +
    `Payment: ${t.paymentMethod}\n` +
    `Player ID: ${t.playerId}\n` +
    `Agent Number: ${t.agentNumber || "N/A"}\n` +
    `TRX ID: ${t.trxId}\n` +
    `Date: ${t.date}\n` +
    `Time: ${t.time}`
  );
}

function userButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💬 Reply Support", `reply_${ticketNumber}`)],
    [Markup.button.callback("📋 My Tickets", "mytickets")],
  ]);
}

function adminButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Copy Info", `copy_${ticketNumber}`)],
    [Markup.button.callback("👁 Take Task", `take_${ticketNumber}`)],
    [Markup.button.callback("💬 Reply User", `admin_reply_${ticketNumber}`)],
    [
      Markup.button.callback("✅ Successful", `success_${ticketNumber}`),
      Markup.button.callback("🏁 Resolve", `resolve_${ticketNumber}`),
    ],
  ]);
}

function ticketDetails(t) {
  return (
    `🎫 SUPPORT TICKET\n\n` +
    `🎟 Ticket: ${t.ticketNumber}\n` +
    `📌 Status: ${statusText(t.status)}\n\n` +
    `👤 User: ${t.userName || "Unknown"}\n` +
    `🔗 Account: ${displayAccount(t)}\n` +
    `🆔 Telegram ID: ${t.userId}\n\n` +
    `📋 Issue: ${t.issueType}\n` +
    `💳 Payment: ${t.paymentMethod}\n` +
    `🆔 Player ID: ${t.playerId}\n` +
    `🤵 Agent Number: ${t.agentNumber || "N/A"}\n` +
    `🔢 TRX ID: ${t.trxId}\n` +
    `📅 Date: ${t.date}\n` +
    `⏰ Time: ${t.time}\n\n` +
    `👁 Checked By: ${t.checkedBy || "Not checked"}`
  );
}

/* =========================
   MAIN MENU
========================= */

async function showMainMenu(ctx) {
  if (isAdmin(ctx.from.id)) {
    return ctx.reply(
      "👑 ADMIN PANEL",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 Pending", "admin_pending")],
        [Markup.button.callback("👨‍💻 Task", "admin_task")],
        [Markup.button.callback("✅ Successful", "admin_successful")],
      ])
    );
  }

  return ctx.reply(
    "🏠 SUPPORT PANEL",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎫 Create Ticket", "create_ticket")],
      [Markup.button.callback("📋 My Tickets", "mytickets")],
    ])
  );
}

/* =========================
   START
========================= */

bot.start(async (ctx) => {
  const userId = String(ctx.from.id);

  if (isAdmin(userId)) {
    return showMainMenu(ctx);
  }

  const user = await User.findOne({ userId });

  if (!user) {
    return ctx.reply("📱 Please Share Contact", {
      reply_markup: {
        keyboard: [[{ text: "📱 Share Contact", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  return showMainMenu(ctx);
});

/* =========================
   SAVE CONTACT
========================= */

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;

  if (contact.user_id !== ctx.from.id) {
    return ctx.reply("❌ Please send your own contact");
  }

  await User.findOneAndUpdate(
    { userId: String(ctx.from.id) },
    {
      userId: String(ctx.from.id),
      name: `${ctx.from.first_name || ""} ${
        ctx.from.last_name || ""
      }`.trim(),
      username: ctx.from.username || "",
      phone: contact.phone_number,
    },
    { upsert: true }
  );

  await ctx.reply("✅ Registration Complete", {
    reply_markup: {
      remove_keyboard: true,
    },
  });

  return showMainMenu(ctx);
});

/* =========================
   CREATE TICKET
========================= */

bot.action("create_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  return ctx.reply(
    "📋 Select Issue Type",
    Markup.inlineKeyboard([
      [Markup.button.callback("💰 Deposit", "issue_deposit")],
      [Markup.button.callback("💸 Withdrawal", "issue_withdrawal")],
    ])
  );
});

bot.action("issue_deposit", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "payment",
    issueType: "Deposit",
  });

  return ctx.reply("💳 Enter Payment Method");
});

bot.action("issue_withdrawal", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "payment",
    issueType: "Withdrawal",
  });

  return ctx.reply("💳 Enter Payment Method");
});

/* =========================
   PREVIEW
========================= */

async function showPreview(ctx, photoId = "") {
  const state = states.get(ctx.from.id);

  if (!state) {
    return ctx.reply("❌ Session Expired");
  }

  state.photoId = photoId;
  state.step = "preview";

  states.set(ctx.from.id, state);

  const msg =
    `📋 TICKET PREVIEW\n\n` +
    `📋 Issue: ${state.issueType}\n` +
    `💳 Payment: ${state.paymentMethod}\n` +
    `🆔 Player ID: ${state.playerId}\n` +
    `🤵 Agent Number: ${state.agentNumber || "N/A"}\n` +
    `🔢 TRX ID: ${state.trxId}\n` +
    `📅 Date: ${state.date}\n` +
    `⏰ Time: ${state.time}\n\n` +
    `✅ Confirm?`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Submit", "submit_ticket")],
    [Markup.button.callback("❌ Cancel", "cancel_ticket")],
  ]);

  if (photoId) {
    return ctx.replyWithPhoto(photoId, {
      caption: msg,
      ...buttons,
    });
  }

  return ctx.reply(msg, buttons);
}

/* =========================
   CANCEL
========================= */

bot.action("cancel_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  clearState(ctx.from.id);

  await ctx.reply("❌ Ticket Cancelled");

  return showMainMenu(ctx);
});

/* =========================
   SUBMIT TICKET
========================= */

bot.action("submit_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  const state = states.get(ctx.from.id);

  if (!state) {
    return ctx.reply("❌ Session Expired");
  }

  const trxId = state.trxId.trim();

  /* =========================
     DUPLICATE BLOCK
  ========================= */

  const existing = await Ticket.findOne({
    trxId: trxId,
  });

  if (existing) {
    return ctx.reply(
      "❌ This TRX ID already used.\n\nYou cannot create multiple requests with same TRX ID."
    );
  }

  const user = await User.findOne({
    userId: String(ctx.from.id),
  });

  const ticket = await Ticket.create({
    ticketNumber: trxId,
    trxId: trxId,

    userId: String(ctx.from.id),

    userName: user?.name || ctx.from.first_name || "Unknown",

    username: user?.username || "",
    phone: user?.phone || "",

    issueType: state.issueType,
    paymentMethod: state.paymentMethod,
    playerId: state.playerId,
    agentNumber: state.agentNumber,

    date: state.date,
    time: state.time,

    photoId: state.photoId || "",

    status: "processing",
  });

  clearState(ctx.from.id);

  await ctx.reply(
    `✅ Ticket Submitted\n\n🎫 Ticket ID: ${ticket.ticketNumber}`,
    userButtons(ticket.ticketNumber)
  );

  try {
    if (ticket.photoId) {
      await bot.telegram.sendPhoto(
        ADMIN_GROUP_ID,
        ticket.photoId,
        {
          caption: ticketDetails(ticket),
          ...adminButtons(ticket.ticketNumber),
        }
      );
    } else {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        ticketDetails(ticket),
        adminButtons(ticket.ticketNumber)
      );
    }
  } catch (err) {
    console.log(err.message);
  }

  return showMainMenu(ctx);
});

/* =========================
   COPY INFO
========================= */

bot.action(/copy_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("✅ Copy Message Sent");

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("❌ Admin Only");
  }

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) {
    return ctx.reply("❌ Ticket Not Found");
  }

  return ctx.reply(
    `📋 COPY INFORMATION\n\n\`\`\`\n${copyInfo(ticket)}\n\`\`\``,
    {
      parse_mode: "Markdown",
    }
  );
});

/* =========================
   TAKE TASK
========================= */

bot.action(/take_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("❌ Admin Only");
  }

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) {
    return ctx.reply("❌ Ticket Not Found");
  }

  ticket.status = "task_at_work";
  ticket.checkedBy = ctx.from.first_name;

  await ticket.save();

  await ctx.reply("👨‍💻 Task Taken");

  await bot.telegram.sendMessage(
    ticket.userId,
    `👨‍💻 Support Working On Your Ticket\n\n🎫 ${ticket.ticketNumber}`,
    userButtons(ticket.ticketNumber)
  );
});

/* =========================
   SUCCESS
========================= */

bot.action(/success_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) {
    return ctx.reply("❌ Ticket Not Found");
  }

  ticket.status = "successful";

  await ticket.save();

  await ctx.reply("✅ Ticket Successful");

  await bot.telegram.sendMessage(
    ticket.userId,
    `✅ Your Request Successful\n\n🎫 ${ticket.ticketNumber}`
  );
});

/* =========================
   RESOLVE
========================= */

bot.action(/resolve_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) {
    return ctx.reply("❌ Ticket Not Found");
  }

  ticket.status = "resolved";

  await ticket.save();

  await ctx.reply("🏁 Ticket Resolved");

  await bot.telegram.sendMessage(
    ticket.userId,
    `🏁 Ticket Resolved\n\n🎫 ${ticket.ticketNumber}`
  );
});

/* =========================
   MY TICKETS
========================= */

bot.action("mytickets", async (ctx) => {
  await ctx.answerCbQuery();

  const tickets = await Ticket.find({
    userId: String(ctx.from.id),
  }).sort({ createdAt: -1 });

  if (!tickets.length) {
    return ctx.reply("❌ No Tickets Found");
  }

  for (const t of tickets) {
    await ctx.reply(
      `🎫 ${t.ticketNumber}\n📌 ${statusText(t.status)}`,
      userButtons(t.ticketNumber)
    );
  }
});

/* =========================
   ADMIN LISTS
========================= */

async function showTickets(ctx, status) {
  const tickets = await Ticket.find({
    status,
  }).sort({ createdAt: -1 });

  if (!tickets.length) {
    return ctx.reply("❌ No Tickets");
  }

  for (const t of tickets) {
    await ctx.reply(
      ticketDetails(t),
      adminButtons(t.ticketNumber)
    );
  }
}

bot.action("admin_pending", async (ctx) => {
  await ctx.answerCbQuery();
  return showTickets(ctx, "processing");
});

bot.action("admin_task", async (ctx) => {
  await ctx.answerCbQuery();
  return showTickets(ctx, "task_at_work");
});

bot.action("admin_successful", async (ctx) => {
  await ctx.answerCbQuery();
  return showTickets(ctx, "successful");
});

/* =========================
   TEXT HANDLER
========================= */

bot.on("text", async (ctx) => {
  const text = ctx.message.text;

  if (text.startsWith("/")) return;

  const state = states.get(ctx.from.id);

  if (!state) return;

  if (state.step === "payment") {
    state.paymentMethod = text;
    state.step = "player";

    states.set(ctx.from.id, state);

    return ctx.reply("🆔 Enter Player ID");
  }

  if (state.step === "player") {
    state.playerId = text;

    if (state.issueType === "Deposit") {
      state.step = "agent";

      states.set(ctx.from.id, state);

      return ctx.reply("🤵 Enter Agent Number");
    }

    state.step = "trx";

    states.set(ctx.from.id, state);

    return ctx.reply("🔢 Enter TRX ID");
  }

  if (state.step === "agent") {
    state.agentNumber = text;
    state.step = "trx";

    states.set(ctx.from.id, state);

    return ctx.reply("🔢 Enter TRX ID");
  }

  if (state.step === "trx") {
    state.trxId = text;
    state.step = "date";

    states.set(ctx.from.id, state);

    return ctx.reply("📅 Enter Date");
  }

  if (state.step === "date") {
    state.date = text;
    state.step = "time";

    states.set(ctx.from.id, state);

    return ctx.reply("⏰ Enter Time");
  }

  if (state.step === "time") {
    state.time = text;
    state.step = "photo";

    states.set(ctx.from.id, state);

    return ctx.reply("📸 Send Screenshot Or Type skip");
  }

  if (state.step === "photo") {
    if (text.toLowerCase() === "skip") {
      return showPreview(ctx, "");
    }
  }
});

/* =========================
   PHOTO
========================= */

bot.on("photo", async (ctx) => {
  const photo = ctx.message.photo.pop();

  const state = states.get(ctx.from.id);

  if (!state) return;

  if (state.step === "photo") {
    return showPreview(ctx, photo.file_id);
  }
});

/* =========================
   ERROR
========================= */

bot.catch((err) => {
  console.log("BOT ERROR:", err);
});

/* =========================
   START BOT
========================= */

bot.launch();

console.log("✅ BOT STARTED");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

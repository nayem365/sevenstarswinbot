require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { Telegraf, Markup } = require("telegraf");

const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  ? process.env.ADMIN_CHAT_IDS.split(",").map((x) => x.trim())
  : [];
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/support_bot";
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN) {
  console.log("❌ BOT_TOKEN missing");
  process.exit(1);
}

const app = express();
app.get("/", (req, res) => res.send("✅ Bot Running"));
app.listen(PORT, () => console.log(`✅ Server running on ${PORT}`));

const bot = new Telegraf(BOT_TOKEN);

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.log("❌ MongoDB error:", err.message));

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
  trxId: String,
  date: String,
  time: String,
  photoId: String,
  status: { type: String, default: "processing" },
  checkedBy: String,
  lastAdminReply: String,
  groupMessageId: Number,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);

const states = new Map();

function isAdmin(id) {
  return ADMIN_CHAT_IDS.includes(String(id));
}

function clearState(id) {
  states.delete(id);
}

function ticketStatusText(status) {
  if (status === "processing") return "🟡 Processing";
  if (status === "task_at_work") return "👨‍💻 Task At Work";
  if (status === "successful") return "✅ Successful";
  if (status === "resolved") return "🏁 Resolved";
  return status;
}

function ticketDetails(t) {
  return (
    `🎫 TICKET DETAILS\n\n` +
    `🎟 Ticket: ${t.ticketNumber}\n` +
    `📌 Status: ${ticketStatusText(t.status)}\n` +
    `👤 User: ${t.userName || "Unknown"}\n` +
    `🆔 Telegram ID: ${t.userId}\n` +
    `📞 Phone: ${t.phone || "N/A"}\n\n` +
    `📋 Issue: ${t.issueType}\n` +
    `💳 Payment: ${t.paymentMethod}\n` +
    `🆔 Player ID: ${t.playerId}\n` +
    `🤵 Agent Number: ${t.agentNumber || "N/A"}\n` +
    `🔢 TRX ID: ${t.trxId}\n` +
    `📅 Date: ${t.date}\n` +
    `⏰ Time: ${t.time}\n\n` +
    `👁 Checked By: ${t.checkedBy || "Not checked yet"}`
  );
}

function adminButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👁 Take / Check Task", `take_${ticketNumber}`)],
    [Markup.button.callback("✅ Successful", `success_${ticketNumber}`)],
    [Markup.button.callback("🏁 Resolve", `resolve_${ticketNumber}`)],
  ]);
}

async function showMainMenu(ctx) {
  if (isAdmin(ctx.from.id)) {
    return ctx.reply(
      "👑 ADMIN PANEL\n\nChoose an option 👇",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 Pending / Task Tickets", "admin_tickets")],
        [Markup.button.callback("📢 Broadcast", "broadcast")],
      ])
    );
  }

  return ctx.reply(
    "🏠 7STARSWIN SUPPORT ⭐\n\nWelcome! Choose an option 👇",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎫 Create Ticket", "create_ticket")],
      [Markup.button.callback("📋 My Tickets / Status", "mytickets")],
    ])
  );
}

bot.start(async (ctx) => {
  const userId = String(ctx.from.id);

  if (isAdmin(userId)) return showMainMenu(ctx);

  const user = await User.findOne({ userId });

  if (!user) {
    return ctx.reply("📱 Please share your contact number to continue.", {
      reply_markup: {
        keyboard: [[{ text: "📱 Share Contact", request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });
  }

  return showMainMenu(ctx);
});

bot.command("myid", (ctx) => {
  ctx.reply(`🆔 Your Telegram ID:\n${ctx.from.id}`);
});

bot.command("groupid", (ctx) => {
  ctx.reply(`🆔 This Chat ID:\n${ctx.chat.id}`);
});

bot.command("reply", async (ctx) => {
  if (!isAdmin(ctx.from.id)) return;

  const parts = ctx.message.text.split(" ");
  const ticketNumber = parts[1];
  const replyText = parts.slice(2).join(" ");

  if (!ticketNumber || !replyText) {
    return ctx.reply("❌ Use like this:\n/reply TICKET123456 Your message here");
  }

  const ticket = await Ticket.findOne({ ticketNumber });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "task_at_work";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.lastAdminReply = replyText;
  ticket.updatedAt = new Date();
  await ticket.save();

  await bot.telegram.sendMessage(
    ticket.userId,
    `💬 SUPPORT REPLY\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${ticketStatusText(ticket.status)}\n\n${replyText}\n\n✍️ You can reply by typing message here.`
  );

  if (ADMIN_GROUP_ID) {
    await bot.telegram.sendMessage(
      ADMIN_GROUP_ID,
      `💬 Admin Reply Sent\n\n🎫 ${ticket.ticketNumber}\n👤 Admin: ${ctx.from.first_name}\n\n${replyText}`
    );
  }

  return ctx.reply("✅ Reply sent to user.");
});

bot.on("contact", async (ctx) => {
  const contact = ctx.message.contact;

  if (contact.user_id !== ctx.from.id) {
    return ctx.reply("❌ Please share your own contact.");
  }

  await User.findOneAndUpdate(
    { userId: String(ctx.from.id) },
    {
      userId: String(ctx.from.id),
      name: `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim(),
      username: ctx.from.username || "",
      phone: contact.phone_number,
    },
    { upsert: true, new: true }
  );

  await ctx.reply("✅ Registration complete.", {
    reply_markup: { remove_keyboard: true },
  });

  return showMainMenu(ctx);
});

bot.action("create_ticket", async (ctx) => {
  await ctx.answerCbQuery();
  states.set(ctx.from.id, { step: "issue" });

  return ctx.reply(
    "📋 Select issue type:",
    Markup.inlineKeyboard([
      [Markup.button.callback("💰 Deposit Issue", "issue_deposit")],
      [Markup.button.callback("💸 Withdrawal Issue", "issue_withdrawal")],
    ])
  );
});

bot.action("issue_deposit", async (ctx) => {
  await ctx.answerCbQuery();
  states.set(ctx.from.id, { step: "payment", issueType: "Deposit" });

  return ctx.reply("💳 Enter payment method.\n\nExample: bKash, Nagad, Rocket");
});

bot.action("issue_withdrawal", async (ctx) => {
  await ctx.answerCbQuery();
  states.set(ctx.from.id, { step: "payment", issueType: "Withdrawal" });

  return ctx.reply("💳 Enter payment method.\n\nExample: bKash, Nagad, Rocket");
});

async function showPreview(ctx, photoId = "") {
  const state = states.get(ctx.from.id);
  if (!state) return ctx.reply("❌ Session expired. Please start again.");

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
    `⏰ Time: ${state.time}\n` +
    `📸 Photo: ${photoId ? "Attached ✅" : "Skipped ❌"}\n\n` +
    `✅ Everything correct?`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Send Request", "submit_ticket")],
    [Markup.button.callback("❌ Cancel", "cancel_ticket")],
  ]);

  if (photoId) {
    return ctx.replyWithPhoto(photoId, { caption: msg, ...buttons });
  }

  return ctx.reply(msg, buttons);
}

bot.action("cancel_ticket", async (ctx) => {
  await ctx.answerCbQuery();
  clearState(ctx.from.id);
  await ctx.reply("❌ Ticket cancelled.");
  return showMainMenu(ctx);
});

bot.action("submit_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  const state = states.get(ctx.from.id);
  if (!state) return ctx.reply("❌ Session expired. Please start again.");

  const user = await User.findOne({ userId: String(ctx.from.id) });
  const ticketNumber = "TICKET" + Date.now();

  const ticket = await Ticket.create({
    ticketNumber,
    userId: String(ctx.from.id),
    userName: user?.name || ctx.from.first_name || "Unknown",
    username: ctx.from.username || "",
    phone: user?.phone || "",
    issueType: state.issueType,
    paymentMethod: state.paymentMethod,
    playerId: state.playerId,
    agentNumber: state.agentNumber || "",
    trxId: state.trxId,
    date: state.date,
    time: state.time,
    photoId: state.photoId || "",
    status: "processing",
  });

  clearState(ctx.from.id);

  await ctx.reply(
    `✅ Request submitted successfully!\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${ticketStatusText(ticket.status)}`
  );

  if (!ADMIN_GROUP_ID) {
    await ctx.reply("⚠️ Admin group not set. Add ADMIN_GROUP_ID in .env");
    return showMainMenu(ctx);
  }

  try {
    let sentMsg;
    const adminMsg =
      ticketDetails(ticket) +
      `\n\n💬 To reply from group, use:\n/reply ${ticket.ticketNumber} Your message`;

    if (ticket.photoId) {
      sentMsg = await bot.telegram.sendPhoto(ADMIN_GROUP_ID, ticket.photoId, {
        caption: adminMsg,
        ...adminButtons(ticket.ticketNumber),
      });
    } else {
      sentMsg = await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        adminMsg,
        adminButtons(ticket.ticketNumber)
      );
    }

    ticket.groupMessageId = sentMsg.message_id;
    await ticket.save();
  } catch (err) {
    console.log("❌ Group send failed:", err.message);
    await ctx.reply(
      `⚠️ Ticket saved, but group notification failed.\n\nReason: ${err.message}\n\nCheck ADMIN_GROUP_ID and make bot admin in group.`
    );
  }

  return showMainMenu(ctx);
});

bot.action(/take_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) {
    return ctx.reply("❌ Only admin can take task.");
  }

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "task_at_work";
  ticket.checkedBy = ctx.from.first_name || String(ctx.from.id);
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`👁 Checked by ${ticket.checkedBy}\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `👨‍💻 Support started working on your ticket.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${ticketStatusText(ticket.status)}`
  );
});

bot.action(/success_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Only admin can mark successful.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "successful";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`✅ Ticket marked successful.\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `✅ Your request is successful.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${ticketStatusText(ticket.status)}`
  );
});

bot.action(/resolve_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Only admin can resolve.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "resolved";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`🏁 Ticket resolved.\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `🏁 Your ticket has been resolved.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${ticketStatusText(ticket.status)}`
  );
});

bot.action("mytickets", async (ctx) => {
  await ctx.answerCbQuery();

  const tickets = await Ticket.find({ userId: String(ctx.from.id) })
    .sort({ createdAt: -1 })
    .limit(10);

  if (!tickets.length) return ctx.reply("❌ No tickets found.");

  for (const t of tickets) {
    await ctx.reply(
      `🎫 ${t.ticketNumber}\n📌 Status: ${ticketStatusText(t.status)}\n👁 Checked By: ${t.checkedBy || "Not yet"}\n📅 Date: ${t.date}`
    );
  }
});

bot.action("admin_tickets", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const tickets = await Ticket.find({
    status: { $in: ["processing", "task_at_work"] },
  })
    .sort({ createdAt: -1 })
    .limit(20);

  if (!tickets.length) return ctx.reply("✅ No pending/task tickets.");

  for (const t of tickets) {
    await ctx.reply(
      ticketDetails(t) + `\n\n💬 Reply command:\n/reply ${t.ticketNumber} Your message`,
      adminButtons(t.ticketNumber)
    );
  }
});

bot.action("broadcast", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  states.set(ctx.from.id, { step: "broadcast" });

  return ctx.reply(
    "📢 Send broadcast now.\n\nYou can send:\n✅ Text\n✅ Photo with caption"
  );
});

bot.on("photo", async (ctx) => {
  const state = states.get(ctx.from.id);

  if (state && state.step === "broadcast" && isAdmin(ctx.from.id)) {
    const photo = ctx.message.photo.pop();
    const caption = ctx.message.caption || "📢 Admin Broadcast";
    const users = await User.find({});
    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendPhoto(user.userId, photo.file_id, { caption });
        sent++;
      } catch (e) {}
    }

    clearState(ctx.from.id);
    return ctx.reply(`✅ Photo broadcast sent to ${sent} users.`);
  }

  if (state && state.step === "photo") {
    const photo = ctx.message.photo.pop();
    return showPreview(ctx, photo.file_id);
  }
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const userId = ctx.from.id;
  const state = states.get(userId);

  if (state && state.step === "broadcast" && isAdmin(userId)) {
    const users = await User.find({});
    let sent = 0;

    for (const user of users) {
      try {
        await bot.telegram.sendMessage(user.userId, `📢 ADMIN BROADCAST\n\n${text}`);
        sent++;
      } catch (e) {}
    }

    clearState(userId);
    return ctx.reply(`✅ Broadcast sent to ${sent} users.`);
  }

  if (state) {
    if (state.step === "payment") {
      state.paymentMethod = text;
      state.step = "player";
      states.set(userId, state);
      return ctx.reply("🆔 Enter Player ID.\n\nExample: 123456");
    }

    if (state.step === "player") {
      state.playerId = text;

      if (state.issueType === "Deposit") {
        state.step = "agent";
        states.set(userId, state);
        return ctx.reply("🤵 Enter Agent Number.\n\nExample: 017xxxxxxxx");
      }

      state.step = "trx";
      states.set(userId, state);
      return ctx.reply("🔢 Enter TRX ID.\n\nExample: TXN123456789");
    }

    if (state.step === "agent") {
      state.agentNumber = text;
      state.step = "trx";
      states.set(userId, state);
      return ctx.reply("🔢 Enter TRX ID.\n\nExample: TXN123456789");
    }

    if (state.step === "trx") {
      state.trxId = text;
      state.step = "date";
      states.set(userId, state);
      return ctx.reply("📅 Enter date.\n\nExample: 21/05/2026");
    }

    if (state.step === "date") {
      state.date = text;
      state.step = "time";
      states.set(userId, state);
      return ctx.reply("⏰ Enter time.\n\nExample: 3:45 PM");
    }

    if (state.step === "time") {
      state.time = text;
      state.step = "photo";
      states.set(userId, state);
      return ctx.reply("📸 Send screenshot/photo.\n\nOr type: skip");
    }

    if (state.step === "photo" && text.toLowerCase() === "skip") {
      return showPreview(ctx, "");
    }
  }

  if (!isAdmin(userId)) {
    const latestTicket = await Ticket.findOne({
      userId: String(userId),
      status: { $in: ["processing", "task_at_work", "successful"] },
    }).sort({ createdAt: -1 });

    if (latestTicket && ADMIN_GROUP_ID) {
      try {
        await bot.telegram.sendMessage(
          ADMIN_GROUP_ID,
          `💬 USER REPLY\n\n🎫 Ticket: ${latestTicket.ticketNumber}\n👤 User: ${latestTicket.userName}\n📌 Status: ${ticketStatusText(latestTicket.status)}\n\n${text}\n\nAdmin reply:\n/reply ${latestTicket.ticketNumber} Your message`,
          adminButtons(latestTicket.ticketNumber)
        );

        return ctx.reply("✅ Your reply sent to support team.");
      } catch (err) {
        return ctx.reply("❌ Failed to send reply to support group.");
      }
    }

    return ctx.reply("🏠 Use /start to open menu.");
  }
});

bot.catch((err) => {
  console.log("BOT ERROR:", err);
});

bot.launch();
console.log("✅ BOT STARTED");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

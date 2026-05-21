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

function statusText(status) {
  if (status === "processing") return "🟡 Pending / Processing";
  if (status === "task_at_work") return "👨‍💻 Task At Work";
  if (status === "successful") return "✅ Successful";
  if (status === "resolved") return "🏁 Resolved";
  return status;
}

function userReplyButton(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💬 Reply Support", `user_reply_${ticketNumber}`)],
    [Markup.button.callback("📋 Check Status", "mytickets")],
  ]);
}

function adminButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("👁 Take Task", `take_${ticketNumber}`)],
    [Markup.button.callback("💬 Reply User", `admin_reply_${ticketNumber}`)],
    [
      Markup.button.callback("✅ Mark Successful", `success_${ticketNumber}`),
      Markup.button.callback("🏁 Resolve", `resolve_${ticketNumber}`),
    ],
  ]);
}

function ticketDetails(t) {
  return (
    `🎫 SUPPORT TICKET\n\n` +
    `🎟 Ticket: ${t.ticketNumber}\n` +
    `📌 Status: ${statusText(t.status)}\n` +
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

async function showMainMenu(ctx) {
  if (isAdmin(ctx.from.id)) {
    return ctx.reply(
      "👑 ADMIN PANEL\n\nChoose option 👇",
      Markup.inlineKeyboard([
        [Markup.button.callback("📋 Pending", "admin_pending")],
        [Markup.button.callback("👨‍💻 Task At Work", "admin_task")],
        [Markup.button.callback("✅ Successful", "admin_successful")],
        [Markup.button.callback("📢 Broadcast", "broadcast")],
      ])
    );
  }

  return ctx.reply(
    "🏠 7STARSWIN SUPPORT ⭐\n\nWelcome! Choose option 👇",
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

bot.command("myid", (ctx) => ctx.reply(`🆔 Your Telegram ID:\n${ctx.from.id}`));
bot.command("groupid", (ctx) => ctx.reply(`🆔 This Chat ID:\n${ctx.chat.id}`));

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

  if (photoId) return ctx.replyWithPhoto(photoId, { caption: msg, ...buttons });
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
    `✅ Request submitted successfully!\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}`,
    userReplyButton(ticket.ticketNumber)
  );

  try {
    const adminMsg = ticketDetails(ticket);
    let sentMsg;

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
    await ctx.reply(`⚠️ Ticket saved but group send failed:\n${err.message}`);
  }

  return showMainMenu(ctx);
});

bot.action(/user_reply_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
    userId: String(ctx.from.id),
  });

  if (!ticket) return ctx.reply("❌ Ticket not found.");
  if (ticket.status === "resolved") return ctx.reply("🏁 This ticket is already resolved.");

  states.set(ctx.from.id, {
    step: "user_reply",
    ticketNumber: ticket.ticketNumber,
  });

  return ctx.reply(
    `💬 Reply to support\n\n🎫 Ticket: ${ticket.ticketNumber}\n\nSend text, photo, video, or document now.`
  );
});

bot.action(/admin_reply_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");
  if (ticket.status === "resolved") return ctx.reply("🏁 This ticket is already resolved.");

  states.set(ctx.from.id, {
    step: "admin_reply",
    ticketNumber: ticket.ticketNumber,
  });

  return ctx.reply(
    `💬 Reply to user\n\n🎫 Ticket: ${ticket.ticketNumber}\n\nSend text, photo, video, or document now.`
  );
});

bot.action(/take_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "task_at_work";
  ticket.checkedBy = ctx.from.first_name || String(ctx.from.id);
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`👁 Checked by ${ticket.checkedBy}\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `👨‍💻 Support started working on your ticket.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}`,
    userReplyButton(ticket.ticketNumber)
  );
});

bot.action(/success_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "successful";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`✅ Ticket marked successful.\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `✅ Your request is successful.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}`,
    userReplyButton(ticket.ticketNumber)
  );
});

bot.action(/resolve_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const ticket = await Ticket.findOne({ ticketNumber: ctx.match[1] });
  if (!ticket) return ctx.reply("❌ Ticket not found.");

  ticket.status = "resolved";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`🏁 Ticket resolved.\n🎫 ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `🏁 Your ticket has been resolved.\n\n🎫 Ticket: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}`
  );
});

bot.action("mytickets", async (ctx) => {
  await ctx.answerCbQuery();

  const tickets = await Ticket.find({ userId: String(ctx.from.id) })
    .sort({ createdAt: -1 })
    .limit(10);

  if (!tickets.length) return ctx.reply("❌ No tickets found.");

  for (const t of tickets) {
    const buttons =
      t.status === "resolved"
        ? undefined
        : userReplyButton(t.ticketNumber);

    await ctx.reply(
      `🎫 ${t.ticketNumber}\n📌 Status: ${statusText(t.status)}\n👁 Checked By: ${
        t.checkedBy || "Not yet"
      }\n📅 Date: ${t.date}`,
      buttons
    );
  }
});

async function showAdminTicketsByStatus(ctx, status, emptyText) {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  const tickets = await Ticket.find({ status })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(20);

  if (!tickets.length) return ctx.reply(emptyText);

  for (const t of tickets) {
    await ctx.reply(ticketDetails(t), adminButtons(t.ticketNumber));
  }
}

bot.action("admin_pending", async (ctx) => {
  await ctx.answerCbQuery();
  return showAdminTicketsByStatus(ctx, "processing", "✅ No pending tickets.");
});

bot.action("admin_task", async (ctx) => {
  await ctx.answerCbQuery();
  return showAdminTicketsByStatus(ctx, "task_at_work", "✅ No task at work tickets.");
});

bot.action("admin_successful", async (ctx) => {
  await ctx.answerCbQuery();
  return showAdminTicketsByStatus(ctx, "successful", "✅ No successful tickets.");
});

bot.action("broadcast", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin only.");

  states.set(ctx.from.id, { step: "broadcast" });

  return ctx.reply(
    "📢 Send broadcast now.\n\nYou can send:\n✅ Text\n✅ Photo with caption\n✅ Video with caption\n✅ Document with caption"
  );
});

async function sendAdminReplyToUser(ctx, ticket, type, fileId, text) {
  ticket.status = "task_at_work";
  ticket.checkedBy = ticket.checkedBy || ctx.from.first_name;
  ticket.lastAdminReply = text || `[${type}]`;
  ticket.updatedAt = new Date();
  await ticket.save();

  const caption =
    `💬 SUPPORT REPLY\n\n` +
    `🎫 Ticket: ${ticket.ticketNumber}\n` +
    `📌 Status: ${statusText(ticket.status)}\n\n` +
    `${text || ""}`;

  if (type === "text") {
    await bot.telegram.sendMessage(ticket.userId, caption, userReplyButton(ticket.ticketNumber));
  }

  if (type === "photo") {
    await bot.telegram.sendPhoto(ticket.userId, fileId, {
      caption,
      ...userReplyButton(ticket.ticketNumber),
    });
  }

  if (type === "video") {
    await bot.telegram.sendVideo(ticket.userId, fileId, {
      caption,
      ...userReplyButton(ticket.ticketNumber),
    });
  }

  if (type === "document") {
    await bot.telegram.sendDocument(ticket.userId, fileId, {
      caption,
      ...userReplyButton(ticket.ticketNumber),
    });
  }

  if (ADMIN_GROUP_ID) {
    await bot.telegram.sendMessage(
      ADMIN_GROUP_ID,
      `✅ Admin reply sent\n\n🎫 Ticket: ${ticket.ticketNumber}\n👤 Admin: ${ctx.from.first_name}`,
      adminButtons(ticket.ticketNumber)
    );
  }
}

async function sendUserReplyToGroup(ctx, ticket, type, fileId, text) {
  const caption =
    `💬 USER REPLY\n\n` +
    `🎫 Ticket: ${ticket.ticketNumber}\n` +
    `👤 User: ${ticket.userName}\n` +
    `📌 Status: ${statusText(ticket.status)}\n\n` +
    `${text || ""}`;

  if (type === "text") {
    await bot.telegram.sendMessage(ADMIN_GROUP_ID, caption, adminButtons(ticket.ticketNumber));
  }

  if (type === "photo") {
    await bot.telegram.sendPhoto(ADMIN_GROUP_ID, fileId, {
      caption,
      ...adminButtons(ticket.ticketNumber),
    });
  }

  if (type === "video") {
    await bot.telegram.sendVideo(ADMIN_GROUP_ID, fileId, {
      caption,
      ...adminButtons(ticket.ticketNumber),
    });
  }

  if (type === "document") {
    await bot.telegram.sendDocument(ADMIN_GROUP_ID, fileId, {
      caption,
      ...adminButtons(ticket.ticketNumber),
    });
  }

  await ctx.reply("✅ Your reply sent to support team.", userReplyButton(ticket.ticketNumber));
}

async function handleStateMessage(ctx, type, fileId, text) {
  const state = states.get(ctx.from.id);
  if (!state) return false;

  if (state.step === "admin_reply") {
    const ticket = await Ticket.findOne({ ticketNumber: state.ticketNumber });

    if (!ticket) {
      clearState(ctx.from.id);
      await ctx.reply("❌ Ticket not found.");
      return true;
    }

    await sendAdminReplyToUser(ctx, ticket, type, fileId, text);
    clearState(ctx.from.id);
    await ctx.reply("✅ Reply sent to user.");
    return true;
  }

  if (state.step === "user_reply") {
    const ticket = await Ticket.findOne({
      ticketNumber: state.ticketNumber,
      userId: String(ctx.from.id),
    });

    if (!ticket) {
      clearState(ctx.from.id);
      await ctx.reply("❌ Ticket not found.");
      return true;
    }

    await sendUserReplyToGroup(ctx, ticket, type, fileId, text);
    clearState(ctx.from.id);
    return true;
  }

  if (state.step === "broadcast" && isAdmin(ctx.from.id)) {
    const users = await User.find({});
    let sent = 0;

    for (const user of users) {
      try {
        if (type === "text") {
          await bot.telegram.sendMessage(user.userId, `📢 ADMIN BROADCAST\n\n${text}`);
        }
        if (type === "photo") {
          await bot.telegram.sendPhoto(user.userId, fileId, {
            caption: text || "📢 Admin Broadcast",
          });
        }
        if (type === "video") {
          await bot.telegram.sendVideo(user.userId, fileId, {
            caption: text || "📢 Admin Broadcast",
          });
        }
        if (type === "document") {
          await bot.telegram.sendDocument(user.userId, fileId, {
            caption: text || "📢 Admin Broadcast",
          });
        }
        sent++;
      } catch (e) {}
    }

    clearState(ctx.from.id);
    await ctx.reply(`✅ Broadcast sent to ${sent} users.`);
    return true;
  }

  return false;
}

bot.on("photo", async (ctx) => {
  const photo = ctx.message.photo.pop();
  const caption = ctx.message.caption || "";

  const handled = await handleStateMessage(ctx, "photo", photo.file_id, caption);
  if (handled) return;

  const state = states.get(ctx.from.id);
  if (state && state.step === "photo") {
    return showPreview(ctx, photo.file_id);
  }
});

bot.on("video", async (ctx) => {
  const caption = ctx.message.caption || "";
  await handleStateMessage(ctx, "video", ctx.message.video.file_id, caption);
});

bot.on("document", async (ctx) => {
  const caption = ctx.message.caption || "";
  await handleStateMessage(ctx, "document", ctx.message.document.file_id, caption);
});

bot.on("text", async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith("/")) return;

  const userId = ctx.from.id;
  const state = states.get(userId);

  const handled = await handleStateMessage(ctx, "text", null, text);
  if (handled) return;

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

    if (latestTicket) {
      return ctx.reply(
        "💬 To reply support, click button below:",
        userReplyButton(latestTicket.ticketNumber)
      );
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

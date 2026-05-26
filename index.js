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
  trxId: { type: String, unique: true, index: true },
  date: String,
  time: String,
  photoId: String,
  status: { type: String, default: "processing" },
  checkedBy: String,
  lastAdminReply: String,

  takenHistory: [
    {
      adminId: String,
      adminName: String,
      username: String,
      takenAt: { type: Date, default: Date.now },
    },
  ],

  replyHistory: [
    {
      from: String,
      senderId: String,
      senderName: String,
      type: String,
      message: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Ticket = mongoose.model("Ticket", ticketSchema);

const states = new Map();

function clearState(id) {
  states.delete(id);
}

function isAdmin(id) {
  return ADMIN_CHAT_IDS.includes(String(id));
}

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

function adminName(ctx) {
  return `${ctx.from.first_name || ""} ${ctx.from.last_name || ""}`.trim() || "Admin";
}

function userButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("💬 Reply Support", `user_reply_${ticketNumber}`)],
    [Markup.button.callback("📋 My Tickets", "mytickets")],
  ]);
}

function adminButtons(ticketNumber) {
  return Markup.inlineKeyboard([
    [Markup.button.callback("📋 Copy Full Info", `copy_${ticketNumber}`)],
    [
      Markup.button.callback("📋 Issue", `copy_issue_${ticketNumber}`),
      Markup.button.callback("📋 Payment", `copy_payment_${ticketNumber}`),
    ],
    [
      Markup.button.callback("📋 Player ID", `copy_player_${ticketNumber}`),
      Markup.button.callback("📋 Agent", `copy_agent_${ticketNumber}`),
    ],
    [
      Markup.button.callback("📋 TRX", `copy_trx_${ticketNumber}`),
      Markup.button.callback("📋 Date/Time", `copy_datetime_${ticketNumber}`),
    ],
    [Markup.button.callback("👁 Take Task", `take_${ticketNumber}`)],
    [Markup.button.callback("💬 Reply User", `admin_reply_${ticketNumber}`)],
    [Markup.button.callback("📜 Ticket History", `history_${ticketNumber}`)],
    [
      Markup.button.callback("✅ Successful", `success_${ticketNumber}`),
      Markup.button.callback("🏁 Resolve", `resolve_${ticketNumber}`),
    ],
  ]);
}

function copyInfo(t) {
  return (
    `Ticket ID: ${t.ticketNumber}\n` +
    `Issue: ${t.issueType}\n` +
    `Payment: ${t.paymentMethod}\n` +
    `Player ID: ${t.playerId}\n` +
    `Agent Number: ${t.agentNumber || "N/A"}\n` +
    `TRX ID: ${t.trxId}\n` +
    `Date: ${t.date}\n` +
    `Time: ${t.time}`
  );
}

function ticketDetails(t) {
  return (
    `🎫 SUPPORT TICKET\n\n` +
    `🎟 Ticket ID: ${t.ticketNumber}\n` +
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
    "🏠 7STARSWIN SUPPORT ⭐\n\nChoose option 👇",
    Markup.inlineKeyboard([
      [Markup.button.callback("🎫 Create Ticket", "create_ticket")],
      [Markup.button.callback("📋 My Tickets", "mytickets")],
    ])
  );
}

bot.start(async (ctx) => {
  const userId = String(ctx.from.id);

  if (isAdmin(userId)) return showMainMenu(ctx);

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

bot.command("myid", (ctx) => {
  ctx.reply(`🆔 Your ID:\n${ctx.from.id}`);
});

bot.command("groupid", (ctx) => {
  ctx.reply(`🆔 Group ID:\n${ctx.chat.id}`);
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

  await ctx.reply("✅ Registration Complete", {
    reply_markup: { remove_keyboard: true },
  });

  return showMainMenu(ctx);
});

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

  return ctx.reply("💳 Enter Payment Method\n\nExample: BKASH");
});

bot.action("issue_withdrawal", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    step: "payment",
    issueType: "Withdrawal",
  });

  return ctx.reply("💳 Enter Payment Method\n\nExample: NAGAD");
});

async function showPreview(ctx, photoId = "") {
  const state = states.get(ctx.from.id);

  if (!state) return ctx.reply("❌ Session Expired");

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
    `✅ Everything Correct?`;

  const buttons = Markup.inlineKeyboard([
    [Markup.button.callback("✅ Send Request", "submit_ticket")],
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

bot.action("cancel_ticket", async (ctx) => {
  await ctx.answerCbQuery();
  clearState(ctx.from.id);
  await ctx.reply("❌ Ticket Cancelled");
  return showMainMenu(ctx);
});

bot.action("submit_ticket", async (ctx) => {
  await ctx.answerCbQuery();

  const state = states.get(ctx.from.id);
  if (!state) return ctx.reply("❌ Session Expired");

  const trxId = state.trxId.trim();
  const ticketNumber = trxId;

  const existing = await Ticket.findOne({
    $or: [{ trxId }, { ticketNumber }],
  });

  if (existing) {
    return ctx.reply(
      "❌ This TRX ID already used.\n\nYou cannot create multiple requests with same TRX ID."
    );
  }

  const user = await User.findOne({
    userId: String(ctx.from.id),
  });

  try {
    const ticket = await Ticket.create({
      ticketNumber,
      userId: String(ctx.from.id),
      userName: user?.name || ctx.from.first_name || "Unknown",
      username: user?.username || "",
      phone: user?.phone || "",
      issueType: state.issueType,
      paymentMethod: state.paymentMethod,
      playerId: state.playerId,
      agentNumber: state.agentNumber || "",
      trxId,
      date: state.date,
      time: state.time,
      photoId: state.photoId || "",
      status: "processing",
    });

    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Request Submitted\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 Status: ${statusText(
        ticket.status
      )}`,
      userButtons(ticket.ticketNumber)
    );

    try {
      if (ticket.photoId) {
        await bot.telegram.sendPhoto(ADMIN_GROUP_ID, ticket.photoId, {
          caption: ticketDetails(ticket),
          ...adminButtons(ticket.ticketNumber),
        });
      } else {
        await bot.telegram.sendMessage(
          ADMIN_GROUP_ID,
          ticketDetails(ticket),
          adminButtons(ticket.ticketNumber)
        );
      }
    } catch (err) {
      console.log("❌ Group send failed:", err.message);
    }

    return showMainMenu(ctx);
  } catch (err) {
    if (err.code === 11000) {
      return ctx.reply(
        "❌ This TRX ID already used.\n\nYou cannot create multiple requests with same TRX ID."
      );
    }

    console.log("❌ Ticket create error:", err.message);
    return ctx.reply("❌ Something went wrong. Please try again.");
  }
});

bot.action(/copy_(issue|payment|player|agent|trx|datetime)_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("Copy text sent ✅");

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const field = ctx.match[1];
  const ticketNumber = ctx.match[2];

  const ticket = await Ticket.findOne({ ticketNumber });
  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  let text = "";

  if (field === "issue") text = `Issue: ${ticket.issueType}`;
  if (field === "payment") text = `Payment: ${ticket.paymentMethod}`;
  if (field === "player") text = `Player ID: ${ticket.playerId}`;
  if (field === "agent") text = `Agent Number: ${ticket.agentNumber || "N/A"}`;
  if (field === "trx") text = `TRX ID: ${ticket.trxId}`;
  if (field === "datetime") text = `Date: ${ticket.date}\nTime: ${ticket.time}`;

  return ctx.reply(`\`\`\`\n${text}\n\`\`\``, {
    parse_mode: "Markdown",
  });
});

bot.action(/copy_(.+)/, async (ctx) => {
  await ctx.answerCbQuery("Full copy text sent ✅");

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  return ctx.reply(`\`\`\`\n${copyInfo(ticket)}\n\`\`\``, {
    parse_mode: "Markdown",
  });
});

bot.action(/user_reply_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const ticketNumber = ctx.match[1];

  const ticket = await Ticket.findOne({
    ticketNumber,
    userId: String(ctx.from.id),
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");
  if (ticket.status === "resolved") return ctx.reply("🏁 Ticket Already Resolved");

  states.set(ctx.from.id, {
    step: "user_reply",
    ticketNumber,
  });

  return ctx.reply(
    `💬 Send Reply\n\n🎫 Ticket ID: ${ticketNumber}\n\nYou can send:\n✅ Text\n✅ Photo\n✅ Video\n✅ Document`
  );
});

bot.action(/admin_reply_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticketNumber = ctx.match[1];

  const ticket = await Ticket.findOne({ ticketNumber });
  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  states.set(ctx.from.id, {
    step: "admin_reply",
    ticketNumber,
  });

  return ctx.reply(
    `💬 Reply To User\n\n🎫 Ticket ID: ${ticketNumber}\n\nSend:\n✅ Text\n✅ Photo\n✅ Video\n✅ Document`
  );
});

bot.action(/take_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  const name = adminName(ctx);

  ticket.status = "task_at_work";
  ticket.checkedBy = name;
  ticket.updatedAt = new Date();

  ticket.takenHistory.push({
    adminId: String(ctx.from.id),
    adminName: name,
    username: ctx.from.username || "",
  });

  await ticket.save();

  const historyText = ticket.takenHistory
    .map((h, i) => {
      return (
        `${i + 1}. ${h.adminName}` +
        `${h.username ? ` (@${h.username})` : ""}\n` +
        `🕒 ${new Date(h.takenAt).toLocaleString()}`
      );
    })
    .join("\n\n");

  await ctx.reply(
    `👁 TASK TAKEN\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n👤 Current Admin: ${name}\n\n📜 TAKE HISTORY:\n${historyText}`
  );

  await bot.telegram.sendMessage(
    ticket.userId,
    `👨‍💻 Support Started Working\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n👤 Checked By: ${name}\n📌 ${statusText(
      ticket.status
    )}`,
    userButtons(ticket.ticketNumber)
  );
});

bot.action(/success_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  ticket.status = "successful";
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`✅ Ticket Successful\n\n🎫 Ticket ID: ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `✅ Your Request Successful\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 ${statusText(
      ticket.status
    )}`,
    userButtons(ticket.ticketNumber)
  );
});

bot.action(/resolve_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  ticket.status = "resolved";
  ticket.updatedAt = new Date();
  await ticket.save();

  await ctx.reply(`🏁 Ticket Resolved\n\n🎫 Ticket ID: ${ticket.ticketNumber}`);

  await bot.telegram.sendMessage(
    ticket.userId,
    `🏁 Your Ticket Resolved\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 ${statusText(
      ticket.status
    )}`
  );
});

bot.action(/history_(.+)/, async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const ticket = await Ticket.findOne({
    ticketNumber: ctx.match[1],
  });

  if (!ticket) return ctx.reply("❌ Ticket Not Found");

  let history = `📜 TICKET HISTORY\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}\n\n`;

  history += `👁 TAKE HISTORY:\n`;

  if (ticket.takenHistory && ticket.takenHistory.length) {
    ticket.takenHistory.forEach((h, i) => {
      history +=
        `\n${i + 1}. ${h.adminName}` +
        `${h.username ? ` (@${h.username})` : ""}` +
        `\n🕒 ${new Date(h.takenAt).toLocaleString()}\n`;
    });
  } else {
    history += `No take history\n`;
  }

  history += `\n💬 REPLY HISTORY:\n`;

  if (ticket.replyHistory && ticket.replyHistory.length) {
    ticket.replyHistory.forEach((r, i) => {
      history +=
        `\n${i + 1}. ${r.senderName} (${r.from})` +
        `\n📦 Type: ${r.type}` +
        `\n📝 Message: ${r.message}` +
        `\n🕒 ${new Date(r.createdAt).toLocaleString()}\n`;
    });
  } else {
    history += `No replies yet`;
  }

  return ctx.reply(history);
});

bot.action("mytickets", async (ctx) => {
  await ctx.answerCbQuery();

  const tickets = await Ticket.find({
    userId: String(ctx.from.id),
  }).sort({ createdAt: -1 });

  if (!tickets.length) return ctx.reply("❌ No Tickets Found");

  for (const t of tickets) {
    await ctx.reply(
      `🎫 Ticket ID: ${t.ticketNumber}\n📌 ${statusText(t.status)}\n👁 ${
        t.checkedBy || "Not Checked"
      }`,
      t.status === "resolved" ? undefined : userButtons(t.ticketNumber)
    );
  }
});

async function showTicketsByStatus(ctx, status, emptyText) {
  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  const tickets = await Ticket.find({ status }).sort({
    updatedAt: -1,
    createdAt: -1,
  });

  if (!tickets.length) return ctx.reply(emptyText);

  for (const t of tickets) {
    await ctx.reply(ticketDetails(t), adminButtons(t.ticketNumber));
  }
}

bot.action("admin_pending", async (ctx) => {
  await ctx.answerCbQuery();
  return showTicketsByStatus(ctx, "processing", "✅ No Pending Tickets");
});

bot.action("admin_task", async (ctx) => {
  await ctx.answerCbQuery();
  return showTicketsByStatus(ctx, "task_at_work", "✅ No Task Tickets");
});

bot.action("admin_successful", async (ctx) => {
  await ctx.answerCbQuery();
  return showTicketsByStatus(ctx, "successful", "✅ No Successful Tickets");
});

bot.action("broadcast", async (ctx) => {
  await ctx.answerCbQuery();

  if (!isAdmin(ctx.from.id)) return ctx.reply("❌ Admin Only");

  states.set(ctx.from.id, {
    step: "broadcast",
  });

  return ctx.reply(
    "📢 Send Broadcast Now\n\nYou can send:\n✅ Text\n✅ Photo\n✅ Video\n✅ Document"
  );
});

async function handleStateMessage(ctx, type, fileId, text) {
  const state = states.get(ctx.from.id);

  if (!state) return false;

  if (state.step === "broadcast") {
    if (!isAdmin(ctx.from.id)) {
      clearState(ctx.from.id);
      await ctx.reply("❌ Admin Only");
      return true;
    }

    const users = await User.find({});
    let sent = 0;
    let failed = 0;

    for (const user of users) {
      try {
        if (type === "text") {
          await bot.telegram.sendMessage(
            user.userId,
            `📢 ADMIN BROADCAST\n\n${text}`
          );
        }

        if (type === "photo") {
          await bot.telegram.sendPhoto(user.userId, fileId, {
            caption: text || "📢 ADMIN BROADCAST",
          });
        }

        if (type === "video") {
          await bot.telegram.sendVideo(user.userId, fileId, {
            caption: text || "📢 ADMIN BROADCAST",
          });
        }

        if (type === "document") {
          await bot.telegram.sendDocument(user.userId, fileId, {
            caption: text || "📢 ADMIN BROADCAST",
          });
        }

        sent++;
      } catch (err) {
        failed++;
      }
    }

    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Broadcast Complete\n\n📤 Sent: ${sent}\n❌ Failed: ${failed}`
    );

    return true;
  }

  if (state.step === "admin_reply") {
    const ticket = await Ticket.findOne({
      ticketNumber: state.ticketNumber,
    });

    if (!ticket) {
      clearState(ctx.from.id);
      await ctx.reply("❌ Ticket Not Found");
      return true;
    }

    const caption =
      `💬 SUPPORT REPLY\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 ${statusText(
        ticket.status
      )}\n\n${text || ""}`;

    if (type === "text") {
      await bot.telegram.sendMessage(
        ticket.userId,
        caption,
        userButtons(ticket.ticketNumber)
      );
    }

    if (type === "photo") {
      await bot.telegram.sendPhoto(ticket.userId, fileId, {
        caption,
        ...userButtons(ticket.ticketNumber),
      });
    }

    if (type === "video") {
      await bot.telegram.sendVideo(ticket.userId, fileId, {
        caption,
        ...userButtons(ticket.ticketNumber),
      });
    }

    if (type === "document") {
      await bot.telegram.sendDocument(ticket.userId, fileId, {
        caption,
        ...userButtons(ticket.ticketNumber),
      });
    }

    ticket.status = "task_at_work";
    ticket.lastAdminReply = text || type;
    ticket.updatedAt = new Date();

    ticket.replyHistory.push({
      from: "admin",
      senderId: String(ctx.from.id),
      senderName: adminName(ctx),
      type,
      message: text || type,
    });

    await ticket.save();

    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Reply Sent\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n👤 User: ${ticket.userName}\n📌 Status: ${statusText(ticket.status)}`
    );

    return true;
  }

  if (state.step === "user_reply") {
    const ticket = await Ticket.findOne({
      ticketNumber: state.ticketNumber,
      userId: String(ctx.from.id),
    });

    if (!ticket) {
      clearState(ctx.from.id);
      await ctx.reply("❌ Ticket Not Found");
      return true;
    }

    if (ticket.status === "resolved") {
      clearState(ctx.from.id);
      await ctx.reply("🏁 Ticket Already Resolved");
      return true;
    }

    const caption =
      `💬 USER REPLY\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n👤 ${ticket.userName}\n📌 ${statusText(
        ticket.status
      )}\n\n${text || ""}`;

    if (type === "text") {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        caption,
        adminButtons(ticket.ticketNumber)
      );
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

    ticket.replyHistory.push({
      from: "user",
      senderId: String(ctx.from.id),
      senderName: ticket.userName || "User",
      type,
      message: text || type,
    });

    ticket.updatedAt = new Date();
    await ticket.save();

    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Reply Sent\n\n🎫 Ticket ID: ${ticket.ticketNumber}\n📌 Status: ${statusText(ticket.status)}`
    );

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

  const state = states.get(ctx.from.id);

  const handled = await handleStateMessage(ctx, "text", null, text);
  if (handled) return;

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

  if (state.step === "photo" && text.toLowerCase() === "skip") {
    return showPreview(ctx, "");
  }
});

bot.catch((err) => {
  console.log("BOT ERROR:", err);
});

bot.launch();
console.log("✅ BOT STARTED");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

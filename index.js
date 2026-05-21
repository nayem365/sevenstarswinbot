// ============================================
// 7STARSWIN FULL SUPPORT BOT
// ADMIN GROUP VERSION
// ============================================

require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const { Telegraf, Markup } = require("telegraf");

// ============================================
// CONFIG
// ============================================

const BOT_TOKEN = process.env.BOT_TOKEN;

const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS
  ? process.env.ADMIN_CHAT_IDS.split(",").map((x) => x.trim())
  : [];

const ADMIN_GROUP_ID = process.env.ADMIN_GROUP_ID;

const MONGODB_URI =
  process.env.MONGODB_URI ||
  "mongodb://127.0.0.1:27017/support_bot";

const PORT = process.env.PORT || 3000;

// ============================================
// EXPRESS
// ============================================

const app = express();

app.get("/", (req, res) => {
  res.send("✅ Bot Running");
});

app.listen(PORT, () => {
  console.log("✅ Server Running");
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
    default: "processing",
  },
  checkedBy: String,
  adminReply: String,
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

  const isAdmin =
    ADMIN_CHAT_IDS.includes(userId);

  let user = await User.findOne({
    userId,
  });

  if (!user && !isAdmin) {
    return ctx.reply(
      "📱 Please Share Contact",
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
  const isAdmin =
    ADMIN_CHAT_IDS.includes(
      ctx.from.id.toString()
    );

  if (isAdmin) {
    return ctx.reply(
      "👑 ADMIN PANEL",
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
    "🏠 7STARSWIN SUPPORT ⭐",
    Markup.inlineKeyboard([
      [
        Markup.button.callback(
          "🎫 Create Ticket",
          "create_ticket"
        ),
      ],
      [
        Markup.button.callback(
          "📋 My Tickets",
          "mytickets"
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
      name: `${ctx.from.first_name}`,
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
// ISSUE
// ============================================

bot.action("deposit", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    issueType: "Deposit",
    step: "payment",
  });

  ctx.reply(
    "💳 Enter Payment Method\n\nExample:\nBKASH"
  );
});

bot.action("withdraw", async (ctx) => {
  await ctx.answerCbQuery();

  states.set(ctx.from.id, {
    issueType: "Withdrawal",
    step: "payment",
  });

  ctx.reply(
    "💳 Enter Payment Method\n\nExample:\nNAGAD"
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

  if (state.step === "reply") {
    const ticket = await Ticket.findOne({
      ticketNumber: state.ticketNumber,
    });

    if (!ticket) return;

    ticket.adminReply = text;

    await ticket.save();

    await bot.telegram.sendMessage(
      ticket.userId,
      `💬 SUPPORT REPLY\n\n${text}\n\n📌 Status: Task At Work\n\nReply Anytime`
    );

    clearState(userId);

    return ctx.reply("✅ Reply Sent");
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
  // PLAYER
  // ==========================================

  if (state.step === "player") {
    state.playerId = text;

    if (state.issueType === "Deposit") {
      state.step = "agent";

      states.set(userId, state);

      return ctx.reply(
        "🤵 Enter Agent Number"
      );
    }

    state.step = "trx";

    states.set(userId, state);

    return ctx.reply(
      "🔢 Enter TRX ID"
    );
  }

  // ==========================================
  // AGENT
  // ==========================================

  if (state.step === "agent") {
    state.agentNumber = text;
    state.step = "trx";

    states.set(userId, state);

    return ctx.reply(
      "🔢 Enter TRX ID"
    );
  }

  // ==========================================
  // TRX
  // ==========================================

  if (state.step === "trx") {
    state.trxId = text;
    state.step = "date";

    states.set(userId, state);

    return ctx.reply(
      "📅 Enter Date"
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
      "⏰ Enter Time"
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
      "📸 Send Screenshot\n\nOr Type skip"
    );
  }

  // ==========================================
  // SKIP PHOTO
  // ==========================================

  if (
    state.step === "photo" &&
    text.toLowerCase() === "skip"
  ) {
    return showPreview(ctx, null);
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

    return showPreview(
      ctx,
      photo.file_id
    );
  }
});

// ============================================
// PREVIEW
// ============================================

async function showPreview(
  ctx,
  photoId
) {
  const state = states.get(ctx.from.id);

  state.photoId = photoId;

  states.set(ctx.from.id, state);

  let msg =
    `📋 TICKET PREVIEW\n\n` +
    `📌 Issue: ${state.issueType}\n` +
    `💳 Payment: ${state.paymentMethod}\n` +
    `🆔 Player ID: ${state.playerId}\n` +
    `🤵 Agent: ${
      state.agentNumber || "N/A"
    }\n` +
    `🔢 TRX: ${state.trxId}\n` +
    `📅 Date: ${state.date}\n` +
    `⏰ Time: ${state.time}\n\n` +
    `✅ Everything Correct?`;

  if (photoId) {
    await ctx.replyWithPhoto(photoId, {
      caption: msg,
      ...Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Submit",
            "submit_ticket"
          ),
        ],
        [
          Markup.button.callback(
            "❌ Cancel",
            "cancel_ticket"
          ),
        ],
      ]),
    });
  } else {
    await ctx.reply(
      msg,
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "✅ Submit",
            "submit_ticket"
          ),
        ],
        [
          Markup.button.callback(
            "❌ Cancel",
            "cancel_ticket"
          ),
        ],
      ])
    );
  }
}

// ============================================
// CANCEL
// ============================================

bot.action(
  "cancel_ticket",
  async (ctx) => {
    await ctx.answerCbQuery();

    clearState(ctx.from.id);

    ctx.reply("❌ Ticket Cancelled");

    showMainMenu(ctx);
  }
);

// ============================================
// SUBMIT
// ============================================

bot.action(
  "submit_ticket",
  async (ctx) => {
    await ctx.answerCbQuery();

    const state = states.get(ctx.from.id);

    const ticketNumber =
      "TICKET" + Date.now();

    const ticket =
      await Ticket.create({
        ticketNumber,
        userId: ctx.from.id.toString(),
        userName: ctx.from.first_name,
        issueType: state.issueType,
        paymentMethod:
          state.paymentMethod,
        playerId: state.playerId,
        agentNumber:
          state.agentNumber || "",
        trxId: state.trxId,
        date: state.date,
        time: state.time,
        photoId:
          state.photoId || "",
      });

    clearState(ctx.from.id);

    await ctx.reply(
      `✅ Ticket Submitted\n\n🎫 ${ticket.ticketNumber}\n\n📌 Status: Processing`
    );

    // ========================================
    // SEND TO ADMIN GROUP
    // ========================================

    let adminMsg =
      `🎫 NEW TICKET\n\n` +
      `🎟 Ticket: ${ticket.ticketNumber}\n` +
      `👤 User: ${ticket.userName}\n` +
      `📌 Issue: ${ticket.issueType}\n` +
      `💳 Payment: ${ticket.paymentMethod}\n` +
      `🆔 Player: ${ticket.playerId}\n` +
      `🤵 Agent: ${ticket.agentNumber}\n` +
      `🔢 TRX: ${ticket.trxId}\n` +
      `📅 Date: ${ticket.date}\n` +
      `⏰ Time: ${ticket.time}\n\n` +
      `📌 Status: Processing`;

    const buttons =
      Markup.inlineKeyboard([
        [
          Markup.button.callback(
            "👁 Take Task",
            `take_${ticket.ticketNumber}`
          ),
        ],
        [
          Markup.button.callback(
            "💬 Reply",
            `reply_${ticket.ticketNumber}`
          ),
        ],
        [
          Markup.button.callback(
            "✅ Successful",
            `success_${ticket.ticketNumber}`
          ),
        ],
      ]);

    if (ticket.photoId) {
      await bot.telegram.sendPhoto(
        ADMIN_GROUP_ID,
        ticket.photoId,
        {
          caption: adminMsg,
          ...buttons,
        }
      );
    } else {
      await bot.telegram.sendMessage(
        ADMIN_GROUP_ID,
        adminMsg,
        buttons
      );
    }
  }
);

// ============================================
// TAKE TASK
// ============================================

bot.action(
  /take_(.+)/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const ticketNumber =
      ctx.match[1];

    const ticket =
      await Ticket.findOne({
        ticketNumber,
      });

    if (!ticket) return;

    ticket.checkedBy =
      ctx.from.first_name;

    ticket.status =
      "task at work";

    await ticket.save();

    ctx.reply(
      `👁 ${ctx.from.first_name} Checked Ticket ${ticketNumber}`
    );

    await bot.telegram.sendMessage(
      ticket.userId,
      `👨‍💻 Support Started Working\n\n🎫 ${ticket.ticketNumber}\n\n📌 Status: Task At Work`
    );
  }
);

// ============================================
// REPLY
// ============================================

bot.action(
  /reply_(.+)/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const ticketNumber =
      ctx.match[1];

    states.set(ctx.from.id, {
      step: "reply",
      ticketNumber,
    });

    ctx.reply(
      "💬 Send Reply Message"
    );
  }
);

// ============================================
// SUCCESS
// ============================================

bot.action(
  /success_(.+)/,
  async (ctx) => {
    await ctx.answerCbQuery();

    const ticketNumber =
      ctx.match[1];

    const ticket =
      await Ticket.findOne({
        ticketNumber,
      });

    if (!ticket) return;

    ticket.status =
      "successful";

    await ticket.save();

    ctx.reply(
      `✅ Ticket ${ticketNumber} Marked Successful`
    );

    await bot.telegram.sendMessage(
      ticket.userId,
      `✅ Your Ticket Successful\n\n🎫 ${ticket.ticketNumber}\n\n📌 Status: Successful`
    );
  }
);

// ============================================
// MY TICKETS
// ============================================

bot.action(
  "mytickets",
  async (ctx) => {
    await ctx.answerCbQuery();

    const tickets =
      await Ticket.find({
        userId:
          ctx.from.id.toString(),
      });

    if (!tickets.length) {
      return ctx.reply(
        "❌ No Tickets Found"
      );
    }

    for (const t of tickets) {
      await ctx.reply(
        `🎫 ${t.ticketNumber}\n📌 Status: ${t.status}\n👁 Checked By: ${
          t.checkedBy || "Not Yet"
        }`
      );
    }
  }
);

// ============================================
// PENDING
// ============================================

bot.action(
  "pending",
  async (ctx) => {
    await ctx.answerCbQuery();

    const tickets =
      await Ticket.find({
        status: {
          $ne: "successful",
        },
      });

    if (!tickets.length) {
      return ctx.reply(
        "✅ No Pending Tickets"
      );
    }

    for (const t of tickets) {
      await ctx.reply(
        `🎫 ${t.ticketNumber}\n📌 ${t.status}\n👤 ${t.userName}`
      );
    }
  }
);

// ============================================
// BROADCAST
// ============================================

bot.action(
  "broadcast",
  async (ctx) => {
    await ctx.answerCbQuery();

    states.set(ctx.from.id, {
      step: "broadcast",
    });

    ctx.reply(
      "📢 Send Broadcast Message"
    );
  }
);

// ============================================
// GROUP ID
// ============================================

bot.command("groupid", (ctx) => {
  ctx.reply(
    `🆔 GROUP ID:\n${ctx.chat.id}`
  );
});

// ============================================
// MY ID
// ============================================

bot.command("myid", (ctx) => {
  ctx.reply(
    `🆔 YOUR ID:\n${ctx.from.id}`
  );
});

// ============================================
// ERROR
// ============================================

bot.catch((err) => {
  console.log(err);
});

// ============================================
// START
// ============================================

bot.launch();

console.log("✅ BOT STARTED");

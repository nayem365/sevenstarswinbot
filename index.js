// ============================================
// index.js - COMPLETE BOT (DATE PICKER, TIME, PHOTO, PREVIEW, USER REPLY, ADMIN REPLY)
// ============================================

require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');

// ==================== CONFIGURATION ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS ? process.env.ADMIN_CHAT_IDS.split(',').map(id => id.trim()) : [];
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mobcash_bot';
const PORT = process.env.PORT || 3000;

console.log('✅ Bot Token:', BOT_TOKEN ? 'Set' : 'Missing');
console.log('✅ Admin IDs:', ADMIN_CHAT_IDS);

// ==================== MONGODB SCHEMAS ====================
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    name: String,
    username: String,
    phone: String,
    language: { type: String, default: 'en' },
    registeredAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
});

const submissionSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    type: { type: String, default: 'player' },
    requestNumber: Number,
    data: mongoose.Schema.Types.Mixed,
    status: { type: String, default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const conversationSchema = new mongoose.Schema({
    requestNumber: { type: Number, required: true },
    userId: { type: String, required: true },
    adminId: String,
    messages: [{
        role: String, // 'admin' or 'user'
        message: String,
        timestamp: { type: Date, default: Date.now }
    }],
    lastActivity: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);
const Submission = mongoose.model('Submission', submissionSchema);
const Conversation = mongoose.model('Conversation', conversationSchema);

// ==================== DATABASE FUNCTIONS ====================
async function connectDB() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('✅ MongoDB connected');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error);
        throw error;
    }
}

async function getUser(userId) {
    return await User.findOne({ userId: userId.toString() }).lean();
}

async function saveUser(userId, data) {
    return await User.findOneAndUpdate(
        { userId: userId.toString() },
        { ...data, lastActive: new Date() },
        { upsert: true, new: true }
    );
}

async function getAllUsers() {
    return await User.find({}).lean();
}

async function saveSubmission(data) {
    const submission = new Submission(data);
    return await submission.save();
}

async function getSubmissions(filter = {}) {
    const query = {};
    if (filter.userId) query.userId = filter.userId.toString();
    if (filter.status) query.status = filter.status;
    return await Submission.find(query).sort({ createdAt: -1 }).limit(50).lean();
}

async function updateRequestStatus(requestNumber, status) {
    return await Submission.findOneAndUpdate(
        { requestNumber: parseInt(requestNumber) },
        { status: status },
        { new: true }
    );
}

async function getRequestByNumber(requestNumber) {
    return await Submission.findOne({ requestNumber: parseInt(requestNumber) }).lean();
}

async function saveConversationMessage(requestNumber, userId, adminId, role, message) {
    let conv = await Conversation.findOne({ requestNumber: requestNumber });
    if (!conv) {
        conv = new Conversation({ requestNumber, userId, adminId, messages: [] });
    }
    conv.messages.push({ role, message, timestamp: new Date() });
    conv.lastActivity = new Date();
    if (adminId) conv.adminId = adminId;
    return await conv.save();
}

async function getConversation(requestNumber) {
    return await Conversation.findOne({ requestNumber: requestNumber }).lean();
}

// ==================== HELPERS ====================
function generateRequestNumber() {
    return Math.floor(1000 + Math.random() * 9000);
}

function formatDate(date = new Date()) {
    return date.toLocaleString();
}

function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}

async function safeAnswer(ctx) {
    try {
        if (ctx && typeof ctx.answerCallbackQuery === 'function') {
            await ctx.answerCallbackQuery();
        }
    } catch (e) {}
}

// ==================== EXPRESS SERVER ====================
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health check on port ${PORT}`));

// ==================== BOT SETUP ====================
const bot = new Telegraf(BOT_TOKEN);
const userStates = new Map();

function clearState(userId) {
    userStates.delete(userId);
}

// ==================== MAIN MENU ====================
async function showMainMenu(ctx) {
    const user = await getUser(ctx.from.id);
    const isAdmin = ADMIN_CHAT_IDS.includes(ctx.from.id.toString());
    
    if (isAdmin) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👤 Player Support', 'menu_player')],
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Stats', 'admin_stats')],
            [Markup.button.callback('📋 Pending', 'admin_pending')],
        ]);
        await ctx.reply(`👑 *Admin Panel*\n\nWelcome ${user?.name || 'Admin'}!`, { parse_mode: 'Markdown', ...keyboard });
    } else {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👤 Player Support', 'menu_player')],
        ]);
        await ctx.reply(`🏠 *Main Menu*\n\nWelcome ${user?.name || 'User'}!`, { parse_mode: 'Markdown', ...keyboard });
    }
}

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    console.log(`🚀 /start from ${userId}`);
    clearState(userId);

    if (ADMIN_CHAT_IDS.includes(userId.toString())) {
        await showMainMenu(ctx);
        return;
    }

    const user = await getUser(userId);
    if (user && user.phone) {
        await showMainMenu(ctx);
    } else {
        await ctx.reply(
            `👋 *Welcome!*\n\nPlease share your phone number:`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [[{ text: '📱 Share Contact', request_contact: true }]],
                    resize_keyboard: true,
                    one_time_keyboard: true,
                },
            }
        );
    }
});

// ==================== CONTACT HANDLER ====================
bot.on('contact', async (ctx) => {
    const userId = ctx.from.id;
    const contact = ctx.message.contact;
    
    if (contact.user_id !== userId) {
        return ctx.reply('⚠️ Share your own number.');
    }
    
    await saveUser(userId, {
        userId: userId.toString(),
        name: `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
        username: ctx.from.username,
        phone: contact.phone_number,
        language: 'en',
    });
    
    await ctx.reply('✅ Phone verified!', { reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx);
});

// ==================== PLAYER FLOW ====================
bot.action('menu_player', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇧🇩 Bangladesh', 'country_bd')],
        [Markup.button.callback('🇮🇳 India', 'country_in')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply('📍 *Select your country:*', { parse_mode: 'Markdown', ...keyboard });
});

// ==================== PAYMENT METHODS ====================
bot.action('country_bd', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'Bangladesh', step: 'payment' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('bKash', 'pay_bkash'), Markup.button.callback('Nagad', 'pay_nagad')],
        [Markup.button.callback('Rocket', 'pay_rocket'), Markup.button.callback('Upay', 'pay_upay')],
        [Markup.button.callback('MoneyGo', 'pay_moneygo'), Markup.button.callback('Binance', 'pay_binance')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('💳 *Select payment method:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('country_in', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'India', step: 'payment' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('PhonePe', 'pay_phonepe'), Markup.button.callback('PayTM', 'pay_paytm')],
        [Markup.button.callback('Google Pay', 'pay_gpay'), Markup.button.callback('Amazon Pay', 'pay_amazon')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('💳 *Select payment method:*', { parse_mode: 'Markdown', ...keyboard });
});

const paymentMap = {
    pay_bkash: 'bKash', pay_nagad: 'Nagad', pay_rocket: 'Rocket',
    pay_upay: 'Upay', pay_moneygo: 'MoneyGo', pay_binance: 'Binance',
    pay_phonepe: 'PhonePe', pay_paytm: 'PayTM', pay_gpay: 'Google Pay', pay_amazon: 'Amazon Pay'
};

for (const [action, method] of Object.entries(paymentMap)) {
    bot.action(action, async (ctx) => {
        await safeAnswer(ctx);
        const state = userStates.get(ctx.from.id) || {};
        state.paymentMethod = method;
        state.step = 'issue';
        userStates.set(ctx.from.id, state);
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💰 Deposit', 'issue_deposit')],
            [Markup.button.callback('💸 Withdrawal', 'issue_withdrawal')],
            [Markup.button.callback('🔙 Back', `country_${state.country === 'Bangladesh' ? 'bd' : 'in'}`)],
        ]);
        await ctx.reply(`📋 *Select issue type for ${method}:*`, { parse_mode: 'Markdown', ...keyboard });
    });
}

// ==================== ISSUE TYPE ====================
bot.action('issue_deposit', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Deposit';
    state.step = 'user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your User ID:*', { parse_mode: 'Markdown' });
});

bot.action('issue_withdrawal', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Withdrawal';
    state.step = 'user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your Player ID:*', { parse_mode: 'Markdown' });
});

// ==================== DATE PICKER ====================
async function showDatePicker(ctx) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const monthName = monthNames[month];
    
    const keyboard = [];
    keyboard.push([Markup.button.callback(`📅 ${monthName} ${year}`, 'noop')]);
    
    const weekDays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    keyboard.push(weekDays.map(d => Markup.button.callback(d, 'noop')));
    
    let week = [];
    for (let i = 0; i < firstDay; i++) week.push(Markup.button.callback(' ', 'noop'));
    for (let d = 1; d <= daysInMonth; d++) {
        week.push(Markup.button.callback(d.toString(), `date_${d}`));
        if (week.length === 7) { keyboard.push(week); week = []; }
    }
    if (week.length) keyboard.push(week);
    
    keyboard.push([Markup.button.callback('🔙 Back', 'menu_player')]);
    
    await ctx.reply('📅 *Select date:*', {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: keyboard }
    });
}

bot.action(/date_(\d+)/, async (ctx) => {
    await safeAnswer(ctx);
    const day = ctx.match[1];
    const state = userStates.get(ctx.from.id) || {};
    state.selectedDate = day;
    state.step = 'time';
    userStates.set(ctx.from.id, state);
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🕐 09:00 AM', 'time_09'), Markup.button.callback('🕑 10:00 AM', 'time_10')],
        [Markup.button.callback('🕒 11:00 AM', 'time_11'), Markup.button.callback('🕓 12:00 PM', 'time_12')],
        [Markup.button.callback('🕔 01:00 PM', 'time_13'), Markup.button.callback('🕕 02:00 PM', 'time_14')],
        [Markup.button.callback('🕖 03:00 PM', 'time_15'), Markup.button.callback('🕗 04:00 PM', 'time_16')],
        [Markup.button.callback('🕘 05:00 PM', 'time_17'), Markup.button.callback('🕙 06:00 PM', 'time_18')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply(`⏰ *Select time for ${state.selectedDate}:*`, { parse_mode: 'Markdown', ...keyboard });
});

const timeMap = {
    time_09: '09:00 AM', time_10: '10:00 AM', time_11: '11:00 AM', time_12: '12:00 PM',
    time_13: '01:00 PM', time_14: '02:00 PM', time_15: '03:00 PM', time_16: '04:00 PM',
    time_17: '05:00 PM', time_18: '06:00 PM'
};

for (const [action, time] of Object.entries(timeMap)) {
    bot.action(action, async (ctx) => {
        await safeAnswer(ctx);
        const state = userStates.get(ctx.from.id) || {};
        state.selectedTime = time;
        state.step = 'photo';
        userStates.set(ctx.from.id, state);
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📸 Send Photo', 'send_photo_prompt')],
            [Markup.button.callback('⏭️ Skip', 'skip_photo')],
            [Markup.button.callback('🔙 Back', 'menu_player')],
        ]);
        await ctx.reply('📸 *Do you want to send a photo as proof?*\n\nYou can send a photo or skip this step.', { parse_mode: 'Markdown', ...keyboard });
    });
}

bot.action('send_photo_prompt', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.step = 'waiting_photo';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📸 *Please send your photo now.*', { parse_mode: 'Markdown' });
});

bot.action('skip_photo', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.step = 'review';
    userStates.set(ctx.from.id, state);
    await showReviewScreen(ctx);
});

// ==================== PHOTO HANDLER ====================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const user = await getUser(userId);
    
    if (!user || !user.phone) {
        return ctx.reply('⚠️ Please use /start first.');
    }
    
    if (state && state.step === 'waiting_photo') {
        const photo = ctx.message.photo.pop();
        state.photoId = photo.file_id;
        state.step = 'review';
        userStates.set(userId, state);
        await ctx.reply('📸 *Photo received!*', { parse_mode: 'Markdown' });
        await showReviewScreen(ctx);
    } else {
        await ctx.reply('📸 *Photo received!*\n\nPlease start a support request first using the Player Support button.', { parse_mode: 'Markdown' });
    }
});

// ==================== REVIEW SCREEN ====================
async function showReviewScreen(ctx) {
    const state = userStates.get(ctx.from.id);
    if (!state) {
        await ctx.reply('⚠️ Session expired. Please start over.');
        await showMainMenu(ctx);
        return;
    }
    
    let reviewText = `📋 *REVIEW YOUR INFORMATION*\n\n`;
    reviewText += `📍 *Country:* ${state.country}\n`;
    reviewText += `💳 *Payment:* ${state.paymentMethod}\n`;
    reviewText += `📋 *Issue:* ${state.issueType}\n`;
    reviewText += `🆔 *ID:* ${state.userOrPlayerId}\n`;
    reviewText += `📅 *Date:* ${state.selectedDate}\n`;
    reviewText += `⏰ *Time:* ${state.selectedTime}\n`;
    reviewText += `📸 *Photo:* ${state.photoId ? '✅ Received' : '⏭️ Skipped'}\n`;
    reviewText += `\n✅ *Is all information correct?*`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ SUBMIT', 'submit_request')],
        [Markup.button.callback('❌ CANCEL', 'cancel_request')],
        [Markup.button.callback('🔙 Edit', 'menu_player')],
    ]);
    
    if (state.photoId) {
        try {
            await ctx.replyWithPhoto(state.photoId, { caption: reviewText, parse_mode: 'Markdown', ...keyboard });
        } catch (e) {
            await ctx.reply(reviewText, { parse_mode: 'Markdown', ...keyboard });
        }
    } else {
        await ctx.reply(reviewText, { parse_mode: 'Markdown', ...keyboard });
    }
}

// ==================== SUBMIT REQUEST ====================
bot.action('submit_request', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const user = await getUser(userId);
    
    if (!state) {
        await ctx.reply('⚠️ Session expired. Please start over.');
        await showMainMenu(ctx);
        return;
    }
    
    const requestNumber = generateRequestNumber();
    const fullDateTime = `${state.selectedDate} ${state.selectedTime}`;
    
    await saveSubmission({
        userId: userId.toString(),
        type: 'player',
        requestNumber: requestNumber,
        data: {
            country: state.country,
            issueType: state.issueType,
            paymentMethod: state.paymentMethod,
            userOrPlayerId: state.userOrPlayerId,
            dateTime: fullDateTime,
            photoId: state.photoId,
            userName: user?.name,
            userPhone: user?.phone
        },
        status: 'pending'
    });
    
    // Notify admins
    let adminMsg = 
        `🆕 *NEW REQUEST #${requestNumber}*\n\n` +
        `👤 *User:* ${user?.name || 'Unknown'}\n` +
        `🆔 *ID:* ${userId}\n` +
        `📍 *Country:* ${state.country}\n` +
        `💳 *Payment:* ${state.paymentMethod}\n` +
        `📋 *Issue:* ${state.issueType}\n` +
        `🆔 *User/Player ID:* ${state.userOrPlayerId}\n` +
        `📅 *Date/Time:* ${fullDateTime}\n` +
        `📸 *Photo:* ${state.photoId ? '✅ Yes' : '❌ No'}`;
    
    const adminKeyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💬 Reply', `admin_reply_${requestNumber}`)],
        [Markup.button.callback('✅ Resolve', `resolve_${requestNumber}`)],
    ]);
    
    for (const adminId of ADMIN_CHAT_IDS) {
        try {
            if (state.photoId) {
                await bot.telegram.sendPhoto(adminId, state.photoId, { 
                    caption: adminMsg, 
                    parse_mode: 'Markdown',
                    ...adminKeyboard
                });
            } else {
                await bot.telegram.sendMessage(adminId, adminMsg, { 
                    parse_mode: 'Markdown',
                    ...adminKeyboard
                });
            }
        } catch (e) {
            console.error(`Failed to notify admin ${adminId}:`, e.message);
        }
    }
    
    await ctx.reply(
        `✅ *REQUEST SUBMITTED!*\n\n` +
        `📋 *Request #:* ${requestNumber}\n\n` +
        `Our team will review and respond shortly.\n` +
        `📱 You will be notified when there is a reply.`,
        { parse_mode: 'Markdown' }
    );
    
    clearState(userId);
    await showMainMenu(ctx);
});

bot.action('cancel_request', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    await ctx.reply('❌ *Request cancelled.*', { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
});

// ==================== TEXT HANDLER FOR USER ID ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;

    // Admin broadcast
    if (state && state.step === 'admin_broadcast') {
        const users = await getAllUsers();
        let sent = 0;
        await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.userId, text);
                sent++;
            } catch (e) {}
        }
        await ctx.reply(`✅ Broadcast sent to ${sent} users.`);
        clearState(userId);
        return;
    }

    // Player flow - waiting for user ID
    if (state && state.step === 'user_id') {
        state.userOrPlayerId = text;
        state.step = 'date';
        userStates.set(userId, state);
        await showDatePicker(ctx);
        return;
    }
});

// ==================== ADMIN PENDING REQUESTS ====================
bot.action('admin_pending', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const pending = await getSubmissions({ status: 'pending' });
    
    if (pending.length === 0) {
        await ctx.reply('📭 *No pending requests.*', { parse_mode: 'Markdown' });
        return;
    }
    
    let msg = '*📋 PENDING REQUESTS*\n\n';
    const keyboard = [];
    for (const req of pending.slice(0, 10)) {
        msg += `#${req.requestNumber} - ${req.data?.issueType || 'Unknown'} (${req.data?.paymentMethod || 'N/A'})\n`;
        keyboard.push([Markup.button.callback(`📋 View #${req.requestNumber}`, `view_${req.requestNumber}`)]);
    }
    keyboard.push([Markup.button.callback('🔙 Back', 'back_to_main')]);
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
});

// ==================== VIEW REQUEST DETAILS ====================
bot.action(/view_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const requestNumber = parseInt(ctx.match[1]);
    const request = await getRequestByNumber(requestNumber);
    
    if (!request) {
        await ctx.reply('❌ Request not found.');
        return;
    }
    
    const data = request.data;
    let details = `📋 *REQUEST #${requestNumber}*\n\n`;
    details += `📌 *Status:* ${request.status === 'pending' ? '⏳ Pending' : '✅ Resolved'}\n`;
    details += `👤 *User:* ${data?.userName || 'Unknown'}\n`;
    details += `🆔 *User ID:* ${request.userId}\n`;
    details += `📍 *Country:* ${data?.country || 'Unknown'}\n`;
    details += `💳 *Payment:* ${data?.paymentMethod || 'N/A'}\n`;
    details += `📋 *Issue:* ${data?.issueType || 'Unknown'}\n`;
    details += `🆔 *User/Player ID:* ${data?.userOrPlayerId || 'N/A'}\n`;
    details += `📅 *Date/Time:* ${data?.dateTime || 'N/A'}\n`;
    details += `📸 *Photo:* ${data?.photoId ? '✅ Yes' : '❌ No'}\n`;
    details += `📅 *Submitted:* ${formatDate(request.createdAt)}\n\n`;
    details += `💬 *Click below to reply to this user.*`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💬 Reply to User', `admin_reply_${requestNumber}`)],
        [Markup.button.callback('✅ Mark Resolved', `resolve_${requestNumber}`)],
        [Markup.button.callback('🔙 Back', 'admin_pending')],
    ]);
    
    if (data?.photoId) {
        try {
            await bot.telegram.sendPhoto(ctx.from.id, data.photoId, {
                caption: details,
                parse_mode: 'Markdown',
                reply_markup: keyboard.reply_markup
            });
        } catch (e) {
            await ctx.reply(details, { parse_mode: 'Markdown', ...keyboard });
        }
    } else {
        await ctx.reply(details, { parse_mode: 'Markdown', ...keyboard });
    }
});

// ==================== ADMIN REPLY TO USER ====================
bot.action(/admin_reply_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const requestNumber = ctx.match[1];
    const request = await getRequestByNumber(parseInt(requestNumber));
    
    if (!request) {
        await ctx.reply('❌ Request not found.');
        return;
    }
    
    userStates.set(ctx.from.id, { 
        step: 'admin_reply', 
        targetUserId: request.userId, 
        requestNumber: requestNumber 
    });
    await ctx.reply(`✏️ *Reply to Request #${requestNumber}*\n\nType your message below:`, { parse_mode: 'Markdown' });
});

// ==================== TEXT HANDLER FOR ADMIN REPLY ====================
// This handles the actual message from admin after clicking reply button
// Add this inside the bot.on('text') handler

// ==================== RESOLVE REQUEST ====================
bot.action(/resolve_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const requestNumber = parseInt(ctx.match[1]);
    const request = await getRequestByNumber(requestNumber);
    
    if (!request) {
        await ctx.reply('❌ Request not found.');
        return;
    }
    
    await updateRequestStatus(requestNumber, 'resolved');
    
    // Notify user
    try {
        await bot.telegram.sendMessage(request.userId, 
            `✅ *REQUEST #${requestNumber} RESOLVED*\n\n` +
            `Your request has been marked as resolved.\n` +
            `Thank you for using MobCash!`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}
    
    await ctx.reply(`✅ Request #${requestNumber} marked as resolved.`);
});

// ==================== ADMIN STATS ====================
bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const users = await getAllUsers();
    const submissions = await getSubmissions();
    const pending = submissions.filter(s => s.status === 'pending');
    await ctx.reply(
        `📊 *STATISTICS*\n\n` +
        `👥 Total Users: ${users.length}\n` +
        `📝 Total Requests: ${submissions.length}\n` +
        `⏳ Pending: ${pending.length}\n` +
        `✅ Resolved: ${submissions.length - pending.length}`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== ADMIN BROADCAST ====================
bot.action('admin_broadcast', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { step: 'admin_broadcast' });
    await ctx.reply('📢 *Enter your broadcast message:*', { parse_mode: 'Markdown' });
});

// ==================== BACK TO MAIN ====================
bot.action('back_to_main', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    await showMainMenu(ctx);
});

// ==================== USER REPLY TO ADMIN (AFTER RECEIVING ADMIN REPLY) ====================
// This allows users to reply to admin messages
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;
    const isAdmin = ADMIN_CHAT_IDS.includes(userId.toString());

    // Skip processing for commands
    if (text.startsWith('/')) return;

    // Handle admin broadcast
    if (state && state.step === 'admin_broadcast') {
        const users = await getAllUsers();
        let sent = 0;
        await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.userId, text);
                sent++;
            } catch (e) {}
        }
        await ctx.reply(`✅ Broadcast sent to ${sent} users.`);
        clearState(userId);
        return;
    }

    // Handle admin reply to a specific request
    if (state && state.step === 'admin_reply') {
        const targetUserId = state.targetUserId;
        const requestNumber = state.requestNumber;
        
        // Save conversation
        await saveConversationMessage(parseInt(requestNumber), targetUserId, userId, 'admin', text);
        
        try {
            await bot.telegram.sendMessage(targetUserId, 
                `📬 *ADMIN RESPONSE - REQUEST #${requestNumber}*\n\n` +
                `${text}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `💬 *You can reply directly to this message*`,
                { parse_mode: 'Markdown' }
            );
            await ctx.reply(`✅ Reply sent to user for request #${requestNumber}.`);
        } catch (error) {
            await ctx.reply(`❌ Failed to send reply: ${error.message}`);
        }
        clearState(userId);
        return;
    }

    // Handle USER REPLY to admin (when user sends a message after receiving an admin reply)
    if (!isAdmin) {
        // Check if this is a reply to a previous admin message
        // Find any active conversation for this user
        const conversation = await Conversation.findOne({ 
            userId: userId.toString(), 
            lastActivity: { $gt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } // Last 7 days
        }).sort({ lastActivity: -1 });
        
        if (conversation) {
            const request = await getRequestByNumber(conversation.requestNumber);
            if (request && request.status !== 'resolved') {
                // Save user's reply
                await saveConversationMessage(conversation.requestNumber, userId, null, 'user', text);
                
                // Notify all admins
                const user = await getUser(userId);
                const adminMsg = 
                    `💬 *USER REPLY - REQUEST #${conversation.requestNumber}*\n\n` +
                    `👤 *User:* ${user?.name || 'Unknown'}\n` +
                    `🆔 *User ID:* ${userId}\n` +
                    `📋 *Request #:* ${conversation.requestNumber}\n\n` +
                    `📝 *Message:*\n${text}`;
                
                const adminKeyboard = Markup.inlineKeyboard([
                    [Markup.button.callback('💬 Reply', `admin_reply_${conversation.requestNumber}`)],
                    [Markup.button.callback('✅ Resolve', `resolve_${conversation.requestNumber}`)],
                ]);
                
                for (const adminId of ADMIN_CHAT_IDS) {
                    try {
                        await bot.telegram.sendMessage(adminId, adminMsg, { 
                            parse_mode: 'Markdown',
                            ...adminKeyboard
                        });
                    } catch (e) {}
                }
                
                await ctx.reply(`✅ *Your reply has been sent to admin.*\n\nWe will get back to you shortly.`, { parse_mode: 'Markdown' });
                return;
            }
        }
    }

    // Handle player flow - waiting for user ID
    if (state && state.step === 'user_id') {
        state.userOrPlayerId = text;
        state.step = 'date';
        userStates.set(userId, state);
        await showDatePicker(ctx);
        return;
    }

    // If no state matches and not a conversation reply, ignore
    if (!state && !isAdmin) {
        // Just a friendly reminder
        await ctx.reply(`💬 *Menu*\n\nUse /start to see the main menu.`, { parse_mode: 'Markdown' });
    }
});

// ==================== ERROR HANDLER ====================
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    try {
        if (ctx && typeof ctx.reply === 'function') {
            ctx.reply('⚠️ An error occurred. Please try again.').catch(() => {});
        }
    } catch (e) {}
});

// ==================== LAUNCH ====================
(async () => {
    try {
        console.log('🚀 Initializing bot...');
        await connectDB();
        await bot.telegram.deleteWebhook();
        await bot.launch();
        console.log('✅ Bot is running and ready!');
    } catch (err) {
        console.error('❌ Launch failed:', err);
        process.exit(1);
    }
})();

process.once('SIGINT', async () => { await bot.stop('SIGINT'); await mongoose.disconnect(); process.exit(0); });
process.once('SIGTERM', async () => { await bot.stop('SIGTERM'); await mongoose.disconnect(); process.exit(0); });

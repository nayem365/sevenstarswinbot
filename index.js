// ============================================
// index.js - COMPLETE BOT (ALL FEATURES WORKING)
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
    createdAt: { type: Date, default: Date.now },
    resolvedAt: Date
});

const conversationSchema = new mongoose.Schema({
    requestNumber: { type: Number, required: true },
    userId: { type: String, required: true },
    adminId: String,
    messages: [{
        role: String,
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
    const updateData = { status: status };
    if (status === 'resolved') {
        updateData.resolvedAt = new Date();
    }
    return await Submission.findOneAndUpdate(
        { requestNumber: parseInt(requestNumber) },
        updateData,
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
app.get('/', (req, res) => res.send('✨ Bot is running! ✨'));
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
            [Markup.button.callback('🎮 Player Support', 'menu_player')],
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Statistics', 'admin_stats')],
            [Markup.button.callback('📋 Pending Requests', 'admin_pending')],
        ]);
        await ctx.reply(`👑 *ADMIN PANEL*\n\nWelcome ${user?.name || 'Admin'}! ✨`, { parse_mode: 'Markdown', ...keyboard });
    } else {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('🎮 Create Support Ticket', 'menu_player')],
        ]);
        await ctx.reply(`🏠 *MAIN MENU*\n\nWelcome ${user?.name || 'User'}! ✨\n\nCreate a support ticket for any issue.`, { parse_mode: 'Markdown', ...keyboard });
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
            `🌟 *WELCOME TO 7STARSWIN* 🌟\n\n` +
            `Please share your phone number to continue:`,
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
        return ctx.reply('⚠️ Please share your own number.');
    }
    
    await saveUser(userId, {
        userId: userId.toString(),
        name: `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
        username: ctx.from.username,
        phone: contact.phone_number,
        language: 'en',
    });
    
    await ctx.reply('✅ *Phone Verified!* ✨\n\nYou can now create support tickets.', { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx);
});

// ==================== PLAYER FLOW - COUNTRY ====================
bot.action('menu_player', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇧🇩 Bangladesh', 'country_bd')],
        [Markup.button.callback('🇮🇳 India', 'country_in')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply('📍 *SELECT YOUR COUNTRY*', { parse_mode: 'Markdown', ...keyboard });
});

// ==================== PAYMENT METHODS ====================
bot.action('country_bd', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'Bangladesh', step: 'payment' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 bKash', 'pay_bkash'), Markup.button.callback('💳 Nagad', 'pay_nagad')],
        [Markup.button.callback('💳 Rocket', 'pay_rocket'), Markup.button.callback('💳 Upay', 'pay_upay')],
        [Markup.button.callback('💳 MoneyGo', 'pay_moneygo'), Markup.button.callback('💳 Binance', 'pay_binance')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('💳 *SELECT PAYMENT METHOD*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('country_in', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'India', step: 'payment' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 PhonePe', 'pay_phonepe'), Markup.button.callback('💳 PayTM', 'pay_paytm')],
        [Markup.button.callback('💳 Google Pay', 'pay_gpay'), Markup.button.callback('💳 Amazon Pay', 'pay_amazon')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('💳 *SELECT PAYMENT METHOD*', { parse_mode: 'Markdown', ...keyboard });
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
            [Markup.button.callback('💰 Deposit Issue', 'issue_deposit')],
            [Markup.button.callback('💸 Withdrawal Issue', 'issue_withdrawal')],
            [Markup.button.callback('🔙 Back', `country_${state.country === 'Bangladesh' ? 'bd' : 'in'}`)],
        ]);
        await ctx.reply(`📋 *SELECT ISSUE TYPE FOR ${method}*`, { parse_mode: 'Markdown', ...keyboard });
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

// ==================== DATE SELECTOR ====================
async function showDateSelector(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📅 Today', 'date_today'), Markup.button.callback('📅 Tomorrow', 'date_tomorrow')],
        [Markup.button.callback('📅 Pick Custom Date', 'date_custom')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📅 *SELECT DATE*\n\nChoose when this issue occurred:', { parse_mode: 'Markdown', ...keyboard });
}

bot.action('date_today', async (ctx) => {
    await safeAnswer(ctx);
    const today = new Date();
    const dateStr = today.toLocaleDateString();
    const state = userStates.get(ctx.from.id) || {};
    state.selectedDate = dateStr;
    state.step = 'time';
    userStates.set(ctx.from.id, state);
    await askTime(ctx);
});

bot.action('date_tomorrow', async (ctx) => {
    await safeAnswer(ctx);
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toLocaleDateString();
    const state = userStates.get(ctx.from.id) || {};
    state.selectedDate = dateStr;
    state.step = 'time';
    userStates.set(ctx.from.id, state);
    await askTime(ctx);
});

bot.action('date_custom', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.step = 'waiting_custom_date';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📅 *Enter custom date*\n\nFormat: DD/MM/YYYY\nExample: 15/03/2024', { parse_mode: 'Markdown' });
});

// ==================== TIME INPUT (TEXT FORMAT) ====================
async function askTime(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('⏰ *ENTER TIME*\n\nPlease write the time in text format.\n\nExample: "Around 3:00 PM" or "Morning 10:30 AM"', { parse_mode: 'Markdown', ...keyboard });
}

// ==================== PHOTO OPTION ====================
async function askPhoto(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📸 Send Photo', 'send_photo')],
        [Markup.button.callback('⏭️ Skip Photo', 'skip_photo')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📸 *PHOTO EVIDENCE*\n\nWould you like to attach a photo as proof?\n(Optional)', { parse_mode: 'Markdown', ...keyboard });
}

bot.action('send_photo', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.step = 'waiting_photo';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📸 *Send your photo now*', { parse_mode: 'Markdown' });
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
        await ctx.reply('📸 *Photo received!* ✅', { parse_mode: 'Markdown' });
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
    reviewText += `📅 *Date:* ${state.selectedDate || 'Not set'}\n`;
    reviewText += `⏰ *Time:* ${state.selectedTime || 'Not set'}\n`;
    reviewText += `📸 *Photo:* ${state.photoId ? '✅ Attached' : '⏭️ Skipped'}\n`;
    reviewText += `\n✅ *Is all information correct?*`;
    
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ SUBMIT TICKET', 'submit_request')],
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
    
    await saveSubmission({
        userId: userId.toString(),
        type: 'player',
        requestNumber: requestNumber,
        data: {
            country: state.country,
            issueType: state.issueType,
            paymentMethod: state.paymentMethod,
            userOrPlayerId: state.userOrPlayerId,
            date: state.selectedDate,
            time: state.selectedTime,
            photoId: state.photoId,
            userName: user?.name,
            userPhone: user?.phone
        },
        status: 'pending'
    });
    
    // Notify admins
    let adminMsg = 
        `🎫 *NEW TICKET #${requestNumber}*\n\n` +
        `👤 *User:* ${user?.name || 'Unknown'}\n` +
        `🆔 *ID:* ${userId}\n` +
        `📍 *Country:* ${state.country}\n` +
        `💳 *Payment:* ${state.paymentMethod}\n` +
        `📋 *Issue:* ${state.issueType}\n` +
        `🆔 *User/Player ID:* ${state.userOrPlayerId}\n` +
        `📅 *Date:* ${state.selectedDate || 'N/A'}\n` +
        `⏰ *Time:* ${state.selectedTime || 'N/A'}\n` +
        `📸 *Photo:* ${state.photoId ? '✅ Yes' : '❌ No'}\n\n` +
        `🟡 *Status: PENDING*`;
    
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
        `✅ *TICKET CREATED!* 🎫\n\n` +
        `📋 *Ticket #:* ${requestNumber}\n\n` +
        `🟡 *Status:* PENDING\n\n` +
        `Our support team will review your ticket and respond shortly.\n\n` +
        `📱 *You will be notified when there is a reply.*`,
        { parse_mode: 'Markdown' }
    );
    
    clearState(userId);
    await showMainMenu(ctx);
});

bot.action('cancel_request', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    await ctx.reply('❌ *Ticket cancelled.*', { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
});

// ==================== TEXT HANDLER ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;
    const isAdmin = ADMIN_CHAT_IDS.includes(userId.toString());

    if (text.startsWith('/')) return;

    // Handle custom date input
    if (state && state.step === 'waiting_custom_date') {
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (dateRegex.test(text)) {
            state.selectedDate = text;
            state.step = 'time';
            userStates.set(userId, state);
            await askTime(ctx);
        } else {
            await ctx.reply('❌ *Invalid date format*\n\nPlease use DD/MM/YYYY\nExample: 15/03/2024', { parse_mode: 'Markdown' });
        }
        return;
    }

    // Handle time input (text format)
    if (state && state.step === 'time') {
        state.selectedTime = text;
        state.step = 'photo';
        userStates.set(userId, state);
        await askPhoto(ctx);
        return;
    }

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
        
        await saveConversationMessage(parseInt(requestNumber), targetUserId, userId, 'admin', text);
        
        try {
            await bot.telegram.sendMessage(targetUserId, 
                `📬 *ADMIN RESPONSE - TICKET #${requestNumber}*\n\n` +
                `${text}\n\n` +
                `━━━━━━━━━━━━━━━━━━━━━\n` +
                `💬 *You can reply directly to this message*`,
                { parse_mode: 'Markdown' }
            );
            await ctx.reply(`✅ Reply sent to user for ticket #${requestNumber}.`);
        } catch (error) {
            await ctx.reply(`❌ Failed to send reply: ${error.message}`);
        }
        clearState(userId);
        return;
    }

    // Handle USER REPLY to admin
    if (!isAdmin) {
        const conversation = await Conversation.findOne({ 
            userId: userId.toString(), 
            lastActivity: { $gt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
        }).sort({ lastActivity: -1 });
        
        if (conversation) {
            const request = await getRequestByNumber(conversation.requestNumber);
            if (request && request.status !== 'resolved') {
                await saveConversationMessage(conversation.requestNumber, userId, null, 'user', text);
                
                const user = await getUser(userId);
                const adminMsg = 
                    `💬 *USER REPLY - TICKET #${conversation.requestNumber}*\n\n` +
                    `👤 *User:* ${user?.name || 'Unknown'}\n` +
                    `🆔 *User ID:* ${userId}\n` +
                    `📋 *Ticket #:* ${conversation.requestNumber}\n\n` +
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
                
                await ctx.reply(`✅ *Your reply has been sent to support.*\n\nWe will get back to you shortly.`, { parse_mode: 'Markdown' });
                return;
            }
        }
    }

    // Handle player flow - waiting for user ID
    if (state && state.step === 'user_id') {
        state.userOrPlayerId = text;
        state.step = 'date';
        userStates.set(userId, state);
        await showDateSelector(ctx);
        return;
    }

    if (!state && !isAdmin) {
        await ctx.reply(`💬 *Menu*\n\nUse /start to see the main menu.`, { parse_mode: 'Markdown' });
    }
});

// ==================== ADMIN PENDING REQUESTS ====================
bot.action('admin_pending', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const pending = await getSubmissions({ status: 'pending' });
    
    if (pending.length === 0) {
        await ctx.reply('📭 *No pending tickets.*', { parse_mode: 'Markdown' });
        return;
    }
    
    let msg = '*📋 PENDING TICKETS*\n\n';
    const keyboard = [];
    for (const req of pending.slice(0, 10)) {
        msg += `🎫 #${req.requestNumber} - ${req.data?.issueType || 'Unknown'} (${req.data?.paymentMethod || 'N/A'})\n`;
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
        await ctx.reply('❌ Ticket not found.');
        return;
    }
    
    const data = request.data;
    let details = `🎫 *TICKET #${requestNumber}*\n\n`;
    details += `📌 *Status:* ${request.status === 'pending' ? '🟡 Pending' : '✅ Resolved'}\n`;
    details += `👤 *User:* ${data?.userName || 'Unknown'}\n`;
    details += `🆔 *User ID:* ${request.userId}\n`;
    details += `📍 *Country:* ${data?.country || 'Unknown'}\n`;
    details += `💳 *Payment:* ${data?.paymentMethod || 'N/A'}\n`;
    details += `📋 *Issue:* ${data?.issueType || 'Unknown'}\n`;
    details += `🆔 *User/Player ID:* ${data?.userOrPlayerId || 'N/A'}\n`;
    details += `📅 *Date:* ${data?.date || 'N/A'}\n`;
    details += `⏰ *Time:* ${data?.time || 'N/A'}\n`;
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

// ==================== ADMIN REPLY ====================
bot.action(/admin_reply_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const requestNumber = ctx.match[1];
    const request = await getRequestByNumber(parseInt(requestNumber));
    
    if (!request) {
        await ctx.reply('❌ Ticket not found.');
        return;
    }
    
    userStates.set(ctx.from.id, { 
        step: 'admin_reply', 
        targetUserId: request.userId, 
        requestNumber: requestNumber 
    });
    await ctx.reply(`✏️ *REPLY TO TICKET #${requestNumber}*\n\nType your message below:`, { parse_mode: 'Markdown' });
});

// ==================== RESOLVE REQUEST ====================
bot.action(/resolve_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const requestNumber = parseInt(ctx.match[1]);
    const request = await getRequestByNumber(requestNumber);
    
    if (!request) {
        await ctx.reply('❌ Ticket not found.');
        return;
    }
    
    await updateRequestStatus(requestNumber, 'resolved');
    
    // Notify user with beautiful message
    try {
        await bot.telegram.sendMessage(request.userId, 
            `✅ *TICKET #${requestNumber} RESOLVED* 🎉\n\n` +
            `Your request has been marked as resolved.\n` +
            `Thank you for using 7starswin! ⭐\n\n` +
            `🌟 *We appreciate your trust in us!* 🌟`,
            { parse_mode: 'Markdown' }
        );
    } catch (e) {}
    
    await ctx.reply(`✅ Ticket #${requestNumber} marked as resolved.`);
});

// ==================== ADMIN STATS ====================
bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const users = await getAllUsers();
    const submissions = await getSubmissions();
    const pending = submissions.filter(s => s.status === 'pending');
    await ctx.reply(
        `📊 *STATISTICS* 📊\n\n` +
        `👥 *Total Users:* ${users.length}\n` +
        `📝 *Total Tickets:* ${submissions.length}\n` +
        `🟡 *Pending:* ${pending.length}\n` +
        `✅ *Resolved:* ${submissions.length - pending.length}\n\n` +
        `✨ *7Starswin Support Team* ✨`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== ADMIN BROADCAST ====================
bot.action('admin_broadcast', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { step: 'admin_broadcast' });
    await ctx.reply('📢 *ENTER BROADCAST MESSAGE*\n\nType your message below:', { parse_mode: 'Markdown' });
});

// ==================== BACK TO MAIN ====================
bot.action('back_to_main', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    await showMainMenu(ctx);
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

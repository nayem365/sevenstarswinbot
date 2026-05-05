// ============================================
// index.js - PLAYER SUPPORT + BROADCAST ONLY (FIXED)
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

const User = mongoose.model('User', userSchema);
const Submission = mongoose.model('Submission', submissionSchema);

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

// ==================== HELPERS ====================
function generateRequestNumber() {
    return Math.floor(1000 + Math.random() * 9000);
}

function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}

// Safe answer callback query
async function safeAnswer(ctx) {
    try {
        if (ctx && typeof ctx.answerCallbackQuery === 'function') {
            await ctx.answerCallbackQuery();
        }
    } catch (e) {
        console.log('Answer callback error:', e.message);
    }
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
    
    let keyboard;
    if (isAdmin) {
        keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('👤 Player Support', 'menu_player')],
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Statistics', 'admin_stats')],
        ]);
        await ctx.reply(`👑 *Admin Panel*\n\nWelcome ${user?.name || 'Admin'}!`, { parse_mode: 'Markdown', ...keyboard });
    } else {
        keyboard = Markup.inlineKeyboard([
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
            `👋 *Welcome!*\n\nPlease share your phone number to continue:`,
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
        return ctx.reply('⚠️ Please share your own phone number.');
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
    await ctx.reply('👤 *Select your country:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('country_bd', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'Bangladesh', step: 'select_issue' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Deposit', 'issue_deposit')],
        [Markup.button.callback('💸 Withdrawal', 'issue_withdrawal')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📋 *Select issue type:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('country_in', async (ctx) => {
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { country: 'India', step: 'select_issue' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Deposit', 'issue_deposit')],
        [Markup.button.callback('💸 Withdrawal', 'issue_withdrawal')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📋 *Select issue type:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('issue_deposit', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Deposit';
    state.step = 'waiting_user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your User ID:*', { parse_mode: 'Markdown' });
});

bot.action('issue_withdrawal', async (ctx) => {
    await safeAnswer(ctx);
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Withdrawal';
    state.step = 'waiting_user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your User ID:*', { parse_mode: 'Markdown' });
});

// ==================== BROADCAST FLOW (ADMIN ONLY) ====================
bot.action('admin_broadcast', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    userStates.set(ctx.from.id, { step: 'admin_broadcast' });
    await ctx.reply('📢 *Enter your broadcast message:*', { parse_mode: 'Markdown' });
});

bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await safeAnswer(ctx);
    const users = await getAllUsers();
    const submissions = await getSubmissions();
    await ctx.reply(
        `📊 *Statistics*\n\n` +
        `👥 Total Users: ${users.length}\n` +
        `📝 Total Requests: ${submissions.length}\n` +
        `⏳ Pending: ${submissions.filter(s => s.status === 'pending').length}`,
        { parse_mode: 'Markdown' }
    );
});

// ==================== BACK TO MAIN MENU ====================
bot.action('back_to_main', async (ctx) => {
    await safeAnswer(ctx);
    clearState(ctx.from.id);
    await showMainMenu(ctx);
});

// ==================== TEXT HANDLER ====================
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
    if (state && state.step === 'waiting_user_id') {
        state.userId = text;
        state.step = 'waiting_date';
        userStates.set(userId, state);
        await ctx.reply('📅 *Enter date (DD/MM/YYYY):*', { parse_mode: 'Markdown' });
        return;
    }

    // Player flow - waiting for date
    if (state && state.step === 'waiting_date') {
        state.date = text;
        
        const confirmMsg = 
            `📋 *Confirm Your Details*\n\n` +
            `Country: ${state.country}\n` +
            `Issue: ${state.issueType}\n` +
            `User ID: ${state.userId}\n` +
            `Date: ${state.date}\n\n` +
            `Is this correct?`;
        
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('✅ Submit', 'confirm_yes')],
            [Markup.button.callback('❌ Restart', 'confirm_no')],
            [Markup.button.callback('🔙 Back', 'menu_player')],
        ]);
        
        userStates.set(userId, { ...state, step: 'confirm' });
        await ctx.reply(confirmMsg, { parse_mode: 'Markdown', ...keyboard });
        return;
    }
});

// ==================== CONFIRMATION HANDLERS ====================
bot.action('confirm_yes', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const user = await getUser(userId);
    
    if (state) {
        const requestNumber = generateRequestNumber();
        
        await saveSubmission({
            userId: userId.toString(),
            type: 'player',
            requestNumber: requestNumber,
            data: {
                country: state.country,
                issueType: state.issueType,
                userId: state.userId,
                date: state.date,
                userName: user?.name
            },
            status: 'pending'
        });
        
        // Notify admins
        const adminMsg = 
            `👤 *New ${state.issueType} Request #${requestNumber}*\n\n` +
            `User: ${user?.name || 'Unknown'}\n` +
            `ID: ${userId}\n` +
            `Country: ${state.country}\n` +
            `User ID: ${state.userId}\n` +
            `Date: ${state.date}`;
        
        for (const adminId of ADMIN_CHAT_IDS) {
            try {
                await bot.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' });
            } catch (e) {}
        }
        
        await ctx.reply(`✅ *Request Registered!* #${requestNumber}\n\nAdmin will respond shortly.`, { parse_mode: 'Markdown' });
        clearState(userId);
        await showMainMenu(ctx);
    }
});

bot.action('confirm_no', async (ctx) => {
    await safeAnswer(ctx);
    const userId = ctx.from.id;
    clearState(userId);
    await ctx.reply('🔄 Restarting...');
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

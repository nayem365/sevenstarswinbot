// ============================================
// index.js - SIMPLE WORKING BOT (NO EDITING)
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

// ==================== MONGODB ====================
const userSchema = new mongoose.Schema({
    userId: String,
    name: String,
    phone: String,
    language: { type: String, default: 'en' },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function connectDB() {
    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');
}

async function getUser(userId) {
    return await User.findOne({ userId: userId.toString() });
}

async function saveUser(userId, data) {
    return await User.findOneAndUpdate(
        { userId: userId.toString() },
        data,
        { upsert: true, new: true }
    );
}

// ==================== EXPRESS ====================
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health check on port ${PORT}`));

// ==================== BOT ====================
const bot = new Telegraf(BOT_TOKEN);

// Simple session storage
const userStates = new Map();

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    console.log(`🚀 /start from ${userId}`);

    // Clear any previous state
    userStates.delete(userId);

    // Check if admin
    if (ADMIN_CHAT_IDS.includes(userId.toString())) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Stats', 'admin_stats')],
            [Markup.button.callback('👤 User Mode', 'user_mode')],
        ]);
        await ctx.reply('👑 *Admin Panel*', { parse_mode: 'Markdown', ...keyboard });
        return;
    }

    // Check if user has phone
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
        return ctx.reply('⚠️ Please share your own number.');
    }
    
    await saveUser(userId, {
        userId: userId.toString(),
        name: `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
        phone: contact.phone_number,
        language: 'en',
    });
    
    await ctx.reply('✅ Phone verified!', { reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx);
});

// ==================== MAIN MENU ====================
async function showMainMenu(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👤 Player Support', 'menu_player')],
        [Markup.button.callback('🧑‍💼 Agent', 'menu_agent')],
        [Markup.button.callback('🎁 Promo', 'menu_promo')],
        [Markup.button.callback('⚙️ Settings', 'menu_settings')],
    ]);
    await ctx.reply('🏠 *Main Menu*\n\nWelcome back!', { parse_mode: 'Markdown', ...keyboard });
}

// ==================== PLAYER FLOW ====================
bot.action('menu_player', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇧🇩 Bangladesh', 'player_bd')],
        [Markup.button.callback('🇮🇳 India', 'player_in')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply('👤 *Select your country:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('player_bd', async (ctx) => {
    await ctx.answerCallbackQuery();
    userStates.set(ctx.from.id, { step: 'player_issue', country: 'Bangladesh' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Deposit', 'issue_deposit')],
        [Markup.button.callback('💸 Withdrawal', 'issue_withdrawal')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📋 *Select issue type:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('player_in', async (ctx) => {
    await ctx.answerCallbackQuery();
    userStates.set(ctx.from.id, { step: 'player_issue', country: 'India' });
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💰 Deposit', 'issue_deposit')],
        [Markup.button.callback('💸 Withdrawal', 'issue_withdrawal')],
        [Markup.button.callback('🔙 Back', 'menu_player')],
    ]);
    await ctx.reply('📋 *Select issue type:*', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('issue_deposit', async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Deposit';
    state.step = 'waiting_user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your User ID:*', { parse_mode: 'Markdown' });
});

bot.action('issue_withdrawal', async (ctx) => {
    await ctx.answerCallbackQuery();
    const state = userStates.get(ctx.from.id) || {};
    state.issueType = 'Withdrawal';
    state.step = 'waiting_user_id';
    userStates.set(ctx.from.id, state);
    await ctx.reply('📝 *Enter your User ID:*', { parse_mode: 'Markdown' });
});

// ==================== AGENT FLOW ====================
bot.action('menu_agent', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('✅ Accept Terms', 'agent_accept')],
        [Markup.button.callback('❌ Reject', 'agent_reject')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply(
        `🧑‍💼 *Agent Terms*\n\n` +
        `• Deposit commission: 5%\n` +
        `• Withdrawal commission: 3%\n` +
        `• Prepay requirement: $100\n\n` +
        `Do you accept these terms?`,
        { parse_mode: 'Markdown', ...keyboard }
    );
});

bot.action('agent_accept', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const user = await getUser(userId);
    
    // Notify admins
    for (const adminId of ADMIN_CHAT_IDS) {
        try {
            await bot.telegram.sendMessage(adminId, 
                `🧑‍💼 *New Agent Registration*\n\nUser: ${user?.name || 'Unknown'}\nID: ${userId}\nStatus: ACCEPTED`,
                { parse_mode: 'Markdown' }
            );
        } catch (e) {}
    }
    
    await ctx.reply('✅ *Agent interest registered!*\n\nOur team will contact you soon.', { parse_mode: 'Markdown' });
    await showMainMenu(ctx);
});

bot.action('agent_reject', async (ctx) => {
    await ctx.answerCallbackQuery();
    await ctx.reply('Thank you for your response. You can register later.');
    await showMainMenu(ctx);
});

// ==================== PROMO FLOW ====================
bot.action('menu_promo', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('👨‍💼 Contact Manager', 'promo_manager')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply('🎁 *Affiliate Options*\n\nChoose an option:', { parse_mode: 'Markdown', ...keyboard });
});

bot.action('promo_manager', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url('📞 Contact Manager', 'https://t.me/Contact_7starswinpartners')],
        [Markup.button.callback('🔙 Back', 'menu_promo')],
    ]);
    await ctx.reply('👨‍💼 *Manager Contact*\n\nClick below to contact our manager:', { parse_mode: 'Markdown', ...keyboard });
});

// ==================== SETTINGS FLOW ====================
bot.action('menu_settings', async (ctx) => {
    await ctx.answerCallbackQuery();
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇸 English', 'lang_en')],
        [Markup.button.callback('🇧🇩 বাংলা', 'lang_bn')],
        [Markup.button.callback('🔙 Back', 'back_to_main')],
    ]);
    await ctx.reply('⚙️ *Settings*\n\nSelect language:', { parse_mode: 'Markdown', ...keyboard });
});

bot.action(/lang_(en|bn)/, async (ctx) => {
    await ctx.answerCallbackQuery();
    const lang = ctx.match[1];
    await saveUser(ctx.from.id, { language: lang });
    await ctx.reply(`✅ Language changed to ${lang === 'en' ? 'English' : 'Bangla'}!`);
    await showMainMenu(ctx);
});

// ==================== ADMIN FLOW ====================
bot.action('admin_broadcast', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery();
    userStates.set(ctx.from.id, { step: 'admin_broadcast' });
    await ctx.reply('📢 *Enter your broadcast message:*', { parse_mode: 'Markdown' });
});

bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery();
    const users = await User.find({});
    await ctx.reply(`📊 *Statistics*\n\n👥 Total Users: ${users.length}`, { parse_mode: 'Markdown' });
});

bot.action('user_mode', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery();
    await showMainMenu(ctx);
});

// ==================== BACK BUTTON ====================
bot.action('back_to_main', async (ctx) => {
    await ctx.answerCallbackQuery();
    userStates.delete(ctx.from.id);
    if (ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Stats', 'admin_stats')],
            [Markup.button.callback('👤 User Mode', 'user_mode')],
        ]);
        await ctx.reply('👑 *Admin Panel*', { parse_mode: 'Markdown', ...keyboard });
    } else {
        await showMainMenu(ctx);
    }
});

// ==================== TEXT HANDLER ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const text = ctx.message.text;

    // Admin broadcast
    if (state && state.step === 'admin_broadcast') {
        const users = await User.find({});
        let sent = 0;
        await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
        for (const user of users) {
            try {
                await bot.telegram.sendMessage(user.userId, text);
                sent++;
            } catch (e) {}
        }
        await ctx.reply(`✅ Broadcast sent to ${sent} users.`);
        userStates.delete(userId);
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
        
        // Create confirmation message
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
        ]);
        
        userStates.set(userId, { ...state, step: 'confirm' });
        await ctx.reply(confirmMsg, { parse_mode: 'Markdown', ...keyboard });
        return;
    }
});

// ==================== CONFIRMATION HANDLERS ====================
bot.action('confirm_yes', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    const state = userStates.get(userId);
    const user = await getUser(userId);
    
    if (state) {
        // Generate request number
        const requestNumber = Math.floor(1000 + Math.random() * 9000);
        
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
        userStates.delete(userId);
        await showMainMenu(ctx);
    }
});

bot.action('confirm_no', async (ctx) => {
    await ctx.answerCallbackQuery();
    const userId = ctx.from.id;
    userStates.delete(userId);
    await ctx.reply('🔄 Restarting...');
    await showMainMenu(ctx);
});

// ==================== ERROR HANDLER ====================
bot.catch((err, ctx) => {
    console.error('❌ Bot error:', err);
    ctx?.reply('⚠️ An error occurred. Please try again.').catch(() => {});
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

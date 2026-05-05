// ============================================
// index.js - COMPLETE WORKING BOT (FIXED)
// ============================================

require('dotenv').config();
const express = require('express');
const { Telegraf, Markup } = require('telegraf');
const mongoose = require('mongoose');
const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

// ==================== CONFIGURATION ====================
const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_IDS = process.env.ADMIN_CHAT_IDS ? process.env.ADMIN_CHAT_IDS.split(',').map(id => id.trim()) : [];
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/mobcash_bot';
const MANAGER_USERNAME = process.env.MANAGER_USERNAME || '@Contact_7starswinpartners';
const PORT = process.env.PORT || 3000;

console.log('✅ Bot Token:', BOT_TOKEN ? 'Set' : 'Missing');
console.log('✅ Admin IDs:', ADMIN_CHAT_IDS);
console.log('✅ MongoDB URI:', MONGODB_URI ? 'Set' : 'Missing');

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
    type: { type: String, required: true },
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
    if (filter.type) query.type = filter.type;
    if (filter.status) query.status = filter.status;
    if (filter.userId) query.userId = filter.userId.toString();
    let results = await Submission.find(query).sort({ createdAt: -1 }).limit(50).lean();
    if (filter.data && filter.data.issueType) {
        results = results.filter(s => s.data && s.data.issueType === filter.data.issueType);
    }
    return results;
}

async function updateSubmissionStatus(requestNumber, status) {
    return await Submission.findOneAndUpdate(
        { requestNumber: parseInt(requestNumber) },
        { status: status },
        { new: true }
    );
}

// ==================== HELPERS ====================
function formatDate(date = new Date()) {
    return date.toLocaleString();
}

function generateRequestNumber() {
    return Math.floor(1000 + Math.random() * 9000);
}

function escapeMarkdown(text) {
    return String(text).replace(/_/g, '\\_').replace(/\*/g, '\\*').replace(/\[/g, '\\[').replace(/`/g, '\\`');
}

async function ensureFolder(folderPath) {
    try { await fs.access(folderPath); } catch { await fs.mkdir(folderPath, { recursive: true }); }
}

async function getImageFiles(folderPath) {
    try {
        const files = await fs.readdir(folderPath);
        return files.filter(f => f.match(/\.(jpg|jpeg|png|gif|webp)$/i));
    } catch { return []; }
}

async function addTextToImage(inputPath, outputPath, text) {
    const image = sharp(inputPath);
    const { width, height } = await image.metadata();
    const fontSize = Math.max(54, Math.min(width * 0.091, 115));
    const svg = `<svg width="${width}" height="${height}"><text x="50%" y="94.5%" text-anchor="middle" font-family="Impact" font-size="${fontSize}" font-weight="900" fill="white" stroke="black" stroke-width="2">${text}</text></svg>`;
    await image.composite([{ input: Buffer.from(svg) }]).jpeg({ quality: 95 }).toFile(outputPath);
    return true;
}

// ==================== I18N ====================
const translations = {
    en: {
        welcome: "Welcome to MobCash!",
        player_support: "Player Support",
        agent_registration: "Agent Registration",
        affiliate: "Affiliate",
        settings: "Settings",
        bangladesh: "Bangladesh",
        india: "India",
        pakistan: "Pakistan",
        egypt: "Egypt",
        nepal: "Nepal",
        back: "🔙 Back",
        main_menu: "🏠 Main Menu",
        deposit: "💰 Deposit",
        withdrawal: "💸 Withdrawal",
        manager: "Manager",
        promo_banner: "Promo Banner",
        select_language: "Select Language",
        language_changed: "Language changed!",
        english: "English",
        bangla: "Bangla",
        hindi: "Hindi",
        urdu: "Urdu",
        select_country: "Select your country",
        select_issue: "What type of issue?",
        enter_user_id: "Enter your User ID:",
        enter_player_id: "Enter your Player ID:",
        select_date: "Select Date",
        confirm: "Confirm Your Details:",
        is_correct: "Is this correct?",
        submit: "📤 Submit",
        restart: "🔄 Restart",
        request_registered: "Request Registered!",
        admin_will_respond: "Admin will respond shortly.",
        error: "An error occurred. Please try again.",
        share_contact: "📱 Share Contact",
        phone_verified: "Phone verified!",
        welcome_back: "Welcome back!",
        admin_panel: "Admin Panel",
        broadcast: "Broadcast",
        stats: "Statistics",
        deposit_issues: "Deposit Issues",
        withdrawal_issues: "Withdrawal Issues",
        agent_requests: "Agent Requests",
        user_mode: "User Mode",
        accept: "✅ Accept",
        reject: "❌ Reject",
        next: "Next ➡️",
        agent_welcome: "Welcome to the MobCash agent program!",
        agent_role: "As an agent, you'll earn commissions on user activities.",
        agent_commission: "Deposit commission: 5% | Withdrawal commission: 3%",
        agent_prepay: "Prepay requirement: $100",
        agent_accept: "Are you okay with these terms?",
        agent_registered: "Agent interest registered!",
        agent_contact: "Our team will contact you soon.",
        manager_contact: "Manager contact:",
        click_to_contact: "Click below to contact manager:",
        select_banner_lang: "Select banner language:",
        enter_promo: "Enter your promo code (max 10 chars):",
        invalid_promo: "Invalid promo code.",
        no_banners: "No banners available.",
        processing: "Processing banners...",
        banners_delivered: "✅ Banners delivered!",
        download_app: "Download App",
    },
};

function t(lang, key, params = {}) {
    let text = (translations[lang] || translations.en)[key] || key;
    for (const [k, v] of Object.entries(params)) {
        text = text.replace(`{${k}}`, v);
    }
    return text;
}

// ==================== EXPRESS SERVER ====================
const app = express();
app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(PORT, '0.0.0.0', () => console.log(`✅ Health check on port ${PORT}`));

// ==================== BOT SETUP ====================
const bot = new Telegraf(BOT_TOKEN);
const sessions = new Map();

function getSession(userId) {
    if (!sessions.has(userId)) sessions.set(userId, { state: null, data: {} });
    return sessions.get(userId);
}

function clearSession(userId) {
    sessions.delete(userId);
}

// ==================== MAIN MENU ====================
async function showMainMenu(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`👤 ${t(lang, 'player_support')}`, 'menu_player')],
        [Markup.button.callback(`🧑‍💼 ${t(lang, 'agent_registration')}`, 'menu_agent')],
        [Markup.button.callback(`🎁 ${t(lang, 'affiliate')}`, 'menu_promo')],
        [Markup.button.callback(`⚙️ ${t(lang, 'settings')}`, 'menu_settings')],
    ]);
    await ctx.reply(`🏠 ${t(lang, 'main_menu')}\n\n${t(lang, 'welcome_back')} ${user?.name || ''}!`, { parse_mode: 'Markdown', ...keyboard });
}

// ==================== START COMMAND ====================
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    console.log(`🚀 /start from ${userId}`);
    clearSession(userId);

    if (ADMIN_CHAT_IDS.includes(userId.toString())) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Statistics', 'admin_stats')],
            [Markup.button.callback('💳 Deposit Issues', 'admin_deposit')],
            [Markup.button.callback('💰 Withdrawal Issues', 'admin_withdrawal')],
            [Markup.button.callback('🤝 Agent Requests', 'admin_agent')],
            [Markup.button.callback('👤 User Mode', 'back_to_main')],
        ]);
        await ctx.reply('👑 *Admin Panel*', { parse_mode: 'Markdown', ...keyboard });
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
    if (contact.user_id !== userId) return ctx.reply('⚠️ Share your own number.');
    await saveUser(userId, {
        name: `${ctx.from.first_name} ${ctx.from.last_name || ''}`.trim(),
        username: ctx.from.username,
        phone: contact.phone_number,
        language: 'en',
    });
    await ctx.reply('✅ Phone verified!', { reply_markup: { remove_keyboard: true } });
    await showMainMenu(ctx);
});

// ==================== PLAYER FLOW ====================
async function playerFlow(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    clearSession(ctx.from.id);
    const session = getSession(ctx.from.id);
    session.state = 'player_country';
    session.data = { type: 'player' };
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🇧🇩 ${t(lang, 'bangladesh')}`, 'player_bd')],
        [Markup.button.callback(`🇮🇳 ${t(lang, 'india')}`, 'player_in')],
        [Markup.button.callback(t(lang, 'back'), 'back_to_main')],
    ]);
    await ctx.editMessageText(`👤 *${t(lang, 'player_support')}*\n\n${t(lang, 'select_country')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function handleCountry(ctx, country) {
    const session = getSession(ctx.from.id);
    session.data.country = country;
    session.state = 'player_issue';
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'deposit'), 'player_deposit')],
        [Markup.button.callback(t(lang, 'withdrawal'), 'player_withdrawal')],
        [Markup.button.callback(t(lang, 'back'), 'menu_player')],
    ]);
    await ctx.editMessageText(`📋 *${t(lang, 'select_issue')}*`, { parse_mode: 'Markdown', ...keyboard });
}

async function handleIssue(ctx, type) {
    const session = getSession(ctx.from.id);
    session.data.issueType = type === 'deposit' ? 'Deposit' : 'Withdrawal';
    session.state = 'player_payment';
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    let keyboard;
    if (session.data.country === 'bd') {
        keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('bKash', 'pay_bkash'), Markup.button.callback('Nagad', 'pay_nagad')],
            [Markup.button.callback('Rocket', 'pay_rocket'), Markup.button.callback('Upay', 'pay_upay')],
            [Markup.button.callback('MoneyGo', 'pay_moneygo'), Markup.button.callback('Binance', 'pay_binance')],
            [Markup.button.callback(t(lang, 'back'), 'menu_player')],
        ]);
    } else {
        keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('PhonePe', 'pay_phonepe'), Markup.button.callback('PayTM UPI', 'pay_paytm')],
            [Markup.button.callback(t(lang, 'back'), 'menu_player')],
        ]);
    }
    await ctx.editMessageText(`💳 *Select Payment Method*`, { parse_mode: 'Markdown', ...keyboard });
}

async function handlePayment(ctx, payment) {
    const session = getSession(ctx.from.id);
    session.data.payment = payment;
    if (session.data.issueType === 'Withdrawal') {
        session.state = 'waiting_player_id';
        await ctx.editMessageText(`📢 *Enter your Player ID:*`, { parse_mode: 'Markdown' });
    } else {
        session.state = 'waiting_user_id';
        await ctx.editMessageText(`📢 *Enter your User ID:*`, { parse_mode: 'Markdown' });
    }
}

async function showDatePicker(ctx, isWithdrawal = false) {
    const session = getSession(ctx.from.id);
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDay = new Date(year, month, 1).getDay();
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const monthName = monthNames[month];
    const keyboard = [];
    keyboard.push([Markup.button.callback(`📅 ${monthName} ${year}`, 'noop')]);
    const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
    keyboard.push(days.map(d => Markup.button.callback(d, 'noop')));
    let week = [];
    for (let i = 0; i < firstDay; i++) week.push(Markup.button.callback(' ', 'noop'));
    for (let d = 1; d <= daysInMonth; d++) {
        const callback = isWithdrawal ? `date_wd_${d}` : `date_d_${d}`;
        week.push(Markup.button.callback(d.toString(), callback));
        if (week.length === 7) { keyboard.push(week); week = []; }
    }
    if (week.length) keyboard.push(week);
    keyboard.push([Markup.button.callback(t(lang, 'back'), 'menu_player')]);
    session.state = 'waiting_date';
    await ctx.editMessageText(`📅 *${t(lang, 'select_date')}*`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function showConfirmation(ctx) {
    const session = getSession(ctx.from.id);
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    let details = '';
    for (const [k, v] of Object.entries(session.data)) {
        if (['type', 'state', 'processing'].includes(k)) continue;
        details += `*${escapeMarkdown(k)}:* ${escapeMarkdown(String(v))}\n`;
    }
    if (session.data.fileId) {
        try {
            await ctx.replyWithPhoto(session.data.fileId, { caption: `📎 *Your uploaded file*` });
        } catch (e) {}
    }
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'submit'), 'confirm_yes')],
        [Markup.button.callback(t(lang, 'restart'), 'confirm_no')],
    ]);
    await ctx.editMessageText(`📋 *${t(lang, 'confirm')}*\n\n${details}\n${t(lang, 'is_correct')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function submitRequest(ctx) {
    const userId = ctx.from.id;
    const session = getSession(userId);
    if (session.submitting) return;
    session.submitting = true;
    const user = await getUser(userId);
    const lang = user?.language || 'en';
    try {
        const requestNumber = generateRequestNumber();
        session.data.requestNumber = requestNumber;
        await saveSubmission({ userId, type: 'player', requestNumber, data: session.data });
        const adminKeyboard = Markup.inlineKeyboard([
            [Markup.button.callback('💬 Reply', `admin_reply_${userId}_${requestNumber}`)],
            [Markup.button.callback('✅ Mark Resolved', `admin_resolve_${userId}_${requestNumber}`)],
        ]);
        let adminMsg = `👤 *New ${session.data.issueType} Request #${requestNumber}*\n\n`;
        adminMsg += `*User:* ${user?.name || 'Unknown'}\n*ID:* ${userId}\n`;
        for (const [k, v] of Object.entries(session.data)) {
            if (['type', 'state', 'processing', 'submitting', 'fileId'].includes(k)) continue;
            adminMsg += `*${escapeMarkdown(k)}:* ${escapeMarkdown(String(v))}\n`;
        }
        for (const adminId of ADMIN_CHAT_IDS) {
            try {
                if (session.data.fileId) {
                    await bot.telegram.sendPhoto(adminId, session.data.fileId, { caption: adminMsg, parse_mode: 'Markdown', ...adminKeyboard });
                } else {
                    await bot.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown', ...adminKeyboard });
                }
            } catch (e) {}
        }
        await ctx.editMessageText(`✅ *${t(lang, 'request_registered')}* #${requestNumber}\n\n${t(lang, 'admin_will_respond')}`, { parse_mode: 'Markdown' });
        clearSession(userId);
    } catch (error) {
        console.error(error);
        await ctx.reply(`⚠️ ${t(lang, 'error')}`);
    } finally {
        session.submitting = false;
    }
}

// ==================== AGENT FLOW ====================
async function agentFlow(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    clearSession(ctx.from.id);
    const session = getSession(ctx.from.id);
    session.state = 'agent_country';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`🇧🇩 ${t(lang, 'bangladesh')}`, 'agent_bd')],
        [Markup.button.callback(`🇮🇳 ${t(lang, 'india')}`, 'agent_in')],
        [Markup.button.callback(`🇵🇰 ${t(lang, 'pakistan')}`, 'agent_pk')],
        [Markup.button.callback(`🇪🇬 ${t(lang, 'egypt')}`, 'agent_eg')],
        [Markup.button.callback(`🇳🇵 ${t(lang, 'nepal')}`, 'agent_np')],
        [Markup.button.callback(t(lang, 'back'), 'back_to_main')],
    ]);
    await ctx.editMessageText(`🧑‍💼 *${t(lang, 'agent_registration')}*\n\n${t(lang, 'select_country')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function agentDetails(ctx, country) {
    const session = getSession(ctx.from.id);
    session.data.country = country;
    session.state = 'agent_details';
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const msg = `${t(lang, 'agent_welcome')}\n\n${t(lang, 'agent_role')}\n\n${t(lang, 'agent_commission')}\n\n${t(lang, 'agent_prepay')}`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'next'), `agent_confirm_${country}`)],
        [Markup.button.callback(t(lang, 'back'), 'menu_agent')],
    ]);
    await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
}

async function agentConfirm(ctx, country) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'accept'), `agent_accept_${country}`)],
        [Markup.button.callback(t(lang, 'reject'), `agent_reject_${country}`)],
    ]);
    await ctx.reply(`${t(lang, 'agent_accept')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function agentResponse(ctx, country, response) {
    const userId = ctx.from.id;
    const user = await getUser(userId);
    const lang = user?.language || 'en';
    const isInterested = response === 'accept';
    await saveSubmission({ userId, type: 'agent_response', data: { country, response, interested: isInterested } });
    const adminMsg = `🧑‍💼 *Agent ${isInterested ? 'Interest' : 'Rejection'}*\n\nUser: ${user?.name}\nID: ${userId}\nCountry: ${country}\nResponse: ${isInterested ? 'ACCEPTED' : 'REJECTED'}`;
    for (const adminId of ADMIN_CHAT_IDS) {
        try {
            await bot.telegram.sendMessage(adminId, adminMsg, { parse_mode: 'Markdown' });
        } catch (e) {}
    }
    if (isInterested) {
        await ctx.reply(`✅ ${t(lang, 'agent_registered')}\n\n${t(lang, 'agent_contact')}`);
    } else {
        await ctx.reply(`Thank you. You can register later.`);
    }
    await showMainMenu(ctx);
}

// ==================== PROMO FLOW ====================
async function promoFlow(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(`👨‍💼 ${t(lang, 'manager')}`, 'promo_manager')],
        [Markup.button.callback(`🎨 ${t(lang, 'promo_banner')}`, 'promo_banner')],
        [Markup.button.callback(t(lang, 'back'), 'back_to_main')],
    ]);
    await ctx.editMessageText(`🎁 *${t(lang, 'affiliate')}*`, { parse_mode: 'Markdown', ...keyboard });
}

async function managerCountries(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback(t(lang, 'bangladesh'), 'manager_bd')],
        [Markup.button.callback(t(lang, 'india'), 'manager_in')],
        [Markup.button.callback(t(lang, 'pakistan'), 'manager_pk')],
        [Markup.button.callback(t(lang, 'egypt'), 'manager_eg')],
        [Markup.button.callback(t(lang, 'back'), 'menu_promo')],
    ]);
    await ctx.reply(`👨‍💼 ${t(lang, 'select_country')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function showManager(ctx, country) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.url(`📞 ${t(lang, 'manager')}`, `https://t.me/${MANAGER_USERNAME.replace('@', '')}`)],
        [Markup.button.callback(t(lang, 'back'), 'menu_promo')],
    ]);
    await ctx.reply(`${t(lang, 'manager_contact')} ${MANAGER_USERNAME}\n\n${t(lang, 'click_to_contact')}`, { parse_mode: 'HTML', ...keyboard });
}

async function promoLanguage(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇸 English', 'banner_en'), Markup.button.callback('🇧🇩 বাংলা', 'banner_bn')],
        [Markup.button.callback('🇮🇳 हिंदी', 'banner_hi'), Markup.button.callback('🇵🇰 اردو', 'banner_pk')],
        [Markup.button.callback(t(lang, 'back'), 'menu_promo')],
    ]);
    await ctx.reply(`🎨 ${t(lang, 'select_banner_lang')}`, { parse_mode: 'Markdown', ...keyboard });
}

async function promoCode(ctx, bannerLang) {
    const session = getSession(ctx.from.id);
    session.data.bannerLang = bannerLang;
    session.state = 'waiting_promo';
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    await ctx.reply(`✏️ ${t(lang, 'enter_promo')}`, { parse_mode: 'Markdown' });
}

async function generateBanners(ctx, promoCode) {
    const userId = ctx.from.id;
    const session = getSession(userId);
    const { bannerLang } = session.data;
    const user = await getUser(userId);
    const lang = user?.language || 'en';
    const folder = `./assets/${bannerLang}/banners`;
    const tempFolder = `./temp/${userId}`;
    await ensureFolder(folder);
    await ensureFolder(tempFolder);
    const files = await getImageFiles(folder);
    if (files.length === 0) return ctx.reply(`⚠️ ${t(lang, 'no_banners')}`);
    await ctx.reply(`📄 ${t(lang, 'processing')}`);
    let sent = 0;
    const processed = [];
    for (const file of files) {
        const input = path.join(folder, file);
        const output = path.join(tempFolder, `${promoCode}_${file}`);
        try {
            await addTextToImage(input, output, promoCode);
            processed.push(output);
        } catch (e) {}
    }
    for (let i = 0; i < processed.length; i += 10) {
        const group = processed.slice(i, i + 10).map(p => ({ type: 'photo', media: { source: p } }));
        try {
            await ctx.replyWithMediaGroup(group);
            sent += group.length;
        } catch (e) {}
    }
    for (const p of processed) await fs.unlink(p).catch(() => {});
    await fs.rmdir(tempFolder).catch(() => {});
    await saveSubmission({ userId, type: 'affiliate_promo_banner', data: { promoCode, bannerLang, files: sent } });
    await ctx.reply(`✅ ${t(lang, 'banners_delivered')}\n\n🎉 ${t(lang, 'download_app')}`, Markup.inlineKeyboard([Markup.button.url('📱 Download App', 'https://7starswin.com/downloads/androidclient/releases_android/7StarsWin/site/7StarsWin.apk')]));
}

// ==================== SETTINGS FLOW ====================
async function settingsFlow(ctx) {
    const user = await getUser(ctx.from.id);
    const lang = user?.language || 'en';
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🌐 Change Language', 'settings_lang')],
        [Markup.button.callback(t(lang, 'back'), 'back_to_main')],
    ]);
    await ctx.editMessageText(`⚙️ *Settings*`, { parse_mode: 'Markdown', ...keyboard });
}

async function languageSelection(ctx) {
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('🇺🇸 English', 'lang_en')],
        [Markup.button.callback('🇧🇩 বাংলা', 'lang_bn')],
        [Markup.button.callback('🇮🇳 हिंदी', 'lang_hi')],
        [Markup.button.callback('🇵🇰 اردو', 'lang_ur')],
        [Markup.button.callback('🔙 Back', 'menu_settings')],
    ]);
    await ctx.editMessageText('🌐 *Select Language*', { parse_mode: 'Markdown', ...keyboard });
}

// ==================== ADMIN FLOW ====================
async function adminBroadcast(ctx, message) {
    const users = await getAllUsers();
    let sent = 0;
    await ctx.reply(`📢 Broadcasting to ${users.length} users...`);
    for (const user of users) {
        try {
            await bot.telegram.sendMessage(user.userId, message);
            sent++;
        } catch (e) {}
    }
    await ctx.reply(`✅ Broadcast sent to ${sent} users.`);
    clearSession(ctx.from.id);
}

async function adminStats(ctx) {
    const users = await getAllUsers();
    const deposits = await getSubmissions({ type: 'player', data: { issueType: 'Deposit' } });
    const withdrawals = await getSubmissions({ type: 'player', data: { issueType: 'Withdrawal' } });
    const agents = await getSubmissions({ type: 'agent_response' });
    await ctx.reply(
        `📊 *Statistics*\n\n` +
        `👥 Users: ${users.length}\n` +
        `💳 Deposits: ${deposits.length}\n` +
        `💰 Withdrawals: ${withdrawals.length}\n` +
        `🤝 Agents: ${agents.length}`,
        { parse_mode: 'Markdown' }
    );
    clearSession(ctx.from.id);
}

async function adminListIssues(ctx, type) {
    const subs = await getSubmissions({ type: 'player', data: { issueType: type } });
    if (!subs.length) {
        await ctx.reply(`No ${type} issues.`);
        return;
    }
    let msg = `*${type} Issues*\n\n`;
    const keyboard = [];
    for (const sub of subs.slice(0, 10)) {
        msg += `#${sub.requestNumber}\n`;
        keyboard.push([Markup.button.callback(`View #${sub.requestNumber}`, `admin_view_${sub.requestNumber}`)]);
    }
    keyboard.push([Markup.button.callback('🔙 Back', 'admin_back')]);
    await ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function adminViewSubmission(ctx, requestNumber) {
    const subs = await Submission.find({ requestNumber: parseInt(requestNumber) }).lean();
    if (!subs.length) return;
    const sub = subs[0];
    let details = `📋 *Request #${requestNumber}*\n\n`;
    const data = sub.data;
    for (const [k, v] of Object.entries(data)) {
        details += `*${escapeMarkdown(k)}:* ${escapeMarkdown(String(v))}\n`;
    }
    details += `\n*Status:* ${sub.status}`;
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💬 Reply', `admin_reply_${sub.userId}_${requestNumber}`)],
        [Markup.button.callback('✅ Mark Resolved', `admin_resolve_${sub.userId}_${requestNumber}`)],
        [Markup.button.callback('🔙 Back', 'admin_back')],
    ]);
    await ctx.reply(details, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: keyboard } });
}

async function adminReply(ctx, userId, requestNumber, message) {
    try {
        await bot.telegram.sendMessage(userId, `📬 *Admin Response*\n\n${message}`, { parse_mode: 'Markdown' });
        await ctx.reply(`✅ Reply sent to user #${requestNumber}.`);
    } catch (error) {
        await ctx.reply(`❌ Failed: ${error.message}`);
    }
}

async function adminResolve(ctx, userId, requestNumber) {
    await updateSubmissionStatus(requestNumber, 'resolved');
    await ctx.reply(`✅ Request #${requestNumber} marked as resolved.`);
}

// ==================== ACTION HANDLERS ====================
bot.action('menu_player', playerFlow);
bot.action('menu_agent', agentFlow);
bot.action('menu_promo', promoFlow);
bot.action('menu_settings', settingsFlow);
bot.action('back_to_main', async (ctx) => {
    await ctx.answerCallbackQuery().catch(() => {});
    clearSession(ctx.from.id);
    if (ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) {
        const keyboard = Markup.inlineKeyboard([
            [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
            [Markup.button.callback('📊 Statistics', 'admin_stats')],
            [Markup.button.callback('👤 User Mode', 'back_to_main')],
        ]);
        await ctx.reply('👑 *Admin Panel*', { parse_mode: 'Markdown', ...keyboard });
    } else {
        await showMainMenu(ctx);
    }
});

bot.action('settings_lang', languageSelection);
bot.action(/lang_(en|bn|hi|ur)/, async (ctx) => {
    const lang = ctx.match[1];
    await ctx.answerCallbackQuery().catch(() => {});
    await saveUser(ctx.from.id, { language: lang });
    await ctx.reply('✅ Language changed!');
    await showMainMenu(ctx);
});

bot.action('player_bd', (ctx) => handleCountry(ctx, 'bd'));
bot.action('player_in', (ctx) => handleCountry(ctx, 'in'));
bot.action('player_deposit', (ctx) => handleIssue(ctx, 'deposit'));
bot.action('player_withdrawal', (ctx) => handleIssue(ctx, 'withdrawal'));

const payments = {
    pay_bkash: 'bKash', pay_nagad: 'Nagad', pay_rocket: 'Rocket',
    pay_upay: 'Upay', pay_moneygo: 'MoneyGo', pay_binance: 'Binance',
    pay_phonepe: 'PhonePe', pay_paytm: 'PayTM UPI',
};
for (const [key, value] of Object.entries(payments)) {
    bot.action(key, (ctx) => handlePayment(ctx, value));
}

bot.action(/date_d_(\d+)/, async (ctx) => {
    const session = getSession(ctx.from.id);
    session.data.date = ctx.match[1];
    await showConfirmation(ctx);
});
bot.action(/date_wd_(\d+)/, async (ctx) => {
    const session = getSession(ctx.from.id);
    session.data.date = ctx.match[1];
    await showConfirmation(ctx);
});
bot.action('confirm_yes', submitRequest);
bot.action('confirm_no', async (ctx) => {
    clearSession(ctx.from.id);
    await playerFlow(ctx);
});

bot.action(/agent_(bd|in|pk|eg|np)/, (ctx) => agentDetails(ctx, ctx.match[1]));
bot.action(/agent_confirm_(.+)/, (ctx) => agentConfirm(ctx, ctx.match[1]));
bot.action(/agent_accept_(.+)/, (ctx) => agentResponse(ctx, ctx.match[1], 'accept'));
bot.action(/agent_reject_(.+)/, (ctx) => agentResponse(ctx, ctx.match[1], 'reject'));

bot.action('promo_manager', managerCountries);
bot.action('promo_banner', promoLanguage);
bot.action(/manager_(bd|in|pk|eg)/, (ctx) => showManager(ctx, ctx.match[1]));
bot.action(/banner_(en|bn|hi|pk)/, (ctx) => promoCode(ctx, ctx.match[1]));

bot.action('admin_broadcast', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const session = getSession(ctx.from.id);
    session.state = 'admin_broadcast';
    await ctx.reply('📢 *Enter broadcast message:*', { parse_mode: 'Markdown' });
});
bot.action('admin_stats', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await adminStats(ctx);
});
bot.action('admin_deposit', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await adminListIssues(ctx, 'Deposit');
});
bot.action('admin_withdrawal', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await adminListIssues(ctx, 'Withdrawal');
});
bot.action('admin_agent', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const subs = await getSubmissions({ type: 'agent_response', status: 'pending' });
    if (!subs.length) {
        await ctx.reply('No pending agent requests.');
        return;
    }
    let msg = '*Agent Requests*\n\n';
    for (const sub of subs) {
        const data = sub.data;
        msg += `${data.country} - ${data.interested ? '✅' : '❌'}\n`;
    }
    await ctx.reply(msg, { parse_mode: 'Markdown' });
});
bot.action('admin_back', async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📢 Broadcast', 'admin_broadcast')],
        [Markup.button.callback('📊 Statistics', 'admin_stats')],
        [Markup.button.callback('👤 User Mode', 'back_to_main')],
    ]);
    await ctx.reply('👑 *Admin Panel*', { parse_mode: 'Markdown', ...keyboard });
});
bot.action(/admin_view_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await adminViewSubmission(ctx, parseInt(ctx.match[1]));
});
bot.action(/admin_reply_(\d+)_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    const session = getSession(ctx.from.id);
    session.state = 'admin_replying';
    session.data = { targetUserId: ctx.match[1], requestNumber: ctx.match[2] };
    await ctx.reply(`✏️ *Reply to user #${ctx.match[2]}*`, { parse_mode: 'Markdown' });
});
bot.action(/admin_resolve_(\d+)_(\d+)/, async (ctx) => {
    if (!ADMIN_CHAT_IDS.includes(ctx.from.id.toString())) return;
    await ctx.answerCallbackQuery().catch(() => {});
    await adminResolve(ctx, ctx.match[1], parseInt(ctx.match[2]));
});

// ==================== TEXT HANDLER ====================
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const session = getSession(userId);
    const text = ctx.message.text;

    try {
        if (session.state === 'admin_broadcast' && ADMIN_CHAT_IDS.includes(userId.toString())) {
            await adminBroadcast(ctx, text);
            clearSession(userId);
        } else if (session.state === 'admin_replying' && ADMIN_CHAT_IDS.includes(userId.toString())) {
            await adminReply(ctx, session.data.targetUserId, session.data.requestNumber, text);
            clearSession(userId);
        } else if (session.state === 'waiting_user_id') {
            session.data.userId = text;
            await showDatePicker(ctx, false);
        } else if (session.state === 'waiting_player_id') {
            session.data.playerId = text;
            await showDatePicker(ctx, true);
        } else if (session.state === 'waiting_promo') {
            if (text.length > 10) return ctx.reply('⚠️ Max 10 characters');
            await generateBanners(ctx, text.toUpperCase());
            clearSession(userId);
        }
    } catch (error) {
        console.error('Text handler error:', error);
        await ctx.reply('⚠️ An error occurred. Please try again.');
    }
});

// ==================== PHOTO HANDLER ====================
bot.on('photo', async (ctx) => {
    const userId = ctx.from.id;
    const session = getSession(userId);
    const user = await getUser(userId);
    if (!user || !user.phone) return ctx.reply('Please use /start first.');
    if (session.state === 'waiting_date' || session.state === 'waiting_user_id' || session.state === 'waiting_player_id') {
        const photo = ctx.message.photo.pop();
        session.data.fileId = photo.file_id;
        session.data.fileName = 'photo.jpg';
        await showConfirmation(ctx);
    } else {
        ctx.reply('Please start a request via Player Support first.');
    }
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
        await ensureFolder('./temp');
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

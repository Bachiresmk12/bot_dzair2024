import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from chargily_pay import ChargilyClient
from chargily_pay.entity import Customer, Address, Product, Price, Checkout, PaymentLink, PaymentItem
from chargily_pay.settings import CHARGILIY_TEST_URL
import random

# ========================
# إعداد Chargily
# ========================
key = "live_pk_gywqZXUKjaB6HakLRGq6XWQRyiaS83yc24jGOTvx"  # المفتاح العام
secret = "live_sk_dfAMt3vBDpyDU2QOgOxmefbZxPTuSFFWjxfKBzty"  # المفتاح السري
chargily = ChargilyClient(key, secret, CHARGILIY_TEST_URL)

# ========================
# إعداد بوت تلغرام
# ========================
TOKEN = '7737206748:AAHYAVdXJ92ha6UY7_Z4ImbEL6m54RSAquc'  # توكن البوت

logging.basicConfig(format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
                    level=logging.INFO)
logger = logging.getLogger(__name__)

# ========================
# إعداد قاعدة البيانات (مؤقتًا في الذاكرة)
# ========================
users_data = {}
matches_data = []
referral_codes = {}

# =========================
# دالة الترحيب في البوت
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if user_id not in users_data:
        users_data[user_id] = {'balance': 0, 'referred_by': None, 'bet_history': []}

    keyboard = [
        [InlineKeyboardButton("عرض المباريات", callback_data='show_matches')],
        [InlineKeyboardButton("رصيدي", callback_data='check_balance')],
        [InlineKeyboardButton("سحب الرصيد", callback_data='withdraw_balance')],
        [InlineKeyboardButton("شحن رصيد 200 DZD", callback_data='charge_balance')],
        [InlineKeyboardButton("كود الإحالة", callback_data='referral')]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(f"مرحبًا {update.message.from_user.first_name}!\nأنا بوت مراهنات الدوري الجزائري 🇩🇿. اختر أحد الأوامر:", reply_markup=reply_markup)

# ============================
# دالة لعرض المباريات
# ============================
async def show_matches(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    keyboard = []
    for i, match in enumerate(matches_data):
        match_text = f"{match['team1']} ضد {match['team2']}"
        keyboard.append([InlineKeyboardButton(match_text, callback_data=f'bet_{i}')])

    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text("اختر المباراة للمراهنة عليها:", reply_markup=reply_markup)

# ============================
# دالة للمراهنة على المباراة
# ============================
async def bet_on_match(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    match_index = int(query.data.split('_')[1])
    match = matches_data[match_index]
    
    keyboard = [
        [InlineKeyboardButton(f"فوز {match['team1']}", callback_data=f'bet_{match_index}_team1')],
        [InlineKeyboardButton(f"فوز {match['team2']}", callback_data=f'bet_{match_index}_team2')],
        [InlineKeyboardButton("تعادل", callback_data=f'bet_{match_index}_draw')]
    ]
    
    reply_markup = InlineKeyboardMarkup(keyboard)
    await query.message.edit_text(f"مباراة: {match['team1']} ضد {match['team2']}\nاختر النتيجة:", reply_markup=reply_markup)

# ============================
# دالة لحفظ المراهنة وتحديث الرصيد
# ============================
async def save_bet(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    match_index, team_choice = query.data.split('_')[1], query.data.split('_')[2]
    match = matches_data[int(match_index)]

    # حفظ المراهنة
    user_id = query.from_user.id
    if user_id not in users_data:
        users_data[user_id] = {'balance': 0, 'referred_by': None, 'bet_history': []}
    
    users_data[user_id]['bet_history'].append({'match': match, 'choice': team_choice})
    
    # فحص النتيجة
    if (team_choice == 'team1' and match['result'] == 'team1') or \
       (team_choice == 'team2' and match['result'] == 'team2') or \
       (team_choice == 'draw' and match['result'] == 'draw'):
        win = True
        users_data[user_id]['balance'] *= 2  # الرصيد ×2 عند التكهن الصحيح
        await query.message.edit_text(f"مبروك! فزت في المباراة {match['team1']} ضد {match['team2']}. رصيدك الآن: {users_data[user_id]['balance']} DZD")
    else:
        win = False
        await query.message.edit_text(f"آسف! خسرت في المباراة {match['team1']} ضد {match['team2']}. رصيدك الآن: {users_data[user_id]['balance']} DZD")

# ============================
# دالة عرض الرصيد
# ============================
async def check_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if user_id not in users_data:
        users_data[user_id] = {'balance': 0, 'referred_by': None, 'bet_history': []}
    
    await update.message.reply_text(f"رصيدك الحالي هو: {users_data[user_id]['balance']} DZD")

# ============================
# دالة سحب الرصيد عبر Chargily
# ============================
async def withdraw_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if user_id not in users_data or users_data[user_id]['balance'] <= 0:
        await update.message.reply_text("ليس لديك رصيد للسحب.")
        return

    amount = users_data[user_id]['balance']
    try:
        response = chargily.create_payment_link(
            PaymentLink(
                name=f"سحب رصيد {amount} DZD",
                items=[PaymentItem(price=amount, quantity=1)]
            )
        )
        await update.message.reply_text(f"رابط الدفع للسحب تم إنشاؤه بنجاح: {response['url']}")
        users_data[user_id]['balance'] = 0  # إفراغ الرصيد بعد السحب
    except Exception as e:
        await update.message.reply_text(f"حدث خطأ أثناء السحب: {str(e)}")

# ============================
# دالة الشحن عبر رابط Chargily
# ============================
async def charge_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    amount = 200  # المبلغ للشحن

    try:
        response = chargily.create_payment_link(
            PaymentLink(
                name=f"شحن رصيد {amount} DZD",
                items=[PaymentItem(price=amount, quantity=1)]
            )
        )
        await update.message.reply_text(f"رابط الدفع للشحن تم إنشاؤه بنجاح: {response['url']}")
    except Exception as e:
        await update.message.reply_text(f"حدث خطأ أثناء الشحن: {str(e)}")

# ============================
# دالة الإحالة
# ============================
async def referral(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    ref_code = str(user_id)[-6:]  # كود الإحالة بناءً على معرف المستخدم
    referral_codes[ref_code] = user_id
    
    await update.message.reply_text(f"كود الإحالة الخاص بك هو: {ref_code}")

# ============================
# دالة إضافة المباريات
# ============================
def add_match(team1: str, team2: str, result: str) -> None:
    matches_data.append({
        'team1': team1,
        'team2': team2,
        'result': result
    })

# ============================
# إضافة الأوامر للبوت
# ============================
def main() -> None:
    application = Application.builder().token(TOKEN).build()

    # إضافة الأ

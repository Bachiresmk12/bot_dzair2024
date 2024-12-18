import logging
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler, ContextTypes
from chargily import Chargily
import os

# ========================
# إعداد Chargily
# ========================
CHARGILY_PUBLIC_KEY = "live_pk_gywqZXUKjaB6HakLRGq6XWQRyiaS83yc24jGOTvx"
CHARGILY_SECRET_KEY = "live_sk_dfAMt3vBDpyDU2QOgOxmefbZxPTuSFFWjxfKBzty"
chargily = Chargily(api_key=CHARGILY_PUBLIC_KEY, secret_key=CHARGILY_SECRET_KEY)

# ========================
# إعداد بوت تلغرام
# ========================
TOKEN = "7737206748:AAHYAVdXJ92ha6UY7_Z4ImbEL6m54RSAquc"  # توكن البوت

logging.basicConfig(format="%(asctime)s - %(name)s - %(levelname)s - %(message)s", level=logging.INFO)
logger = logging.getLogger(__name__)

# ========================
# قاعدة بيانات مؤقتة
# ========================
users_data = {}

# =========================
# أوامر البوت
# =========================
async def start(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.message.from_user.id
    if user_id not in users_data:
        users_data[user_id] = {"balance": 0}

    keyboard = [
        [InlineKeyboardButton("شحن رصيد 200 DZD", callback_data="charge_balance")],
        [InlineKeyboardButton("رصيدي", callback_data="check_balance")],
        [InlineKeyboardButton("سحب الرصيد", callback_data="withdraw_balance")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        f"مرحبًا {update.message.from_user.first_name}!\n"
        "أنا بوت شحن وسحب الرصيد باستخدام Chargily.\nاختر أحد الخيارات:",
        reply_markup=reply_markup,
    )

async def charge_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = query.from_user.id
    amount = 200  # مبلغ الشحن

    try:
        payment_link = chargily.create_payment_link(
            client_name="User",
            client_email="user@example.com",
            amount=amount,
            payment_mode="EDAHABIA",  # أو CIB حسب طريقة الدفع
        )
        await query.message.reply_text(f"رابط الشحن الخاص بك:\n{payment_link}")
    except Exception as e:
        await query.message.reply_text(f"حدث خطأ أثناء إنشاء رابط الدفع: {e}")

async def check_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    user_id = update.callback_query.from_user.id
    balance = users_data.get(user_id, {}).get("balance", 0)
    await update.callback_query.message.reply_text(f"رصيدك الحالي هو: {balance} DZD")

async def withdraw_balance(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    query = update.callback_query
    user_id = query.from_user.id
    balance = users_data.get(user_id, {}).get("balance", 0)

    if balance <= 0:
        await query.message.reply_text("رصيدك غير كافٍ للسحب.")
        return

    try:
        payment_link = chargily.create_payment_link(
            client_name="User",
            client_email="user@example.com",
            amount=balance,
            payment_mode="EDAHABIA",
        )
        users_data[user_id]["balance"] = 0  # إعادة تعيين الرصيد بعد السحب
        await query.message.reply_text(f"رابط سحب الرصيد الخاص بك:\n{payment_link}")
    except Exception as e:
        await query.message.reply_text(f"حدث خطأ أثناء إنشاء رابط السحب: {e}")

# =========================
# إعداد التطبيق
# =========================
def main() -> None:
    application = Application.builder().token(TOKEN).build()

    application.add_handler(CommandHandler("start", start))
    application.add_handler(CallbackQueryHandler(charge_balance, pattern="charge_balance"))
    application.add_handler(CallbackQueryHandler(check_balance, pattern="check_balance"))
    application.add_handler(CallbackQueryHandler(withdraw_balance, pattern="withdraw_balance"))

    application.run_polling()

if __name__ == "__main__":
    main()

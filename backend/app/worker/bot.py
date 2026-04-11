import asyncio
import json
import logging
import os
import time
from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, CallbackQueryHandler
from telegram.constants import ParseMode
from sqlalchemy.orm import Session

from app.core.redis import get_redis_url
from app.db.session import SessionLocal
from app.db.models import SystemSetting, User, AuditLog
import redis.asyncio as redis

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("telegram_bot")

def get_db_setting(key: str) -> str:
    db = SessionLocal()
    try:
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        return setting.value if setting else ""
    finally:
        db.close()

async def start(update, context):
    keyboard = [
        [InlineKeyboardButton("🔓 Unlock System", callback_data="unlock")],
        [InlineKeyboardButton("👢 Kick All Users", callback_data="kick_all")],
        [InlineKeyboardButton("🚨 Activate Lockdown", callback_data="lockdown")],
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    await update.message.reply_text(
        "Documentarno Bot is active. Listening for alerts...\n\n*Available Actions:*",
        parse_mode=ParseMode.MARKDOWN,
        reply_markup=reply_markup
    )

async def button_handler(update, context):
    """Handle inline keyboard button clicks."""
    query = update.callback_query
    await query.answer()

    action = query.data
    redis_client = redis.from_url(get_redis_url(), decode_responses=True)
    db = SessionLocal()

    try:
        if action == "unlock":
            await redis_client.set("APP_STATE", "SEARCH")
            audit = AuditLog(event="UNLOCK_VIA_BOT", payload={"triggered_by": "Telegram_Bot"})
            db.add(audit)
            db.commit()
            await query.edit_message_text("✅ System unlocked. APP_STATE set to SEARCH.")

        elif action == "kick_all":
            global_version = await redis_client.incr("GLOBAL_SESSION_VERSION")
            users = db.query(User).all()
            for u in users:
                u.session_version += 1
            audit = AuditLog(event="KICK_ALL", payload={"triggered_by": "Telegram_Bot", "new_global_version": global_version})
            db.add(audit)
            db.commit()
            await query.edit_message_text(f"👢 All users kicked. Global session version: {global_version}")

        elif action == "lockdown":
            await redis_client.set("APP_STATE", "LOCKDOWN")
            audit = AuditLog(event="LOCKDOWN_VIA_BOT", payload={"triggered_by": "Telegram_Bot"})
            db.add(audit)
            db.commit()
            await query.edit_message_text("🚨 System LOCKDOWN activated!")

        elif action.startswith("block_ip:"):
            ip_to_block = action.split(":", 1)[1]
            await redis_client.sadd("BLOCKED_IPS", ip_to_block)
            audit = AuditLog(event="IP_BLOCKED_VIA_BOT", payload={"ip": ip_to_block, "triggered_by": "Telegram_Bot"})
            db.add(audit)
            db.commit()
            await query.edit_message_text(f"🔒 IP `{ip_to_block}` permanently blocked.")

    except Exception as e:
        logger.error(f"Error handling button: {e}")
        await query.edit_message_text(f"❌ Error executing action: {str(e)}")
    finally:
        db.close()
        await redis_client.aclose()

async def unlock(update, context):
    redis_client = redis.from_url(get_redis_url(), decode_responses=True)
    await redis_client.set("APP_STATE", "SEARCH")
    await update.message.reply_text("✅ System unlocked. APP_STATE set to SEARCH.")
    await redis_client.aclose()

async def kick_all(update, context):
    redis_client = redis.from_url(get_redis_url(), decode_responses=True)
    global_version = await redis_client.incr("GLOBAL_SESSION_VERSION")

    db = SessionLocal()
    try:
        users = db.query(User).all()
        for u in users:
            u.session_version += 1

        audit = AuditLog(event="KICK_ALL", payload={"triggered_by": "Telegram_Bot", "new_global_version": global_version})
        db.add(audit)
        db.commit()
    except Exception as e:
        logger.error(f"Error kicking users: {e}")
    finally:
        db.close()

    await update.message.reply_text(f"👢 All users have been kicked. Global session version: {global_version}")
    await redis_client.aclose()

async def listen_to_event_bus(bot_app: Application):
    """Listens to Redis PubSub and forwards messages to Telegram Chat."""
    redis_client = redis.from_url(get_redis_url(), decode_responses=True)
    pubsub = redis_client.pubsub()
    await pubsub.subscribe("documentarno_events")
    
    logger.info("Subscribed to documentarno_events...")

    try:
        async for message in pubsub.listen():
            if message['type'] == 'message':
                try:
                    chat_id = get_db_setting("telegram_chat_id")
                    if not chat_id:
                        continue
                        
                    data = json.loads(message['data'])
                    event_name = data.get('event')
                    payload = data.get('payload', {})
                    
                    if event_name == "IP_BLOCKED":
                        text = f"🛡 *[SECURITY_ALERT]* IP `{payload.get('ip')}` превысил лимит авторизаций."
                        keyboard = [[InlineKeyboardButton("🔒 Block IP Permanently", callback_data=f"block_ip:{payload.get('ip')}")]]
                        reply_markup = InlineKeyboardMarkup(keyboard)
                        await bot_app.bot.send_message(
                            chat_id=chat_id,
                            text=text,
                            parse_mode=ParseMode.MARKDOWN,
                            reply_markup=reply_markup
                        )

                    elif event_name == "HARDWARE_CRITICAL":
                        text = f"🔴 *[HARDWARE_CRITICAL]* {payload.get('message')}"
                        keyboard = [[InlineKeyboardButton("🚨 Activate Lockdown", callback_data="lockdown")]]
                        reply_markup = InlineKeyboardMarkup(keyboard)
                        await bot_app.bot.send_message(
                            chat_id=chat_id,
                            text=text,
                            parse_mode=ParseMode.MARKDOWN,
                            reply_markup=reply_markup
                        )
                        
                    elif event_name == "LOCKDOWN_ACTIVATED":
                        text = f"🚨 *[LOCKDOWN]* Система переведена в режим полной изоляции!"
                        await bot_app.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.MARKDOWN)
                        
                    elif event_name == "UNLOCK_ACTIVATED":
                        text = f"✅ *[UNLOCK]* Блокировка системы снята."
                        await bot_app.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.MARKDOWN)
                        
                    elif event_name == "SYNC_PROMPT":
                        text = f"⚠️ *[WATCHDOG]* В исходной папке удален файл `{payload.get('file')}`. Удалить его из базы?\n\n(В этой версии UI для подтверждения находится в веб-панели, но бот оповещает о событии)."
                        await bot_app.bot.send_message(chat_id=chat_id, text=text, parse_mode=ParseMode.MARKDOWN)
                        
                except Exception as e:
                    logger.error(f"Failed to process event: {e}")
    finally:
        await pubsub.unsubscribe("documentarno_events")
        await redis_client.aclose()

async def main():
    logger.info("Starting Telegram Bot Service...")
    application = None
    listener_task = None
    
    # Wait until token is configured in DB
    while True:
        token = get_db_setting("telegram_bot_token")
        if token:
            break
        logger.info("Waiting for TELEGRAM_BOT_TOKEN to be configured in UI...")
        await asyncio.sleep(10)

    try:
        application = Application.builder().token(token).build()
        application.add_handler(CommandHandler("start", start))
        application.add_handler(CommandHandler("unlock", unlock))
        application.add_handler(CommandHandler("kick_all", kick_all))
        application.add_handler(CallbackQueryHandler(button_handler))
        
        await application.initialize()
        await application.start()
        await application.updater.start_polling()
        
        listener_task = asyncio.create_task(listen_to_event_bus(application))
        logger.info("Telegram Bot started.")
        
        # Keep checking if token changes (basic reload strategy)
        while True:
            current_token = get_db_setting("telegram_bot_token")
            if current_token != token:
                logger.info("Bot token changed, restarting bot...")
                break # Restart outer container or implement graceful restart
            await asyncio.sleep(10)
            
    except asyncio.CancelledError:
        pass
    except Exception as e:
        logger.error(f"Bot error: {e}")
    finally:
        if listener_task:
            listener_task.cancel()
        if application:
            await application.updater.stop()
            await application.stop()
            await application.shutdown()

if __name__ == "__main__":
    while True:
        try:
            asyncio.run(main())
        except KeyboardInterrupt:
            break
        except Exception as e:
            logger.error(f"Service crashed: {e}. Restarting in 5s...")
            time.sleep(5)



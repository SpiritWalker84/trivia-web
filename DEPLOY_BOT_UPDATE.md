# Инструкция по обновлению бота на сервере

## Важно: Структура проекта

На сервере структура должна быть такой:
```
megagames/
├── trivia-bot/     (код бота - отдельный репозиторий или директория)
└── trivia-web/     (код веб-интерфейса, docker-compose.yml)
```

## Как работает сборка бота

Когда вы делаете `docker compose build bot` из `trivia-web/`:
1. Docker использует контекст `..` (родительская директория `megagames/`)
2. Копирует код из `trivia-bot/` в контейнер
3. Поэтому изменения в коде бота нужно применять в директории `trivia-bot/`

## Пошаговая инструкция

### Вариант 1: Если `trivia-bot` - отдельный git репозиторий

1. **Закоммить изменения в `trivia-bot`** (если еще не закоммичено):
   ```bash
   cd ~/megagames/trivia-bot
   git add main.py config.py
   git commit -m "Update /start command to open web interface"
   git push origin <ваша-ветка>
   ```

2. **На сервере обновить код бота**:
   ```bash
   cd ~/megagames/trivia-bot
   git pull origin <ваша-ветка>
   ```

3. **Пересобрать контейнер бота** (из `trivia-web/`):
   ```bash
   cd ~/megagames/trivia-web
   sudo docker compose build --no-cache bot
   sudo docker compose up -d bot
   ```

### Вариант 2: Если `trivia-bot` - просто директория (не git репозиторий)

1. **Скопировать измененные файлы на сервер**:
   - `trivia-bot/main.py`
   - `trivia-bot/config.py`

2. **Пересобрать контейнер бота**:
   ```bash
   cd ~/megagames/trivia-web
   sudo docker compose build --no-cache bot
   sudo docker compose up -d bot
   ```

### Вариант 3: Если нужно применить изменения вручную на сервере

1. **Отредактировать файлы на сервере**:
   ```bash
   cd ~/megagames/trivia-bot
   nano main.py  # или vim, или другой редактор
   nano config.py
   ```

2. **Применить изменения** (см. файлы ниже)

3. **Пересобрать контейнер**:
   ```bash
   cd ~/megagames/trivia-web
   sudo docker compose build --no-cache bot
   sudo docker compose up -d bot
   ```

## Изменения, которые нужно применить

### 1. `trivia-bot/config.py`

Добавить в класс `Config` (после строки 98):
```python
    # Web Interface URL
    WEB_URL: str = os.getenv("WEB_URL", "http://193.42.127.176")
```

### 2. `trivia-bot/main.py`

Заменить функцию `start_command` (строки 17-61) на:

```python
async def start_command(update: Update, context) -> None:
    """Handle /start command - opens web interface."""
    from database.session import db_session
    from database.queries import UserQueries
    from bot.private_game import handle_private_game_invite
    from telegram import InlineKeyboardButton, InlineKeyboardMarkup
    
    user = update.effective_user
    logger.info(f"User {user.id} ({user.username}) started the bot")
    
    # Check if there's a parameter (e.g., /start private_123)
    # Keep this for backward compatibility with private game invites
    args = context.args
    if args and len(args) > 0:
        param = args[0]
        if param.startswith("private_"):
            try:
                game_id = int(param.split("_")[1])
                await handle_private_game_invite(update, context, game_id)
                return
            except (ValueError, IndexError):
                logger.warning(f"Invalid private game invite parameter: {param}")
    
    # Get or create user in database
    with db_session() as session:
        db_user = UserQueries.get_or_create_user(
            session,
            telegram_id=user.id,
            username=user.username,
            full_name=f"{user.first_name} {user.last_name or ''}".strip()
        )
    
    # URL веб-интерфейса с telegram_id
    web_url_with_params = f"{config.config.WEB_URL}/?telegram_id={user.id}"
    
    # Отправляем кнопку для открытия веб-интерфейса
    keyboard = [
        [InlineKeyboardButton("🎮 Начать игру", url=web_url_with_params)]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)
    
    welcome_text = (
        "🎮 Добро пожаловать в Brain Survivor! 🧠\n\n"
        "Нажмите кнопку, чтобы открыть игру в браузере."
    )
    
    await update.message.reply_text(
        welcome_text,
        reply_markup=reply_markup
    )
```

## Проверка

1. **Проверить логи бота**:
   ```bash
   cd ~/megagames/trivia-web
   sudo docker compose logs bot --tail=50
   ```

2. **Проверить работу**:
   - Нажмите `/start` в боте
   - Должна появиться кнопка "🎮 Начать игру"
   - При нажатии откроется веб-интерфейс

## Опционально: Настроить WEB_URL через переменную окружения

Если URL веб-интерфейса отличается, добавьте в `.env` файл в `trivia-web/`:
```env
WEB_URL=http://193.42.127.176
```

Или добавьте в переменные окружения контейнера бота в `docker-compose.yml`:
```yaml
bot:
  environment:
    - WEB_URL=${WEB_URL:-http://193.42.127.176}
    # ... остальные переменные
```

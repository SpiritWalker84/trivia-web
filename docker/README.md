# Docker конфигурация для Trivia Web + Bot

## Структура

- `Dockerfile.api` - образ для FastAPI приложения
- `Dockerfile.frontend` - образ для React приложения (с Nginx)
- `Dockerfile.bot` - образ для Telegram бота
- `nginx.conf` - конфигурация Nginx для фронтенда
- `docker-compose.yml` - оркестрация всех сервисов

## Сервисы

1. **postgres** - PostgreSQL база данных (данные сохраняются в volume `postgres_data`)
2. **redis** - Redis для кэширования и очередей (данные сохраняются в volume `redis_data`)
3. **migrations** - Запуск миграций Alembic (один раз при старте)
4. **celery** - Celery worker для фоновых задач бота
5. **bot** - Telegram бот
6. **api** - FastAPI для веб-интерфейса
7. **frontend** - React приложение с Nginx

## Миграция данных из существующей БД

Если у вас уже есть БД с данными, используйте скрипт миграции:

**Windows:**
```powershell
.\docker\migrate_database.ps1
```

**Linux/Mac:**
```bash
chmod +x docker/migrate_database.sh
./docker/migrate_database.sh
```

Подробная инструкция: [docker/MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)

## Сохранение данных

✅ **База данных не потеряется!** 

Данные сохраняются в Docker volumes:
- `postgres_data` - все данные PostgreSQL (вопросы, пользователи, игры)
- `redis_data` - кэш Redis

При перезапуске контейнеров данные сохраняются. Чтобы удалить данные, нужно явно удалить volumes:
```bash
docker-compose down -v  # ⚠️ Удалит все данные!
```

## Настройка

1. Создайте файл `.env` в корне проекта (рядом с `docker-compose.yml`):

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_IDS=123456789,987654321
ENVIRONMENT=production
```

2. Убедитесь, что структура проекта:
```
megagames/
├── trivia-bot/      # Код Telegram бота
└── trivia-web/      # Веб-интерфейс и API
    ├── docker/
    ├── frontend/
    ├── api/
    ├── shared/      # Общая логика
    └── docker-compose.yml
```

## Запуск

```bash
# Из директории trivia-web
cd trivia-web

# Сборка и запуск всех контейнеров
docker-compose up --build

# Запуск в фоне
docker-compose up -d

# Остановка
docker-compose down

# Остановка с удалением volumes (⚠️ удалит все данные!)
docker-compose down -v

# Просмотр логов конкретного сервиса
docker-compose logs -f bot
docker-compose logs -f api
docker-compose logs -f celery
docker-compose logs -f migrations

# Перезапуск сервиса
docker-compose restart bot
```

## Доступ

- **Frontend**: http://localhost
- **API**: http://localhost:8000
- **API Docs**: http://localhost:8000/docs
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Миграции базы данных

Миграции запускаются автоматически при старте через сервис `migrations`.

Если нужно выполнить миграции вручную:
```bash
docker-compose exec bot alembic upgrade head
```

Создать новую миграцию:
```bash
docker-compose exec bot alembic revision --autogenerate -m "description"
```

## Для продакшена на Ubuntu

1. Установите Docker и Docker Compose:
```bash
sudo apt update
sudo apt install docker.io docker-compose-plugin
sudo systemctl enable docker
sudo systemctl start docker
```

2. Скопируйте проект на сервер:
```bash
scp -r megagames/ user@server:/path/to/
```

3. Создайте `.env` файл с реальными токенами

4. Запустите:
```bash
cd /path/to/megagames/trivia-web
docker-compose up -d
```

5. Проверьте статус:
```bash
docker-compose ps
docker-compose logs -f
```

## Обновление

```bash
# Остановить контейнеры
docker-compose down

# Обновить код (git pull или копирование файлов)

# Пересобрать и запустить
docker-compose up --build -d
```

## Резервное копирование

Для резервного копирования базы данных:
```bash
# Создать бэкап
docker-compose exec postgres pg_dump -U trivia_user trivia_db > backup.sql

# Восстановить из бэкапа
docker-compose exec -T postgres psql -U trivia_user trivia_db < backup.sql
```

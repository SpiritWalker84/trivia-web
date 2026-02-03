# Пошаговая инструкция по миграции существующей БД в Docker

## Вариант 1: Миграция данных в Docker контейнер (рекомендуется)

Если у вас уже есть БД на сервере (где работает бот), и вы хотите перенести данные в Docker контейнер:

### Шаг 1: Подготовка на сервере

```bash
# 1. Клонировать репозиторий
cd /path/to/projects
git clone https://github.com/SpiritWalker84/trivia-web.git
cd trivia-web

# 2. Убедитесь, что у вас установлен pg_dump (обычно уже есть с PostgreSQL)
which pg_dump
```

### Шаг 2: Экспорт данных из существующей БД

```bash
# Установить пароль для pg_dump
export PGPASSWORD=trivia_password

# Создать дамп БД (замените параметры на свои, если отличаются)
pg_dump -h localhost -p 5432 -U trivia_user -d trivia_bot -f trivia_backup.sql

# Или если БД на другом хосте:
# pg_dump -h your_db_host -p 5432 -U trivia_user -d trivia_bot -f trivia_backup.sql
```

**Windows PowerShell (если делаете с локальной машины):**
```powershell
$env:PGPASSWORD = "trivia_password"
pg_dump -h your_server_ip -p 5432 -U trivia_user -d trivia_bot -f trivia_backup.sql
```

### Шаг 3: Запустить только PostgreSQL контейнер

```bash
cd trivia-web
docker compose up -d postgres

# Подождать 15-20 секунд, пока PostgreSQL запустится
sleep 15
# Или проверить статус:
docker compose ps postgres
```

### Шаг 4: Импорт данных в Docker контейнер

```bash
# Linux/Mac
export PGPASSWORD=trivia_password
cat trivia_backup.sql | docker compose exec -T postgres psql -U trivia_user -d trivia_bot

# Windows PowerShell
$env:PGPASSWORD = "trivia_password"
Get-Content trivia_backup.sql | docker compose exec -T postgres psql -U trivia_user -d trivia_bot
```

### Шаг 5: Проверка данных

```bash
# Проверить количество записей
docker compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT COUNT(*) FROM questions;"
docker compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT COUNT(*) FROM users;"
docker compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT COUNT(*) FROM themes;"
```

### Шаг 6: Создать .env файл

```bash
nano .env
```

Содержимое `.env`:
```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_IDS=123456789,987654321
ENVIRONMENT=production

# Database (Docker контейнер - автоматически)
# DATABASE_URL будет указывать на контейнер postgres через docker-compose.yml
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

**Важно:** В `docker-compose.yml` уже настроено, что API подключается к контейнеру `postgres`, поэтому `DATABASE_URL` в `.env` не нужен (или можно не указывать).

### Шаг 7: Запустить все сервисы

```bash
docker compose up -d --build
```

### Шаг 8: Проверить работу

```bash
# Проверить статус всех контейнеров
docker compose ps

# Проверить логи
docker compose logs -f api
docker compose logs -f bot

# Проверить API
curl http://localhost:8000/api/questions/random
```

---

## Вариант 2: Использовать существующую БД (без миграции)

Если вы хотите, чтобы Docker контейнеры использовали существующую БД на сервере (не создавать новую):

### Шаг 1: Создать .env файл

```bash
nano .env
```

Содержимое `.env`:
```env
# Telegram Bot
TELEGRAM_BOT_TOKEN=your_bot_token_here
TELEGRAM_ADMIN_IDS=123456789,987654321
ENVIRONMENT=production

# Database (существующая БД на сервере)
DATABASE_URL=postgresql://trivia_user:trivia_password@localhost:5432/trivia_bot
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

### Шаг 2: Изменить docker-compose.yml

Закомментируйте или удалите сервис `postgres` из `docker-compose.yml`, так как будете использовать внешнюю БД.

Или оставьте, но измените `DATABASE_URL` в сервисе `api`:

```yaml
api:
  environment:
    - DATABASE_URL=${DATABASE_URL}  # Берет из .env
    # вместо:
    # - DATABASE_URL=postgresql://trivia_user:trivia_password@postgres:5432/trivia_bot
```

### Шаг 3: Запустить сервисы (без postgres)

```bash
# Запустить все кроме postgres
docker compose up -d --build api frontend bot celery migrations

# Или если postgres закомментирован:
docker compose up -d --build
```

---

## Автоматическая миграция (скрипт)

Используйте готовый скрипт для автоматической миграции:

### Linux/Mac:

```bash
cd trivia-web

# Установить параметры существующей БД (если отличаются от дефолтных)
export SOURCE_HOST=localhost
export SOURCE_PORT=5432
export SOURCE_USER=trivia_user
export SOURCE_PASSWORD=trivia_password
export SOURCE_DB=trivia_bot

# Запустить скрипт
chmod +x docker/migrate_database.sh
./docker/migrate_database.sh
```

### Windows PowerShell:

```powershell
cd trivia-web

# Установить параметры существующей БД
$env:SOURCE_HOST = "localhost"
$env:SOURCE_PORT = "5432"
$env:SOURCE_USER = "trivia_user"
$env:SOURCE_PASSWORD = "trivia_password"
$env:SOURCE_DB = "trivia_bot"

# Запустить скрипт
.\docker\migrate_database.ps1
```

---

## Важные замечания

1. ✅ **Резервная копия создается автоматически** скриптом в файле `trivia_backup_YYYYMMDD_HHMMSS.sql`
2. ✅ **Данные в существующей БД не удаляются** - это только копирование
3. ✅ После успешной миграции можно остановить старую БД (но лучше подождать пару дней для проверки)
4. ⚠️ Если используете существующую БД (Вариант 2), убедитесь, что порт 5432 доступен из Docker контейнеров

---

## Откат (если что-то пошло не так)

Если нужно вернуться к старой БД:

1. Остановите контейнеры: `docker compose down`
2. В `.env` измените `DATABASE_URL` на старую БД
3. Запустите снова: `docker compose up -d`

Старая БД остается нетронутой!

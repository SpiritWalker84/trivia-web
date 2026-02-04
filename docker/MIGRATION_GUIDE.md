# Руководство по миграции базы данных в Docker

## Быстрый старт

### Windows (PowerShell):

```powershell
cd trivia-web
.\docker\migrate_database.ps1
```

### Linux/Mac:

```bash
cd trivia-web
chmod +x docker/migrate_database.sh
./docker/migrate_database.sh
```

## Что делает скрипт:

1. ✅ Экспортирует данные из существующей БД
2. ✅ Запускает PostgreSQL контейнер
3. ✅ Импортирует данные в контейнер
4. ✅ Проверяет количество записей

## Ручная миграция (если скрипт не работает)

### Шаг 1: Экспорт данных

```bash
# Установить переменную окружения с паролем
export PGPASSWORD=trivia_password

# Создать дамп
pg_dump -h localhost -p 5432 -U trivia_user -d trivia_bot -f trivia_backup.sql
```

**Windows PowerShell:**
```powershell
$env:PGPASSWORD = "trivia_password"
pg_dump -h localhost -p 5432 -U trivia_user -d trivia_bot -f trivia_backup.sql
```

### Шаг 2: Запустить PostgreSQL контейнер

```bash
cd trivia-web
docker-compose up -d postgres

# Подождать 15-20 секунд
docker-compose ps postgres
```

### Шаг 3: Импорт данных

```bash
# Linux/Mac
cat trivia_backup.sql | docker-compose exec -T postgres psql -U trivia_user -d trivia_bot

# Windows PowerShell
Get-Content trivia_backup.sql | docker-compose exec -T postgres psql -U trivia_user -d trivia_bot
```

### Шаг 4: Проверка

```bash
docker-compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT COUNT(*) FROM questions;"
docker-compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT COUNT(*) FROM users;"
```

### Шаг 5: Запустить все сервисы

```bash
docker-compose up -d
```

## Настройка параметров подключения

Если ваша БД на другом хосте или с другими параметрами, установите переменные окружения:

**Linux/Mac:**
```bash
export SOURCE_HOST=your_host
export SOURCE_PORT=5432
export SOURCE_USER=your_user
export SOURCE_PASSWORD=your_password
export SOURCE_DB=your_database

./docker/migrate_database.sh
```

**Windows PowerShell:**
```powershell
$env:SOURCE_HOST = "your_host"
$env:SOURCE_PORT = "5432"
$env:SOURCE_USER = "your_user"
$env:SOURCE_PASSWORD = "your_password"
$env:SOURCE_DB = "your_database"

.\docker\migrate_database.ps1
```

## Важные замечания

1. ⚠️ **Сделайте резервную копию** перед миграцией!
2. ✅ Скрипт автоматически создает резервную копию в файле `trivia_backup_YYYYMMDD_HHMMSS.sql`
3. ✅ Данные в существующей БД **не удаляются** - это только копирование
4. ✅ После успешной миграции можно остановить старую БД (но лучше подождать пару дней)

## Проверка после миграции

```bash
# Проверить что бот видит данные
docker-compose exec bot python -c "from database.session import db_session; from database.queries import QuestionQueries; with db_session() as s: print(f'Вопросов: {QuestionQueries.count(s)}')"

# Проверить API
curl http://localhost:8000/api/questions/random
```

## Откат (если что-то пошло не так)

Если нужно вернуться к старой БД:

1. Остановите контейнеры: `docker-compose down`
2. В `.env` измените `DATABASE_URL` на старую БД
3. Запустите снова: `docker-compose up -d`

Старая БД остается нетронутой!

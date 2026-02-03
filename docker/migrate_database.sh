#!/bin/bash
# Скрипт для миграции данных из существующей БД в Docker контейнер

set -e

echo "🚀 Миграция базы данных в Docker контейнер"
echo ""

# Параметры существующей БД (измените на свои)
SOURCE_HOST=${SOURCE_HOST:-localhost}
SOURCE_PORT=${SOURCE_PORT:-5432}
SOURCE_USER=${SOURCE_USER:-trivia_user}
SOURCE_PASSWORD=${SOURCE_PASSWORD:-trivia_password}
SOURCE_DB=${SOURCE_DB:-trivia_bot}

# Параметры целевой БД (в контейнере)
TARGET_USER=trivia_user
TARGET_PASSWORD=trivia_password
TARGET_DB=trivia_bot

BACKUP_FILE="trivia_backup_$(date +%Y%m%d_%H%M%S).sql"

echo "📤 Шаг 1: Экспорт данных из существующей БД"
echo "   Источник: $SOURCE_USER@$SOURCE_HOST:$SOURCE_PORT/$SOURCE_DB"
echo ""

# Экспорт данных
export PGPASSWORD="$SOURCE_PASSWORD"
pg_dump -h "$SOURCE_HOST" -p "$SOURCE_PORT" -U "$SOURCE_USER" -d "$SOURCE_DB" -f "$BACKUP_FILE"

if [ $? -ne 0 ]; then
    echo "❌ Ошибка при экспорте данных!"
    exit 1
fi

echo "✅ Данные экспортированы в $BACKUP_FILE"
echo ""

echo "📦 Шаг 2: Запуск PostgreSQL контейнера"
docker-compose up -d postgres

echo "⏳ Жду запуска PostgreSQL (15 секунд)..."
sleep 15

# Проверка что PostgreSQL запустился
if ! docker-compose ps postgres | grep -q "Up"; then
    echo "❌ PostgreSQL контейнер не запустился!"
    exit 1
fi

echo "✅ PostgreSQL запущен"
echo ""

echo "📥 Шаг 3: Импорт данных в контейнер"
echo "   Цель: $TARGET_USER@postgres:5432/$TARGET_DB"
echo ""

# Импорт данных
export PGPASSWORD="$TARGET_PASSWORD"
cat "$BACKUP_FILE" | docker-compose exec -T postgres psql -U "$TARGET_USER" -d "$TARGET_DB"

if [ $? -ne 0 ]; then
    echo "❌ Ошибка при импорте данных!"
    exit 1
fi

echo "✅ Данные импортированы"
echo ""

echo "🔍 Шаг 4: Проверка данных"
echo ""

# Проверка количества вопросов
QUESTIONS_COUNT=$(docker-compose exec -T postgres psql -U "$TARGET_USER" -d "$TARGET_DB" -t -c "SELECT COUNT(*) FROM questions;" | tr -d ' ')
USERS_COUNT=$(docker-compose exec -T postgres psql -U "$TARGET_USER" -d "$TARGET_DB" -t -c "SELECT COUNT(*) FROM users;" | tr -d ' ')
THEMES_COUNT=$(docker-compose exec -T postgres psql -U "$TARGET_USER" -d "$TARGET_DB" -t -c "SELECT COUNT(*) FROM themes;" | tr -d ' ')

echo "   Вопросов: $QUESTIONS_COUNT"
echo "   Пользователей: $USERS_COUNT"
echo "   Тем: $THEMES_COUNT"
echo ""

echo "🎉 Миграция завершена успешно!"
echo ""
echo "Теперь можно запустить все сервисы:"
echo "  docker-compose up -d"
echo ""
echo "Резервная копия сохранена в: $BACKUP_FILE"

#!/bin/bash
# Скрипт для импорта данных из существующей БД в Docker контейнер

set -e

echo "🚀 Импорт данных в Docker контейнер PostgreSQL"

# Проверка аргументов
if [ -z "$1" ]; then
    echo "Использование: ./import_data.sh <путь_к_дампу.sql>"
    echo "Пример: ./import_data.sh ../trivia_backup.sql"
    exit 1
fi

BACKUP_FILE=$1

# Проверка существования файла
if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Файл $BACKUP_FILE не найден!"
    exit 1
fi

# Проверка запущен ли PostgreSQL
if ! docker-compose ps postgres | grep -q "Up"; then
    echo "📦 Запускаю PostgreSQL контейнер..."
    docker-compose up -d postgres
    echo "⏳ Жду запуска PostgreSQL (10 секунд)..."
    sleep 10
fi

echo "📥 Импортирую данные из $BACKUP_FILE..."

# Импорт через stdin
cat "$BACKUP_FILE" | docker-compose exec -T postgres psql -U trivia_user -d trivia_db

echo "✅ Импорт завершен!"

# Проверка данных
echo "🔍 Проверяю количество вопросов..."
docker-compose exec postgres psql -U trivia_user -d trivia_db -c "SELECT COUNT(*) as total_questions FROM questions;"

echo "🎉 Готово! Данные импортированы."

#!/bin/bash
# Скрипт для экспорта данных из существующей БД

set -e

echo "📤 Экспорт данных из существующей PostgreSQL БД"

# Параметры подключения (измените на свои)
DB_HOST=${DB_HOST:-localhost}
DB_PORT=${DB_PORT:-5432}
DB_USER=${DB_USER:-postgres}
DB_NAME=${DB_NAME:-trivia_bot}
OUTPUT_FILE=${OUTPUT_FILE:-trivia_backup_$(date +%Y%m%d_%H%M%S).sql}

echo "Подключение: $DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
echo "Выходной файл: $OUTPUT_FILE"

# Экспорт
pg_dump -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$OUTPUT_FILE"

echo "✅ Экспорт завершен! Файл: $OUTPUT_FILE"
echo ""
echo "Для импорта в Docker выполните:"
echo "  ./import_data.sh $OUTPUT_FILE"

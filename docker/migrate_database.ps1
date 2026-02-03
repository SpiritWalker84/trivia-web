# PowerShell скрипт для миграции данных из существующей БД в Docker контейнер

Write-Host "🚀 Миграция базы данных в Docker контейнер" -ForegroundColor Cyan
Write-Host ""

# Параметры существующей БД (измените на свои)
$SOURCE_HOST = if ($env:SOURCE_HOST) { $env:SOURCE_HOST } else { "localhost" }
$SOURCE_PORT = if ($env:SOURCE_PORT) { $env:SOURCE_PORT } else { "5432" }
$SOURCE_USER = if ($env:SOURCE_USER) { $env:SOURCE_USER } else { "trivia_user" }
$SOURCE_PASSWORD = if ($env:SOURCE_PASSWORD) { $env:SOURCE_PASSWORD } else { "trivia_password" }
$SOURCE_DB = if ($env:SOURCE_DB) { $env:SOURCE_DB } else { "trivia_bot" }

# Параметры целевой БД (в контейнере)
$TARGET_USER = "trivia_user"
$TARGET_PASSWORD = "trivia_password"
$TARGET_DB = "trivia_bot"

$BACKUP_FILE = "trivia_backup_$(Get-Date -Format 'yyyyMMdd_HHmmss').sql"

Write-Host "📤 Шаг 1: Экспорт данных из существующей БД" -ForegroundColor Yellow
Write-Host "   Источник: ${SOURCE_USER}@${SOURCE_HOST}:${SOURCE_PORT}/${SOURCE_DB}"
Write-Host ""

# Установить пароль для pg_dump
$env:PGPASSWORD = $SOURCE_PASSWORD

# Экспорт данных
$dumpResult = & pg_dump -h $SOURCE_HOST -p $SOURCE_PORT -U $SOURCE_USER -d $SOURCE_DB -f $BACKUP_FILE 2>&1

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при экспорте данных!" -ForegroundColor Red
    Write-Host $dumpResult
    exit 1
}

Write-Host "✅ Данные экспортированы в $BACKUP_FILE" -ForegroundColor Green
Write-Host ""

Write-Host "📦 Шаг 2: Запуск PostgreSQL контейнера" -ForegroundColor Yellow
docker-compose up -d postgres

Write-Host "⏳ Жду запуска PostgreSQL (15 секунд)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

# Проверка что PostgreSQL запустился
$postgresStatus = docker-compose ps postgres
if ($postgresStatus -notmatch "Up") {
    Write-Host "❌ PostgreSQL контейнер не запустился!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ PostgreSQL запущен" -ForegroundColor Green
Write-Host ""

Write-Host "📥 Шаг 3: Импорт данных в контейнер" -ForegroundColor Yellow
Write-Host "   Цель: ${TARGET_USER}@postgres:5432/${TARGET_DB}"
Write-Host ""

# Импорт данных
$env:PGPASSWORD = $TARGET_PASSWORD
Get-Content $BACKUP_FILE | docker-compose exec -T postgres psql -U $TARGET_USER -d $TARGET_DB

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Ошибка при импорте данных!" -ForegroundColor Red
    exit 1
}

Write-Host "✅ Данные импортированы" -ForegroundColor Green
Write-Host ""

Write-Host "🔍 Шаг 4: Проверка данных" -ForegroundColor Yellow
Write-Host ""

# Проверка количества вопросов
$QUESTIONS_COUNT = docker-compose exec -T postgres psql -U $TARGET_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM questions;" | ForEach-Object { $_.Trim() }
$USERS_COUNT = docker-compose exec -T postgres psql -U $TARGET_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM users;" | ForEach-Object { $_.Trim() }
$THEMES_COUNT = docker-compose exec -T postgres psql -U $TARGET_USER -d $TARGET_DB -t -c "SELECT COUNT(*) FROM themes;" | ForEach-Object { $_.Trim() }

Write-Host "   Вопросов: $QUESTIONS_COUNT" -ForegroundColor Cyan
Write-Host "   Пользователей: $USERS_COUNT" -ForegroundColor Cyan
Write-Host "   Тем: $THEMES_COUNT" -ForegroundColor Cyan
Write-Host ""

Write-Host "🎉 Миграция завершена успешно!" -ForegroundColor Green
Write-Host ""
Write-Host "Теперь можно запустить все сервисы:" -ForegroundColor Yellow
Write-Host "  docker-compose up -d" -ForegroundColor White
Write-Host ""
Write-Host "Резервная копия сохранена в: $BACKUP_FILE" -ForegroundColor Cyan

# Инструкция по деплою на сервер

## Подготовка к деплою

### 1. Проверка файлов

Убедитесь, что все необходимые файлы на месте:
- ✅ `docker-compose.yml` - конфигурация всех сервисов
- ✅ `docker/Dockerfile.*` - Dockerfile'ы для всех сервисов
- ✅ `docker/nginx.conf` - конфигурация Nginx
- ✅ `api/requirements.txt` - зависимости Python
- ✅ `frontend/package.json` - зависимости Node.js

### 2. Файлы, которые НЕ должны попасть в Git

Убедитесь, что `.gitignore` содержит:
- `venv/` - виртуальное окружение Python
- `node_modules/` - зависимости Node.js
- `.env` - переменные окружения (содержит секреты!)

## Деплой на сервер (Ubuntu)

### Шаг 1: Подготовка сервера

```bash
# Обновление системы
sudo apt update && sudo apt upgrade -y

# Установка Docker
sudo apt install docker.io docker-compose-plugin -y
sudo systemctl enable docker
sudo systemctl start docker

# Проверка установки
docker --version
docker compose version
```

### Шаг 2: Клонирование репозитория

```bash
# На сервере
cd /path/to/projects
git clone <your-repo-url> megagames
cd megagames/trivia-web
```

### Шаг 3: Создание .env файла

```bash
# Создайте .env файл в корне trivia-web/
nano .env
```

Содержимое `.env`:
```env
TELEGRAM_BOT_TOKEN=your_actual_bot_token_here
TELEGRAM_ADMIN_IDS=123456789,987654321
ENVIRONMENT=production
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20
```

**⚠️ ВАЖНО:** Не коммитьте `.env` в Git! Он уже в `.gitignore`.

### Шаг 4: Миграция данных (если есть существующая БД)

Если у вас уже есть БД на сервере с данными, используйте скрипты миграции:
```bash
# Windows (локально)
.\docker\migrate_database.ps1

# Linux/Mac (локально)
chmod +x docker/migrate_database.sh
./docker/migrate_database.sh
```

Подробнее: [docker/MIGRATION_GUIDE.md](docker/MIGRATION_GUIDE.md)

### Шаг 5: Запуск на сервере

```bash
# Из директории trivia-web
cd /path/to/megagames/trivia-web

# Сборка и запуск всех контейнеров
docker compose up -d --build

# Проверка статуса
docker compose ps

# Просмотр логов
docker compose logs -f
```

### Шаг 6: Проверка работы

- **Frontend**: http://your-server-ip (порт 80)
- **API**: http://your-server-ip:8000
- **API Docs**: http://your-server-ip:8000/docs
- **PostgreSQL**: localhost:5432 (внутри Docker сети)

### Шаг 7: Настройка файрвола (если нужно)

```bash
# Разрешить HTTP (порт 80)
sudo ufw allow 80/tcp

# Разрешить HTTPS (если используете, порт 443)
sudo ufw allow 443/tcp

# Проверить статус
sudo ufw status
```

## Обновление после изменений

```bash
# Остановить контейнеры
docker compose down

# Обновить код (git pull)
git pull

# Пересобрать и запустить
docker compose up -d --build

# Проверить логи
docker compose logs -f
```

## Полезные команды

```bash
# Просмотр логов конкретного сервиса
docker compose logs -f api
docker compose logs -f frontend
docker compose logs -f bot

# Перезапуск сервиса
docker compose restart api

# Остановка всех сервисов
docker compose down

# Остановка с удалением volumes (⚠️ удалит все данные!)
docker compose down -v

# Просмотр использования ресурсов
docker stats
```

## Резервное копирование БД

```bash
# Создать бэкап
docker compose exec postgres pg_dump -U trivia_user trivia_bot > backup_$(date +%Y%m%d_%H%M%S).sql

# Восстановить из бэкапа
docker compose exec -T postgres psql -U trivia_user trivia_bot < backup.sql
```

## Troubleshooting

### Проблема: Контейнеры не запускаются
```bash
# Проверить логи
docker compose logs

# Проверить статус
docker compose ps
```

### Проблема: Порт уже занят
```bash
# Проверить, что использует порт
sudo lsof -i :80
sudo lsof -i :8000

# Остановить конфликтующий процесс или изменить порт в docker-compose.yml
```

### Проблема: Нет доступа к БД
```bash
# Проверить, что postgres контейнер запущен
docker compose ps postgres

# Проверить логи postgres
docker compose logs postgres
```

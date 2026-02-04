# Настройка для использования существующей БД

## Шаг 1: Создать .env файл

Создайте файл `.env` в директории `trivia-web/` (рядом с `docker-compose.yml`):

```env
# Telegram Bot Configuration
TELEGRAM_BOT_TOKEN=ваш_токен_бота
TELEGRAM_ADMIN_IDS=123456789,987654321

# Database Configuration (существующая БД на хосте)
DATABASE_URL=postgresql://trivia_user:trivia_password@host.docker.internal:5432/trivia_bot
DATABASE_POOL_SIZE=10
DATABASE_MAX_OVERFLOW=20

# Redis (используется контейнер)
REDIS_URL=redis://redis:6379/0
CELERY_BROKER_URL=redis://redis:6379/1
CELERY_RESULT_BACKEND=redis://redis:6379/2

# Environment
ENVIRONMENT=production
```

## Шаг 2: Важно для Linux сервера

Если вы разворачиваете на **Linux сервере**, `host.docker.internal` может не работать. Используйте один из вариантов:

### Вариант 1: Использовать IP хоста (рекомендуется)

Узнайте IP адрес Docker bridge:
```bash
ip addr show docker0
# Или
docker network inspect bridge | grep Gateway
```

Обычно это `172.17.0.1`. Тогда в `.env`:
```env
DATABASE_URL=postgresql://trivia_user:trivia_password@172.17.0.1:5432/trivia_bot
```

### Вариант 2: Настроить PostgreSQL для приема подключений из Docker

1. Отредактируйте `/etc/postgresql/*/main/postgresql.conf`:
```conf
listen_addresses = '*'  # или 'localhost,172.17.0.1'
```

2. Отредактируйте `/etc/postgresql/*/main/pg_hba.conf`:
```conf
host    all             all             172.17.0.0/16           md5
```

3. Перезапустите PostgreSQL:
```bash
sudo systemctl restart postgresql
```

4. В `.env` используйте IP хоста:
```env
DATABASE_URL=postgresql://trivia_user:trivia_password@172.17.0.1:5432/trivia_bot
```

### Вариант 3: Использовать network_mode: host

В `docker-compose.yml` для каждого сервиса, который подключается к БД, добавьте:
```yaml
network_mode: host
```

И в `.env` используйте `localhost`:
```env
DATABASE_URL=postgresql://trivia_user:trivia_password@localhost:5432/trivia_bot
```

## Шаг 3: Проверить доступность БД из контейнера

```bash
# Запустить тестовый контейнер
docker run --rm -it --add-host=host.docker.internal:host-gateway postgres:15-alpine sh

# Внутри контейнера проверить подключение
psql -h host.docker.internal -U trivia_user -d trivia_bot
```

## Шаг 4: Запустить контейнеры

```bash
cd trivia-web

# Запустить все сервисы (кроме postgres - он отключен)
docker-compose up -d

# Проверить логи
docker-compose logs -f bot
docker-compose logs -f api
```

## Проверка подключения

```bash
# Проверить, что бот подключился к БД
docker-compose exec bot python -c "from database.session import get_db_session; db = get_db_session(); print('✅ БД подключена!')"

# Проверить количество вопросов
docker-compose exec bot python -c "from database.session import db_session; from database.queries import QuestionQueries; with db_session() as s: print(f'Вопросов в БД: {QuestionQueries.count(s)}')"
```

## Важные замечания

1. ✅ **Все данные остаются в существующей БД** - ничего не теряется
2. ✅ **Бот и веб-интерфейс используют одну БД** - данные синхронизированы
3. ✅ **Redis в контейнере** - кэш изолирован, но можно подключить и внешний Redis
4. ⚠️ **PostgreSQL должен быть доступен** из Docker сети (проверьте firewall)

## Если что-то не работает

1. Проверьте логи: `docker-compose logs bot`
2. Проверьте подключение к БД из контейнера (см. Шаг 3)
3. Убедитесь, что PostgreSQL слушает на нужном интерфейсе
4. Проверьте firewall правила

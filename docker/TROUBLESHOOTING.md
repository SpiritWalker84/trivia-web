# Troubleshooting - Решение проблем

## Порт 6379 уже занят (Redis)

Если при запуске `docker compose up` вы видите ошибку:
```
Error response from daemon: failed to bind host port 0.0.0.0:6379/tcp: address already in use
```

Это значит, что локальный Redis уже запущен и занимает порт 6379.

### Решение 1: Остановить локальный Redis (рекомендуется)

**Ubuntu/Debian:**
```bash
# Остановить службу Redis
sudo systemctl stop redis
sudo systemctl stop redis-server

# Проверить статус
sudo systemctl status redis

# Если нужно отключить автозапуск:
sudo systemctl disable redis
```

### Решение 2: Изменить порт в docker-compose.yml

Если нужно оставить локальный Redis запущенным, измените порт в `docker-compose.yml`:

```yaml
redis:
  ports:
    - "6380:6379"  # Внешний порт 6380, внутренний 6379
```

**Важно:** Если измените порт Redis, нужно также обновить `REDIS_URL` в `.env` для сервисов, которые используют внешний Redis (если нужно).

---

## Порт 5432 уже занят

Если при запуске `docker compose up` вы видите ошибку:
```
Error response from daemon: failed to bind host port 0.0.0.0:5432/tcp: address already in use
```

Это значит, что локальный PostgreSQL уже запущен и занимает порт 5432.

### Решение 1: Остановить локальный PostgreSQL (рекомендуется)

**Ubuntu/Debian:**
```bash
# Остановить службу PostgreSQL
sudo systemctl stop postgresql

# Или для конкретной версии:
sudo systemctl stop postgresql@15-main
sudo systemctl stop postgresql@14-main
# и т.д.

# Проверить статус
sudo systemctl status postgresql

# Если нужно отключить автозапуск:
sudo systemctl disable postgresql
```

**CentOS/RHEL:**
```bash
sudo systemctl stop postgresql
sudo systemctl disable postgresql
```

### Решение 2: Изменить порт в docker-compose.yml

Если нужно оставить локальный PostgreSQL запущенным, измените порт в `docker-compose.yml`:

```yaml
postgres:
  ports:
    - "5433:5432"  # Внешний порт 5433, внутренний 5432
```

И обновите `DATABASE_URL` в `.env`:
```env
DATABASE_URL=postgresql://trivia_user:trivia_password@localhost:5433/trivia_bot
```

### Решение 3: Использовать локальный PostgreSQL вместо контейнера

Если хотите использовать существующий локальный PostgreSQL:

1. Закомментируйте сервис `postgres` в `docker-compose.yml`
2. В `.env` укажите:
```env
DATABASE_URL=postgresql://trivia_user:trivia_password@localhost:5432/trivia_bot
```

---

## Проверка занятых портов

```bash
# Проверить, что использует порт 5432
sudo lsof -i :5432
# или
sudo netstat -tulpn | grep 5432
# или
sudo ss -tulpn | grep 5432
```

---

## Другие проблемы

### Контейнеры не запускаются

```bash
# Проверить логи
docker compose logs

# Проверить статус
docker compose ps

# Пересобрать контейнеры
docker compose down
docker compose up -d --build
```

### Проблемы с правами доступа

```bash
# Проверить права на volumes
sudo chown -R $USER:$USER /var/lib/docker/volumes/
```

### Очистка Docker

```bash
# Остановить все контейнеры
docker compose down

# Удалить volumes (⚠️ удалит все данные!)
docker compose down -v

# Очистить неиспользуемые образы
docker system prune -a
```

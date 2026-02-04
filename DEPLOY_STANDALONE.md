# Пошаговая инструкция по развертыванию на сервере

## Шаг 1: Подключение к серверу

```bash
ssh user@193.42.127.176
# или
ssh rinat@193.42.127.176
```

## Шаг 2: Переход в директорию проекта

```bash
cd ~/trivia-web
# или
cd /path/to/trivia-web
```

## Шаг 3: Проверка текущей ветки

```bash
git branch
```

Должна быть активна ветка `standalone-frontend`. Если нет, переключитесь:

```bash
git checkout standalone-frontend
```

## Шаг 4: Получение последних изменений

```bash
git pull origin standalone-frontend
```

## Шаг 5: Остановка текущих контейнеров (если запущены)

```bash
sudo docker compose down
```

## Шаг 6: Пересборка контейнеров

```bash
# Пересборка с очисткой кеша (рекомендуется)
sudo docker compose build --no-cache api frontend

# Или пересборка только измененных
sudo docker compose build api frontend
```

## Шаг 7: Запуск контейнеров

```bash
sudo docker compose up -d
```

## Шаг 8: Проверка статуса контейнеров

```bash
sudo docker compose ps
```

Все сервисы должны быть в статусе `Up`:
- `trivia-api` - API сервер
- `trivia-frontend` - Frontend (Nginx)
- `trivia-postgres` - База данных
- `trivia-redis` - Redis (если используется)

## Шаг 9: Проверка логов

```bash
# Логи API
sudo docker compose logs api --tail=50

# Логи Frontend
sudo docker compose logs frontend --tail=50

# Все логи
sudo docker compose logs --tail=50
```

## Шаг 10: Проверка работы

1. **Откройте в браузере:** http://193.42.127.176/
2. **Если есть telegram_id в URL:** Игра должна автоматически начаться
3. **Если нет telegram_id:** Должен показаться экран настройки игры

## Шаг 11: Тестирование с telegram_id

Откройте в браузере:
```
http://193.42.127.176/?telegram_id=123456789
```

Игра должна автоматически:
1. Загрузить информацию о пользователе (если есть в БД)
2. Создать игру с дефолтными настройками
3. Создать и запустить первый раунд
4. Показать первый вопрос

## Возможные проблемы и решения

### Проблема: Контейнеры не запускаются

```bash
# Проверьте логи
sudo docker compose logs

# Проверьте, не заняты ли порты
sudo netstat -tulpn | grep -E '80|8000|5432|6379'
```

### Проблема: Frontend не обновляется

```bash
# Очистите кеш браузера (Ctrl+Shift+R или Cmd+Shift+R)
# Или пересоберите frontend с очисткой кеша
sudo docker compose build --no-cache frontend
sudo docker compose up -d frontend
```

### Проблема: API не подключается к БД

```bash
# Проверьте переменные окружения
sudo docker compose exec api env | grep DATABASE_URL

# Проверьте подключение к БД
sudo docker compose exec postgres psql -U trivia_user -d trivia_bot -c "SELECT 1;"
```

### Проблема: Ошибки при создании игры

```bash
# Проверьте логи API
sudo docker compose logs api --tail=100

# Проверьте, что БД доступна
sudo docker compose exec api python -c "from sqlalchemy import create_engine; engine = create_engine('postgresql://trivia_user:trivia_password@postgres:5432/trivia_bot'); conn = engine.connect(); print('DB OK')"
```

## Быстрая команда для обновления

Если нужно быстро обновить только frontend и API:

```bash
cd ~/trivia-web
git pull origin standalone-frontend
sudo docker compose build --no-cache api frontend
sudo docker compose up -d
sudo docker compose logs -f api frontend
```

## Откат к предыдущей версии

Если что-то пошло не так, можно вернуться к версии с ботом:

```bash
git checkout bot-integration
git pull origin bot-integration
sudo docker compose build --no-cache
sudo docker compose up -d
```

## Проверка версии

```bash
# Проверка текущего коммита
git log --oneline -1

# Проверка ветки
git branch --show-current
```

## Мониторинг

```bash
# Просмотр логов в реальном времени
sudo docker compose logs -f

# Статус контейнеров
sudo docker compose ps

# Использование ресурсов
sudo docker stats
```

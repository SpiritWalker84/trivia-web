# Миграция данных из существующей БД в Docker

## Шаг 1: Экспорт данных из существующей БД

### Вариант A: Если у вас есть доступ к серверу с PostgreSQL

```bash
# Создать дамп всей базы данных
pg_dump -U ваш_пользователь -d название_базы -F c -f trivia_backup.dump

# Или в формате SQL (проще для переноса)
pg_dump -U ваш_пользователь -d название_базы -f trivia_backup.sql

# Если нужен только дамп данных (без схемы)
pg_dump -U ваш_пользователь -d название_базы --data-only -f trivia_data.sql

# Если нужна только схема (без данных)
pg_dump -U ваш_пользователь -d название_базы --schema-only -f trivia_schema.sql
```

### Вариант B: Если БД на удаленном сервере

```bash
# Через SSH туннель
ssh user@server "pg_dump -U ваш_пользователь -d название_базы" > trivia_backup.sql

# Или напрямую (если доступ открыт)
pg_dump -h ваш_хост -U ваш_пользователь -d название_базы -f trivia_backup.sql
```

### Вариант C: Если используете psql напрямую

```bash
# Подключиться к БД
psql -U ваш_пользователь -d название_базы

# В psql выполнить:
\copy (SELECT * FROM questions) TO 'questions.csv' CSV HEADER;
\copy (SELECT * FROM themes) TO 'themes.csv' CSV HEADER;
\copy (SELECT * FROM users) TO 'users.csv' CSV HEADER;
# и т.д. для всех таблиц
```

## Шаг 2: Запустить Docker контейнеры (без бота)

```bash
cd trivia-web

# Запустить только PostgreSQL (и Redis для полноты)
docker-compose up -d postgres redis

# Подождать пока PostgreSQL запустится (10-20 секунд)
docker-compose ps
```

## Шаг 3: Импорт данных в контейнер

### Вариант A: Импорт SQL дампа

```bash
# Скопировать дамп в контейнер
docker cp trivia_backup.sql trivia-postgres:/tmp/backup.sql

# Импортировать данные
docker-compose exec postgres psql -U trivia_user -d trivia_db -f /tmp/backup.sql

# Или напрямую через stdin
cat trivia_backup.sql | docker-compose exec -T postgres psql -U trivia_user -d trivia_db
```

### Вариант B: Импорт через pg_restore (для .dump файлов)

```bash
# Скопировать дамп в контейнер
docker cp trivia_backup.dump trivia-postgres:/tmp/backup.dump

# Восстановить
docker-compose exec postgres pg_restore -U trivia_user -d trivia_db /tmp/backup.dump
```

### Вариант C: Импорт через psql (для CSV)

```bash
# Скопировать CSV файлы в контейнер
docker cp questions.csv trivia-postgres:/tmp/questions.csv

# Импортировать
docker-compose exec postgres psql -U trivia_user -d trivia_db -c "\copy questions FROM '/tmp/questions.csv' CSV HEADER;"
```

## Шаг 4: Проверка данных

```bash
# Подключиться к БД в контейнере
docker-compose exec postgres psql -U trivia_user -d trivia_db

# Проверить количество вопросов
SELECT COUNT(*) FROM questions;

# Проверить темы
SELECT * FROM themes LIMIT 10;

# Проверить пользователей
SELECT COUNT(*) FROM users;
```

## Шаг 5: Запустить все сервисы

```bash
# Теперь можно запустить все остальное
docker-compose up -d
```

## Альтернативный способ: Подключить существующую БД

Если не хотите переносить данные, можно подключить контейнеры к существующей БД:

1. В `docker-compose.yml` изменить `DATABASE_URL` для всех сервисов:
```yaml
environment:
  - DATABASE_URL=postgresql://пользователь:пароль@хост:5432/база_данных
```

2. Убрать сервис `postgres` из docker-compose или не запускать его

3. Убедиться, что PostgreSQL доступен из контейнеров (настроить сеть/firewall)

# 🌍 Окружения проекта

## Структура окружений

У проекта есть **3 окружения**:

| Окружение      | Ветка         | Workflow              | URL                   | Назначение                     |
| -------------- | ------------- | --------------------- | --------------------- | ------------------------------ |
| **Local**      | любая         | -                     | http://localhost:3000 | Локальная разработка           |
| **Beta**       | `development` | deploy.yml            | https://beta.sr2.ru   | Тестирование перед продакшеном |
| **Production** | `main`        | deploy-production.yml | https://sr2.ru        | Продакшен для пользователей    |

## 🔄 Процесс деплоя

### 1️⃣ Local Development

```bash
# Разработка на своей машине
bun run dev
```

**Используется для**:

- Разработка новых фич
- Тестирование изменений
- Отладка

### 2️⃣ Beta (Staging)

**Триггер**: Push в ветку `development`

```bash
git checkout development
git merge feature/my-feature
git push origin development
```

**Автоматически**:

- 🏗️ Собирает приложение
- 🚀 Деплоит на beta.sr2.ru
- ✅ Готово для тестирования

**Используется для**:

- Тестирование интеграций
- QA тестирование
- Демо новых фич
- Проверка перед продакшеном

### 3️⃣ Production

**Триггер**: Push в ветку `main`

```bash
git checkout main
git merge development
git push origin main
```

**Автоматически**:

- 🏗️ Собирает приложение
- 🚀 Деплоит на sr2.ru
- 🎉 Доступно пользователям

**Используется для**:

- Стабильная версия приложения
- Реальные пользователи
- Продакшен данные

## 🎯 Workflow примеры

### Создание новой фичи

```bash
# 1. Создать feature branch
git checkout -b feature/new-feature

# 2. Разработка
# ... code, test locally ...

# 3. Создать changeset
bun run changeset:add

# 4. Commit и push
git add .
git commit -m "feat: new feature"
git push origin feature/new-feature

# 5. Create PR в development
```

### Деплой на Beta

```bash
# После merge PR в development
git checkout development
git pull origin development

# Автоматически деплоится на beta.sr2.ru
# Проверяем: https://beta.sr2.ru
```

### Релиз в Production

```bash
# 1. Анализ изменений
bun run release:analyze development main
bun run release:summarize development main

# 2. Создание версии
git checkout main
git merge development
bun run version

# 3. Создание тега
git tag -a "v0.3.0" -m "Release v0.3.0"

# 4. Push
git push origin main --follow-tags

# 5. Создание GitHub релиза
bun run release:github

# Автоматически деплоится на sr2.ru
```

## 🔐 GitHub Environments

В GitHub Settings → Environments настроены:

### Beta Environment

- **Deployment branch**: `development`
- **URL**: https://beta.sr2.ru
- **Secrets**: Beta credentials

### Production Environment

- **Deployment branch**: `main`
- **URL**: https://sr2.ru
- **Secrets**: Production credentials
- **Protection rules**: Может требовать approval

## ⚠️ Preview окружение

**Preview окружение НЕ используется** и может быть удалено из GitHub Settings.

Если нужно preview для PR:

- Можно настроить отдельный workflow
- Сейчас для preview используем Beta

## 📋 Checklist перед деплоем

### Beta deploy

- [ ] Все тесты проходят локально
- [ ] Код прошел code review
- [ ] Changeset создан (если нужен для release)
- [ ] Merged в `development`

### Production deploy

- [ ] Протестировано на Beta
- [ ] Release notes готовы
- [ ] Версия обновлена (changeset version)
- [ ] Git tag создан
- [ ] Backup базы данных сделан (если нужно)

## 🚨 Откат (Rollback)

Если что-то пошло не так:

### На Beta

```bash
# SSH на сервер
ssh user@beta.sr2.ru
cd /path/to/app
ls -la releases/  # Посмотреть старые релизы
rm current
ln -s releases/2026-02-13T10-00-00Z current
pm2 restart sr2-beta
```

### На Production

```bash
# То же самое, но осторожнее!
ssh user@sr2.ru
cd /path/to/app
ls -la releases/
rm current
ln -s releases/2026-02-13T10-00-00Z current
pm2 restart sr2
```

## 📊 Мониторинг

После деплоя проверить:

- [ ] Приложение запустилось (pm2 status)
- [ ] Нет ошибок в логах (pm2 logs)
- [ ] Сайт открывается
- [ ] Авторизация работает
- [ ] Основные фичи работают

---

**Важно**: Preview окружение можно **удалить** из GitHub Settings → Environments, так как оно не используется.

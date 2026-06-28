# SnapFeed.ai — описание проекта

**SnapFeed.ai** — веб-приложение для генерации визуального контента под соцсети (Instagram, Facebook): посты по текстовому промпту, product shots и virtual try-on.

**Монетизация:** кредиты (1 кредит = 1 генерация). Оплата сейчас **ручная** — заявка на email (`VITE_SUPPORT_EMAIL`). Stripe подготовлен на уровне конфига и миграции БД, но **API-роуты оплаты не подключены**.

---

## Общая архитектура

```
┌─────────────────────────────────────────────────────────────┐
│  Frontend (Vercel)                                          │
│  React + Vite + Tailwind · i18n (en/ru/uz/tg) · Supabase   │
└───────────────────────────┬─────────────────────────────────┘
                            │ REST (+ Bearer JWT при входе)
                            │ X-Guest-Fingerprint для гостей
┌───────────────────────────▼─────────────────────────────────┐
│  Backend (Render)                                           │
│  Express · кредиты · AI-пайплайны · хранение изображений    │
└───────┬─────────────────┬─────────────────┬─────────────────┘
        │                 │                 │
        ▼                 ▼                 ▼
   Supabase          OpenAI            Replicate
 Auth + Postgres    GPT-4o-mini      nano-banana-2, IDM-VTON, Flux
```

**Три слоя:**

| Слой | Технологии | Роль |
|------|------------|------|
| Frontend | React 19, TypeScript, Vite 8, Tailwind 4 | UI, роутинг, i18n, OAuth-клиент |
| Backend | Node.js, Express 5 (ESM) | API, AI, списание кредитов |
| Supabase | Postgres + Auth | Профили, кредиты, учёт гостей |

> **БД:** Postgres через Supabase. MongoDB в проекте **не используется**.

---

## Структура репозитория

| Папка | Назначение |
|-------|------------|
| `frontend/` | React SPA |
| `backend/` | REST API, AI-пайплайны, middleware |
| `supabase/migrations/` | SQL-миграции |
| `docs/` | Документация (`LAUNCH_CHECKLIST.md`, этот файл) |
| `my-replicate-app/` | Локальный playground Replicate (**не прод**) |
| `package.json` (корень) | `npm run dev` — frontend + backend одновременно |

---

## Frontend (`frontend/`)

### Стек

React 19, TypeScript, Vite 8, Tailwind CSS 4, react-router-dom, i18next, `@supabase/supabase-js`.

### Маршруты

| Путь | Компонент | Описание |
|------|-----------|----------|
| `/` | `App.tsx` | Главный генератор |
| `/login` | `LoginPage` | Вход через Google (Supabase OAuth) |
| `/auth/callback` | `AuthCallback` | OAuth callback |
| `/cabinet` | `CabinetPage` | Личный кабинет, баланс, пополнение |

### Режимы генерации (`App.tsx`)

1. **Text mode** — текстовый промпт → оптимизация GPT → изображение для поста.
2. **Product mode** — загрузка фото товара:
   - **Product shot** — студийная сцена с товаром;
   - **Virtual try-on** — примерка одежды (IDM-VTON).

**Настройки (text mode):** платформа (Instagram / Facebook), формат (1:1 square / 9:16 story), текст на изображении, хештеги.

**Product mode** также передаёт `platform` и `format` в API; UI выбора платформы в product-режиме сейчас не дублируется — используются значения, выставленные ранее или дефолты.

### Ключевые компоненты

| Компонент | Назначение |
|-----------|------------|
| `Header` | Логотип, бейдж кредитов, язык, профиль |
| `ChatAssistant` | Чат-помощник для text mode |
| `ProductPromptAssistant` | Ассистент промптов для product mode |
| `ProductGenerationPanel` | Загрузка фото, try-on, настройки |
| `GeneratedImagePreview` | Превью, слайдер до/после, скачивание |
| `PricingModal` | Тарифы, кнопка «Связаться» (mailto) |
| `LoadingOverlay`, `AlertBanner`, `Lightbox` | UX-состояния |

### API-слой (`frontend/src/api/`)

| Файл | Назначение |
|------|------------|
| `generateImage.ts` | Text mode |
| `generateProductImage.ts` | Product shot / try-on |
| `generatePrompt.ts`, `generateProductPrompt.ts` | Промпты через чат |
| `authFetch.ts` | `fetch` с Bearer JWT |
| `guestCredits.ts` | Баланс гостя (fingerprint) |
| `downloadImage.ts` | Скачивание результата |

### Контексты

- **`AuthContext`** — сессия Supabase, профиль, кредиты, Google OAuth.
- **`ToastContext`** — уведомления («Списано 1 кредит»).

### Локализация

4 языка: `en`, `ru`, `uz`, `tg` — `frontend/src/i18n/locales/`.

### Локальная разработка и API

Vite проксирует `/api/*` → `http://127.0.0.1:5000` (`vite.config.ts`).  
`VITE_API_URL` **не обязателен** локально.

В production без `VITE_API_URL` фронтенд ходит на `https://snapfeed-ai.onrender.com` (`apiBaseUrl.ts`).

### Env (frontend)

| Переменная | Обязательность | Описание |
|------------|----------------|----------|
| `VITE_SUPABASE_URL` | Для входа | URL проекта Supabase |
| `VITE_SUPABASE_ANON_KEY` | Для входа | Anon / publishable key |
| `VITE_SUPPORT_EMAIL` | Для оплаты | Email заявок на пополнение |
| `VITE_API_URL` | Опционально | Кастомный API-хост в prod |

### Деплой

Vercel — `frontend/vercel.json`.

---

## Backend (`backend/`)

### Стек

Express 5, ES modules, OpenAI SDK, Replicate, Sharp, Supabase Admin (`service_role`), `@imgly/background-removal-node`.  
Пакет `stripe` установлен; используется только `config/stripe.js` — **без HTTP-роутов**.

### API endpoints

| Метод | Путь | Auth | Кредиты | Описание |
|-------|------|------|---------|----------|
| GET | `/api/health` | — | — | Статус сервисов |
| POST | `/api/generate-image` | optional | ✅ | Text mode |
| POST | `/api/generate-product-image` | optional | ✅ | Product / try-on |
| POST | `/api/download-image` | — | — | Скачивание |
| GET | `/api/generated-images/:filename` | — | — | Раздача сохранённых файлов |
| POST | `/api/chat-assistant` | optional | — | Чат-помощник |
| POST | `/api/chat/generate-prompt` | optional | — | То же (алиас) |
| GET | `/api/auth/me` | required | — | Профиль пользователя |
| POST | `/api/auth/claim-guest-credits` | required | — | Перенос оставшихся гостевых генераций |
| GET | `/api/guest/credits` | optional | — | Баланс гостя |

**Кредиты списываются только** на `generate-image` и `generate-product-image`. Чат-помощник — бесплатный.

### Middleware

| Файл | Назначение |
|------|------------|
| `supabaseAuth.js` | `protect` / `optionalAuth` — JWT Supabase |
| `requireCredits.js` | Проверка баланса перед генерацией |

Если Supabase **не настроен**, кредиты отключены: генерация без лимитов (`isCreditsEnabled()` → false).

### Контроллеры

**`imageController.js` (text mode)**

1. GPT-4o-mini оптимизирует промпт (сохранение стиля, spatial rules).
2. Replicate `google/nano-banana-2` (fallback: Flux).
3. Опционально: upscale (Sharp), текстовый overlay, хештеги, кэш.

**`productImageController.js` (product mode)**

1. Vision-анализ фото (OpenAI).
2. **Product pipeline:** удаление фона → nano-banana native edit → fallback composite (Sharp).
3. **Try-on pipeline:** IDM-VTON (Replicate) → fallback на product shot.

**`chatController.js`** — диалог для промптов (без списания кредитов).

### Сервисы

| Сервис | Роль |
|--------|------|
| `imageGeneration.js` | Основной пайплайн генерации |
| `productImageAnalysis.js` | Vision, промпты, placement |
| `backgroundRemoval.js` | Локальное / Replicate удаление фона |
| `tryOnImagePrep.js` | Подготовка фото одежды |
| `textOverlayRender.js` | Наложение текста |
| `imageUpscaling.js` | Upscale 2× |
| `credits.js` | Кредиты авторизованных пользователей |
| `guestCredits.js` | Лимиты гостей (fingerprint + IP) |

### Конфигурация (`backend/config/`)

`openai.js`, `replicate.js`, `supabase.js`, `stripe.js` (заготовка).

### Тарифы (`constants/pricingTiers.js`)

| Tier | Кредиты | Цена (UI) |
|------|---------|-----------|
| Starter | 10 | $4.99 |
| Pro | 50 | $14.99 |
| Business | 200 | $39.99 |

В коде `priceUsd` хранится в центах (499, 1499, 3999).

### Деплой

Render (`render.yaml`), Railway (`railway.toml`), Docker (`Dockerfile`).  
Лимит JSON body — **15 MB** (base64 с фронтенда).  
Production API: `https://snapfeed-ai.onrender.com`.

---

## База данных (Supabase / Postgres)

### `001_profiles.sql`

- Таблица `profiles`: email, имя, avatar, **credits** (default 0), plan, `guest_fingerprint_claimed`.
- RLS: пользователь читает свой профиль; UPDATE только `full_name` и `avatar_url` (credits/plan — только backend).
- Триггер `handle_new_user` — профиль при регистрации с 0 кредитами.

### `005_profiles_protect_credits.sql`

- Для уже развёрнутых проектов: column-level GRANT + колонка `guest_fingerprint_claimed`.

### `002_guest_usage.sql`

- Таблица `guest_usage`: `fingerprint_hash`, IP, `generations_used`, `max_generations` (default 3).
- Доступ только через `service_role` (backend).

### `003_credit_purchases.sql`

- Таблица `credit_purchases` — задел под Stripe.
- Поле `purchased_credits` в `guest_usage` — **в backend-коде пока не используется**.

---

## Система кредитов

```
Гость (fingerprint / IP)  →  guest_usage  →  max 3 бесплатных генерации
Пользователь (JWT)        →  profiles.credits  →  старт 0; перенос остатка гостя при первом входе

generate-image / generate-product-image
        │
        ▼
  requireCredits (402 если 0)
        │
        ▼
  finishGenerationResponse → списание 1 кредита

0 кредитов → PricingModal → mailto на VITE_SUPPORT_EMAIL → ручное начисление в Supabase
```

| Актор | Лимит | Идентификация |
|-------|-------|---------------|
| Гость | 3 (настраивается `GUEST_MAX_GENERATIONS`) | SHA-256 fingerprint или IP |
| Пользователь | `profiles.credits` | Supabase JWT |
| Без Supabase | Без лимитов | — |

**Пополнение:** email-заявка → ручное начисление в Supabase Dashboard.  
Подробнее: [`LAUNCH_CHECKLIST.md`](./LAUNCH_CHECKLIST.md).

---

## AI-пайплайны

### Text mode

```
Промпт → GPT-4o-mini (оптимизация) → Replicate nano-banana-2 → [upscale] → [overlay] → хештеги
```

### Product shot

```
Фото → Vision (OpenAI) → удаление фона → nano-banana native edit / Sharp composite → [upscale] → [overlay]
```

Режим pipeline: `PRODUCT_PIPELINE_MODE=native` (default) или `composite`.

### Virtual try-on

```
Фото одежды → анализ категории/пола → подготовка garment + human/model → IDM-VTON → [fallback: product shot]
```

---

## Документация и вспомогательное

| Файл | Содержание |
|------|------------|
| `docs/LAUNCH_CHECKLIST.md` | Env, Supabase, деплой, ручная оплата |
| `docs/PROJECT_OVERVIEW.md` | Этот документ |
| `restart.ps1` | Перезапуск dev-среды (Windows) |
| `my-replicate-app/` | Эксперименты с Replicate API |

---

## Локальный запуск

```bash
# Из корня (рекомендуется)
npm install
npm run dev

# Или по отдельности
cd backend && cp .env.example .env && npm install && npm run dev
cd frontend && cp .env.example .env && npm install && npm run dev
```

| Сервис | URL |
|--------|-----|
| Frontend | http://localhost:5173 |
| Backend | http://localhost:5000 |
| Health | http://localhost:5000/api/health |

`npm run dev` в корне перед стартом освобождает порты 5000 и 5173 (`kill-port`).

---

## Production URLs (текущие)

| Компонент | URL |
|-----------|-----|
| Frontend | `https://snap-feed-ai.vercel.app` (и preview-домены `*.vercel.app`) |
| Backend | `https://snapfeed-ai.onrender.com` |

CORS на backend разрешает localhost, явные production-origins и любой `*.vercel.app`.

---

## Итог

SnapFeed.ai — **full-stack SaaS для SMM-контента**:

- **Frontend:** React SPA на Vercel.
- **Backend:** Express API на Render.
- **Данные и auth:** Supabase (Postgres + Google OAuth).
- **AI:** OpenAI (промпты, vision) + Replicate (nano-banana-2, IDM-VTON, Flux).
- **Продукты:** текстовые посты + e-commerce (product shots + virtual try-on).
- **Монетизация:** кредиты, ручная оплата; Stripe — задел на будущее.

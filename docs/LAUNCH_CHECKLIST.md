# SnapFeed.ai — чеклист запуска

Документ для команды: что настроить перед деплоем, как работают кредиты и ручная оплата (пока ЮKassa не подключена).

---

## 1. Быстрый чеклист перед запуском

### Frontend (`frontend/.env`)

- [ ] `VITE_SUPABASE_URL` — URL проекта Supabase
- [ ] `VITE_SUPABASE_ANON_KEY` — publishable / anon key
- [ ] `VITE_SUPPORT_EMAIL` — **ваш реальный email** для заявок на пополнение
- [ ] `VITE_API_URL` — в production только если API не на Render по умолчанию

### Backend (`backend/.env`)

- [ ] `OPENAI_API_KEY` (+ при необходимости `OPENAI_PROJECT_ID`)
- [ ] `REPLICATE_*` — модели генерации (см. `backend/.env.example`)
- [ ] `CORS_ORIGIN` — URL фронтенда (например `https://snap-feed-ai.vercel.app`)
- [ ] `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` — для auth и списания кредитов
- [ ] `GUEST_MAX_GENERATIONS=3` — лимит для гостей (опционально)

### Supabase

- [ ] Выполнены миграции:
  - `supabase/migrations/001_profiles.sql`
  - `supabase/migrations/002_guest_usage.sql`
  - `supabase/migrations/003_credit_purchases.sql` (если планируете Stripe позже)
  - `supabase/migrations/005_profiles_protect_credits.sql` (**обязательно** — защита credits от изменения с клиента)
- [ ] Google OAuth включён: Authentication → Providers → Google
- [ ] Redirect URL: `https://ваш-домен/auth/callback` и `http://localhost:5173/auth/callback`

### Деплой

- [ ] Frontend на Vercel (или аналог) — env из `frontend/.env.example`
- [ ] Backend на Render — env из `backend/.env.example`
- [ ] После деплоя: вход через Google, тестовая генерация, проверка toast и бейджа кредитов

### Контент и оплата (сейчас)

- [ ] `VITE_SUPPORT_EMAIL` указывает на почту, которую вы реально читаете
- [ ] Вы знаете, как начислять кредиты в Supabase (раздел 4)
- [ ] Самозанятый / чеки «Мой налог» — на вашей стороне (сайт только отправляет заявку)

---

## 2. Что уже сделано в интерфейсе

### Шапка

| Элемент | Описание |
|--------|----------|
| Логотип | SVG **S + молния** (`Logo.tsx`, `public/favicon.svg`) |
| Позиция | `fixed`, glassmorphism (`bg-white/80 backdrop-blur-md`) |
| Отступ контента | `<main class="pt-16">` — контент не заезжает под шапку |
| Бейдж кредитов | ⚡ + **только цифра** (без «кред.»). Янтарная капсула |
| Язык | `🌐 EN` + dropdown (en / ru / uz / tg) |
| Профиль | Аватар с инициалами → dropdown (имя, email, Sign out) |

### После генерации

1. API возвращает успех → баланс обновляется сразу в шапке  
2. Toast: «✨ Успешно! Списано: 1 кредит.» (локализован)  
3. Показывается сгенерированное изображение  

### Нет кредитов

- Кнопка Generate → «Купить кредиты» → модалка `PricingModal`
- Клик по бейджу ⚡0 → та же модалка
- В кабинете (`/cabinet`) — блок «Пополнить баланс»

---

## 3. Ручная оплата (пока ЮKassa не подключена)

Онлайн-оплаты на сайте **нет**. Схема:

```
Клиент → «Связаться» → письмо на VITE_SUPPORT_EMAIL
       → вы отправляете реквизиты (самозанятый)
       → клиент платит → вы пробиваете чек
       → вы начисляете credits в Supabase
       → клиент обновляет страницу → видит новый баланс
```

### Пакеты в модалке

| ID | Кредитов | Цена (в UI) |
|----|----------|-------------|
| starter | 10 | $4.99 |
| pro | 50 | $14.99 |
| business | 200 | $39.99 |

Цены в UI можно поменять в `frontend/src/components/PricingModal.tsx` (`TIERS`).

### Что приходит вам на почту

Тема и тело формируются из i18n (`pricing.mailSubject`, `pricing.mailBody`):

- выбранный пакет и цена  
- email аккаунта SnapFeed.ai (если пользователь залогинен)  

### Настройка email поддержки

```env
# frontend/.env
VITE_SUPPORT_EMAIL=ваш@email.ru
```

Без переменной используется fallback: `support@snapfeed.ai`.

---

## 4. Как начислить кредиты в Supabase

Таблица: **`public.profiles`**, поле: **`credits`**.

### Способ A — Table Editor

1. [Supabase Dashboard](https://supabase.com/dashboard) → проект  
2. **Table Editor** → `profiles`  
3. Найти строку по **`email`** из письма клиента  
4. Изменить **`credits`** (добавить к текущему или установить новое значение)  
5. **Save**

### Способ B — SQL Editor

```sql
-- Добавить 50 кредитов к текущему балансу
UPDATE public.profiles
SET credits = credits + 50
WHERE email = 'client@example.com';

-- Или установить точное значение
UPDATE public.profiles
SET credits = 50
WHERE email = 'client@example.com';
```

### Проверка

- Клиент обновляет сайт или заходит снова  
- В шапке бейдж ⚡ показывает новое число  
- Генерация снова доступна  

> **Важно:** пользователь через RLS может менять только свой профиль. Начисление **другим** пользователям — только через Dashboard / service role (SQL Editor от имени админа).

---

## 5. Локальная разработка

```bash
# Backend
cd backend
cp .env.example .env
# заполнить ключи
npm install
npm run dev

# Frontend (другой терминал)
cd frontend
cp .env.example .env
# заполнить Supabase + VITE_SUPPORT_EMAIL
npm install
npm run dev
```

Frontend: http://localhost:5173  
Backend: http://localhost:5000  

---

## 6. Ключевые файлы (для разработчиков)

| Область | Файлы |
|---------|--------|
| Шапка | `frontend/src/components/Header.tsx`, `HeaderRightSection.tsx` |
| Логотип | `frontend/src/components/Logo.tsx`, `public/logo.svg`, `public/favicon.svg` |
| Toast | `frontend/src/context/ToastContext.tsx`, `App.tsx` → `applyCreditsAndToast` |
| Пополнение | `frontend/src/components/PricingModal.tsx`, `utils/supportContact.ts` |
| Кабинет | `frontend/src/pages/CabinetPage.tsx` |
| Auth + credits | `frontend/src/context/AuthContext.tsx`, `backend/services/credits.js` |
| Переводы | `frontend/src/i18n/locales/*.json` |

---

## 7. После подключения ЮKassa (TODO)

1. Backend: webhook оплаты → `UPDATE profiles SET credits = credits + N`  
2. Frontend: заменить кнопку «Связаться» на виджет / redirect ЮKassa  
3. Убрать или скрыть баннер `pricing.manualPaymentNotice`  
4. Опционально: таблица `credit_purchases` для истории платежей  

---

## 8. Smoke-тест после деплоя

- [ ] Favicon и логотип S+молния отображаются  
- [ ] Вход через Google → профиль в шапке (инициалы)  
- [ ] Генерация → toast + минус 1 кредит в бейдже  
- [ ] При 0 кредитов → модалка с пакетами  
- [ ] «Связаться» → открывается почта на правильный адрес  
- [ ] Ручное начисление в Supabase → баланс обновился на сайте  
- [ ] Переключение языка (ru / en / uz / tg)  

---

*Последнее обновление: UI-рефакторинг шапки, toast, логотип, ручная оплата до ЮKassa.*

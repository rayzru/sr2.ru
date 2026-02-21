import { ExternalLink } from "lucide-react";
import { type Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Чаты — Сообщество СР2",
  description:
    "Telegram-чаты жителей ЖК «Сердце Ростова 2»: основной чат, чаты по строениям, паркинг и барахолка.",
};

// Иконка Telegram
function TelegramIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

// Чаты по строениям
const buildingChats = [
  { number: 1, link: "https://t.me/sr2_s1" },
  { number: 2, link: "https://t.me/sr2_s2" },
  { number: 3, link: "https://t.me/sr2_s3" },
  { number: 4, link: "https://t.me/sr2_s4" },
  { number: 5, link: "https://t.me/sr2_s5" },
  { number: 6, link: "https://t.me/sr2_s6" },
  { number: 7, link: "https://t.me/sr2_s7" },
];

// Компонент ссылки на чат
function ChatLink({
  href,
  title,
  description,
  badge,
  disabled,
}: {
  href: string;
  title: string;
  description?: string;
  badge?: string;
  disabled?: boolean;
}) {
  if (disabled) {
    return (
      <div className="flex items-center gap-3 py-2 opacity-50">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#26A5E4]/10">
          <TelegramIcon className="h-5 w-5 text-[#26A5E4]" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{title}</span>
            {badge && (
              <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-xs text-amber-700 dark:text-amber-400">
                {badge}
              </span>
            )}
          </div>
          {description && <p className="text-muted-foreground truncate text-xs">{description}</p>}
        </div>
      </div>
    );
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:bg-muted/50 group -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#26A5E4]">
        <TelegramIcon className="h-5 w-5 text-white" />
      </div>
      <div className="min-w-0 flex-1">
        <span className="group-hover:text-primary text-sm font-medium transition-colors">
          {title}
        </span>
        {description && <p className="text-muted-foreground truncate text-xs">{description}</p>}
      </div>
      <ExternalLink className="text-muted-foreground h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
    </Link>
  );
}

export default function ChatsPage() {
  return (
    <div className="py-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight">Чаты</h1>
        <p className="text-muted-foreground mt-1">Telegram-чаты жителей ЖК «Сердце Ростова 2»</p>
      </header>

      <div className="flex flex-col gap-12 lg:flex-row">
        {/* Левая колонка — список чатов */}
        <div className="w-full space-y-8 lg:max-w-sm">
          {/* Новости и основной чат */}
          <section>
            <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
              Основные
            </h2>
            <div className="space-y-1">
              <ChatLink
                href="https://t.me/serdcerostova2"
                title="СР2 — Основной"
                description="Главный чат для всех жителей"
              />
              <ChatLink
                href="https://t.me/sr2today"
                title="SR2.today"
                description="Новости и объявления комплекса"
              />
            </div>
          </section>

          {/* Чаты по строениям */}
          <section>
            <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
              По строениям
            </h2>
            <div className="grid grid-cols-2 gap-x-4">
              {buildingChats.map((chat) => (
                <ChatLink key={chat.number} href={chat.link} title={`Строение ${chat.number}`} />
              ))}
            </div>
          </section>

          {/* Тематические чаты */}
          <section>
            <h2 className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
              Тематические
            </h2>
            <div className="space-y-1">
              <ChatLink
                href="https://t.me/sr2_auto"
                title="Паркинг"
                description="Вопросы подземного паркинга"
              />
              <ChatLink
                href="https://t.me/sr2_market"
                title="Барахолка"
                description="Купля-продажа между соседями"
              />
            </div>
          </section>
        </div>

        {/* Правая колонка — описание (на мобильных уходит вниз) */}
        <aside className="text-muted-foreground flex-1 space-y-6 text-sm">
          {/* Почему Telegram */}
          <section>
            <h3 className="text-foreground mb-2 font-medium">Почему Telegram?</h3>
            <p className="leading-relaxed">
              Telegram — основная платформа общения нашего сообщества. Чаты работают с 2019 года и
              объединяют тысячи жителей комплекса.
            </p>
          </section>

          {/* Модерация */}
          <section>
            <h3 className="text-foreground mb-2 font-medium">Модерация</h3>
            <p className="leading-relaxed">
              Порядок в чатах поддерживают наши администраторы — огромное им спасибо за их труд.
              Также работает умный бот на базе ИИ (GPT), который помогает отвечать на частые вопросы
              и следит за соблюдением правил.
            </p>
            <p className="mt-2">
              Все чаты подчиняются{" "}
              <Link href="/larina-45/rules" className="text-primary font-medium hover:underline">
                общим правилам сообщества
              </Link>
              .
            </p>
          </section>

          {/* Вступление */}
          <section>
            <h3 className="text-foreground mb-2 font-medium">Как вступить?</h3>
            <p className="leading-relaxed">
              Основной чат, новостной канал и паркинг открыты для всех. Для вступления в чаты
              строений необходимо подтвердить проживание в соответствующем доме.
            </p>
          </section>

          {/* Правила барахолки */}
          <section className="bg-muted/30 rounded-lg border p-4">
            <h3 className="text-foreground mb-3 font-medium">Правила барахолки</h3>
            <ul className="space-y-2 text-xs leading-relaxed">
              <li className="flex gap-2">
                <span className="text-destructive font-bold">⚠️</span>
                <span>
                  <strong>Никогда не переводите авансы!</strong> Встречайтесь лично для передачи
                  товара.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">1.</span>
                <span>
                  Только объявления от участников чата. Оффтопик и внешние ссылки запрещены.
                </span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">2.</span>
                <span>Одно объявление — одно сообщение с фото товара/услуги.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">3.</span>
                <span>Обязательно указывайте цену или условия приобретения.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">4.</span>
                <span>Кратко опишите характеристики товара или услуги.</span>
              </li>
              <li className="flex gap-2">
                <span className="text-muted-foreground">5.</span>
                <span>
                  Укажите контактный телефон или Telegram для связи. Внешние ссылки запрещены.
                </span>
              </li>
            </ul>
            <p className="text-muted-foreground mt-3 text-xs">
              Администрация может удалить или попросить изменить сообщение, не соответствующее
              правилам.
            </p>
            <Link
              href="https://t.me/sr2_market/552"
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary mt-2 inline-flex items-center gap-1 text-xs hover:underline"
            >
              Полные правила в чате
              <ExternalLink className="h-3 w-3" />
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

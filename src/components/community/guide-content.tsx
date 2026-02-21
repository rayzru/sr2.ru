"use client";

import { useEffect, useState } from "react";

import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Car,
  CheckCircle2,
  ClipboardList,
  FileCheck,
  Home,
  Info,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import Link from "next/link";

import { Button } from "~/components/ui/button";
import { cn } from "~/lib/utils";

const sections = [
  { id: "overview", title: "Обзор", icon: BookOpen },
  { id: "registration", title: "Регистрация", icon: UserPlus },
  { id: "verification", title: "Подтверждение", icon: FileCheck },
  { id: "apartments", title: "Квартиры", icon: Home },
  { id: "parking", title: "Паркинг", icon: Car },
  { id: "moderation", title: "Модерация", icon: ClipboardList },
];

export function GuideContent() {
  const [activeSection, setActiveSection] = useState("overview");

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        });
      },
      { rootMargin: "-20% 0px -70% 0px" }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, []);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="py-6">
      <div className="flex gap-8">
        {/* Main content */}
        <article className="min-w-0 max-w-prose flex-1">
          <header className="mb-8">
            <h1 className="text-2xl font-bold tracking-tight">Как пользоваться сервисом</h1>
            <p className="text-muted-foreground mt-1">
              Пошаговое руководство для жителей ЖК «Сердце Ростова 2»
            </p>
          </header>

          {/* Overview */}
          <section id="overview" className="mb-10 scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <BookOpen className="text-primary h-5 w-5 shrink-0" />
              Обзор сервиса
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                Наш сервис — это информационная платформа для жителей ЖК, которая объединяет
                несколько ключевых функций:
              </p>
              <ul className="list-none space-y-2">
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>
                    <span className="text-foreground font-medium">Справочник</span> — контакты
                    служб, организаций и полезная информация о ЖК
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>
                    <span className="text-foreground font-medium">Объявления</span> — аренда и
                    продажа квартир, машиномест в паркинге
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>
                    <span className="text-foreground font-medium">Новости</span> — важные события,
                    объявления и обновления комплекса
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                  <span>
                    <span className="text-foreground font-medium">Обратная связь</span> — жалобы,
                    пожелания и заявки
                  </span>
                </li>
              </ul>

              <div className="flex gap-3 rounded-lg border bg-blue-50 p-4 dark:bg-blue-950/30">
                <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Для просмотра справочника и новостей регистрация не требуется. Для подачи
                  объявлений необходима регистрация и подтверждение права собственности.
                </p>
              </div>
            </div>
          </section>

          {/* Registration */}
          <section id="registration" className="mb-10 scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <UserPlus className="text-primary h-5 w-5 shrink-0" />
              Регистрация в сервисе
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                Регистрация открыта для всех жителей комплекса. Вы можете зарегистрироваться двумя
                способами:
              </p>

              <div className="space-y-3">
                <div className="rounded-lg border p-4">
                  <p className="text-foreground mb-2 font-medium">Быстрая регистрация</p>
                  <p className="text-sm">
                    Войдите одним нажатием через Яндекс ID, VK ID или Google. Нажмите «Войти» и
                    выберите удобный вариант.
                  </p>
                </div>

                <div className="rounded-lg border p-4">
                  <p className="text-foreground mb-2 font-medium">Email и пароль</p>
                  <p className="text-sm">
                    Классическая регистрация с подтверждением email. Потребуется ввести код из
                    письма.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button asChild>
                  <Link href="/register">
                    <UserPlus className="mr-2 h-4 w-4" />
                    Зарегистрироваться
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Verification */}
          <section id="verification" className="mb-10 scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <FileCheck className="text-primary h-5 w-5 shrink-0" />
              Подтверждение собственности
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                Для подачи объявлений о продаже или аренде недвижимости необходимо подтвердить право
                собственности. Это защищает жителей от мошенников и обеспечивает достоверность
                информации.
              </p>

              <div className="flex gap-3 rounded-lg border bg-amber-50 p-4 dark:bg-amber-950/30">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  Без подтверждения собственности вы не сможете создавать объявления о продаже или
                  аренде.
                </p>
              </div>

              <h3 className="text-foreground pt-2 font-medium">Как подтвердить собственность:</h3>

              <div className="space-y-4">
                {/* Path 1 */}
                <div className="border-primary/20 bg-primary/5 rounded-lg border-2 p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="bg-primary text-primary-foreground flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
                      1
                    </span>
                    <p className="text-foreground font-medium">Через заявку с документами</p>
                  </div>
                  <ol className="list-inside list-decimal space-y-2 text-sm">
                    <li>Перейдите в раздел «Моя недвижимость»</li>
                    <li>Нажмите «Добавить объект»</li>
                    <li>Выберите тип (квартира или машиноместо)</li>
                    <li>Укажите адрес и номер</li>
                    <li>
                      Прикрепите фото документа:{" "}
                      <span className="text-muted-foreground">
                        выписка ЕГРН, свидетельство о собственности или договор
                      </span>
                    </li>
                    <li>Отправьте заявку на проверку</li>
                  </ol>
                  <p className="text-muted-foreground mt-3 text-xs">
                    Срок рассмотрения: обычно в течение 24 часов
                  </p>
                </div>

                {/* Path 2 */}
                <div className="rounded-lg border p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <span className="bg-muted flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold">
                      2
                    </span>
                    <p className="text-foreground font-medium">
                      Личное подтверждение администратором
                    </p>
                  </div>
                  <p className="text-sm">
                    Если вы знакомы с администраторами сообщества лично, они могут подтвердить вашу
                    собственность без загрузки документов. Для этого свяжитесь с администратором в
                    чате.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <Button variant="outline" asChild>
                  <Link href="/my/property">
                    <FileCheck className="mr-2 h-4 w-4" />
                    Добавить недвижимость
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Apartments */}
          <section id="apartments" className="mb-10 scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Home className="text-primary h-5 w-5 shrink-0" />
              Объявления о квартирах
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                После подтверждения собственности вы можете размещать объявления о продаже или сдаче
                в аренду вашей квартиры.
              </p>

              <h3 className="text-foreground font-medium">Типы объявлений:</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">Продажа квартиры</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Для собственников, желающих продать недвижимость
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">Аренда квартиры</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Долгосрочная или краткосрочная аренда
                  </p>
                </div>
              </div>

              <h3 className="text-foreground pt-2 font-medium">Процесс подачи объявления:</h3>
              <ol className="list-inside list-decimal space-y-2 text-sm">
                <li>Убедитесь, что квартира добавлена и подтверждена</li>
                <li>Перейдите в «Мои объявления» → «Создать объявление»</li>
                <li>Выберите квартиру из списка вашей недвижимости</li>
                <li>Укажите тип объявления (продажа/аренда)</li>
                <li>Заполните описание и загрузите фотографии</li>
                <li>Укажите цену и условия</li>
                <li>Отправьте на модерацию</li>
              </ol>

              <div className="pt-2">
                <Button asChild>
                  <Link href="/a/aparts">
                    <Home className="mr-2 h-4 w-4" />
                    Смотреть объявления
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Parking */}
          <section id="parking" className="mb-10 scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Car className="text-primary h-5 w-5 shrink-0" />
              Объявления о паркинге
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                Машиноместа в подземном паркинге также можно продать или сдать в аренду через наш
                сервис. Процесс аналогичен квартирам.
              </p>

              <h3 className="text-foreground font-medium">Типы объявлений:</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">Продажа машиноместа</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Продажа права собственности на место в паркинге
                  </p>
                </div>
                <div className="rounded-lg border p-3">
                  <p className="text-foreground text-sm font-medium">Аренда машиноместа</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    Помесячная аренда места в паркинге
                  </p>
                </div>
              </div>

              <h3 className="text-foreground pt-2 font-medium">Особенности паркинга:</h3>
              <ul className="list-inside list-disc space-y-2 text-sm">
                <li>Укажите уровень паркинга и номер места</li>
                <li>Отметьте, есть ли рядом колонна или препятствия</li>
                <li>Добавьте фото места для наглядности</li>
                <li>Укажите размеры места, если нестандартные</li>
              </ul>

              <div className="pt-2">
                <Button asChild>
                  <Link href="/a/parking">
                    <Car className="mr-2 h-4 w-4" />
                    Смотреть паркинг
                  </Link>
                </Button>
              </div>
            </div>
          </section>

          {/* Moderation */}
          <section id="moderation" className="scroll-mt-6">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <ClipboardList className="text-primary h-5 w-5 shrink-0" />
              Модерация и сроки
            </h2>
            <div className="text-muted-foreground space-y-4 leading-relaxed">
              <p>
                Все заявки и объявления проходят модерацию для обеспечения качества и безопасности
                информации.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="text-foreground text-sm font-medium">
                      Заявки на подтверждение собственности
                    </p>
                    <p className="text-muted-foreground text-xs">
                      Обычно рассматриваются в течение 24 часов
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="text-foreground text-sm font-medium">Объявления о недвижимости</p>
                    <p className="text-muted-foreground text-xs">
                      Проверяются и публикуются в течение нескольких часов
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-lg border p-3">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-500" />
                  <div>
                    <p className="text-foreground text-sm font-medium">Обращения и жалобы</p>
                    <p className="text-muted-foreground text-xs">
                      Рассматриваются в порядке поступления
                    </p>
                  </div>
                </div>
              </div>

              <p className="text-sm">
                Статус всех ваших заявок можно отслеживать в личном кабинете. При отклонении заявки
                вы получите уведомление с указанием причины.
              </p>

              <div className="flex flex-wrap gap-3 pt-2">
                <Button variant="outline" asChild>
                  <Link href="/my">
                    Личный кабинет
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/feedback">
                    Обратная связь
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </div>
          </section>
        </article>

        {/* Right navigation */}
        <aside className="hidden w-48 shrink-0 md:block">
          <nav className="sticky top-6">
            <p className="text-muted-foreground mb-3 text-xs font-medium uppercase tracking-wide">
              На странице
            </p>
            <ul className="space-y-1">
              {sections.map(({ id, title }) => (
                <li key={id}>
                  <button
                    onClick={() => scrollToSection(id)}
                    className={cn(
                      "w-full rounded-md px-3 py-1.5 text-left text-sm transition-colors",
                      activeSection === id
                        ? "bg-primary/10 text-primary font-medium"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                  >
                    {title}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </aside>
      </div>
    </div>
  );
}

"use client";

import { FileText, Scale, Shield, Trash2, UserCheck } from "lucide-react";
import Link from "next/link";

import { ArticleWithNav } from "~/components/article-with-nav";

const sections = [
  { id: "intro", title: "Введение" },
  { id: "general", title: "Общие положения" },
  { id: "registration", title: "Регистрация" },
  { id: "community", title: "Соседское сообщество" },
  { id: "documents", title: "Загрузка документов" },
  { id: "legal", title: "Правовые основания" },
  { id: "liability", title: "Ответственность" },
  { id: "deletion", title: "Удаление аккаунта" },
  { id: "changes", title: "Изменения" },
];

export default function TermsPage() {
  return (
    <ArticleWithNav
      title="Пользовательское соглашение"
      description="Правила использования информационного сервиса SR2.ru"
      sections={sections}
    >
      {/* Intro */}
      <section id="intro" className="mb-8 scroll-mt-6">
        <div className="bg-muted/50 rounded-lg border p-4">
          <p className="text-muted-foreground text-sm">
            Настоящее Пользовательское соглашение (далее — «Соглашение») регулирует отношения между
            информационным сервисом SR2.ru (далее — «Сервис») и пользователями Сервиса. Регистрация
            в Сервисе означает полное и безоговорочное принятие условий настоящего Соглашения.
          </p>
        </div>
      </section>

      {/* General */}
      <section id="general" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FileText className="text-primary h-5 w-5" />
          Общие положения
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            1.1. Сервис SR2.ru является некоммерческим информационным проектом, созданным и
            поддерживаемым инициативными жильцами жилого комплекса «Сердце Ростова 2» для удобства
            соседей.
          </p>
          <p>
            1.2. Сервис предоставляет справочную информацию о жилом комплексе, управляющих
            компаниях, контактах служб и полезных сервисах.
          </p>
          <p>
            1.3. Использование Сервиса является бесплатным. Любые пожертвования направляются
            исключительно на развитие и поддержку Сервиса.
          </p>
          <p>
            1.4. Сервис не является официальным представителем застройщика, управляющих компаний или
            государственных органов.
          </p>
        </div>
      </section>

      {/* Registration */}
      <section id="registration" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <UserCheck className="text-primary h-5 w-5" />
          Регистрация и использование
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            2.1. Регистрация в Сервисе осуществляется через авторизацию с использованием учётной
            записи Яндекс.
          </p>
          <p>2.2. Регистрируясь в Сервисе, пользователь подтверждает, что:</p>
          <ul className="ml-4 list-inside list-disc space-y-1">
            <li>Ознакомился и согласен с настоящим Соглашением</li>
            <li>
              Ознакомился и согласен с{" "}
              <Link href="/privacy" className="text-primary hover:underline">
                Политикой конфиденциальности
              </Link>
            </li>
            <li>Является дееспособным лицом</li>
            <li>Предоставляет достоверную информацию о себе</li>
          </ul>
          <p>
            2.3. Пользователь обязуется не использовать Сервис для противоправных целей, не нарушать
            права других пользователей и соблюдать{" "}
            <Link href="/larina-45/rules" className="text-primary hover:underline">
              Правила сообщества
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Community */}
      <section id="community" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <UserCheck className="text-primary h-5 w-5" />
          Соседское сообщество и обмен информацией
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            3.1. Сервис создан для добровольного обмена информацией между соседями жилого комплекса
            «Сердце Ростова 2».
          </p>
          <p>3.2. Пользователи Сервиса:</p>
          <ul className="ml-4 list-inside list-disc space-y-1">
            <li>Самостоятельно решают, какую информацию о себе публиковать</li>
            <li>Понимают, что предоставленная информация может быть доступна другим жильцам</li>
            <li>
              Осознают добровольный характер обмена контактами, документами и другой информацией
            </li>
            <li>Несут ответственность за достоверность предоставляемой информации</li>
          </ul>
          <p>
            3.3. Сервис не является посредником в отношениях между соседями и не несёт
            ответственности за последствия обмена информацией.
          </p>
          <p>
            3.4. Пользователи обязуются использовать полученную от других пользователей информацию
            исключительно для целей соседского общения и не передавать её третьим лицам без
            согласия.
          </p>
        </div>
      </section>

      {/* Documents */}
      <section id="documents" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <FileText className="text-primary h-5 w-5" />
          Загрузка подтверждающих документов
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            4.1. При подаче заявки на подтверждение прав на недвижимость пользователь может
            добровольно загрузить подтверждающие документы.
          </p>
          <p>4.2. Загружаемые документы могут включать:</p>
          <ul className="ml-4 list-inside list-disc space-y-1">
            <li>Выписку из ЕГРН</li>
            <li>Договор купли-продажи или аренды</li>
            <li>Копию паспорта или иного документа, удостоверяющего личность</li>
            <li>Другие подтверждающие документы</li>
          </ul>
          <p>
            4.3. Загрузка документов является <strong>добровольной</strong> и не является
            обязательным требованием для использования Сервиса.
          </p>
          <p>
            4.4. Документы используются исключительно для проверки прав на недвижимость
            администрацией Сервиса и не передаются третьим лицам.
          </p>
          <p>
            4.5. Документы хранятся только на время рассмотрения заявки. После одобрения или
            отклонения заявки все загруженные файлы автоматически удаляются.
          </p>
          <p>
            4.6. Пользователь несёт ответственность за содержание загружаемых документов и
            подтверждает, что имеет право на их предоставление.
          </p>
          <p>
            4.7. Администрация обязуется обеспечить конфиденциальность и безопасность хранения
            загруженных документов в соответствии с требованиями{" "}
            <Link href="/privacy" className="text-primary hover:underline">
              Политики конфиденциальности
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Legal basis */}
      <section id="legal" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Scale className="text-primary h-5 w-5" />
          Правовые основания
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            5.1. Деятельность Сервиса осуществляется в соответствии с законодательством Российской
            Федерации, в том числе:
          </p>
          <ul className="ml-4 list-inside list-disc space-y-1">
            <li>
              Федеральный закон от 27.07.2006 № 149-ФЗ «Об информации, информационных технологиях и
              о защите информации»
            </li>
            <li>Федеральный закон от 27.07.2006 № 152-ФЗ «О персональных данных»</li>
            <li>Гражданский кодекс Российской Федерации</li>
          </ul>
          <p>
            5.2. Любые споры, возникающие из использования Сервиса, разрешаются в соответствии с
            действующим законодательством РФ.
          </p>
        </div>
      </section>

      {/* Liability */}
      <section id="liability" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Shield className="text-primary h-5 w-5" />
          Ограничение ответственности
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            6.1. Сервис предоставляется «как есть». Администрация не гарантирует, что Сервис будет
            соответствовать ожиданиям пользователя или работать без перерывов и ошибок.
          </p>
          <p>
            6.2. Информация, размещённая в Сервисе, носит справочный характер. Администрация не
            несёт ответственности за точность, полноту и актуальность информации.
          </p>
          <p>
            6.3. Администрация не несёт ответственности за действия третьих лиц и за любой ущерб,
            причинённый пользователю в результате использования Сервиса.
          </p>
          <p>
            6.4. Администрация не несёт ответственности за последствия добровольного обмена
            информацией и документами между пользователями Сервиса.
          </p>
        </div>
      </section>

      {/* Account deletion */}
      <section id="deletion" className="mb-8 scroll-mt-6">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
          <Trash2 className="text-primary h-5 w-5" />
          Удаление аккаунта
        </h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            5.1. Пользователь имеет право в любой момент удалить свой аккаунт и все связанные с ним
            персональные данные.
          </p>
          <p>
            5.2. Для удаления аккаунта необходимо подать заявку через специальную форму в{" "}
            <Link href="/my/profile" className="text-primary hover:underline">
              настройках профиля
            </Link>
            .
          </p>
          <p>
            5.3. После подтверждения заявки все персональные данные пользователя будут безвозвратно
            удалены из Сервиса в течение 30 дней.
          </p>
          <p>
            5.4. Администрация оставляет за собой право сохранять обезличенные данные для
            статистических целей.
          </p>
        </div>
      </section>

      {/* Changes */}
      <section id="changes" className="scroll-mt-6">
        <h2 className="mb-4 text-lg font-semibold">Изменения Соглашения</h2>
        <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
          <p>
            6.1. Администрация вправе в одностороннем порядке изменять условия настоящего
            Соглашения.
          </p>
          <p>
            6.2. Продолжение использования Сервиса после внесения изменений означает согласие
            пользователя с новой редакцией Соглашения.
          </p>
          <p className="text-muted-foreground mt-6 text-xs">
            Дата последнего обновления: декабрь 2025
          </p>
        </div>
      </section>
    </ArticleWithNav>
  );
}

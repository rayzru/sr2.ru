import {
  BookMarked,
  BookOpen,
  Calendar,
  Car,
  HandHelping,
  Home,
  Info,
  Map,
  Megaphone,
  MessageSquare,
  Newspaper,
  Package,
  Sparkles,
  Users,
  Wrench,
} from "lucide-react";

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  description: string;
  testId?: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
  /** если true — группа отображается как прямая ссылка без выпадашки */
  direct?: boolean;
  href?: string;
  testId?: string;
}

export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Лента",
    items: [
      {
        title: "Новости",
        href: "/news",
        icon: Newspaper,
        description: "Официальные новости и объявления ЖК",
        testId: "nav-news",
      },
      {
        title: "Публикации соседей",
        href: "/live",
        icon: MessageSquare,
        description: "Истории, обсуждения и жизнь жителей",
        testId: "nav-live",
      },
      {
        title: "События",
        href: "/events",
        icon: Calendar,
        description: "Мероприятия, собрания, ежемесячные напоминания",
        testId: "nav-events",
      },
    ],
  },
  {
    title: "Объявления",
    items: [
      {
        title: "Квартиры",
        href: "/a/aparts",
        icon: Home,
        description: "Аренда и продажа квартир в жилом комплексе",
        testId: "nav-a-aparts",
      },
      {
        title: "Паркинг",
        href: "/a/parking",
        icon: Car,
        description: "Аренда и продажа парковочных мест",
        testId: "nav-a-parking",
      },
      {
        title: "Услуги",
        href: "/a/services",
        icon: Wrench,
        description: "Услуги от жителей и для жителей",
        testId: "nav-a-services",
      },
      {
        title: "Барахолка",
        href: "/a/catalog",
        icon: Package,
        description: "Купля-продажа вещей между жителями",
        testId: "nav-a-catalog",
      },
    ],
  },
  {
    title: "Справочная",
    items: [
      {
        title: "Справочная",
        href: "/",
        icon: Info,
        description: "Телефоны, организации, контакты ЖК",
        testId: "nav-info",
      },
      {
        title: "Знания",
        href: "/howtos",
        icon: BookOpen,
        description: "Инструкции, руководства и полезные гайды",
        testId: "nav-howtos",
      },
    ],
  },
  {
    title: "ЖК",
    items: [
      {
        title: "О нас",
        href: "/larina-45",
        icon: Sparkles,
        description: "Цели, история и команда платформы sr2.ru",
        testId: "nav-community-about",
      },
      {
        title: "Карта",
        href: "/larina-45/map",
        icon: Map,
        description: "Интерактивная карта ЖК и инфраструктуры",
        testId: "nav-map",
      },
      {
        title: "Чаты",
        href: "/larina-45/chats",
        icon: Users,
        description: "Ссылки на чаты строений и общий чат ЖК",
        testId: "nav-chats",
      },
      {
        title: "Правила",
        href: "/larina-45/rules",
        icon: BookMarked,
        description: "Правила проживания и внутренний распорядок",
        testId: "nav-rules",
      },
      {
        title: "Как пользоваться",
        href: "/larina-45/guide",
        icon: BookOpen,
        description: "Регистрация, подтверждение собственности, публикации",
        testId: "nav-community-guide",
      },
      {
        title: "Как помочь",
        href: "/larina-45/contribute",
        icon: HandHelping,
        description: "Как поддержать развитие платформы",
        testId: "nav-community-contribute",
      },
    ],
  },
  {
    title: "Контакты",
    direct: true,
    href: "/feedback",
    testId: "nav-feedback",
    items: [],
  },
];

/** Пункты кабинета пользователя (для мобильной навигации и выпадашки) */
export const CABINET_ITEMS = [
  { title: "Мой кабинет", href: "/my", testId: "nav-cabinet" },
  { title: "Профиль", href: "/my/profile", testId: "nav-profile" },
  { title: "Уведомления", href: "/my/notifications", testId: "nav-notifications" },
  { title: "Безопасность", href: "/my/security", testId: "nav-security" },
  { title: "Недвижимость", href: "/my/property", testId: "nav-property" },
  { title: "Объявления", href: "/my/ads", testId: "nav-ads" },
] as const;

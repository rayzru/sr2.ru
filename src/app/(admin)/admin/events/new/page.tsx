"use client";

import { useState } from "react";

import type { JSONContent } from "@tiptap/react";

import {
  ArrowLeft,
  Calendar,
  Clock,
  Eye,
  FileText,
  Link as LinkIcon,
  Loader2,
  MapPin,
  Phone,
  Repeat,
  Send,
  User,
  Users,
  UserX,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { z } from "zod";

import { ContentSearch, type LinkedContent } from "~/components/content-search";
import { StandardEditor } from "~/components/editor/rich-editor";
import { ImageUploader } from "~/components/media/image-uploader";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { DatePicker, DateTimePicker } from "~/components/ui/date-picker";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Switch } from "~/components/ui/switch";
import { useToast } from "~/hooks/use-toast";
import { EVENT_RECURRENCE_TYPE_LABELS, type EventRecurrenceType } from "~/server/db/schema";
import { api } from "~/trpc/react";

// Zod validation schema for event form
const eventFormSchema = z
  .object({
    title: z
      .string()
      .min(1, "Введите название мероприятия")
      .max(255, "Название слишком длинное (макс. 255 символов)"),
    description: z.custom<JSONContent>().optional(),
    coverImage: z.string().max(500).optional(),
    publishAt: z.date().optional(), // Дата и время публикации
    eventStartAt: z.date({ error: "Укажите дату и время начала" }),
    eventEndAt: z.date().optional(),
    eventLocation: z.string().max(500, "Адрес слишком длинный (макс. 500 символов)").optional(),
    eventMaxAttendees: z
      .string()
      .optional()
      .transform((val) => {
        if (!val) return undefined;
        const num = parseInt(val, 10);
        return isNaN(num) ? undefined : num;
      }),
    eventExternalUrl: z
      .string()
      .max(500, "Ссылка слишком длинная")
      .optional()
      .refine((val) => !val || val.startsWith("http://") || val.startsWith("https://"), {
        message: "Ссылка должна начинаться с http:// или https://",
      }),
    eventOrganizer: z.string().max(255, "Имя организатора слишком длинное").optional(),
    eventOrganizerPhone: z.string().max(20, "Номер телефона слишком длинный").optional(),
    buildingId: z.string().optional(),
    isUrgent: z.boolean().default(false),
    isAnonymous: z.boolean().default(false),
    publishToTelegram: z.boolean().default(false),
  })
  .refine(
    (data) => {
      if (data.eventEndAt && data.eventStartAt) {
        return data.eventEndAt > data.eventStartAt;
      }
      return true;
    },
    {
      message: "Время окончания должно быть позже времени начала",
      path: ["eventEndAt"],
    }
  );

type EventFormData = z.infer<typeof eventFormSchema>;
type FormErrors = Partial<Record<keyof EventFormData | "root", string>>;

export default function NewEventPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: session } = useSession();

  // Form state
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState<JSONContent>({ type: "doc", content: [] });
  const [coverImage, setCoverImage] = useState<string | null>(null);
  const [publishAt, setPublishAt] = useState<Date | undefined>();
  const [eventStartAt, setEventStartAt] = useState<Date | undefined>();
  const [eventEndAt, setEventEndAt] = useState<Date | undefined>();
  const [eventLocation, setEventLocation] = useState("");
  const [eventMaxAttendees, setEventMaxAttendees] = useState("");
  const [eventExternalUrl, setEventExternalUrl] = useState("");
  const [eventOrganizer, setEventOrganizer] = useState("");
  const [eventOrganizerPhone, setEventOrganizerPhone] = useState("");
  const [buildingId, setBuildingId] = useState<string>("");
  const [isUrgent, setIsUrgent] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [publishToTelegram, setPublishToTelegram] = useState(false);
  const [eventAllDay, setEventAllDay] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});

  // Recurrence state
  const [eventRecurrenceType, setEventRecurrenceType] = useState<EventRecurrenceType>("none");
  const [linkedContentIds, setLinkedContentIds] = useState<LinkedContent[]>([]);

  // Check if user is admin
  const isAdmin =
    session?.user?.roles?.some((r) =>
      ["Root", "SuperAdmin", "Admin", "Editor", "Moderator"].includes(r)
    ) ?? false;

  // Get buildings for selector
  const { data: buildings } = api.profile.getAvailableBuildings.useQuery();

  // Create mutation
  const createMutation = api.publications.create.useMutation({
    onSuccess: () => {
      toast({ title: "Мероприятие создано" });
      router.push("/admin/events");
    },
    onError: (error) => {
      toast({ title: "Ошибка", description: error.message, variant: "destructive" });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});

    const formData = {
      title: title.trim(),
      coverImage: coverImage || undefined,
      publishAt,
      eventAllDay,
      eventStartAt,
      eventEndAt,
      eventLocation: eventLocation.trim() || undefined,
      eventMaxAttendees: eventMaxAttendees || undefined,
      eventExternalUrl: eventExternalUrl.trim() || undefined,
      eventOrganizer: eventOrganizer.trim() || undefined,
      eventOrganizerPhone: eventOrganizerPhone.trim() || undefined,
      buildingId: buildingId || undefined,
      isUrgent,
      isAnonymous,
      publishToTelegram,
    };

    const result = eventFormSchema.safeParse(formData);

    if (!result.success) {
      const fieldErrors: FormErrors = {};
      result.error.issues.forEach((issue) => {
        const path = issue.path[0] as keyof EventFormData;
        if (path && !fieldErrors[path]) {
          fieldErrors[path] = issue.message;
        }
      });
      setErrors(fieldErrors);

      const firstIssue = result.error.issues[0];
      if (firstIssue) {
        toast({
          title: "Ошибка валидации",
          description: firstIssue.message,
          variant: "destructive",
        });
      }
      return;
    }

    const validData = result.data;

    createMutation.mutate({
      title: validData.title,
      content: description,
      type: "event",
      coverImage: validData.coverImage,
      buildingId: validData.buildingId || undefined,
      isUrgent: validData.isUrgent,
      isAnonymous: validData.isAnonymous,
      publishAt: validData.publishAt,
      publishToTelegram: validData.publishToTelegram,
      eventAllDay,
      eventStartAt: validData.eventStartAt,
      eventEndAt: validData.eventEndAt,
      eventLocation: validData.eventLocation,
      eventMaxAttendees: validData.eventMaxAttendees,
      eventExternalUrl: validData.eventExternalUrl,
      eventOrganizer: validData.eventOrganizer,
      eventOrganizerPhone: validData.eventOrganizerPhone,
      // Recurrence fields
      eventRecurrenceType: eventRecurrenceType !== "none" ? eventRecurrenceType : undefined,
      linkedContentIds: linkedContentIds.length > 0 ? linkedContentIds : undefined,
    });
  };

  const handlePreview = () => {
    toast({ title: "Превью", description: "Функция превью будет добавлена позже" });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/admin/events">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <Calendar className="h-6 w-6" />
            Новое мероприятие
          </h1>
          <p className="text-muted-foreground mt-1">Создание события для сообщества</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="flex gap-6">
          {/* Main Content - Left Side */}
          <div className="flex-1 space-y-6">
            {/* Basic Info */}
            <Card>
              <CardHeader>
                <CardTitle>Основная информация</CardTitle>
                <CardDescription>Название и описание мероприятия</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Название *</Label>
                  <Input
                    id="title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Например: Субботник во дворе"
                    className={errors.title ? "border-destructive" : ""}
                  />
                  {errors.title && <p className="text-destructive text-sm">{errors.title}</p>}
                </div>
                <div className="space-y-2">
                  <Label>Описание</Label>
                  <StandardEditor
                    content={description}
                    onChange={setDescription}
                    placeholder="Подробности о мероприятии..."
                    minHeight="200px"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <Switch id="urgent" checked={isUrgent} onCheckedChange={setIsUrgent} />
                  <Label htmlFor="urgent">Срочное мероприятие</Label>
                </div>
              </CardContent>
            </Card>

            {/* Date & Time */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  Дата и время
                </CardTitle>
                <CardDescription>Когда состоится мероприятие</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center gap-3">
                  <Switch id="allDay" checked={eventAllDay} onCheckedChange={setEventAllDay} />
                  <Label htmlFor="allDay">Весь день (без конкретного времени)</Label>
                </div>
                <div className="space-y-2">
                  <Label>{eventAllDay ? "Дата начала *" : "Начало мероприятия *"}</Label>
                  {eventAllDay ? (
                    <DatePicker
                      value={eventStartAt}
                      onChange={setEventStartAt}
                      placeholder="Выберите дату начала"
                      className={errors.eventStartAt ? "border-destructive" : ""}
                    />
                  ) : (
                    <DateTimePicker
                      value={eventStartAt}
                      onChange={setEventStartAt}
                      placeholder="Выберите дату и время начала"
                      className={errors.eventStartAt ? "border-destructive" : ""}
                    />
                  )}
                  {errors.eventStartAt && (
                    <p className="text-destructive text-sm">{errors.eventStartAt}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{eventAllDay ? "Дата окончания" : "Окончание мероприятия"}</Label>
                  {eventAllDay ? (
                    <DatePicker
                      value={eventEndAt}
                      onChange={setEventEndAt}
                      placeholder="Выберите дату окончания"
                      fromDate={eventStartAt}
                      className={errors.eventEndAt ? "border-destructive" : ""}
                    />
                  ) : (
                    <DateTimePicker
                      value={eventEndAt}
                      onChange={setEventEndAt}
                      placeholder="Выберите дату и время окончания"
                      fromDate={eventStartAt}
                      className={errors.eventEndAt ? "border-destructive" : ""}
                    />
                  )}
                  {errors.eventEndAt && (
                    <p className="text-destructive text-sm">{errors.eventEndAt}</p>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Recurrence */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Repeat className="h-5 w-5" />
                  Повторение
                </CardTitle>
                <CardDescription>Настройка регулярных мероприятий</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Тип повторения</Label>
                  <Select
                    value={eventRecurrenceType}
                    onValueChange={(v) => setEventRecurrenceType(v as EventRecurrenceType)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Без повторения" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(EVENT_RECURRENCE_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {eventRecurrenceType === "monthly" && eventStartAt && (
                  <p className="text-muted-foreground bg-muted rounded-md p-3 text-sm">
                    {eventEndAt && eventStartAt.getDate() !== eventEndAt.getDate()
                      ? `${eventStartAt.getDate()} — ${eventEndAt.getDate()} числа каждого месяца`
                      : `${eventStartAt.getDate()} числа каждого месяца`}
                  </p>
                )}

                {eventRecurrenceType === "yearly" && eventStartAt && (
                  <p className="text-muted-foreground bg-muted rounded-md p-3 text-sm">
                    {new Intl.DateTimeFormat("ru-RU", {
                      day: "numeric",
                      month: "long",
                      timeZone: "Europe/Moscow",
                    }).format(eventStartAt)}{" "}
                    каждый год
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Linked Content */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Связанный контент
                </CardTitle>
                <CardDescription>
                  Ссылки на новости, публикации, события или статьи базы знаний
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ContentSearch
                  value={linkedContentIds}
                  onChange={setLinkedContentIds}
                  placeholder="Поиск по названию..."
                />
              </CardContent>
            </Card>

            {/* Location */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Место проведения
                </CardTitle>
                <CardDescription>Где состоится мероприятие</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="location">Адрес / место</Label>
                  <Input
                    id="location"
                    value={eventLocation}
                    onChange={(e) => setEventLocation(e.target.value)}
                    placeholder="Например: Двор строения 1, детская площадка"
                    className={errors.eventLocation ? "border-destructive" : ""}
                  />
                  {errors.eventLocation && (
                    <p className="text-destructive text-sm">{errors.eventLocation}</p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="building">Строение</Label>
                  <Select
                    value={buildingId || "all"}
                    onValueChange={(v) => setBuildingId(v === "all" ? "" : v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Выберите строение (опционально)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Все строения</SelectItem>
                      {buildings?.map((b) => (
                        <SelectItem key={b.id} value={b.id}>
                          Строение {b.number} {b.title && `- ${b.title}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Additional Info */}
            <Card>
              <CardHeader>
                <CardTitle>Дополнительно</CardTitle>
                <CardDescription>Организатор и ограничения</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="organizer" className="flex items-center gap-2">
                      <User className="h-4 w-4" />
                      Организатор
                    </Label>
                    <Input
                      id="organizer"
                      value={eventOrganizer}
                      onChange={(e) => setEventOrganizer(e.target.value)}
                      placeholder="Имя организатора"
                      className={errors.eventOrganizer ? "border-destructive" : ""}
                    />
                    {errors.eventOrganizer && (
                      <p className="text-destructive text-sm">{errors.eventOrganizer}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="organizerPhone" className="flex items-center gap-2">
                      <Phone className="h-4 w-4" />
                      Телефон организатора
                    </Label>
                    <Input
                      id="organizerPhone"
                      value={eventOrganizerPhone}
                      onChange={(e) => setEventOrganizerPhone(e.target.value)}
                      placeholder="+7 (999) 123-45-67"
                      className={errors.eventOrganizerPhone ? "border-destructive" : ""}
                    />
                    {errors.eventOrganizerPhone && (
                      <p className="text-destructive text-sm">{errors.eventOrganizerPhone}</p>
                    )}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="maxAttendees" className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Макс. участников
                    </Label>
                    <Input
                      id="maxAttendees"
                      type="number"
                      min="0"
                      value={eventMaxAttendees}
                      onChange={(e) => setEventMaxAttendees(e.target.value)}
                      placeholder="Без ограничений"
                      className={errors.eventMaxAttendees ? "border-destructive" : ""}
                    />
                    {errors.eventMaxAttendees && (
                      <p className="text-destructive text-sm">{errors.eventMaxAttendees}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="externalUrl" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Внешняя ссылка
                    </Label>
                    <Input
                      id="externalUrl"
                      type="url"
                      value={eventExternalUrl}
                      onChange={(e) => setEventExternalUrl(e.target.value)}
                      placeholder="https://zoom.us/..."
                      className={errors.eventExternalUrl ? "border-destructive" : ""}
                    />
                    {errors.eventExternalUrl && (
                      <p className="text-destructive text-sm">{errors.eventExternalUrl}</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar - Right Side */}
          <div className="w-80 space-y-4">
            {/* Actions */}
            <Card>
              <CardContent className="space-y-3 pt-6">
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Опубликовать
                </Button>
                <Button type="button" variant="outline" className="w-full" onClick={handlePreview}>
                  <Eye className="mr-2 h-4 w-4" />
                  Превью
                </Button>
                <Link href="/admin/events" className="block">
                  <Button type="button" variant="ghost" className="w-full">
                    Отмена
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Publication Settings */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm font-medium">
                  <Clock className="h-4 w-4" />
                  Публикация
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-xs">Дата и время публикации</Label>
                  <DateTimePicker
                    value={publishAt}
                    onChange={setPublishAt}
                    placeholder="Сразу после создания"
                    className="text-sm"
                  />
                </div>
                <p className="text-muted-foreground text-xs">
                  {publishAt ? "Отложенная публикация" : "Публикация сразу после создания"}
                </p>

                <Separator />

                {/* Telegram toggle */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="telegram"
                    checked={publishToTelegram}
                    onCheckedChange={(checked) => setPublishToTelegram(checked === true)}
                    disabled={!isAdmin}
                  />
                  <div className="space-y-1">
                    <Label
                      htmlFor="telegram"
                      className={`flex cursor-pointer items-center gap-2 text-sm font-medium ${!isAdmin ? "text-muted-foreground" : ""}`}
                    >
                      <Send className="h-3.5 w-3.5" />
                      Опубликовать в Telegram
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      {isAdmin ? "Отправить в Telegram-канал" : "Только для администраторов"}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Author Section */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Автор</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Author Profile */}
                <div
                  className={`flex items-center gap-3 rounded-lg border p-3 ${isAnonymous ? "bg-muted/50" : ""}`}
                >
                  {isAnonymous ? (
                    <>
                      <div className="bg-muted flex h-10 w-10 items-center justify-center rounded-full">
                        <UserX className="text-muted-foreground h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-muted-foreground text-sm font-medium">Анонимно</p>
                        <p className="text-muted-foreground text-xs">Автор скрыт</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <Avatar className="h-10 w-10">
                        <AvatarImage src={session?.user?.image ?? undefined} />
                        <AvatarFallback>
                          {session?.user?.name?.slice(0, 2).toUpperCase() ?? "U"}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {session?.user?.name ?? "Пользователь"}
                        </p>
                        <p className="text-muted-foreground truncate text-xs">
                          {session?.user?.email}
                        </p>
                      </div>
                    </>
                  )}
                </div>

                <Separator />

                {/* Anonymous Toggle */}
                <div className="flex items-start gap-3">
                  <Checkbox
                    id="anonymous"
                    checked={isAnonymous}
                    onCheckedChange={(checked) => setIsAnonymous(checked === true)}
                  />
                  <div className="space-y-1">
                    <Label htmlFor="anonymous" className="cursor-pointer text-sm font-medium">
                      Опубликовать анонимно
                    </Label>
                    <p className="text-muted-foreground text-xs">
                      Ваше имя и фото не будут показаны
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Cover Image */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Обложка</CardTitle>
              </CardHeader>
              <CardContent>
                <ImageUploader
                  value={coverImage}
                  onChange={(url) => setCoverImage(url)}
                  aspectRatio={16 / 9}
                  placeholder="Добавить обложку"
                />
              </CardContent>
            </Card>
          </div>
        </div>
      </form>
    </div>
  );
}

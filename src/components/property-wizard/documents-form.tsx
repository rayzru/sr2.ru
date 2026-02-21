"use client";

import { AlertCircle, CheckCircle } from "lucide-react";

import type { UploadedDocument } from "~/components/claim-document-uploader";
import { ClaimDocumentUploader } from "~/components/claim-document-uploader";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";

interface DocumentsFormProps {
  documents: UploadedDocument[];
  onDocumentsChange: (docs: UploadedDocument[]) => void;
  isUploading: boolean;
  onUploadingChange: (uploading: boolean) => void;
}

export function DocumentsForm({ documents, onDocumentsChange }: DocumentsFormProps) {
  return (
    <div className="space-y-4">
      {/* Document importance warning */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Важная информация о документах</AlertTitle>
        <AlertDescription className="space-y-2 text-sm">
          <p>
            <strong>Рекомендуем загрузить подтверждающие документы</strong> для ускорения
            рассмотрения вашей заявки.
          </p>
          <p className="text-muted-foreground">
            Без документов проверка может быть выполнена только в личном порядке с администрацией,
            что займет больше времени.
          </p>
        </AlertDescription>
      </Alert>

      {/* Success message after uploading documents */}
      {documents.length > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-950/20 dark:text-green-100">
          <CheckCircle className="h-4 w-4 shrink-0" />
          <span>
            Загружено документов: {documents.length}. Ваша заявка будет рассмотрена быстрее!
          </span>
        </div>
      )}

      {/* Document Uploader - at the top */}
      <ClaimDocumentUploader documents={documents} onChange={onDocumentsChange} />

      {/* Compact unified info block after upload form */}
      <div className="text-muted-foreground space-y-3 text-sm">
        <div>
          <p className="font-medium">Зачем нужны документы?</p>
          <p className="mt-1">
            Для подтверждения права собственности или проживания нам необходимы документы. Это
            защищает вас и других жильцов от мошенничества.
          </p>
        </div>

        <div>
          <p className="font-medium">Какие документы подойдут:</p>
          <ul className="mt-1 space-y-1">
            <li>• Выписка из ЕГРН (подтверждает право собственности)</li>
            <li>• Договор купли-продажи или дарения</li>
            <li>• Договор аренды (для проживающих)</li>
            <li>• Страница паспорта с пропиской</li>
          </ul>
        </div>

        <div>
          <p className="font-medium">Конфиденциальность:</p>
          <ul className="mt-1 space-y-1">
            <li>• Документы используются только для проверки заявки</li>
            <li>• После одобрения/отклонения все файлы автоматически удаляются</li>
            <li>• Мы не занимаемся накоплением персональных данных</li>
          </ul>
        </div>
      </div>

      {/* Optional hint at the bottom */}
      {documents.length === 0 && (
        <p className="text-muted-foreground text-center text-sm">
          Вы можете пропустить загрузку документов и добавить их позже, если потребуется.
        </p>
      )}
    </div>
  );
}

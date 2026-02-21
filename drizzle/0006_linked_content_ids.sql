-- Replace linkedArticleId (single UUID) with linkedContentIds (jsonb array of {id, type})
ALTER TABLE "publication" ADD COLUMN "linked_content_ids" jsonb;

-- Migrate existing data: convert single UUID to [{id, type: "knowledge"}]
UPDATE "publication"
SET "linked_content_ids" = jsonb_build_array(jsonb_build_object('id', "linked_article_id"::text, 'type', 'knowledge'))
WHERE "linked_article_id" IS NOT NULL;

ALTER TABLE "publication" DROP COLUMN IF EXISTS "linked_article_id";

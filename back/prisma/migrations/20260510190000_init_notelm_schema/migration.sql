-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."MessageRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "public"."RagDocumentKind" AS ENUM ('PDF', 'MARKDOWN', 'PLAIN_TEXT');

-- CreateEnum
CREATE TYPE "public"."RagDocumentStatus" AS ENUM ('PENDING', 'PARSING', 'VECTORIZING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."messages" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "role" "public"."MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rag_documents" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "original_name" TEXT NOT NULL,
    "kind" "public"."RagDocumentKind" NOT NULL,
    "mime_type" TEXT NOT NULL,
    "md5_hex" TEXT,
    "byte_size" BIGINT NOT NULL,
    "storage_path" TEXT NOT NULL,
    "status" "public"."RagDocumentStatus" NOT NULL DEFAULT 'PENDING',
    "failure_reason" TEXT,
    "chroma_synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rag_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_session_id_created_at_idx" ON "public"."messages"("session_id", "created_at" ASC);

-- CreateIndex
CREATE INDEX "rag_documents_session_id_status_idx" ON "public"."rag_documents"("session_id", "status");

-- CreateIndex
CREATE INDEX "rag_documents_md5_hex_idx" ON "public"."rag_documents"("md5_hex");

-- AddForeignKey
ALTER TABLE "public"."messages" ADD CONSTRAINT "messages_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."rag_documents" ADD CONSTRAINT "rag_documents_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

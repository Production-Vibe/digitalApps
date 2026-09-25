-- CreateTable
CREATE TABLE "DictionaryValue" (
    "id" SERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "synonyms" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sort" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DictionaryValue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DictionaryValue_type_idx" ON "DictionaryValue"("type");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryValue_type_value_key" ON "DictionaryValue"("type", "value");

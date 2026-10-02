-- CreateTable
CREATE TABLE "ProductDoc" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "file" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',

    CONSTRAINT "ProductDoc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductDocLink" (
    "docId" TEXT NOT NULL,
    "partCode" TEXT NOT NULL,

    CONSTRAINT "ProductDocLink_pkey" PRIMARY KEY ("docId","partCode")
);

-- CreateIndex
CREATE INDEX "ProductDoc_type_idx" ON "ProductDoc"("type");

-- CreateIndex
CREATE UNIQUE INDEX "ProductDoc_type_file_path_key" ON "ProductDoc"("type", "file", "path");

-- CreateIndex
CREATE INDEX "ProductDocLink_partCode_idx" ON "ProductDocLink"("partCode");

-- AddForeignKey
ALTER TABLE "ProductDocLink" ADD CONSTRAINT "ProductDocLink_docId_fkey" FOREIGN KEY ("docId") REFERENCES "ProductDoc"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductDocLink" ADD CONSTRAINT "ProductDocLink_partCode_fkey" FOREIGN KEY ("partCode") REFERENCES "Catalog"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

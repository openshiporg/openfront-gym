-- AlterTable
ALTER TABLE "ClassType" ADD COLUMN     "photo_extension" TEXT,
ADD COLUMN     "photo_filesize" INTEGER,
ADD COLUMN     "photo_height" INTEGER,
ADD COLUMN     "photo_id" TEXT,
ADD COLUMN     "photo_width" INTEGER;

-- AlterTable
ALTER TABLE "Instructor" ADD COLUMN     "portrait_extension" TEXT,
ADD COLUMN     "portrait_filesize" INTEGER,
ADD COLUMN     "portrait_height" INTEGER,
ADD COLUMN     "portrait_id" TEXT,
ADD COLUMN     "portrait_width" INTEGER;

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "photo_extension" TEXT,
ADD COLUMN     "photo_filesize" INTEGER,
ADD COLUMN     "photo_height" INTEGER,
ADD COLUMN     "photo_id" TEXT,
ADD COLUMN     "photo_width" INTEGER;

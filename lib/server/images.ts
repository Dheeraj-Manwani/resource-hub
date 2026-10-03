import "server-only"

import sharp from "sharp"

/** Reads just the pixel dimensions, without re-encoding anything. */
export async function imageDimensions(input: Buffer) {
  const meta = await sharp(input, {
    failOn: "none",
    limitInputPixels: 120_000_000,
  })
    .rotate()
    .metadata()
  return {
    width: meta.autoOrient?.width ?? meta.width ?? null,
    height: meta.autoOrient?.height ?? meta.height ?? null,
  }
}

/** WebP thumbnail (max 800px wide) plus the source dimensions. */
export async function makeThumbnail(input: Buffer) {
  const image = sharp(input, {
    failOn: "none",
    limitInputPixels: 120_000_000,
  }).rotate()
  const meta = await image.metadata()
  const { data, info } = await image
    .resize({ width: 800, withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer({ resolveWithObject: true })
  return {
    data,
    width: info.width,
    height: info.height,
    sourceWidth: meta.autoOrient?.width ?? meta.width ?? null,
    sourceHeight: meta.autoOrient?.height ?? meta.height ?? null,
  }
}

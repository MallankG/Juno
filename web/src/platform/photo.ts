/**
 * Turns a picked picture into a small square avatar: centre-cropped to 256px
 * and encoded as WebP (or JPEG where WebP encoding is unavailable, as in
 * older Safari). The result is a data URL of roughly 10 to 40 KB.
 */
export const shrinkPhoto = async (file: File): Promise<string> => {
  if (!file.type.startsWith("image/")) throw new Error("Choose a picture file.")
  if (file.size > 20_000_000) throw new Error("That picture is too large.")
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      throw new Error("That picture can't be opened here. Try a JPEG or PNG.")
    }
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    if (!side) throw new Error("That picture looks empty.")
    const size = 256
    const canvas = document.createElement("canvas")
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext("2d")
    if (!ctx) throw new Error("Your browser can't resize pictures.")
    ctx.imageSmoothingQuality = "high"
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size)
    let data = canvas.toDataURL("image/webp", 0.82)
    if (!data.startsWith("data:image/webp")) data = canvas.toDataURL("image/jpeg", 0.85)
    return data
  } finally {
    URL.revokeObjectURL(url)
  }
}

// Συμπίεση/μετατροπή φωτογραφίας ΠΡΙΝ το upload (στη συσκευή, χωρίς server).
// Φωτογραφία κινητού = 3–8MB, 4000×3000 → εδώ γίνεται JPEG έως 1600px, ~200–400KB.
// Το JPEG ανοίγει παντού (και οι HEIC του iPhone μετατρέπονται, αν ο browser τις διαβάζει).

const MAX_SIDE = 1600
const QUALITY = 0.82

export async function compressImage(file: File): Promise<Blob> {
  try {
    let bitmap: ImageBitmap | HTMLImageElement
    try {
      // imageOrientation: σωστή περιστροφή από EXIF (κάθετες φωτό κινητού).
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' } as ImageBitmapOptions)
    } catch {
      bitmap = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = URL.createObjectURL(file)
      })
    }
    const w0 = bitmap.width, h0 = bitmap.height
    const scale = Math.min(1, MAX_SIDE / Math.max(w0, h0))
    const w = Math.round(w0 * scale), h = Math.round(h0 * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return file
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h) // PNG με διαφάνεια → λευκό φόντο στο JPEG
    ctx.drawImage(bitmap as CanvasImageSource, 0, 0, w, h)
    const blob = await new Promise<Blob | null>(r => canvas.toBlob(r, 'image/jpeg', QUALITY))
    return blob && blob.size < file.size ? blob : (blob || file)
  } catch {
    return file // αν κάτι αποτύχει, ανέβασε το αρχικό
  }
}

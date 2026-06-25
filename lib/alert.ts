// Άμεσα alerts σε κρίσιμες αποτυχίες (πληρωμές/webhook/refund) μέσω Telegram.
// Χρησιμοποιεί το ίδιο bot με το notify workflow.
// ENV: TELEGRAM_BOT_TOKEN (υποχρεωτικό), TELEGRAM_ALERT_CHAT_ID (προαιρετικό).
export async function alertCritical(context: string, detail: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_ALERT_CHAT_ID || '789041137'
  if (!token) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: `⚠️ Washio ALERT — ${context}\n${detail}`,
      }),
    })
  } catch {
    // Το alert δεν πρέπει ποτέ να σπάσει το κύριο flow.
  }
}

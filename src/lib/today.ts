/** Today's date in India as YYYY-MM-DD (the app's users are in AP and Telangana). */
export function todayInIndia(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

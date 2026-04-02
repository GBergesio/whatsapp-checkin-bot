export const config = {
  myNumber: process.env.MY_NUMBER,
  groupJid: process.env.GROUP_JID,
  sheetId: process.env.GOOGLE_SHEET_ID,
  timezone: process.env.TIMEZONE || 'America/Argentina/Buenos_Aires',
  reminderMinutes: parseInt(process.env.REMINDER_MINUTES || '60', 10),
  dashboardUser: process.env.DASHBOARD_USER || null,
  dashboardPass: process.env.DASHBOARD_PASS || null,
}

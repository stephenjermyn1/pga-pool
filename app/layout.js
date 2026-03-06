export const metadata = {
  title: "PGA Tour Pool",
  description: "Snake Draft & Live Leaderboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}

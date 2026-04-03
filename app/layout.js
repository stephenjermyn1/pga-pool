export const metadata = {
  title: "PGA Tour Pool",
  description: "Snake Draft & Live Leaderboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <style dangerouslySetInnerHTML={{ __html: `
          @keyframes splashFadeIn { from { opacity: 0; } to { opacity: 1; } }
          @keyframes splashFadeOut { from { opacity: 1; } to { opacity: 0; } }
          @keyframes splashPulse { 0%, 100% { transform: scale(1); opacity: 0.8; } 50% { transform: scale(1.08); opacity: 1; } }
          @keyframes splashSlideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes flagWave { 0%, 100% { transform: rotate(-5deg); } 50% { transform: rotate(5deg); } }
        `}} />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}

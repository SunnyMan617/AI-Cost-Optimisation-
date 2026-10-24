import "./globals.css";
import { ReactNode } from "react";

export const metadata = {
  title: "AI Cost Optimisation Gateway",
  description: "MVP dashboard",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

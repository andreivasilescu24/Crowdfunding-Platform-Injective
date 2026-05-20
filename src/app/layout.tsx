import "./globals.css";
import type { Metadata } from "next";
import { WalletProvider } from "@/components/WalletProvider";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Injective Crowdfunding",
  description: "Crowdfunding DApp on Injective",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <WalletProvider>
          <Header />
          <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}

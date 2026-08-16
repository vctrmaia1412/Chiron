import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Topbar } from "@/components/layout/Topbar";
import { MobileNav } from "@/components/MobileNav";
import { AppProvider } from "@/context/AppContext";
import { SearchCommand } from "@/components/SearchCommand";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "CHIRON Veterinary Platform",
  description: "Protótipo visual e navegável para gestão veterinária profissional.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full bg-[#F7FAF9] text-[#172126]">
        <AppProvider>
          <div className="flex min-h-screen bg-[#F7FAF9]">
            <Sidebar />
            <div className="flex min-h-screen flex-1 flex-col overflow-hidden">
              <Topbar />
              <main className="flex-1 pb-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom))] lg:pb-8">{children}</main>
            </div>
          </div>
          <MobileNav />
          <SearchCommand />
        </AppProvider>
      </body>
    </html>
  );
}

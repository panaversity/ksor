import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { appName } from "@/lib/shared";

const inter = Inter({
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider
          search={{
            // Static search: the browser downloads the index that
            // app/api/search exports at build time (staticGET) and runs
            // Orama client-side — no server needed, so search keeps
            // working on any static host.
            options: {
              type: "static",
              api: `${process.env.KSOR_BASE_PATH ?? ""}/api/search`,
            },
          }}
        >
          {children}
        </RootProvider>
      </body>
    </html>
  );
}

import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import type { Metadata } from "next";
import { appName } from "@/lib/shared";

// No next/font/google: it fetches the face from Google at BUILD time, so a
// scaffolded project could not build offline and two builds of one commit
// could differ byte-wise (review finding, 2026-08-18). The system UI stack
// costs zero bytes and zero network; replace it with a self-hosted @font-face
// if the project wants a specific face.

export const metadata: Metadata = {
  title: {
    default: appName,
    template: `%s | ${appName}`,
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" suppressHydrationWarning>
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

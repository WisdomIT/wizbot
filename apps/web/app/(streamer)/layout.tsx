import AppSidebarStreamer from '@/components/app-sidebar-streamer';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <AppSidebarStreamer>{children}</AppSidebarStreamer>
    </SidebarProvider>
  );
}

import { AppSidebarUser } from '@/components/app-sidebar-user';
import { SidebarProvider } from '@/components/ui/sidebar';

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <SidebarProvider>
      <AppSidebarUser>{children}</AppSidebarUser>
    </SidebarProvider>
  );
}

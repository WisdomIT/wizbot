import { SiteFooter } from '@/components/site-footer';

/**
 * 공개 페이지 공통 셸 (#257) — 홈·목록·공지·다운로드·이용 안내·약관·로그인·신청.
 * 본문이 짧아도 푸터는 화면 아래에 붙는다. 사이드바 셸(콘솔·시청자)과 앱 창은 여기 속하지 않는다.
 */
export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <div className="flex flex-1 flex-col">{children}</div>
      <SiteFooter />
    </div>
  );
}

import Link from 'next/link';

import { BRAND_ICONS } from '@/components/custom/brand-icons';
import { cn } from '@/lib/utils';

const Github = BRAND_ICONS.github;

const THANKS = [
  { name: '빅헤드', href: 'https://chzzk.naver.com/ca1850b2eceb7f86146695fd9bb9cefc' },
  { name: '마뫄', href: 'https://chzzk.naver.com/219d8e65810a77d6e42c7df018d9632b' },
];

const link = 'underline-offset-4 hover:text-foreground hover:underline';

/**
 * 사이트 푸터 (#257). 저작권·약관 링크·GitHub 와 함께 치지직 무관 서드파티 고지와 NAVER 상표 표시를 상시 노출한다.
 * 공개 페이지는 (public) 레이아웃이, 콘솔·시청자 페이지는 각 사이드바 셸이 붙인다. 데스크톱 앱 창(#85)에는 두지 않는다.
 */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        'site-footer mt-auto border-t px-4 py-6 text-xs text-muted-foreground md:px-8',
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-6">
          <span className="shrink-0 font-semibold text-foreground">
            ©{' '}
            <a href="https://github.com/WisdomIT" target="_blank" rel="noreferrer" className={link}>
              WisdomIT
            </a>
          </span>
          <p className="leading-relaxed">
            위즈봇은{' '}
            <a href="https://chzzk.naver.com/" target="_blank" rel="noreferrer" className={link}>
              치지직
            </a>
            의 서드파티 서비스로, 치지직에서 운영하는 서비스가 아닙니다
            <br />
            “치지직(CHZZK)”은 NAVER Corp.의 등록 상표입니다
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          <Link href="/policy/terms" className={cn(link, 'text-foreground')}>
            서비스 이용약관
          </Link>
          <Link href="/policy/privacy" className={cn(link, 'text-foreground')}>
            개인정보처리방침
          </Link>
          <span>
            Special thanks to.{' '}
            {THANKS.map((streamer) => (
              <a
                key={streamer.name}
                href={streamer.href}
                target="_blank"
                rel="noreferrer"
                className={cn(link, 'ml-1')}
              >
                {streamer.name}
              </a>
            ))}
          </span>
          <a
            href="https://github.com/WisdomIT/wizbot"
            target="_blank"
            rel="noreferrer"
            aria-label="위즈봇 GitHub"
            title="위즈봇 GitHub"
            className="text-foreground hover:opacity-70"
          >
            <Github className="size-5" />
          </a>
        </div>
      </div>
    </footer>
  );
}

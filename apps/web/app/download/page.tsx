import { Music, ShieldAlert } from 'lucide-react';
import type { Metadata } from 'next';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

import { DownloadButtons } from './_components/download-buttons';

export const metadata: Metadata = {
  title: '위즈봇 플레이어 다운로드',
  description: '노래 신청을 방송에 송출하는 데스크톱 앱입니다. Windows·macOS 를 지원합니다.',
};

export default function Page() {
  return (
    <main className="w-full max-w-2xl mx-auto px-4 py-16 flex flex-col gap-10">
      <header className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Music className="size-4" />
          위즈봇 플레이어
        </div>
        <h1 className="text-3xl md:text-4xl font-black leading-tight">
          노래를 방송으로 내보내는
          <br />
          <span className="text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text">
            데스크톱 앱
          </span>
        </h1>
        <p className="text-muted-foreground leading-relaxed">
          OBS 브라우저 소스 대신 이 앱으로도 노래를 송출할 수 있습니다. 창을 닫아도 트레이에 남아
          재생을 이어가고, 전역 단축키로 재생·정지·다음 곡을 다룰 수 있습니다. 유튜브 프리미엄
          계정으로 로그인해두면 광고 없이 재생됩니다.
        </p>
      </header>

      <section className="flex flex-col gap-3">
        <DownloadButtons />
        <p className="text-xs text-muted-foreground">
          쓰고 계신 환경의 버튼이 앞에 옵니다. 다른 기기에 설치하려면 나머지 버튼을 쓰세요.
        </p>
      </section>

      <Alert>
        <ShieldAlert />
        <AlertTitle>처음 실행할 때 경고가 뜹니다</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <p>
            코드 서명 인증서가 없어 운영체제가 &ldquo;확인되지 않은 앱&rdquo;으로 막습니다. 아래대로
            한 번만 허용하면 다음부터는 그냥 실행됩니다.
          </p>
          <div className="flex flex-col gap-1">
            <strong className="text-foreground">Windows</strong>
            <p>
              「Windows의 PC 보호」 화면에서 <strong>추가 정보</strong> →{' '}
              <strong>실행</strong> 을 누릅니다.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <strong className="text-foreground">macOS</strong>
            <p>
              앱을 <strong>우클릭 → 열기</strong> 로 실행하고 한 번 더 <strong>열기</strong> 를
              누릅니다. 그래도 막히면 <strong>시스템 설정 → 개인정보 보호 및 보안</strong> 아래쪽의{' '}
              <strong>확인 없이 열기</strong> 를 누릅니다.
            </p>
            <p>
              &ldquo;손상되었기 때문에 열 수 없습니다&rdquo; 가 뜨면 터미널에서 다음을 한 번 실행한 뒤 다시
              여세요 (다운로드 격리 표시를 지웁니다):
            </p>
            <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
              xattr -cr &quot;/Applications/wizbot player.app&quot;
            </code>
            <p>
              macOS 는 새 버전이 나오면 트레이 메뉴에 <strong>새 버전 받기</strong> 가 뜹니다. 내려받은 dmg 를
              다시 설치해주세요 (서명 인증서가 없어 자동 설치는 되지 않습니다). Windows 는 자동으로 설치됩니다.
            </p>
          </div>
        </AlertDescription>
      </Alert>

      <section className="flex flex-col gap-3 text-sm text-muted-foreground">
        <h2 className="text-base font-semibold text-foreground">쓰기 전에</h2>
        <ul className="flex flex-col gap-2 list-disc pl-5 leading-relaxed">
          <li>
            스트리머 콘솔의 <strong>노래 설정</strong>에서 송출 소스를{' '}
            <strong>위즈봇 플레이어 앱</strong> 으로 바꿔야 앱이 소리를 냅니다.
          </li>
          <li>
            송출 소스는 한 번에 하나만 재생합니다. 여러 PC 에서 켜두면{' '}
            <strong>먼저 잡은 쪽이 계속 재생</strong>하고, 그쪽을 끄면 15초 안에 다른 쪽이
            이어받습니다.
          </li>
          <li>새 버전이 나오면 앱이 알아서 받아둡니다. 트레이 메뉴에서 바로 적용할 수 있습니다.</li>
        </ul>
      </section>
    </main>
  );
}

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { ChzzkLoginButton } from './chzzk-login-button';

/** 로그인 전 안내. 버튼이 곧 OAuth 시작이고, 돌아오면 신청 레코드가 만들어져 있다 */
export function ApplyIntro() {
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">위즈봇 사용 신청</CardTitle>
        <CardDescription>치지직 계정으로 로그인하면 바로 신청됩니다</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="text-sm text-muted-foreground list-disc pl-5 leading-relaxed">
          <li>스트리머 본인의 치지직 계정으로 로그인해주세요. 채널 정보가 자동으로 채워집니다.</li>
          <li>신청 후 관리자가 확인해 승인합니다. 승인되면 같은 계정으로 로그인해 바로 쓸 수 있습니다.</li>
          <li>처리 상태는 다시 로그인하면 이 화면에서 볼 수 있습니다.</li>
        </ul>
        <ChzzkLoginButton>치지직으로 로그인해 신청하기</ChzzkLoginButton>
      </CardContent>
    </Card>
  );
}

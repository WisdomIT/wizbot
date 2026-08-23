import { ArrowRight, ExternalLink, List } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CONTACT_URL, functionsList } from '@/src/data/wizbot';

/** 시청자용 사이트 정보 — 위즈봇이 어떤 서비스인지와 도입 안내 */
export default function Page() {
  return (
    <div className="flex max-w-3xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-black">
            이 페이지는{' '}
            <span className="bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
              위즈봇
            </span>
            이 제공합니다
          </CardTitle>
          <CardDescription>
            위즈봇은 치지직 방송을 위한 채팅봇 서비스입니다. 스트리머가 등록한 명령어와 노래
            신청 목록을 시청자가 여기에서 확인할 수 있습니다.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/list">
              <List /> 위즈봇을 쓰는 다른 스트리머 보기
            </Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/">
              위즈봇 홈 <ExternalLink />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>기능</CardTitle>
          <CardDescription>
            아래 기능 중 무엇을 켤지는 스트리머가 정합니다. 이 채널에서 쓸 수 있는 명령어는
            「명령어」 페이지에서 확인하세요.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {functionsList.map((item) => (
            <div key={item.title} className="flex flex-col gap-2 rounded-lg border p-4">
              {item.icon}
              <span className="font-bold">{item.title}</span>
              <span className="text-sm text-muted-foreground">{item.description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>내 방송에도 쓰고 싶다면</CardTitle>
          <CardDescription>
            위즈봇은 신청을 받아 등록해 드리고 있습니다. 아래로 문의해주세요.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href={CONTACT_URL} target="_blank" rel="noreferrer">
              도입 문의하기 <ArrowRight />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

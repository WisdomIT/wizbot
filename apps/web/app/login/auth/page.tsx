import { getChzzkTokenInterlock } from '../_apis/chzzk';

// app/page.tsx
export default async function Page({
  searchParams,
}: {
  searchParams: { code: string; state: string };
}) {
  const { code, state } = await searchParams;
  try {
    const auth = await getChzzkTokenInterlock({ code, state });

    const { channelId, channelName, channelImageUrl } = auth;

    return (
      <>
        <p>channelId: {channelId}</p>
        <p>channelName: {channelName}</p>
        <img src={channelImageUrl} alt="channel thumbnail" width={200} />
      </>
    );
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('Error during authentication:', error);
    return (
      <div>
        <h1>오류가 발생했습니다. 잠시 후 다시 시도해주세요.</h1>
        <p>{(error as Error).message}</p>
      </div>
    );
  }
}

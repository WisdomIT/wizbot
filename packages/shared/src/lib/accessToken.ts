import chzzk from '../chzzk';
import { Context } from '../trpc';

export async function getAccessToken(ctx: Context, userId: number) {
  const credential = await ctx.prisma.oAuthCredential.findFirst({
    where: {
      userId,
    },
  });
  if (!credential) {
    throw new Error('Invalid response from Chzzk on me request');
  }

  // 안전하게 10초 정도 여유를 두고 만료된 것으로 판단
  if (credential.expiresIn.getTime() - 10_000 > new Date().getTime()) {
    return {
      accessToken: credential.accessToken,
    };
  }

  // Refresh token
  const refreshTokenRequest = await chzzk.authorization.refreshToken({
    refreshToken: credential.refreshToken,
  });
  if (refreshTokenRequest.code !== 200) {
    throw new Error('Invalid response from Chzzk on refresh token request');
  }
  const { accessToken, refreshToken, tokenType, expiresIn } = refreshTokenRequest.content;
  await ctx.prisma.oAuthCredential.update({
    where: {
      userId,
    },
    data: {
      accessToken,
      refreshToken,
      tokenType,
      expiresIn: new Date(new Date().getTime() + Number(expiresIn) * 1000),
    },
  });

  return {
    accessToken,
  };
}

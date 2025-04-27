import { z } from 'zod';

import { sendMail } from '../lib/nodemailer';
import { t } from '../trpc';

export const adminRouter = t.router({
  login: t.procedure.input(z.object({ email: z.string() })).query(async ({ ctx, input }) => {
    const { email } = input;

    const adminFind = await ctx.prisma.admin.findFirst({
      where: {
        email,
      },
    });

    if (!adminFind) {
      throw new Error('존재하지 않는 계정입니다.');
    }

    function randomString(length: number) {
      const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
      }
      return result;
    }

    const randomCode = randomString(6);

    await ctx.prisma.adminLogin.upsert({
      where: {
        adminId: adminFind.id,
      },
      create: {
        adminId: adminFind.id,
        passcode: randomCode,
      },
      update: {
        passcode: randomCode,
      },
    });

    await sendMail({
      to: email,
      subject: '위즈봇 관리자 로그인',
      text: `위즈봇 관리자 로그인 링크입니다. 아래 링크를 클릭하여 로그인하세요.\n\n${
        process.env.PUBLIC_SITE_URL ?? ''
      }/admin/login/admin?email=${email}&code=${randomCode}`,
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error('Error sending email:', error);
      throw new Error('이메일 전송에 실패했습니다.');
    });

    return {
      ok: true,
    };
  }),
  loginCheck: t.procedure
    .input(z.object({ email: z.string(), code: z.string() }))
    .query(async ({ ctx, input }) => {
      const { email, code } = input;

      const adminFind = await ctx.prisma.admin.findFirst({
        where: {
          email,
        },
      });

      if (!adminFind) {
        throw new Error('존재하지 않는 계정입니다.');
      }

      const loginFind = await ctx.prisma.adminLogin.findFirst({
        where: {
          adminId: adminFind.id,
          passcode: code,
        },
      });

      await ctx.prisma.adminLogin.deleteMany({
        where: {
          adminId: adminFind.id,
        },
      });

      if (!loginFind) {
        throw new Error('잘못된 코드입니다.');
      }

      return {
        ok: true,
      };
    }),
});

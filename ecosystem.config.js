// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'wizbot_api', // 통합 API 서버
      cwd: './apps/api',
      script: 'pnpm',
      args: 'start',
      interpreter: 'node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    // {
    //   name: 'wizbot_cafe',             // 네이버 카페 워커 (현재 제외)
    //   cwd: './apps/cafe',
    //   script: 'pnpm',
    //   args: 'start',
    //   interpreter: 'bash',
    //   watch: false,
    //   env: {
    //     NODE_ENV: 'production',
    //   },
    // },
    {
      name: 'wizbot_chatbot', // 챗봇 워커
      cwd: './apps/chatbot',
      script: 'pnpm',
      args: 'start',
      interpreter: 'node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'wizbot_web', // Next.js 웹 서버
      cwd: './apps/web',
      script: 'pnpm',
      args: 'start',
      interpreter: 'node',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

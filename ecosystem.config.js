// ecosystem.config.js
module.exports = {
  apps: [
    {
      name: 'wizbot_api', // 통합 API 서버
      cwd: './apps/api',
      script: 'dist/server.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    /*{
      name: 'wizbot_cafe', // 네이버 카페 워커
      cwd: './apps/cafe',
      script: 'dist/index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },*/
    {
      name: 'wizbot_chatbot', // 챗봇 워커
      cwd: './apps/chatbot',
      script: 'dist/index.js',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
    {
      name: 'wizbot_web', // Next.js 웹 서버
      cwd: './apps/web',
      script: 'node_modules/.bin/next',
      args: 'start -p 3001',
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};

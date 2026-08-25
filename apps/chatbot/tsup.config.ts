import { defineConfig } from 'tsup';

//  index 를 단일 CJS 번들로 만든다 — 런타임에서 ts-node 와 devDependencies 를 걷어내기 위함 (#31)
export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  clean: true,
  //  운영 스택 트레이스가 원본 위치를 가리키도록
  sourcemap: true,
  //  의존성을 전부 번들에 넣는다. 두 가지 이유:
  //   1) @wizbot/shared 는 빌드 산출물이 없는 소스 패키지라 번들 말고는 실을 방법이 없고,
  //      pnpm 의 엄격한 격리 때문에 shared 의 node_modules 는 이 앱 쪽에서 해석되지 않는다.
  //   2) 일부만 번들하면 남은 external 이 '앱의 node_modules' 기준으로 해석되면서 버전이 뒤바뀐다.
  //      실제로 chzzk-open-sdk(zod v4)를 번들하고 zod 를 external 로 두자 api 의 zod v3 가 잡혀
  //      z.looseObject is not a function 으로 죽었다. 번들하면 각자 자기 버전을 갖는다.
  noExternal: [/.*/],
  //  Prisma Client 는 생성된 쿼리 엔진 바이너리를 런타임에 찾는다 — 번들하면 깨진다.
  external: ['@prisma/client', '.prisma/client'],
});

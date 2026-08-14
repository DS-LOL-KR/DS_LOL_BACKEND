import { app } from "./app"; // 라우터/미들웨어가 다 붙어있는 완성된 Express 앱 인스턴스
import { env } from "./config/env"; // 실행에 필요한 PORT, NODE_ENV 등 환경변수

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`DS_LOL backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});

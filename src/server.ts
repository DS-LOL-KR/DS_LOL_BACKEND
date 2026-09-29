import { app } from "./app"; // 라우터/미들웨어가 다 붙어있는 완성된 Express 앱 인스턴스
import { env } from "./config/env"; // 실행에 필요한 PORT, NODE_ENV 등 환경변수
import { syncDiscordCommandsOnStartup } from "./modules/discord/discordCommands"; // 디스코드 슬래시 명령어 목록을 코드와 자동으로 맞춤

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`DS_LOL backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});

void syncDiscordCommandsOnStartup();

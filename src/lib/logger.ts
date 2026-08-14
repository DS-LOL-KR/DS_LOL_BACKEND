import winston from "winston"; // 로그 포맷/레벨/전송(transport)을 다루기 위한 로깅 라이브러리

const isProduction = process.env.NODE_ENV === "production";

export const logger = winston.createLogger({
  level: isProduction ? "info" : "debug",
  format: isProduction
    ? winston.format.combine(winston.format.timestamp(), winston.format.json())
    : winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.simple(),
      ),
  transports: [new winston.transports.Console()],
});

export default logger;

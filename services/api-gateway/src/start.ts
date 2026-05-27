/**
 * Docker startup entry point for API Gateway.
 *
 * Wires configuration from environment variables and starts the Express server.
 */
import { initApiGateway } from "./index.js";

const port = parseInt(process.env.PORT ?? "3001", 10);
const jwtSecret = process.env.JWT_SECRET;

if (!jwtSecret) {
  throw new Error("JWT_SECRET is required to start API Gateway");
}

const app = initApiGateway({
  auth: {
    jwtSecret,
    jwtAudience: process.env.JWT_AUDIENCE,
    jwtIssuer: process.env.JWT_ISSUER,
  },
  services: {
    ingestionServiceUrl:
      process.env.INGESTION_SERVICE_URL ?? "http://localhost:3002",
    retrievalServiceUrl:
      process.env.RETRIEVAL_SERVICE_URL ?? "http://localhost:3005",
    connectorServiceUrl:
      process.env.CONNECTOR_SERVICE_URL ?? "http://localhost:3008",
  },
});

app.listen(port, () => {
  console.log(`API Gateway listening on port ${port}`);
});

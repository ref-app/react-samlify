/**
 * Service Layer
 */
import * as jwt from "jsonwebtoken";
import { SSOProvider } from "middleware";

const SECRET = "somethingverysecret";

// this is a mock function, it should be used to interact with your database in real use case
export function getUser(login: string, provider: SSOProvider) {
  switch (provider) {
    case "okta":
      if (login === "user.passify.io@gmail.com") {
        return {
          user_id: "21b06b08-f296-42f4-81aa-73fb5a8eac67",
          email: login
        };
      }
      break;
    case "azure":
      return {
        user_id: "deadbeef-deadbeef",
        email: login
      };
      break;
  }

  return undefined;
}

export function createToken(payload: string | object | Buffer) {
  return jwt.sign(payload, SECRET);
}

export function verifyToken(token: string) {
  try {
    const payload = jwt.verify(token, SECRET);
    return { verified: true, payload: payload };
  } catch (err) {
    return { verified: false, payload: null };
  }
}

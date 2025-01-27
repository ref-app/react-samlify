import * as fs from "fs";
import * as bodyParser from "body-parser";
import { getUser, createToken, verifyToken } from "./services/auth";
import { assignEntity, SSOProvider } from "./middleware";
import * as express from "express";

const getLoginUserIdFromExtract = (
  extract: any,
  provider: SSOProvider
): string | undefined => {
  return extract.nameID;
};

export default function server(app: express.Application) {
  app.use(bodyParser.urlencoded({ extended: false }));
  // for pretty print debugging
  app.set("json spaces", 2);
  // assign the session sp and idp based on the params
  app.use(assignEntity);

  // assertion consumer service endpoint (post-binding)
  app.post("/sp/acs", async (req, res) => {
    try {
      const sp = req.sp;
      const { extract } = await sp.parseLoginResponse(req.idp, "post", req);
      const login = getLoginUserIdFromExtract(extract, req.ssoProvider);
      // get your system user
      const payload = getUser(login, req.ssoProvider);

      // assign req user
      req.user = { nameId: login };

      if (payload) {
        // create session and redirect to the session page
        const token = createToken({
          ...payload,
          provider: req.ssoProvider
        });
        return res.redirect(`/?auth_token=${token}`);
      }
      throw new Error("ERR_USER_NOT_FOUND");
    } catch (e) {
      const provider = req.ssoProvider || "okta";
      console.error(
        `[FATAL] when parsing login response sent from ${provider}`,
        e
      );
      return res.redirect("/");
    }
  });

  // call to init a sso login with redirect binding
  app.get("/sso/redirect", async (req, res) => {
    const { id, context: redirectUrl } = await req.sp.createLoginRequest(
      req.idp,
      "redirect"
    );
    return res.redirect(redirectUrl);
  });

  app.get("/sso/post", async (req, res) => {
    const { id, context } = await req.sp.createLoginRequest(req.idp, "post");
    // construct form data
    const endpoint = req.idp.entityMeta.getSingleSignOnService(
      "post"
    ) as string;
    const requestForm = fs
      .readFileSync("./request.html")
      .toString()
      .replace("$ENDPOINT", endpoint)
      .replace("$CONTEXT", context);

    return res.send(requestForm);
  });

  // endpoint for consuming logout response
  app.post("/sp/sso/logout", async (req, res) => {
    try {
      const { extract } = await req.sp.parseLogoutResponse(
        req.idp,
        "post",
        req
      );
      return res.redirect("/logout");
    } catch (err) {
      console.error(err);
    }
  });

  app.get("/sp/single_logout/redirect", async (req, res) => {
    const logoutNameID = req.query.userId;
    try {
      const { context: redirectUrl } = await req.sp.createLogoutRequest(
        req.idp,
        "redirect",
        {
          logoutNameID
        }
      );
      return res.redirect(redirectUrl);
    } catch (err) {
      console.error(err);
    }
  });

  // distribute the metadata
  app.get("/sp/metadata", (req, res) => {
    res.header("Content-Type", "text/xml").send(req.sp.getMetadata());
  });

  app.get("/idp/metadata", (req, res) => {
    res.header("Content-Type", "text/xml").send(req.idp.getMetadata());
  });

  // get user profile
  app.get("/profile", (req, res) => {
    try {
      const bearer = req.headers.authorization.replace("Bearer ", "");
      const { verified, payload } = verifyToken(bearer);
      if (verified) {
        return res.json({ profile: payload });
      }
      return res.send(401);
    } catch (e) {
      res.send(401);
    }
  });
}

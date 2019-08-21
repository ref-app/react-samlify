import * as samlify from "samlify";
import * as fs from "fs";
import * as validator from "@authenio/samlify-node-xmllint";
import { RequestHandler } from "express";
import {
  IdentityProviderSettings,
  ServiceProviderSettings
} from "samlify/types/src/types";
import { IdentityProvider } from "samlify/types/src/entity-idp";
import { ServiceProvider } from "samlify/types/src/entity-sp";
import { stringify, ParsedUrlQueryInput } from "querystring";

export type SSOProvider = "okta" | "azure";

declare module "express-serve-static-core" {
  interface Request {
    idp: IdentityProvider;
    user: { nameId: string };
    sp: ServiceProvider;
    ssoProvider: SSOProvider;
  }
}
const binding = samlify.Constants.namespace.binding;

samlify.setSchemaValidator(validator);

interface ECSOptions {
  provider?: SSOProvider;
  encrypted?: boolean;
}
/**
 * To use https, inject a url through an environment variable, e.g.
 * ASSERTION_URL=https://abc.ngrok.io/sp/acs yarn dev
 */
const getAssertionUrl = (queryParams: ECSOptions) => {
  // We have no control over the okta login urls so remove that from the query params
  if (queryParams.provider === "okta") {
    delete queryParams.provider;
  }
  const baseUrl =
    process.env["ASSERTION_URL"] || "http://localhost:8080/sp/acs";
  const query = stringify(queryParams as ParsedUrlQueryInput);
  const result = baseUrl + (query ? `?${query}` : "");
  console.log(result);
  return result;
};

const createIdentityProvider = (
  metadataPath: string,
  options: IdentityProviderSettings
) => {
  try {
    if (!fs.existsSync(__dirname + metadataPath)) {
      console.warn(`Cannot load ${metadataPath}`);
      return undefined;
    }
    const metadata = fs.readFileSync(__dirname + metadataPath);
    const result = samlify.IdentityProvider({
      metadata,
      ...options
    });
    return result;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

const createServiceProvider = (
  options: ServiceProviderSettings,
  queryParams: ECSOptions
) => {
  try {
    const commonOptions: ServiceProviderSettings = {
      entityID: "samlify-test",
      authnRequestsSigned: false,
      wantAssertionsSigned: true,
      wantMessageSigned: true,
      wantLogoutResponseSigned: true,
      wantLogoutRequestSigned: true,
      privateKey: fs.readFileSync(__dirname + "/../key/sign/privkey.pem"),
      privateKeyPass: "VHOSp5RUiBcrsjrcAuXFwU1NKCkGA8px",
      isAssertionEncrypted: false,
      assertionConsumerService: [
        {
          Binding: binding.post,
          Location: getAssertionUrl(queryParams)
        }
      ]
    };
    const result = samlify.ServiceProvider({
      ...commonOptions,
      ...options
    });
    return result;
  } catch (err) {
    console.error(err);
    return undefined;
  }
};

const azureIdp = createIdentityProvider("/../metadata/azure.xml", {
  wantLogoutRequestSigned: false
});

const oktaIdp = createIdentityProvider("/../metadata/okta.xml", {
  wantLogoutRequestSigned: true
});

const oktaIdpEnc = createIdentityProvider("/../metadata/okta-enc.xml", {
  isAssertionEncrypted: true,
  messageSigningOrder: "encrypt-then-sign",
  wantLogoutRequestSigned: true
});

// configure our service provider (your application)
const spOkta = createServiceProvider({}, { provider: "okta" });

const spAzure = createServiceProvider(
  { wantMessageSigned: false },
  { provider: "azure" }
);

// encrypted response
const spEnc = createServiceProvider(
  {
    isAssertionEncrypted: true,
    encPrivateKey: fs.readFileSync(__dirname + "/../key/encrypt/privkey.pem")
  },
  { provider: "okta", encrypted: true }
);

export const assignEntity: RequestHandler = (req, res, next) => {
  const { provider = "okta", encrypted = false }: ECSOptions = req.query || {};
  if (provider === "azure") {
    req.idp = azureIdp;
    req.sp = spAzure;
  } else {
    if (encrypted) {
      req.idp = oktaIdpEnc;
      req.sp = spEnc;
    } else {
      req.idp = oktaIdp;
      req.sp = spOkta;
    }
  }
  req.ssoProvider = provider;

  return next();
};
